// 바다: 해저 유적과 보물, 먼 항해, 바다를 떠도는 유랑 선단, 바다 괴수, 그리고 심연의 군주
import { knows } from './contact';
import { dlSide, spared } from './clash';
import { disasterStrikes } from './peril';
import { RACES, type RaceKey } from '../data/races';
import { OCEAN, SHALLOW, FOOD, GOLD, TERRAIN } from '../data/terrain';
import { addNews, charLog } from './news';
import type { Character, Faction, Pos, Settlement, World } from './state';
import { addFacRel, aliveFactions, atWar, charLabel, charPower, clamp, facRel, isAdult, isHero, leaderOf } from './helpers';
import { killChar, relocate, setPos, setTravel } from './characters';
import { foundSettlement } from './settlements';
import { createFaction, crown, makePeace } from './factions';

const L = 2;

// ───────────── 자료형

export type SeaSiteKind = 'wreck' | 'sunken' | 'isle' | 'abyss';
export interface SeaSite { id: number; kind: SeaSiteKind; name: string; x: number; y: number; level: number; loot: number; relic: boolean; found: boolean }

export interface Voyage {
  id: number;
  name: string;
  captain: number;
  crew: number[];
  port: number;
  goal: 'treasure' | 'explore' | 'hunt';
  site: number;
  /** 바닷길 (지상 칸 번호) */
  route: number[];
  months: number;
  elapsed: number;
  x: number; y: number; px: number; py: number;
  arrived: boolean;
  done: boolean;
  t: number;
}

export interface Fleet {
  id: number;
  name: string;
  race: RaceKey;
  pop: number;
  leader: number;
  origin: number;
  x: number; y: number; px: number; py: number;
  route: number[];
  pirate: boolean;
  t: number;
  alive: boolean;
}

export interface SeaBeast {
  id: number;
  l: number;
  name: string;
  kind: string;
  x: number; y: number; px: number; py: number;
  hp: number;
  maxHp: number;
  power: number;
  target: number;
  route: number[];
  /** 해안을 덮쳤는가 */
  ashore: boolean;
  /** 다가옴 → 해안 습격 → 도주 → 휴식 → 다시 다가옴 */
  mode?: 'approach' | 'ashore' | 'retreat' | 'rest';
  /** 지금 상태가 시작된 때 */
  since?: number;
  /** 길들인 마왕 */
  tamedBy?: number;
  /** 맞서 싸운 세력과 실패 횟수 */
  fails: Record<number, number>;
  allies: number[];
  /** 연맹을 청한 세력 (-1: 없음) */
  caller: number;
  t: number;
  alive: boolean;
}

export interface Tentacle { l: number; x: number; y: number; hp: number; alive: boolean }
export interface Leviathan {
  name: string;
  t: number;
  active: boolean;
  ended: number;
  tentacles: Tentacle[];
  alliance: number[];
  leader: number;
  /** 심연의 눈 (지도 표시) */
  eye: { x: number; y: number };
  /** 마왕과 맺은 계약 (마왕 id) */
  boundBy?: number;
  /** 깨어난 까닭과 깨운 자 */
  cause?: string;
  by?: number;
}

export interface SeaState {
  sites: SeaSite[];
  voyages: Voyage[];
  fleets: Fleet[];
  beasts: SeaBeast[];
  leviathan: Leviathan | null;
  /** 지금까지 깨어난 심연의 군주 수 */
  leviathans: number;
  lastLeviathan: number;
  /** 괴수를 치러 해안에 모이는 수비대 */
  musters?: Muster[];
}

/** 해안 수비대: 세력이 인물들을 불러 모아 괴수와 맞선다 */
export interface Muster {
  id: number;
  beast: number;
  faction: number;
  allies: number[];
  members: number[];
  /** 모이는 자리 (고을) */
  at: number;
  t: number;
  done: boolean;
}

// ───────────── 바다의 생김새 (세계마다 한 번 계산)

interface Geo { sea: Uint8Array; deep: number[]; coastSea: number[]; ports: Map<number, number> }
const geos = new WeakMap<World, Geo>();

function isSeaT(t: number): boolean { return t === OCEAN || t === SHALLOW; }

function geo(w: World): Geo {
  let g = geos.get(w);
  if (g) return g;
  const Ly = w.layers[L];
  const W = Ly.w, H = Ly.h, N = W * H;
  // 큰 바다만 바다로 친다 (작은 호수 제외)
  const comp = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !isSeaT(Ly.terrain[i])) continue;
    const id = sizes.length;
    let n = 0;
    const st = [i];
    comp[i] = id;
    while (st.length) {
      const k = st.pop()!;
      n++;
      const x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (comp[nk] < 0 && isSeaT(Ly.terrain[nk])) { comp[nk] = id; st.push(nk); }
      }
    }
    sizes.push(n);
  }
  const sea = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (comp[i] >= 0 && sizes[comp[i]] >= 150) sea[i] = 1;
  const deep: number[] = [], coastSea: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!sea[i]) continue;
    const x = i % W, y = (i / W) | 0;
    let land = false, near = false;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!isSeaT(Ly.terrain[ny * W + nx])) { near = true; if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) land = true; }
    }
    if (land) coastSea.push(i);
    if (!near && Ly.terrain[i] === OCEAN) deep.push(i);
  }
  g = { sea, deep, coastSea, ports: new Map() };
  geos.set(w, g);
  return g;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

/** 정착지에서 배를 띄울 수 있는 바다 칸 (-1: 항구 아님) */
export function portTile(w: World, s: Settlement): number {
  if (s.l !== L) return -1;
  const G = geo(w);
  const cached = G.ports.get(s.id);
  if (cached !== undefined) return cached;
  const W = w.layers[L].w, H = w.layers[L].h;
  let best = -1, bd = 99;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const x = s.x + dx, y = s.y + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    const d = Math.abs(dx) + Math.abs(dy);
    if (G.sea[k] && d < bd) { bd = d; best = k; }
  }
  G.ports.set(s.id, best);
  return best;
}
export function isPort(w: World, s: Settlement): boolean { return s.alive && portTile(w, s) >= 0; }

/** 바다 위 길찾기 (너비 우선) */
function seaPath(w: World, from: number, to: number): number[] | null {
  const G = geo(w);
  if (!G.sea[from] || !G.sea[to]) return null;
  if (from === to) return [];
  const W = w.layers[L].w, H = w.layers[L].h;
  const prev = new Int32Array(W * H).fill(-1);
  prev[from] = from;
  const q = [from];
  for (let qi = 0; qi < q.length; qi++) {
    const k = q[qi];
    if (k === to) break;
    const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (prev[nk] >= 0 || !G.sea[nk]) continue;
      prev[nk] = k;
      q.push(nk);
    }
  }
  if (prev[to] < 0) return null;
  const out: number[] = [];
  for (let k = to; k !== from; k = prev[k]) out.push(k);
  return out.reverse();
}

const xyOf = (w: World, k: number) => ({ x: k % w.layers[L].w, y: (k / w.layers[L].w) | 0 });
const tileOf = (w: World, p: { x: number; y: number }) => p.y * w.layers[L].w + p.x;

/** 바닷길이 이어져 있는가 (교역로 판정용) */
export function seaRoute(w: World, a: Settlement, b: Settlement): number {
  const pa = portTile(w, a), pb = portTile(w, b);
  if (pa < 0 || pb < 0) return Infinity;
  const p = seaPath(w, pa, pb);
  return p ? p.length : Infinity;
}

/** 이 항구 근처 바다에 괴수가 도사리는가 */
export function seaThreatNear(w: World, s: Settlement, r = 10): boolean {
  if (s.l !== L) return false;
  const S = w.sea;
  if (S.beasts.some(b => b.alive && Math.hypot(b.x - s.x, b.y - s.y) < r)) return true;
  return !!S.leviathan?.active && S.leviathan.tentacles.some(t => t.alive && Math.hypot(t.x - s.x, t.y - s.y) < r);
}

/** 탄생 모드의 인물에게 표식을 남긴다 (업적용) */
function pmark(w: World, c: Character | undefined, k: string): void {
  if (!c || !c.isPlayer || !w.player) return;
  w.player.flags ??= {};
  w.player.flags[k] = Math.max(1, w.t);
}

// ───────────── 해저 유적

const SITE_NAME: Record<SeaSiteKind, string[]> = {
  wreck: ['잊힌 왕의 난파선', '황금 함대의 잔해', '검은 돛의 난파선', '유령선 「잿빛 신부」', '대상선의 무덤', '침몰한 보물선'],
  sunken: ['물에 잠긴 해신의 신전', '가라앉은 도시 이르마', '산호에 덮인 옛 왕궁', '파도 아래의 첨탑', '심해 인어의 사당'],
  isle: ['안개 낀 보물섬', '해골섬', '이름 없는 환초', '거북 등 섬', '노래하는 섬'],
  abyss: ['심해의 균열', '바닥 없는 해구', '빛이 닿지 않는 골짜기'],
};

