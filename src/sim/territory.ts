import { RACES } from '../data/races';
import { FOOD, GOLD, MANA, ORE, STONE, TERRAIN, WOOD } from '../data/terrain';
import { COMPASSION, PRUDENCE, SOCIAL, AMBITION, GREED, CURIOSITY, COURAGE } from '../data/traits';
import { addNews } from './news';
import type { Faction, Settlement, World } from './state';
import { addFacRel, atWar, clamp, facRel, leaderOf } from './helpers';

// 영토는 칸 단위로 소유된다. claim(정착지 id)만 영구 저장하고 owner(세력)는 claim에서 다시 계산한다.

export const MAX_RADIUS = [4, 6, 8, 10, 13];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function claimable(tid: number): boolean {
  const T = TERRAIN[tid];
  return T.move > 0 || T.yields.some(v => v > 0);
}

/** 정착지 주변 r칸을 차지한다. 다른 세력의 땅은 건드리지 않는다 */
export function claimInitial(w: World, s: Settlement, r: number): void {
  const L = w.layers[s.l];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r) continue;
    const x = s.x + dx, y = s.y + dy;
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
    const k = y * L.w + x;
    const cur = L.claim[k];
    const center = dx === 0 && dy === 0;
    if (!center && !claimable(L.terrain[k])) continue;
    if (cur >= 0 && !center) {
      const o = w.settlements[cur];
      if (o && o.alive && o.faction !== s.faction) continue;
    }
    L.claim[k] = s.id;
  }
  w.territoryDirty = true;
}

/** claim 배열로부터 owner 배열과 정착지별 칸 목록을 다시 만든다 */
export function rebuildTerritory(w: World): void {
  for (const s of w.settlements) s.tiles = [];
  for (const L of w.layers) {
    L.owner.fill(-1);
    for (let k = 0; k < L.claim.length; k++) {
      const c = L.claim[k];
      if (c < 0) continue;
      const s = w.settlements[c];
      if (!s || !s.alive) { L.claim[k] = -1; continue; }
      L.owner[k] = s.faction;
      s.tiles.push(k);
    }
  }
  // 정착지 중심 칸은 언제나 그 정착지 소유
  for (const s of w.settlements) {
    if (!s.alive) continue;
    const L = w.layers[s.l];
    const k = s.y * L.w + s.x;
    if (L.claim[k] !== s.id) {
      const prev = w.settlements[L.claim[k]];
      if (prev) prev.tiles = prev.tiles.filter(t => t !== k);
      L.claim[k] = s.id;
      L.owner[k] = s.faction;
      s.tiles.push(k);
    }
  }
  w.territoryDirty = false;
}

/** 정착지가 특정 칸에 행사하는 힘: 성에서 멀수록 지키기 어렵다 */
export function tilePower(w: World, s: Settlement, x: number, y: number): number {
  const R = RACES[s.race];
  const base = s.pop * 0.2 * R.might * (1 + s.dev / 70) * (1 + s.tier * 0.25);
  const d = Math.hypot(s.x - x, s.y - y);
  return base / (1 + Math.pow(d / (2 + s.tier), 2));
}

/** 영토를 넓히는 성향: 군주의 성격을 따른다 */
export type ExpandStyle = '실리' | '안정' | '개척' | '농경';
export const STYLE_DESC: Record<ExpandStyle, string> = {
  실리: '광맥과 금, 마나가 나는 땅을 따라 길게 뻗어 나간다',
  안정: '빈틈을 메우며 지키기 쉬운 땅을 촘촘히 다진다',
  개척: '아무도 가 보지 않은 먼 곳을 향해 들쭉날쭉 뻗어 나간다',
  농경: '기름진 들과 숲을 따라 넓혀 간다',
};
export function expandStyle(w: World, f: Faction): ExpandStyle {
  const ld = leaderOf(w, f);
  if (!ld) return '안정';
  const t = ld.traits;
  const sc: [ExpandStyle, number][] = [
    ['실리', (t[GREED] + t[AMBITION]) / 2],
    ['안정', t[PRUDENCE]],
    ['개척', t[CURIOSITY] * 0.8 + t[COURAGE] * 0.25],
    ['농경', (t[COMPASSION] + t[SOCIAL]) / 2],
  ];
  return sc.sort((a, b) => b[1] - a[1])[0][0];
}
/** 성향마다 성에서 얼마나 멀리까지 손을 뻗는가 (반지름 배율) */
export const REACH: Record<ExpandStyle, number> = { 실리: 1.35, 안정: 0.95, 개척: 1.5, 농경: 1.1 };