function addSite(w: World, kind: SeaSiteKind, k: number, name?: string): SeaSite {
  const rng = w.rngSim;
  const used = new Set(w.sea.sites.map(s => s.name));
  let nm = name ?? rng.pick(SITE_NAME[kind]);
  for (let i = 0; i < 6 && used.has(nm); i++) nm = rng.pick(SITE_NAME[kind]);
  if (used.has(nm)) nm = `${nm} ${w.sea.sites.length + 1}`;
  const p = xyOf(w, k);
  const level = kind === 'abyss' ? 5 : kind === 'sunken' ? rng.int(3, 5) : kind === 'isle' ? rng.int(1, 3) : rng.int(1, 4);
  const s: SeaSite = {
    id: w.sea.sites.length, kind, name: nm, x: p.x, y: p.y, level,
    loot: kind === 'abyss' ? 600 : rng.int(80, 160) * level, relic: kind !== 'wreck' && rng.chance(kind === 'abyss' ? 0.8 : 0.3), found: kind === 'isle' ? false : true,
  };
  w.sea.sites.push(s);
  return s;
}

function initSea(w: World): void {
  const rng = w.rngSim;
  const G = geo(w);
  if (!G.deep.length && !G.coastSea.length) return;
  const anySea = () => {
    const pool = G.deep.length ? G.deep : G.coastSea;
    return rng.pick(pool);
  };
  for (let i = 0; i < 4; i++) addSite(w, 'wreck', anySea());
  for (let i = 0; i < 2; i++) addSite(w, 'sunken', anySea());
  for (let i = 0; i < 2; i++) addSite(w, 'isle', anySea());
  addSite(w, 'abyss', anySea());
}

// ───────────── 항해

const SHIPS = ['파도가르기', '은빛 갈매기', '바다의 맹세', '새벽별', '검은 돛', '늙은 고래', '푸른 여왕', '폭풍의 딸', '마지막 희망', '소금꽃', '별을 쫓는 자', '갈색 거북'];
const SEAFARERS = new Set(['선원', '모험가', '상인', '전사', '사냥꾼', '마법사', '치유사', '해적']);

function onVoyage(c: Character): boolean { return c.act.kind === 'voyage'; }

/** 배를 띄운다. 2~10년의 여정 */
export function startVoyage(w: World, captain: Character, port: Settlement, goal?: Voyage['goal'], crewPool?: Character[]): Voyage | null {
  const rng = w.rngSim;
  const S = w.sea;
  const pt = portTile(w, port);
  if (pt < 0) return null;
  // 목적지
  const beasts = S.beasts.filter(b => b.alive);
  goal ??= beasts.length && (isHero(captain) || charPower(captain, w) > 150) && rng.chance(0.5) ? 'hunt' : rng.chance(0.65) ? 'treasure' : 'explore';
  let site = -1, destK = -1;
  if (goal === 'hunt' && beasts.length) {
    const b = beasts.sort((a, c) => Math.hypot(a.x - port.x, a.y - port.y) - Math.hypot(c.x - port.x, c.y - port.y))[0];
    destK = tileOf(w, b);
    site = b.id;
  } else if (goal === 'treasure') {
    const cands = S.sites.filter(s => s.found && (s.loot > 0 || s.relic));
    if (cands.length) { const s = rng.pick(cands); site = s.id; destK = tileOf(w, s); } else goal = 'explore';
  }
  if (goal === 'explore' || destK < 0) {
    goal = 'explore';
    const G = geo(w);
    destK = rng.pick(G.deep.length ? G.deep : G.coastSea);
  }
  const out = seaPath(w, pt, destK);
  if (!out || out.length < 4) return null;
  const route = [pt, ...out];
  const crew = (crewPool ?? w.chars.filter(c => c.died < 0 && !c.isPlayer && c.home === port.id && c.id !== captain.id && isAdult(w, c) && c.act.kind === 'idle'
    && c.role !== '노예' && SEAFARERS.has(c.role) && w.factions[c.faction]?.leader !== c.id && port.governor !== c.id && c.race !== 'dragon'))
    .slice(0, rng.int(1, 4));
  const ship = rng.pick(SHIPS);
  const p = xyOf(w, pt);
  const v: Voyage = {
    id: S.voyages.length, name: `${ship}호`, captain: captain.id, crew: [captain.id, ...crew.map(c => c.id)], port: port.id, goal, site,
    route, months: rng.int(24, 120), elapsed: 0, x: p.x, y: p.y, px: p.x, py: p.y, arrived: false, done: false, t: w.t,
  };
  S.voyages.push(v);
  for (const id of v.crew) {
    const c = w.chars[id];
    c.act = { kind: 'voyage', target: v.id };
    setPos(c, { l: L, x: p.x, y: p.y });
    charLog(w, c, `${port.name}의 항구에서 ${v.name}에 올라 먼 바다로 떠났다.`, 2);
    pmark(w, c, 'sailed');
  }
  const what = goal === 'hunt' ? `${S.beasts[site]?.name ?? '바다 괴수'}을(를) 사냥하러` : goal === 'treasure' ? `${S.sites[site].name}을(를) 찾아` : '아무도 가 보지 못한 바다를 향해';
  addNews(w, `${charLabel(w, captain)}이(가) ${v.crew.length}명의 선원과 함께 ${v.name}을(를) 띄워 ${what} ${port.name}을(를) 떠났다. 돌아오기까지 몇 해가 걸릴지 아무도 모른다.`,
    captain.isPlayer || isHero(captain) || goal === 'hunt' ? 3 : 2, 'hero', { pos: port, chars: v.crew });
  return v;
}

function voyageCrew(w: World, v: Voyage): Character[] {
  return v.crew.map(id => w.chars[id]).filter(c => c && c.died < 0 && onVoyage(c) && c.act.target === v.id);
}

function endVoyage(w: World, v: Voyage, text?: string) {
  v.done = true;
  const port = w.settlements[v.port];
  for (const c of voyageCrew(w, v)) {
    c.act = { kind: 'idle' };
    if (text) pmark(w, c, 'voyageHome');
    const home = port && port.alive ? port : w.settlements[c.home];
    if (home && home.alive) setPos(c, home);
    else {
      const any = w.settlements.filter(s => s.alive && s.l === L).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
      if (any) { setPos(c, any); c.home = any.id; }
    }
    c.pl = c.l; c.px = c.x; c.py = c.y;
  }
  if (text) addNews(w, text, 3, 'hero', { pos: port, chars: v.crew });
}

/** 배가 가라앉았다 */
function sink(w: World, v: Voyage, cause: string, beast?: SeaBeast) {
  const rng = w.rngSim;
  const crew = voyageCrew(w, v);
  const survivors: Character[] = [];
  for (const c of crew) {
    const live = rng.chance(c.isPlayer ? 0.55 : 0.2 + c.stats.health / 400);
    if (live) survivors.push(c);
  }
  for (const c of crew) if (!survivors.includes(c)) killChar(w, c, cause);
  addNews(w, `${v.name}이(가) ${beast ? `${beast.name}에게 습격당해` : '폭풍을 만나'} 바다 깊이 가라앉았다.${survivors.length ? ` ${survivors.map(c => c.name).join(', ')}만이 널빤지에 매달려 살아남았다.` : ' 살아 돌아온 이는 없었다.'}`,
    3, 'nature', { pos: { l: L, x: v.x, y: v.y }, chars: v.crew });
  // 난파선이 새 보물터가 된다
  if (rng.chance(0.5)) {
    const s = addSite(w, 'wreck', tileOf(w, v), `${v.name}의 잔해`);
    s.loot = rng.int(40, 140); s.level = 2;
  }
  // 살아남은 자들은 가까운 해안으로 떠밀려 간다
  v.done = true;
  for (const c of survivors) {
    c.act = { kind: 'idle' };
    c.stats.health = Math.max(10, c.stats.health - 30);
    const shore = w.settlements.filter(s => s.alive && s.l === L && Math.hypot(s.x - v.x, s.y - v.y) < 20).sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
    // 뭍이 너무 멀면 표류 끝에 숨을 거둔다
    if (!shore) { killChar(w, c, '망망대해를 표류하다 지쳐'); continue; }
    if (shore) { setPos(c, shore); c.home = shore.id; c.pl = c.l; c.px = c.x; c.py = c.y; }
    charLog(w, c, `배가 가라앉았으나 살아남아 ${shore?.name ?? '낯선 해안'}에 떠밀려 왔다.`, 3);
    pmark(w, c, 'castaway');
  }
}