/** 넓힐 칸의 매력: 성향과 종족이 좋아하는 땅 */
export function tileAppeal(w: World, s: Settlement, style: ExpandStyle, k: number, x: number, y: number): number {
  const L = w.layers[s.l];
  const tid = L.terrain[k];
  const T = TERRAIN[tid];
  const v = T.yields;
  let own = 0;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < L.w && ny < L.h && L.owner[ny * L.w + nx] === s.faction) own++;
  }
  const d = Math.hypot(x - s.x, y - s.y);
  let sc = 0;
  switch (style) {
    case '실리': sc = v[ORE] * 2 + v[GOLD] * 6 + v[MANA] * 1.5 + v[STONE] * 0.8 + own * 0.3 - d * 0.05; break;
    case '안정': sc = own * 1.5 - d * 0.25 - T.move * 0.3; break;
    case '개척': sc = d * 0.3 + own * 0.1 + w.rngSim.float(0, 1.5); break;
    case '농경': sc = v[FOOD] * 1.5 + v[WOOD] * 0.5 + own * 0.4 - d * 0.1; break;
  }
  // 종족이 익숙한 땅 (엘프의 숲, 드워프의 산)
  const mo = RACES[s.race].moveOverride[tid];
  if (mo !== undefined && mo < T.move) sc += 1.2;
  return sc + w.rngSim.float(0, 0.4);
}

export type Posture = 'guard' | 'open';
const POSTURE_MUL: Record<Posture, number> = { guard: 1.6, open: 0.6 };

function postureOf(f: Faction, other: number): number {
  const p = f.posture?.[other];
  return p ? POSTURE_MUL[p] : 1;
}

function bump(w: World, key: string) {
  w.stats[key] = (w.stats[key] ?? 0) + 1;
}