function voyageMonth(w: World, v: Voyage): void {
  const rng = w.rngSim;
  const crew = voyageCrew(w, v);
  if (!crew.length) { v.done = true; return; }
  v.px = v.x; v.py = v.y;
  v.elapsed++;
  // 위치: 갈 때는 바닷길을 따라, 돌아올 때는 거꾸로
  const half = v.months / 2;
  const frac = v.elapsed < half ? v.elapsed / half : Math.max(0, (v.months - v.elapsed) / half);
  const k = v.route[Math.min(v.route.length - 1, Math.round(frac * (v.route.length - 1)))];
  const p = xyOf(w, k);
  v.x = p.x; v.y = p.y;
  for (const c of crew) { c.pl = c.l; c.px = c.x; c.py = c.y; setPos(c, { l: L, x: p.x, y: p.y }); }
  const cap = w.chars[v.captain];
  const S = w.sea;
  // 바다의 위험
  const lev = S.leviathan?.active ? S.leviathan.tentacles.find(t => t.alive && Math.hypot(t.x - v.x, t.y - v.y) < 6) : undefined;
  if (lev && rng.chance(0.15)) { sink(w, v, '심연의 촉수에 휘감겨 바다에 잠김'); return; }
  const beast = S.beasts.find(b => b.alive && Math.hypot(b.x - v.x, b.y - v.y) < 4);
  if (beast && (v.goal === 'hunt' || rng.chance(0.25))) {
    const pp = crew.reduce((a, c) => a + charPower(c, w), 0) * (1 + 0.1 * crew.length);
    if (rng.chance(pp / (pp + beast.power * 1.4))) {
      const dmg = Math.round(beast.maxHp * rng.float(0.2, 0.5) * Math.min(2, pp / beast.power));
      beast.hp -= dmg;
      for (const c of crew) c.fame += 8;
      if (beast.hp <= 0) slayBeast(w, beast, `${v.name}의 ${cap?.name ?? '선원들'}`, crew);
      else addNews(w, `${v.name}이(가) ${beast.name}과(와) 맞붙어 깊은 상처를 입혔다. 괴수는 피를 흘리며 물러났다.`, 3, 'hero', { pos: beast, chars: v.crew });
    } else { sink(w, v, `${beast.name}에게 배가 부서져 바다에 잠김`, beast); return; }
  }
  if (rng.chance(0.0035)) {
    sink(w, v, '폭풍 속에 바다에 잠김');
    stirAbyss(w, 0.003, `${v.name}이(가) 가라앉으며 남긴 마지막 비명이 깊은 곳까지 닿았다.`);
    return;
  }
  // 목적지에 닿았다
  if (!v.arrived && v.elapsed >= half) {
    v.arrived = true;
    arrive(w, v, crew);
    if (v.done) return;
  }
  if (v.elapsed >= v.months) {
    const port = w.settlements[v.port];
    endVoyage(w, v, `${v.name}이(가) ${Math.round(v.months / 12)}년의 항해를 마치고 ${port?.name ?? '고향'}의 항구로 돌아왔다.${cap && cap.died < 0 ? ` 선장 ${cap.name}의 얼굴에는 바닷바람이 새긴 주름이 가득하였다.` : ''}`);
  }
}

function arrive(w: World, v: Voyage, crew: Character[]): void {
  const rng = w.rngSim;
  const S = w.sea;
  const cap = w.chars[v.captain];
  if (v.goal === 'treasure' || v.goal === 'explore') {
    let site = S.sites[v.site];
    if (v.goal === 'explore') {
      // 새로운 것을 찾는다
      const hidden = S.sites.filter(s => !s.found);
      if (hidden.length && rng.chance(0.4)) {
        site = rng.pick(hidden);
        site.found = true;
        addNews(w, `${v.name}이(가) 지도에 없던 ${site.name}을(를) 발견하였다.`, 3, 'hero', { pos: { l: L, x: site.x, y: site.y }, chars: v.crew });
      } else if (rng.chance(0.25)) {
        site = addSite(w, rng.chance(0.6) ? 'isle' : 'sunken', tileOf(w, v));
        site.found = true;
        addNews(w, `${v.name}이(가) 아무도 몰랐던 ${site.name}을(를) 발견하였다. 뱃사람들의 노래가 하나 늘었다.`, 3, 'hero', { pos: { l: L, x: site.x, y: site.y }, chars: v.crew });
        if (site.kind === 'sunken' && stirAbyss(w, 0.01, `${v.name}의 선원들이 ${site.name}에 걸린 녹슨 종을 호기심에 울렸다. 종소리는 바다 밑바닥까지 내려갔다.`, cap && cap.died < 0 ? cap : crew[0])) return;
      } else {
        for (const c of crew) { c.stats.intellect = Math.min(100, c.stats.intellect + 2); charLog(w, c, '끝없는 수평선 너머를 보았다. 아무것도 없었지만, 그것도 하나의 발견이었다.', 1); }
        return;
      }
    }
    if (!site || (site.loot <= 0 && !site.relic)) return;
    // 바닷속 유적에 잠수한다
    const pp = crew.reduce((a, c) => a + charPower(c, w) + c.stats.intellect * 0.3, 0);
    const danger = site.level * 60;
    if (site.kind === 'abyss' && stirAbyss(w, 0.03, `${v.name}의 잠수부들이 ${site.name}의 바닥을 너무 깊이 파고들었다. 그들의 손끝에 닿은 것은 바위가 아니라 거대한 눈꺼풀이었다.`, cap && cap.died < 0 ? cap : crew[0])) return;
    if (rng.chance(pp / (pp + danger))) {
      const take = Math.min(site.loot, rng.int(40, 100) * site.level);
      site.loot -= take;
      for (const c of crew) { c.wealth += take / crew.length; c.fame += 4 + site.level * 2; pmark(w, c, 'seaTreasure'); }
      let relicText = '';
      if (site.relic && rng.chance(0.5)) {
        site.relic = false;
        const holder = cap && cap.died < 0 ? cap : crew[0];
        const item = rng.pick(['해신의 삼지창', '인어의 눈물', '심해의 진주', '익사한 왕의 왕관', '조류를 부르는 소라고둥']);
        holder.items.push(item);
        holder.fame += 25;
        relicText = ` ${holder.name}은(는) 바닥에서 「${item}」을(를) 건져 올렸다.`;
        if (stirAbyss(w, 0.01, `${holder.name}이(가) ${site.name}에서 「${item}」을(를) 건져 올린 순간, 그것이 수천 년 동안 눌러 두고 있던 무언가가 몸을 뒤척였다.`, holder)) relicText += ' 그러나 그것은 봉인이었다.';
      }
      addNews(w, `${v.name}의 선원들이 ${site.name}에서 보물을 건져 올렸다.${relicText}`, relicText ? 4 : 3, 'hero', { pos: { l: L, x: site.x, y: site.y }, chars: v.crew });
    } else {
      const dead = crew.filter(c => !c.isPlayer && rng.chance(0.25 + site!.level * 0.06));
      for (const c of dead) killChar(w, c, `${site.name}의 깊은 물속에서 돌아오지 못함`);
      addNews(w, `${v.name}의 선원들이 ${site.name}에 잠수하였으나 ${dead.length ? `${dead.map(c => c.name).join(', ')}이(가) 돌아오지 못하였다` : '빈손으로 물러났다'}.`, 2, 'hero', { pos: { l: L, x: site.x, y: site.y }, chars: v.crew });
      if (!voyageCrew(w, v).length) v.done = true;
    }
  }
}

// ───────────── 유랑 선단

function fleetName(w: World, s: Settlement, pirate: boolean): string {
  return pirate ? `${s.name} 해적 선단` : `${s.name} 유랑 선단`;
}