/** 매달: 정착지마다 주변 칸을 한 칸씩 넓히고, 국경에서는 칸을 두고 다툰다 */
export function territoryMonth(w: World): void {
  const rng = w.rngSim;
  const centers = new Set<number>();
  for (const s of w.settlements) if (s.alive) centers.add(s.l * 1e6 + s.y * w.layers[s.l].w + s.x);
  // 빈 땅은 개척민이 일하는 자리 곁에서만 넓어진다 (사람 없이 저절로 넓어지는 일은 드물다)
  const spots = new Map<number, { l: number; x: number; y: number }[]>();
  for (const a of w.armies) if (a.alive && a.goal === 'clear' && !a.path.length) { const l = spots.get(a.home) ?? []; l.push(a); spots.set(a.home, l); }

  for (const s of w.settlements) {
    if (!s.alive || RACES[s.race].noPop || !s.tiles.length) continue;
    const f = w.factions[s.faction];
    if (!f || !f.alive) continue;
    const L = w.layers[s.l];
    const maxR = MAX_RADIUS[s.tier];
    const capTiles = Math.PI * maxR * maxR;
    const style = expandStyle(w, f);
    const reach = maxR * REACH[style];
    // 땅이 비좁을수록, 사람이 많을수록 더 넓히려 한다
    const crowd = clamp(s.pop / (s.tiles.length * 18), 0.2, 2, );
    const dlBoost = w.demonLord >= 0 && (w.chars[w.demonLord]?.faction === f.id || f.flags.includes('dlvassal')) ? 2 : 1;
    const tries = (2 + Math.min(4, Math.floor(s.pop / 300))) * dlBoost;
    for (let i = 0; i < tries; i++) {
      if (!rng.chance(0.3 + 0.35 * crowd)) continue;
      // 국경(우리 땅이 아닌 이웃이 있는 칸) 몇 곳을 살펴, 성향에 맞는 곳을 고른다
      let x = -1, y = -1, best = -Infinity;
      for (let j = 0, found = 0; j < 14 && found < 5; j++) {
        const from = rng.pick(s.tiles);
        const [dx, dy] = rng.pick(DIRS);
        const nx = (from % L.w) + dx, ny = ((from / L.w) | 0) + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const nk = ny * L.w + nx;
        if (L.owner[nk] === s.faction || !claimable(L.terrain[nk]) || centers.has(s.l * 1e6 + nk)) continue;
        if (Math.hypot(nx - s.x, ny - s.y) > reach) continue;
        found++;
        const a = tileAppeal(w, s, style, nk, nx, ny);
        if (a > best) { best = a; x = nx; y = ny; }
      }
      if (x < 0) continue;
      const k = y * L.w + x;
      const cur = L.claim[k];
      if (cur < 0) {
        // 빈 땅: 개척민이 곁에 있어야 일굴 수 있다
        const near = (spots.get(s.id) ?? []).some(p => p.l === s.l && Math.hypot(p.x - x, p.y - y) <= 2.5);
        if (!near && !rng.chance(0.012)) continue;
        if (s.tiles.length > capTiles * 1.2) continue;
        if (s.stock[FOOD] < s.cons[FOOD] * 2 + 3) continue;
        s.stock[FOOD] -= 1;
        s.stock[WOOD] = Math.max(0, s.stock[WOOD] - 1);
        L.claim[k] = s.id;
        L.owner[k] = s.faction;
        s.tiles.push(k);
        continue;
      }
      const os = w.settlements[cur];
      if (!os || !os.alive || os.faction === s.faction) continue;
      const of = w.factions[os.faction];
      if (!of) continue;
      const war = atWar(f, of.id);
      if (!war) {
        // 평시 잠식: 사이가 나쁘고 탐욕스러운 지도자만
        const ld = leaderOf(w, f);
        if (!ld || facRel(f, of.id) > -20 || (ld.traits[GREED] + ld.traits[AMBITION]) / 2 < 55 || !rng.chance(0.12)) continue;
      }
      const atk = tilePower(w, s, x, y) * (war ? 1 : 0.6) * postureOf(f, of.id) ** 0.5;
      const def = tilePower(w, os, x, y) * postureOf(of, f.id);
      if (rng.chance((atk / (atk + def)) * 0.55)) {
        L.claim[k] = s.id;
        L.owner[k] = s.faction;
        os.tiles = os.tiles.filter(t => t !== k);
        s.tiles.push(k);
        bump(w, `${war ? 'bw' : 'bp'}:${f.id}:${of.id}`);
        if (!war) addFacRel(w, f, of, -2);
      }
    }
    // 사람이 모자라면 돌보지 못한 먼 땅부터 다시 황무지로 돌아간다
    const support = 12 + s.pop / 3;
    if (s.tiles.length > support && s.tiles.length > 1) {
      const excess = s.tiles.length - support;
      const lose = Math.min(6, Math.ceil(excess / 12));
      const ck = s.y * L.w + s.x;
      const far = s.tiles.filter(k => k !== ck).sort((a, b) => Math.hypot((b % L.w) - s.x, ((b / L.w) | 0) - s.y) - Math.hypot((a % L.w) - s.x, ((a / L.w) | 0) - s.y)).slice(0, lose);
      for (const k of far) { L.claim[k] = -1; L.owner[k] = -1; }
      if (far.length) {
        const gone = new Set(far);
        s.tiles = s.tiles.filter(k => !gone.has(k));
        w.stats[`fade:${s.id}`] = (w.stats[`fade:${s.id}`] ?? 0) + far.length;
      }
    }
    // 너무 먼 칸은 지키지 못해 떨어져 나간다
    if (rng.chance(0.1) && s.tiles.length > 1) {
      const k = rng.pick(s.tiles);
      const x = k % L.w, y = (k / L.w) | 0;
      if (Math.hypot(x - s.x, y - s.y) > reach + 1.5) {
        L.claim[k] = -1;
        L.owner[k] = -1;
        s.tiles = s.tiles.filter(t => t !== k);
      }
    }
  }
  if (w.t % 12 === 0) reportBorders(w);
}