/** 살 곳을 잃은 이들이 배를 타고 바다로 나간다 */
function launchFleet(w: World, s: Settlement, why: string): Fleet | null {
  const rng = w.rngSim;
  const pt = portTile(w, s);
  if (pt < 0 || s.pop < 150) return null;
  const pop = Math.min(200, Math.round(s.pop * rng.float(0.05, 0.12)));
  s.pop -= pop;
  const pirate = RACES[s.race].align === 'dark' && rng.chance(0.6);
  const p = xyOf(w, pt);
  const ld = w.chars.filter(c => c.died < 0 && !c.isPlayer && c.home === s.id && isAdult(w, c) && c.act.kind === 'idle' && c.race !== 'dragon'
    && w.factions[c.faction]?.leader !== c.id && s.governor !== c.id && c.role !== '노예')
    .sort((a, b) => b.traits[1] - a.traits[1])[0];
  const fl: Fleet = {
    id: w.sea.fleets.length, name: fleetName(w, s, pirate), race: s.race, pop, leader: ld ? ld.id : -1, origin: s.id,
    x: p.x, y: p.y, px: p.x, py: p.y, route: [], pirate, t: w.t, alive: true,
  };
  w.sea.fleets.push(fl);
  if (ld) {
    ld.act = { kind: 'fleet', target: fl.id };
    setPos(ld, { l: L, x: p.x, y: p.y });
    charLog(w, ld, `${why} ${pop}명의 사람들을 이끌고 바다로 나갔다. 다시는 뭍에 발을 딛지 않겠다고 맹세하였다.`, 3);
  }
  addNews(w, `${why} ${s.name}의 ${RACES[s.race].name} ${pop}명이 배를 엮어 바다로 나갔다. 사람들은 그들을 '${fl.name}'이라 불렀다.`, 3, 'nature', { pos: s, facs: [s.faction], chars: ld ? [ld.id] : [] });
  return fl;
}

function fleetLeader(w: World, fl: Fleet): Character | undefined {
  const c = w.chars[fl.leader];
  return c && c.died < 0 && c.act.kind === 'fleet' && c.act.target === fl.id ? c : undefined;
}

function disbandFleet(w: World, fl: Fleet, text: string, imp = 3) {
  fl.alive = false;
  const ld = fleetLeader(w, fl);
  if (ld) ld.act = { kind: 'idle' };
  addNews(w, text, imp, 'nature', { pos: { l: L, x: fl.x, y: fl.y }, chars: ld ? [ld.id] : [] });
}

/** 바다에서는 자원이 모자라 큰 무리가 되지 못한다 */
const FLEET_CAP = 260;

function fleetMonth(w: World, fl: Fleet): void {
  const rng = w.rngSim;
  const S = w.sea;
  fl.px = fl.x; fl.py = fl.y;
  const ld = fleetLeader(w, fl);
  if (fl.leader >= 0 && !ld) {
    const old = w.chars[fl.leader];
    if (old && old.died >= 0) fl.leader = -1;
  }
  // 고기잡이와 굶주림
  const fish = rng.float(0.997, 1.006);
  fl.pop *= fish;
  if (fl.pop > FLEET_CAP) fl.pop -= (fl.pop - FLEET_CAP) * 0.15;
  // 아주 느리게 움직인다 (석 달에 한 칸)
  if (w.t % 3 === fl.id % 3) {
    if (!fl.route.length) {
      const G = geo(w);
      const here = tileOf(w, fl);
      const cand = G.coastSea.length && rng.chance(0.4) ? rng.pick(G.coastSea) : rng.pick(G.deep.length ? G.deep : G.coastSea);
      const near = Math.hypot(xyOf(w, cand).x - fl.x, xyOf(w, cand).y - fl.y) < 40 ? cand : here;
      fl.route = near === here ? [] : seaPath(w, here, near) ?? [];
    }
    const k = fl.route.shift();
    if (k !== undefined) { const p = xyOf(w, k); fl.x = p.x; fl.y = p.y; }
  }
  if (ld) { setPos(ld, { l: L, x: fl.x, y: fl.y }); ld.pl = ld.l; ld.px = fl.px; ld.py = fl.py; }
  // 바다 괴수와 심연
  const beast = S.beasts.find(b => b.alive && Math.hypot(b.x - fl.x, b.y - fl.y) < 4);
  const ten = S.leviathan?.active ? S.leviathan.tentacles.find(t => t.alive && Math.hypot(t.x - fl.x, t.y - fl.y) < 8) : undefined;
  if ((beast && rng.chance(0.2)) || (ten && rng.chance(0.15))) {
    const by = beast ? beast.name : '심연의 촉수';
    if (rng.chance(0.45)) {
      if (ld) killChar(w, ld, `${by}에게 선단이 삼켜짐`);
      disbandFleet(w, fl, `${fl.name}이(가) ${by}에게 습격당해 흔적도 없이 사라졌다. 바다 위에는 부서진 널빤지만 떠다녔다.`);
      return;
    }
    const lost = Math.round(fl.pop * rng.float(0.3, 0.6));
    fl.pop -= lost;
    if (fl.pop < 25) {
      disbandFleet(w, fl, `${fl.name}이(가) ${by}의 습격에 와해되었다. 흩어진 배들은 저마다 살길을 찾아 떠났다.`);
      return;
    }
    addNews(w, `${fl.name}이(가) ${by}에게 습격당해 ${lost}명을 잃었다.`, 2, 'nature', { pos: { l: L, x: fl.x, y: fl.y } });
  }
  if (rng.chance(0.002)) {
    const lost = Math.round(fl.pop * rng.float(0.15, 0.45));
    fl.pop -= lost;
    addNews(w, `거센 폭풍이 ${fl.name}을(를) 덮쳐 ${lost}명이 파도에 휩쓸렸다.`, 2, 'nature', { pos: { l: L, x: fl.x, y: fl.y } });
  }
  if (fl.pop < 15) { disbandFleet(w, fl, `${fl.name}의 마지막 배가 수평선 너머로 사라졌다. 그들의 이야기는 뱃사람들의 노래로만 남았다.`, 2); return; }
  if (fl.pirate && rng.chance(0.0004) && stirAbyss(w, 0.15, `${fl.name}이(가) 풍랑을 잠재우려 산 사람을 바다에 제물로 던졌다. 바다는 제물을 받았고, 답하였다.`, ld)) return;
  // 해적질
  if (fl.pirate && rng.chance(0.03)) {
    const prey = w.settlements.find(s => s.alive && s.l === L && Math.hypot(s.x - fl.x, s.y - fl.y) < 6 && s.race !== fl.race);
    if (prey) {
      const take = Math.min(prey.stock[FOOD] * 0.2, fl.pop * 2);
      prey.stock[FOOD] -= take; prey.stock[GOLD] *= 0.9;
      prey.lastAttacked = w.t;
      fl.pop *= 1.02;
      addNews(w, `${fl.name}이(가) ${prey.name}의 해안을 약탈하였다.`, 2, 'war', { pos: prey, facs: [prey.faction] });
    }
  }
  // 뭍으로 돌아간다
  const years = (w.t - fl.t) / 12;
  if (years > 4 && rng.chance(fl.pop < 50 ? 0.01 : 0.0025)) landFleet(w, fl);
}

function landFleet(w: World, fl: Fleet): void {
  const rng = w.rngSim;
  const Ly = w.layers[L];
  const ld = fleetLeader(w, fl);
  // 주인 없는 해안이 있으면 새 터를 일군다
  for (let i = 0; i < 40; i++) {
    const x = fl.x + rng.int(-10, 10), y = fl.y + rng.int(-10, 10);
    if (x < 1 || y < 1 || x >= Ly.w - 1 || y >= Ly.h - 1) continue;
    const k = y * Ly.w + x;
    const T = TERRAIN[Ly.terrain[k]];
    if (isSeaT(Ly.terrain[k]) || T.move <= 0 || T.yields[FOOD] < 1 || Ly.owner[k] >= 0) continue;
    if (w.settlements.some(s => s.alive && s.l === L && Math.hypot(s.x - x, s.y - y) < 5)) continue;
    const base = fl.name.replace(/ (유랑|해적) 선단$/, '');
    const nf = createFaction(w, fl.race, `새 ${base}`, 0);
    const s = foundSettlement(w, { faction: nf.id, race: fl.race, pos: { l: L, x, y }, pop: fl.pop });
    nf.capital = s.id;
    if (ld) {
      ld.act = { kind: 'idle' }; ld.faction = nf.id; ld.home = s.id; setPos(ld, s);
      crown(w, nf, ld, '개척');
    }
    w.territoryDirty = true;
    fl.alive = false;
    w.stats.fleetsLanded = (w.stats.fleetsLanded ?? 0) + 1;
    addNews(w, `${Math.round((w.t - fl.t) / 12)}년을 바다에서 떠돌던 ${fl.name}이(가) 마침내 뭍에 올라 ${s.name}을(를) 세웠다.`, 3, 'growth', { pos: s, facs: [nf.id], chars: ld ? [ld.id] : [] });
    return;
  }
  // 아니면 같은 겨레의 항구에 몸을 맡긴다
  const kin = w.settlements.filter(s => s.alive && s.l === L && isPort(w, s) && Math.hypot(s.x - fl.x, s.y - fl.y) < 25).sort((a, b) =>
    (a.race === fl.race ? 0 : 30) + Math.hypot(a.x - fl.x, a.y - fl.y) - (b.race === fl.race ? 0 : 30) - Math.hypot(b.x - fl.x, b.y - fl.y))[0];
  if (!kin) return;
  if (kin.race === fl.race) kin.pop += fl.pop;
  else { kin.slaves = (kin.slaves ?? 0); kin.pop += fl.pop * 0.5; }
  if (ld) { ld.act = { kind: 'idle' }; ld.home = kin.id; ld.faction = kin.faction; setPos(ld, kin); }
  fl.alive = false;
  addNews(w, `바다를 떠돌던 ${fl.name}이(가) ${kin.name}의 항구에 닻을 내리고 뭍의 삶으로 돌아갔다.`, 2, 'nature', { pos: kin, facs: [kin.faction] });
}

// ───────────── 바다 괴수

const BEASTS: { kind: string; hp: [number, number]; power: [number, number] }[] = [
  { kind: '크라켄', hp: [300, 500], power: [260, 380] },
  { kind: '거대 바다뱀', hp: [250, 400], power: [220, 330] },
  { kind: '심해 고래', hp: [400, 600], power: [200, 300] },
  { kind: '해룡', hp: [350, 550], power: [300, 420] },
  { kind: '거대 게', hp: [200, 350], power: [180, 260] },
];
const BEAST_PRE = ['검은 이빨의', '천 개의 눈을 가진', '폭풍을 부르는', '잿빛 비늘의', '굶주린', '창백한', '노래하는', '산호를 두른', '잠들지 않는'];

function spawnBeast(w: World): void {
  const rng = w.rngSim;
  const G = geo(w);
  if (!G.deep.length) return;
  const ports = w.settlements.filter(s => isPort(w, s) && s.pop > 200);
  if (!ports.length) return;
  const tgt = rng.weighted(ports, s => s.pop)!;
  const k = rng.pick(G.deep);
  const B = rng.pick(BEASTS);
  const p = xyOf(w, k);
  const hp = rng.int(...B.hp);
  const b: SeaBeast = {
    id: w.sea.beasts.length, l: L, name: `${rng.pick(BEAST_PRE)} ${B.kind}`, kind: B.kind, x: p.x, y: p.y, px: p.x, py: p.y,
    hp, maxHp: hp, power: rng.int(...B.power), target: tgt.id, route: seaPath(w, k, portTile(w, tgt)) ?? [], ashore: false, mode: 'approach', since: w.t,
    fails: {}, allies: [], caller: -1, t: w.t, alive: true,
  };
  if (!b.route.length) return;
  w.sea.beasts.push(b);
  addNews(w, `먼바다에서 ${b.name}이(가) 깨어났다는 뱃사람들의 소문이 돈다. 괴수는 천천히 ${tgt.name} 쪽으로 헤엄쳐 오고 있다.`, 3, 'nature', { pos: b, facs: [tgt.faction] });
}

/** 먼바다로 달아난다 */
function retreatBeast(w: World, b: SeaBeast) {
  const G = geo(w);
  const here = tileOf(w, b);
  // 가장 가까운 깊은 바다 중 하나 (육지에서 멀리)
  const far = G.deep.length ? G.deep.slice().sort((a, c) => { const pa = xyOf(w, a), pc = xyOf(w, c); return Math.hypot(pa.x - b.x, pa.y - b.y) - Math.hypot(pc.x - b.x, pc.y - b.y); }).slice(0, 40) : G.coastSea;
  b.route = seaPath(w, here, w.rngSim.pick(far)) ?? [];
  setMode(w, b, b.route.length ? 'retreat' : 'rest');
}

function slayBeast(w: World, b: SeaBeast, by: string, heroes: Character[]) {
  b.alive = false;
  b.hp = 0;
  stirAbyss(w, 0.01, `${b.name}의 피가 바다 밑으로 끝없이 가라앉아, 잠든 것의 입술을 적셨다.`, heroes[0]);
  for (const c of heroes) { c.fame += 30; c.honor += 10; charLog(w, c, `${b.name}을(를) 쓰러뜨렸다.`, 4); }
  w.stats.beastsSlain = (w.stats.beastsSlain ?? 0) + 1;
  const allies = b.allies.map(id => w.factions[id]).filter(f => f && f.alive);
  for (const a of allies) for (const o of allies) if (a !== o) addFacRel(w, a, o, 8);
  addNews(w, `${by}이(가) 마침내 ${b.name}을(를) 쓰러뜨렸다. 해안의 사람들이 거대한 사체를 보러 몰려들었다.${allies.length > 1 ? ` 함께 싸운 ${allies.map(f => f.name).join(', ')}의 우의가 깊어졌다.` : ''}`,
    4, 'hero', { pos: b, chars: heroes.map(c => c.id), facs: allies.map(f => f.id) });
}

/** 세력이 내보낼 수 있는 힘 */
/** 수비대와 괴수가 맞붙는다. 싸운 이들은 이름으로 남고, 일부는 돌아오지 못한다 */
function beastBattle(w: World, b: SeaBeast, f: Faction, allies: Faction[], fighters: Character[], pp: number, victims: Settlement[]): void {
  const rng = w.rngSim;
  const label = allies.length > 1 ? `${f.name}과(와) 연맹군` : f.name;
  const win = rng.chance(pp / (pp + b.power * 1.5));
  const fallen: Character[] = [];
  for (const h of fighters) {
    const p = (win ? 0.1 : 0.35) * clamp(1.3 - charPower(h, w) / 250, 0.4, 1.3);
    if (rng.chance(p)) { fallen.push(h); killChar(w, h, `${b.name}과(와) 싸우다 전사`); }
  }
  const alive = fighters.filter(h => !fallen.includes(h));
  const who = fighters.length ? ` ${fighters.map(h => h.name).join(', ')}이(가) 앞장섰다.` : '';
  const loss = fallen.length ? ` ${fallen.map(h => h.name).join(', ')}은(는) 끝내 돌아오지 못하였다.` : '';
  if (win) {
    const dmg = Math.round(b.maxHp * rng.float(0.2, 0.45) * Math.min(2, pp / b.power));
    b.hp -= dmg;
    for (const h of alive) { h.fame += 10; charLog(w, h, `${b.name}과(와) 싸워 깊은 상처를 입혔다.`, 3); }
    if (b.hp <= 0) { slayBeast(w, b, label, alive); return; }
    if (b.hp < b.maxHp * 0.25 && rng.chance(0.4)) {
      retreatBeast(w, b);
      addNews(w, `${label}의 맹공에 ${b.name}이(가) 피를 흘리며 먼바다로 달아났다.${who}${loss}`, 3, 'hero', { pos: b, facs: allies.map(a => a.id), chars: fighters.map(c => c.id) });
      return;
    }
    addNews(w, `${label}이(가) ${b.name}에게 맞서 깊은 상처를 입혔다.${who}${loss}`, 3, 'war', { pos: b, facs: allies.map(a => a.id), chars: fighters.map(c => c.id) });
  } else {
    b.fails[f.id] = (b.fails[f.id] ?? 0) + 1;
    for (const s of victims.filter(s => s.faction === f.id)) s.pop *= 0.985;
    const left = alive.length && fighters.length ? ` 살아남은 ${alive.map(h => h.name).join(', ')}은(는) 이를 갈았다.` : '';
    addNews(w, `${label}이(가) ${b.name}에게 맞섰으나 참패하였다. 바다가 붉게 물들었다.${who}${loss}${left}`, 3, 'war', { pos: b, facs: allies.map(a => a.id), chars: fighters.map(c => c.id) });
    if (b.caller < 0 && b.fails[f.id] >= 2) {
      b.caller = f.id;
      b.allies = [f.id, ...askAlliance(w, f, b.name, b, [f.id])];
    }
  }
}