function reportBorders(w: World): void {
  const rng = w.rngSim;
  for (const key of Object.keys(w.stats)) {
    if (!key.startsWith('fade:')) continue;
    const n = w.stats[key];
    delete w.stats[key];
    const s = w.settlements[+key.split(':')[1]];
    if (!s || n < 8) continue;
    addNews(w, rng.pick([`돌보는 이가 없어 ${s.name} 바깥의 밭 ${n}칸이 다시 황무지로 돌아갔다.`, `일손이 모자란 ${s.name}이(가) 먼 땅 ${n}칸을 끝내 내버려 두었다. 울타리가 쓰러지고 들풀이 무성해졌다.`,
      `${s.name}의 사람들이 줄어 바깥 땅 ${n}칸에 다시 짐승들이 돌아왔다.`]), 1, 'nature', { pos: s, facs: [s.faction] });
  }
  for (const key of Object.keys(w.stats)) {
    if (!key.startsWith('bw:') && !key.startsWith('bp:')) continue;
    const n = w.stats[key];
    delete w.stats[key];
    const [kind, a, b] = key.split(':');
    const fa = w.factions[+a], fb = w.factions[+b];
    if (!fa || !fb || n < 3) continue;
    if (kind === 'bw') addNews(w, `${fa.name}이(가) 지난 한 해 동안 ${fb.name}의 국경 땅 ${n}칸을 빼앗았다.`, n >= 10 ? 3 : 2, 'war', { facs: [fa.id, fb.id] });
    else addNews(w, `${fa.name}이(가) 전쟁도 없이 ${fb.name}의 변경 ${n}칸을 야금야금 잠식하였다.`, 2, 'politics', { facs: [fa.id, fb.id] });
  }
}

/** 국경 태세: 경계 강화(수비↑, 관계↓) / 화친(수비↓, 관계↑). 1년에 한 번 정한다 */
export function updatePosture(w: World, f: Faction, neighbors: Faction[]): void {
  const ld = leaderOf(w, f);
  if (!ld) return;
  f.posture ??= {};
  for (const o of neighbors) {
    const r = facRel(f, o.id);
    const t = ld.traits;
    let want: Posture | undefined;
    if (atWar(f, o.id) || r < -25 || (t[PRUDENCE] > 65 && o.military > f.military * 1.2 && r < 10)) want = 'guard';
    else if (r > 10 && (t[SOCIAL] + t[COMPASSION]) / 2 > 55) want = 'open';
    const cur = f.posture[o.id];
    if (want === cur) continue;
    if (want) f.posture[o.id] = want; else delete f.posture[o.id];
    if (want === 'guard' && !atWar(f, o.id)) addNews(w, `${f.name}이(가) ${o.name}과(와)의 국경에 수비대를 늘리고 망루를 세웠다.`, 1, 'politics', { facs: [f.id, o.id] });
    if (want === 'open') addNews(w, `${f.name}의 ${ld.name}이(가) ${o.name}과(와)의 국경 수비대를 물리고 화친의 뜻을 보였다.`, 2, 'politics', { facs: [f.id, o.id], chars: [ld.id] });
  }
  // 태세의 효과: 경계는 관계를 식히고 비용이 들며, 화친은 관계를 데운다
  const nb = new Set(neighbors.map(o => o.id));
  for (const [id, p] of Object.entries(f.posture)) {
    const o = w.factions[+id];
    if (!o || !o.alive || !nb.has(o.id)) { delete f.posture[+id]; continue; }
    if (p === 'guard') addFacRel(w, f, o, -3);
    else addFacRel(w, f, o, 4);
  }
}

/** 두 세력이 칸으로 맞닿아 있는지 */
export function borderNeighbors(w: World, f: Faction): Faction[] {
  const out = new Set<number>();
  for (const sid of f.settlements) {
    const s = w.settlements[sid];
    if (!s?.alive) continue;
    const L = w.layers[s.l];
    for (const k of s.tiles) {
      const x = k % L.w, y = (k / L.w) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const o = L.owner[ny * L.w + nx];
        if (o >= 0 && o !== f.id) out.add(o);
      }
    }
  }
  return [...out].map(id => w.factions[id]).filter(o => o && o.alive);
}