/** 해안 수비대를 꾸린다: 근처의 싸울 만한 이들이 집결지로 걸어간다 */
function startMuster(w: World, b: SeaBeast, f: Faction, allies: Faction[], victims: Settlement[]): boolean {
  const at = victims.filter(s => s.faction === f.id).sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y))[0];
  if (!at) return false;
  const ids = new Set(allies.map(a => a.id));
  const cands = w.chars.filter(c => c.died < 0 && ids.has(c.faction) && !c.isPlayer && isAdult(w, c) && c.act.kind === 'idle' && c.race !== 'dragon' && c.role !== '노예'
    && (isHero(c) || ['전사', '기사', '모험가', '마법사', '선원', '사냥꾼'].includes(c.role)) && c.l === at.l && Math.hypot(c.x - at.x, c.y - at.y) < 30
    && w.factions[c.faction]?.leader !== c.id)
    .sort((a, c) => charPower(c, w) - charPower(a, w)).slice(0, 6);
  if (cands.length < 2) return false;
  w.sea.musters ??= [];
  const m: Muster = { id: w.sea.musters.length, beast: b.id, faction: f.id, allies: allies.map(a => a.id), members: [], at: at.id, t: w.t, done: false };
  for (const c of cands) {
    if (Math.hypot(c.x - at.x, c.y - at.y) <= 3) { c.act = { kind: 'party', target: -2 - m.id }; m.members.push(c.id); continue; }
    if (setTravel(w, c, at, 'muster', m.id)) m.members.push(c.id);
  }
  if (m.members.length < 2) { for (const id of m.members) w.chars[id].act = { kind: 'idle' }; return false; }
  w.sea.musters.push(m);
  for (const id of m.members) charLog(w, w.chars[id], `${b.name}을(를) 치러 ${at.name}의 해안으로 소집되었다.`, 2);
  addNews(w, `${f.name}이(가) ${b.name}에 맞설 해안 수비대를 불러 모았다. ${m.members.map(id => w.chars[id].name).join(', ')}이(가) ${at.name}(으)로 향한다.`, 3, 'war', { pos: at, facs: [f.id], chars: m.members });
  return true;
}

/** 수비대의 한 달: 다 모이면 싸우고, 괴수가 떠났으면 흩어진다 */
function musterMonth(w: World, m: Muster): void {
  const b = w.sea.beasts[m.beast];
  const f = w.factions[m.faction];
  const at = w.settlements[m.at];
  const members = m.members.map(id => w.chars[id]).filter(c => c && c.died < 0);
  const here = members.filter(c => c.act.kind === 'party' && c.act.target === -2 - m.id);
  const coming = members.filter(c => c.act.kind === 'travel' && c.act.purpose === 'muster' && c.act.target === m.id);
  const end = (text?: string) => {
    m.done = true;
    for (const c of [...here, ...coming]) { c.act = { kind: 'idle' }; const h = w.settlements[c.home]; if (h && h.alive) relocate(w, c, h); }
    if (text) addNews(w, text, 2, 'war', { pos: at, facs: [m.faction], chars: m.members });
  };
  if (!b || !b.alive || !f || !f.alive || !at || !at.alive) { end(); return; }
  if (b.mode !== 'ashore') { end(`${b.name}이(가) 먼바다로 물러가자, ${at.name}에 모였던 수비대도 흩어졌다.`); return; }
  if (!here.length || (coming.length && w.t - m.t < 8)) return;
  const allies = m.allies.map(id => w.factions[id]).filter(a => a && a.alive);
  const victims = w.settlements.filter(s => s.alive && s.l === L && Math.hypot(s.x - b.x, s.y - b.y) <= 7);
  const pp = here.reduce((a, c) => a + charPower(c, w), 0) * (1 + 0.1 * (here.length - 1)) + allies.reduce((a, o) => a + Math.sqrt(Math.max(0, o.military)) * (o === f ? 3 : 1.5), 0);
  beastBattle(w, b, f, allies, here, pp, victims);
  end();
}

function sortiePower(w: World, f: Faction, near: Pos): { p: number; heroes: Character[] } {
  const heroes = w.chars.filter(c => c.died < 0 && c.faction === f.id && !c.isPlayer && isAdult(w, c) && c.act.kind === 'idle' && c.race !== 'dragon'
    && (isHero(c) || ['전사', '기사', '모험가', '마법사', '선원', '사냥꾼'].includes(c.role)) && Math.hypot(c.x - near.x, c.y - near.y) < 12 && c.l === near.l)
    .sort((a, b) => charPower(b, w) - charPower(a, w)).slice(0, 3);
  return { p: Math.sqrt(Math.max(0, f.military)) * 4 + heroes.reduce((a, c) => a + charPower(c, w) * 0.6, 0), heroes };
}

function affectedFactions(w: World, x: number, y: number, r: number): Faction[] {
  const ids = new Set<number>();
  for (const s of w.settlements) if (s.alive && s.l === L && Math.hypot(s.x - x, s.y - y) <= r) ids.add(s.faction);
  return [...ids].map(id => w.factions[id]).filter(f => f && f.alive);
}

/** 연맹을 청한다: 받아줄지는 우호도에 달렸다 */
function askAlliance(w: World, caller: Faction, enemyName: string, near: Pos, already: number[], silent = false): number[] {
  const rng = w.rngSim;
  const joined: Faction[] = [], refused: Faction[] = [];
  for (const o of aliveFactions(w)) {
    if (o === caller || already.includes(o.id) || RACES[o.race].noPop || atWar(o, caller.id) || !knows(w, o, caller)) continue;
    const d = Math.min(...o.settlements.map(id => w.settlements[id]).filter(s => s && s.alive && s.l === L).map(s => Math.hypot(s.x - near.x, s.y - near.y)), Infinity);
    if (d > 70) continue;
    const r = facRel(o, caller.id);
    const ld = leaderOf(w, o);
    const kind = ld ? (ld.traits[3] - 50) / 2 : 0;
    const threatened = d < 15;
    const p = threatened ? 0.9 : r >= 40 ? 0.85 : r >= 15 ? 0.55 + kind / 100 : r >= -5 ? 0.2 + kind / 100 : 0.03;
    if (rng.chance(p)) joined.push(o); else if (r > -30) refused.push(o);
  }
  for (const o of joined) { addFacRel(w, caller, o, 15); }
  for (const o of refused) caller.relations[o.id] = Math.max(-100, (caller.relations[o.id] ?? 0) - 8);
  if (!silent) addNews(w, `${caller.name}이(가) ${enemyName}에 맞서 이웃 나라들에 연맹을 청하였다. ${joined.length ? `${joined.map(f => f.name).join(', ')}이(가) 응하였다` : '그러나 아무도 응하지 않았다'}${refused.length && joined.length ? `. ${refused.slice(0, 3).map(f => f.name).join(', ')}은(는) 외면하였다` : ''}.`,
    joined.length ? 4 : 3, 'politics', { pos: near, facs: [caller.id, ...joined.map(f => f.id)] });
  return joined.map(f => f.id);
}

/** 괴수가 노릴 항구를 고른다: 가깝고 큰 곳, 바닷길이 닿는 곳 */
function pickPrey(w: World, b: SeaBeast): boolean {
  const rng = w.rngSim;
  const here = tileOf(w, b);
  const tamed = b.tamedBy !== undefined && w.demonLord === b.tamedBy;
  const ports = w.settlements.filter(s => isPort(w, s) && s.pop > 100 && !(tamed && dlSide(w, s.faction)))
    .sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - c.pop * 0.01 - (Math.hypot(c.x - b.x, c.y - b.y) - a.pop * 0.01));
  for (const n of ports.slice(0, 6)) {
    const route = seaPath(w, here, portTile(w, n));
    if (route && route.length) { b.target = n.id; b.route = route; return true; }
    if (route && !route.length) { b.target = n.id; b.route = []; return true; }
  }
  // 갈 곳이 없으면 깊은 바다를 떠돈다
  const G = geo(w);
  const k = rng.pick(G.deep.length ? G.deep : G.coastSea);
  b.route = seaPath(w, here, k) ?? [];
  return false;
}

function setMode(w: World, b: SeaBeast, m: NonNullable<SeaBeast['mode']>) {
  b.mode = m;
  b.since = w.t;
  b.ashore = m === 'ashore';
}

function beastMonth(w: World, b: SeaBeast): void {
  const rng = w.rngSim;
  b.px = b.x; b.py = b.y;
  b.mode ??= b.ashore ? 'ashore' : 'approach';
  b.since ??= w.t;
  const step = () => { const k = b.route.shift(); if (k !== undefined) { const p = xyOf(w, k); b.x = p.x; b.y = p.y; } };
  let tgt = w.settlements[b.target];
  // 노리던 항구가 사라졌으면 새 먹잇감을 찾는다
  if ((!tgt || !tgt.alive) && b.mode !== 'retreat' && b.mode !== 'rest') {
    pickPrey(w, b);
    setMode(w, b, 'approach');
    tgt = w.settlements[b.target];
  }
  switch (b.mode) {
    case 'approach': {
      // 천천히 다가온다 (두 달에 한 칸)
      if (w.t % 2 === b.id % 2) step();
      // 항구 앞바다(항구 칸은 고을에서 최대 7칸 남짓)에 닿으면 해안을 덮친다
      const near = !!tgt && tgt.alive && (Math.hypot(b.x - tgt.x, b.y - tgt.y) <= 7.5 || (!b.route.length && tileOf(w, b) === portTile(w, tgt)));
      if (near) {
        setMode(w, b, 'ashore');
        addNews(w, `${b.name}이(가) ${tgt!.name}의 앞바다에 모습을 드러냈다. 바닷물이 검게 끓어올랐다.`, 4, 'nature', { pos: tgt, facs: [tgt!.faction] });
      } else if (!b.route.length) {
        // 길이 끊겼거나 목표에 못 미쳤다: 다시 길을 잡는다
        pickPrey(w, b);
      }
      break;
    }
    case 'retreat': {
      // 상처 입은 괴수는 서둘러 달아난다 (달마다 한 칸)
      step();
      if (!b.route.length) setMode(w, b, 'rest');
      break;
    }
    case 'rest': {
      // 깊은 바다에서 상처를 핥는다
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.012);
      if (b.hp >= b.maxHp * 0.8 && w.t - (b.since ?? w.t) >= 24) {
        pickPrey(w, b);
        setMode(w, b, 'approach');
        const t2 = w.settlements[b.target];
        if (t2) addNews(w, `상처를 회복한 ${b.name}이(가) 다시 움직이기 시작하였다. 이번에는 ${t2.name} 쪽이다.`, 3, 'nature', { pos: b, facs: [t2.faction] });
      }
      return;
    }
    case 'ashore': {
      // 십 년 넘게 버틴 괴수는 지쳐 먼바다로 돌아간다
      if (w.t - (b.since ?? w.t) > 12 * 10 && rng.chance(0.02)) {
        retreatBeast(w, b);
        addNews(w, `오랫동안 해안을 괴롭히던 ${b.name}이(가) 지친 듯 먼바다로 물러갔다.`, 3, 'nature', { pos: b });
        return;
      }
      break;
    }
  }
  if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.004);
  if (!b.ashore) return;
  // 해안을 괴롭힌다
  const victims = w.settlements.filter(s => s.alive && s.l === L && Math.hypot(s.x - b.x, s.y - b.y) <= 7);
  for (const s of victims) {
    s.pop -= s.pop * rng.float(0.003, 0.012);
    s.stock[FOOD] *= 0.93;
    s.stability = Math.max(0, s.stability - 1.5);
    s.lastAttacked = w.t;
    disasterStrikes(w, s, 'beast', `${b.name}에게 휩쓸림`, 0.003);
  }
  if (rng.chance(0.08) && victims.length) addNews(w, `${b.name}이(가) ${rng.pick(victims).name}의 배와 부두를 부수었다. 바다로 나가는 이가 없다.`, 2, 'nature', { pos: b, facs: victims.map(s => s.faction) });
  // 세력이 맞선다: 인물들을 해안에 불러 모아 싸운다 (모을 이가 없으면 군대만 보낸다)
  const hurt = affectedFactions(w, b.x, b.y, 8);
  for (const f of hurt) {
    if ((w.sea.musters ?? []).some(m => !m.done && m.beast === b.id && (m.faction === f.id || m.allies.includes(f.id)))) continue;
    if (!rng.chance(0.2)) continue;
    const allies = [f, ...b.allies.filter(id => id !== f.id).map(id => w.factions[id]).filter(o => o && o.alive)];
    if (startMuster(w, b, f, allies, victims)) continue;
    let pp = 0;
    for (const a of allies) pp += Math.sqrt(Math.max(0, a.military)) * 4 * (a === f ? 1 : 0.6);
    beastBattle(w, b, f, allies, [], pp, victims);
    if (!b.alive) return;
  }
}

// ───────────── 심연의 군주 (숨겨진 일곱 번째 봉인)

const LEV_NAMES = ['크툴라', '다고스', '느갈로스', '요그타르', '하스투르', '이브르흐', '르흘레스'];

export function awakenLeviathan(w: World, cause = '', by?: Character): boolean {
  const rng = w.rngSim;
  const G = geo(w);
  if (!G.coastSea.length || !G.deep.length) return false;
  // 육지와 바다의 경계에서, 사람이 사는 곳을 노린다
  const coast = rng.shuffle(G.coastSea.slice());
  const near = (k: number) => { const p = xyOf(w, k); return w.settlements.some(s => s.alive && s.l === L && Math.hypot(s.x - p.x, s.y - p.y) < 10); };
  const n = rng.int(8, 12);
  const picks: number[] = [];
  for (const pass of [true, false]) {
    for (const k of coast) {
      if (picks.length >= n) break;
      if (pass && !near(k)) continue;
      const p = xyOf(w, k);
      if (picks.some(q => { const o = xyOf(w, q); return Math.hypot(o.x - p.x, o.y - p.y) < 14; })) continue;
      picks.push(k);
    }
  }
  if (picks.length < 4) return false;
  const eye = xyOf(w, rng.pick(G.deep));
  const name = `심연의 군주 ${rng.pick(LEV_NAMES)}`;
  w.sea.leviathan = {
    name, t: w.t, active: true, ended: -1, cause: cause || undefined, by: by?.id, tentacles: picks.map(k => ({ l: L, ...xyOf(w, k), hp: 250, alive: true })), alliance: [], leader: -1, eye,
  };
  w.sea.leviathans++;
  w.sea.lastLeviathan = w.t;
  addNews(w, `${cause ? cause + ' ' : ''}바다가 끓어올랐다. 대륙만 한 그림자가 수면 아래에서 몸을 뒤척였다. ${name}이(가) 깨어나 ${picks.length}개의 촉수를 해안마다 뻗었다. 아무도 그 몸의 끝을 보지 못하였다.`, 5, 'doom', { chars: by ? [by.id] : [] });
  if (by) charLog(w, by, `${name}을(를) 깨웠다.`, 5);
  return true;
}

/** 바다에서 벌어진 일이 극히 드물게 심연을 건드린다. 출현 간격(150년)은 지킨다 */
export function stirAbyss(w: World, p: number, cause: string, by?: Character): boolean {
  const S = w.sea;
  if (S.leviathan?.active || w.t - S.lastLeviathan <= 12 * 150) return false;
  if (!w.rngSim.chance(p)) return false;
  if (!awakenLeviathan(w, cause, by)) return false;
  w.stats.leviathan = (w.stats.leviathan ?? 0) + 1;
  w.stats.leviathanStirred = (w.stats.leviathanStirred ?? 0) + 1;
  pmark(w, by, 'ach_abysswoke');
  return true;
}

function leviathanMonth(w: World): void {
  const rng = w.rngSim;
  const V = w.sea.leviathan;
  if (!V || !V.active) return;
  const alive = V.tentacles.filter(t => t.alive);
  // 촉수 주변 10칸을 괴롭힌다
  const hurtIds = new Set<number>();
  for (const t of alive) {
    for (const s of w.settlements) {
      if (!s.alive || s.l !== L || spared(w, s.faction)) continue;
      const d = Math.hypot(s.x - t.x, s.y - t.y);
      if (d > 10) continue;
      const k = 1 - d / 12;
      s.pop -= s.pop * rng.float(0.008, 0.025) * k;
      s.stock[FOOD] *= 1 - 0.1 * k;
      s.stability = Math.max(0, s.stability - 3.5 * k);
      s.lastAttacked = w.t;
      hurtIds.add(s.faction);
      disasterStrikes(w, s, 'abyss', '심연의 촉수에 끌려 바다로 사라짐', 0.004 * k);
    }
    for (const a of w.armies) if (a.alive && a.l === L && Math.hypot(a.x - t.x, a.y - t.y) < 5) a.soldiers *= 0.82;
  }
  if (rng.chance(0.06) && alive.length) {
    const t = rng.pick(alive);
    const s = w.settlements.filter(o => o.alive && o.l === L && Math.hypot(o.x - t.x, o.y - t.y) <= 10)[0];
    if (s) addNews(w, `${V.name}의 촉수가 ${s.name}의 해안을 휩쓸었다. 집과 사람이 함께 바다로 끌려 들어갔다.`, 3, 'doom', { pos: s, facs: [s.faction] });
  }
  const hurt = [...hurtIds].map(id => w.factions[id]).filter(f => f && f.alive && !RACES[f.race].noPop);
  // 연맹: 피해를 크게 입은 나라가 맹주가 되어 연맹을 꾸린다
  if (V.leader < 0 && hurt.length && (w.t - V.t >= 4)) {
    const lead = hurt.sort((a, b) => b.military - a.military)[0];
    V.leader = lead.id;
    V.alliance = [lead.id];
    for (const o of hurt) if (o !== lead && facRel(o, lead.id) > -45) V.alliance.push(o.id);
    const far = askAlliance(w, lead, V.name, { l: L, x: V.eye.x, y: V.eye.y }, V.alliance, true).filter(id => !V.alliance.includes(id));
    V.alliance.push(...far);
    // 공동의 적 앞에서 칼을 거둔다
    for (const a of V.alliance) for (const b of V.alliance) {
      const fa = w.factions[a], fb = w.factions[b];
      if (a < b && fa && fb && atWar(fa, b)) makePeace(w, fa, fb);
    }
    addNews(w, `${lead.name}의 이름으로 '심연 토벌 연맹'이 결성되었다. ${V.alliance.map(id => w.factions[id].name).join(', ')}이(가) 원한을 접고 해안으로 군대를 보냈다.`, 5, 'hero', { facs: V.alliance });
  }
  // 촉수를 친다
  const members = V.leader >= 0 ? V.alliance.map(id => w.factions[id]).filter(f => f && f.alive) : hurt;
  for (const f of members) {
    if (!rng.chance(V.leader >= 0 ? 0.2 : 0.1)) continue;
    const caps = w.settlements[f.capital];
    if (!caps || caps.l !== L) continue;
    // 연맹은 상처 입은 촉수부터 함께 노린다
    const score = (x: Tentacle) => Math.hypot(x.x - caps.x, x.y - caps.y) + (V.leader >= 0 ? x.hp * 0.3 : 0);
    const t = alive.filter(x => x.alive).sort((a, b) => score(a) - score(b))[0];
    if (!t) break;
    const { p, heroes } = sortiePower(w, f, caps.l === L ? t : caps);
    const pp = p * (V.leader >= 0 ? 1.4 : 1);
    if (rng.chance(pp / (pp + 260))) {
      t.hp -= rng.float(12, 24) * Math.max(0.5, Math.min(1.6, pp / 150));
      for (const h of heroes) h.fame += 6;
      if (t.hp <= 0) {
        t.alive = false;
        for (const h of heroes) { h.fame += 25; charLog(w, h, `${V.name}의 촉수 하나를 베어 냈다.`, 4); }
        const cut = V.tentacles.filter(x => !x.alive).length;
        addNews(w, `${f.name}의 군대${heroes[0] ? `와 ${charLabel(w, heroes[0])}` : ''}이(가) ${V.name}의 촉수 하나를 베어 냈다. (${cut}/${V.tentacles.length})`, 4, 'hero', { pos: { l: L, x: t.x, y: t.y }, facs: [f.id], chars: heroes.map(c => c.id) });
      }
    } else {
      for (const s of settlementsNear(w, t, 10).filter(s => s.faction === f.id)) s.pop *= 0.99;
      for (const h of heroes) if (rng.chance(0.12)) killChar(w, h, `${V.name}의 촉수에 휘감겨 전사`);
    }
  }
  // 베어 낸 촉수가 다시 자라기도 한다
  // 스무 해가 넘으면 심연의 군주도 지쳐 간다
  if (w.t - V.t > 12 * 20) for (const t of V.tentacles) if (t.alive) t.hp -= 1.2;
  for (const t of V.tentacles) if (t.alive && t.hp <= 0) t.alive = false;
  for (const t of V.tentacles) if (!t.alive && rng.chance(0.003)) {
    t.alive = true; t.hp = 120;
    addNews(w, `베어 낸 줄 알았던 ${V.name}의 촉수가 다시 자라났다.`, 3, 'doom', { pos: { l: L, x: t.x, y: t.y } });
  }
  // 절반 이상을 베면 심연으로 돌아간다
  const cut = V.tentacles.filter(t => !t.alive).length;
  if (cut * 2 > V.tentacles.length) {
    V.active = false;
    V.ended = w.t;
    const lead = w.factions[V.leader];
    if (lead) { lead.legitimacy = Math.min(100, lead.legitimacy + 20); const ld = leaderOf(w, lead); if (ld) { ld.fame += 60; ld.honor += 20; } }
    for (const a of V.alliance) for (const b of V.alliance) { const fa = w.factions[a], fb = w.factions[b]; if (a !== b && fa && fb) addFacRel(w, fa, fb, 10); }
    w.stats.leviathanRepelled = (w.stats.leviathanRepelled ?? 0) + 1;
    addNews(w, `촉수의 절반을 잃은 ${V.name}이(가) 길게 울부짖으며 심연으로 가라앉았다. ${lead ? `${lead.name}이(가) 이끈 ` : ''}연맹이 세계를 지켜 냈다. 바다는 다시 잔잔해졌지만, 그것은 죽지 않았다. 다만 잠들었을 뿐이다.`, 5, 'hero', { facs: V.alliance });
  }
}

function settlementsNear(w: World, p: { x: number; y: number }, r: number): Settlement[] {
  return w.settlements.filter(s => s.alive && s.l === L && Math.hypot(s.x - p.x, s.y - p.y) <= r);
}

export function leviathanActive(w: World): boolean {
  return !!w.sea?.leviathan?.active;
}

// ───────────── 매달

export function seaMonth(w: World): void {
  const rng = w.rngSim;
  const S = w.sea;
  if (!S.sites.length && w.t > 0) initSea(w);
  for (const v of S.voyages) if (!v.done) voyageMonth(w, v);
  for (const f of S.fleets) if (f.alive) fleetMonth(w, f);
  for (const b of S.beasts) if (b.alive) beastMonth(w, b);
  for (const m of S.musters ?? []) if (!m.done) musterMonth(w, m);
  if ((S.musters?.length ?? 0) > 200) S.musters = S.musters!.filter(m => !m.done);
  leviathanMonth(w);

  // 배를 띄운다
  if (S.voyages.filter(v => !v.done).length < 4) {
    for (const s of w.settlements) {
      if (!s.alive || s.l !== L || s.pop < 200 || !rng.chance(0.004) || !isPort(w, s)) continue;
      if (seaThreatNear(w, s, 12)) continue;
      const cap = w.chars.filter(c => c.died < 0 && !c.isPlayer && c.home === s.id && isAdult(w, c) && c.act.kind === 'idle' && c.race !== 'dragon'
        && (['선원', '모험가', '상인'].includes(c.role) || (c.traits[6] > 70 && ['전사', '사냥꾼', '마법사', '학자'].includes(c.role))) && w.factions[c.faction]?.leader !== c.id && s.governor !== c.id)
        .sort((a, b) => b.traits[6] - a.traits[6])[0];
      if (cap) { startVoyage(w, cap, s); break; }
    }
  }
  // 살 곳을 잃은 이들이 바다로
  if (S.fleets.filter(f => f.alive).length < 3) {
    for (const s of w.settlements) {
      if (!s.alive || s.l !== L || s.pop < 250) continue;
      const why = s.hunger >= 2 ? '굶주림을 견디다 못해' : s.lastAttacked === w.t && s.stability < 30 ? '전란에 집을 잃고' : s.stability < 15 ? '폭정과 혼란을 피해' : '';
      if (!why || !rng.chance(0.004) || !isPort(w, s)) continue;
      launchFleet(w, s, why);
      break;
    }
  }
  // 바다 괴수 (수십 년에 하나)
  if (S.beasts.filter(b => b.alive).length < 2 && rng.chance(1 / (12 * 35))) spawnBeast(w);
  // 심연의 군주(심해의 분노): 300여 년에 한 번 볼까 말까
  if (!S.leviathan?.active && w.t - S.lastLeviathan > 12 * 150 && rng.chance(1 / (12 * 380))) {
    if (awakenLeviathan(w)) w.stats.leviathan = (w.stats.leviathan ?? 0) + 1;
  }
}

export function newSeaState(): SeaState {
  return { sites: [], voyages: [], fleets: [], beasts: [], leviathan: null, leviathans: 0, lastLeviathan: -99999 };
}

export function voyageOf(w: World, c: Character): Voyage | undefined {
  return c.act.kind === 'voyage' ? w.sea.voyages[c.act.target ?? -1] : undefined;
}
export function fleetOf(w: World, c: Character): Fleet | undefined {
  return c.act.kind === 'fleet' ? w.sea.fleets[c.act.target ?? -1] : undefined;
}

/** 지도 칸 근처의 바다 것들 (살펴보기용) */
export function seaThingsAt(w: World, l: number, x: number, y: number) {
  if (l !== L) return { sites: [], voyages: [], fleets: [], beasts: [], tentacles: [] as Tentacle[] };
  const S = w.sea;
  const near = (p: { x: number; y: number }, r = 1.5) => Math.hypot(p.x - x, p.y - y) <= r;
  return {
    sites: S.sites.filter(s => s.found && near(s, 1)),
    voyages: S.voyages.filter(v => !v.done && near(v)),
    fleets: S.fleets.filter(f => f.alive && near(f)),
    beasts: S.beasts.filter(b => b.alive && near(b, 2)),
    tentacles: S.leviathan?.active ? S.leviathan.tentacles.filter(t => t.alive && near(t, 2)) : [],
  };
}
