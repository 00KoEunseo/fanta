import { RACES, type RaceKey } from '../data/races';
import { onPilgrimArrive, pilgrimSite } from './religion';
import { knows, knowsRealm, reachFactor } from './contact';
import { lordLine, marketLine, prayLine, rulerLine, serveLine, socialLine, studyLine, trainLine } from './flavor';
import { disasterStrikes } from './peril';
import { TERRAIN } from '../data/terrain';
import * as TT from '../data/terrain';
import { EPITHETS, dragonEpithet, makeName, uniqueName } from '../data/names';

/** 같은 종족의 살아 있는 인물이 이미 쓰는 이름인가 */
function nameTaken(w: World, race: RaceKey): (n: string) => boolean {
  const used = new Set<string>();
  for (const c of w.chars) if (c.died < 0 && c.race === race) used.add(c.name);
  return n => used.has(n);
}
import {
  AMBITION, APT_COUNT, APT_DEMONLORD, APT_HERO, APT_KING, APT_MERCHANT, APT_SAGE, APT_TRAITOR, COMPASSION, COURAGE,
  CURIOSITY, FAITH, GREED, LOYALTY, PRIDE, PRUDENCE, RACE_JOBS, ROLES, SOCIAL, TRAIT_COUNT, type Role,
} from '../data/traits';
import { tpl } from '../data/text';
import { addNews, charLog } from './news';
import { fixJosa } from '../data/text';
import { MOVE_FLY, MOVE_WALK, advance, findPath, moveCost, posOf, rebuildPortalLinks } from './path';
import type { Character, Pos, Settlement, Site, World } from './state';
import { ageOf, dist } from './state';
import {
  addRel, approxDist, charLabel, charPower, clamp, isAdult, isHero, leaderOf, rel, settlementsOf, titleOf, findAncestor } from './helpers';
import { attemptCoup, invalidateDist } from './factions';
import { ancientMonth, patronMonth } from './calamity';
import { findBuried, onHolderDeath } from './artifacts';
import { angelDeathChance, onAngelDeath } from './angels';
import { allowsSlavery, enslaveChar, freeChar } from './slavery';
import { charKnowsDL, strongEnoughAlone, tryHeroParty } from './crusade';
import { onHouseDeath } from './houses';

export interface NewCharOpts {
  race: RaceKey;
  sex?: 'M' | 'F';
  faction: number;
  home: number;
  pos: Pos;
  born: number;
  father?: number;
  mother?: number;
  traits?: number[];
  apt?: number[];
  name?: string;
}

export function createCharacter(w: World, o: NewCharOpts): Character {
  const rng = w.rngSim;
  const R = RACES[o.race];
  const sex = o.sex ?? (rng.chance(0.5) ? 'M' : 'F');
  const fa = o.father !== undefined ? w.chars[o.father] : undefined;
  const mo = o.mother !== undefined ? w.chars[o.mother] : undefined;
  const traits: number[] = [];
  for (let i = 0; i < TRAIT_COUNT; i++) {
    let v: number;
    if (o.traits) v = o.traits[i];
    else if (fa && mo) v = (fa.traits[i] + mo.traits[i]) / 2 + rng.normal(0, 15);
    else v = rng.normal(50, 18) + (R.traitBias[i] ?? 0);
    traits.push(clamp(Math.round(v)));
  }
  const apt: number[] = [];
  for (let i = 0; i < APT_COUNT; i++) {
    let v: number;
    if (o.apt) v = o.apt[i];
    else {
      v = rng.normal(22, 15) + R.aptBias[i];
      if (fa && mo) v = v * 0.6 + Math.max(fa.apt[i], mo.apt[i]) * 0.4;
      if (rng.chance(0.04)) v += rng.float(30, 55);
    }
    apt.push(clamp(Math.round(v)));
  }
  const might = clamp(rng.normal(35, 12) * Math.min(1.6, R.might) + (o.race === 'dragon' ? 40 : 0));
  const c: Character = {
    id: w.chars.length,
    name: o.name ?? uniqueName(rng, o.race, sex, nameTaken(w, o.race)),
    epithet: o.race === 'dragon' ? dragonEpithet(rng) : '',
    race: o.race, sex, born: o.born, died: -1, cause: '',
    faction: o.faction, home: o.home,
    l: o.pos.l, x: o.pos.x, y: o.pos.y, pl: o.pos.l, px: o.pos.x, py: o.pos.y,
    traits, apt, awakened: [],
    stats: {
      might,
      intellect: clamp(rng.normal(40, 14) + (apt[APT_SAGE] - 25) * 0.3),
      magic: clamp(rng.normal(25, 14) * R.magic),
      command: clamp(rng.normal(30, 14) + (apt[APT_KING] - 25) * 0.3),
      charisma: clamp(rng.normal(40, 15) + (traits[SOCIAL] - 50) * 0.2 + (apt[APT_KING] - 25) * 0.2),
      health: clamp(rng.normal(80, 10)),
    },
    wealth: rng.int(5, 40), honor: 10, fame: 0, mood: 60,
    rank: 0, role: '평민', title: '',
    relations: {}, father: o.father ?? -1, mother: o.mother ?? -1, spouse: -1, children: [],
    log: [], bio: [], act: { kind: 'idle' }, isPlayer: false, plot: 0, items: [], kills: 0,
    lifespan: Math.max(R.adult + 5, rng.normal(R.lifespan[0], R.lifespan[1])),
  };
  w.chars.push(c);
  const ph = fa?.house ?? mo?.house;
  if (ph !== undefined && w.houses[ph]?.alive) c.house = ph;
  if (fa) { fa.children.push(c.id); addRel(w, fa, c, 50); }
  if (mo) { mo.children.push(c.id); addRel(w, mo, c, 60); }
  return c;
}

/** 성인이 될 때 진로를 고른다 */
export function chooseRole(w: World, c: Character): Role {
  const t = c.traits, a = c.apt, rng = w.rngSim;
  const score: Record<string, number> = {
    전사: t[COURAGE] + c.stats.might,
    마법사: c.stats.magic * 1.5 + t[CURIOSITY] * 0.5,
    학자: c.stats.intellect + t[CURIOSITY] + a[APT_SAGE] * 0.5,
    상인: t[GREED] + t[SOCIAL] * 0.5 + a[APT_MERCHANT],
    성직자: t[FAITH] * 1.5 + t[COMPASSION] * 0.5,
    사냥꾼: c.stats.might * 0.6 + 40,
    장인: t[PRUDENCE] + 30,
    모험가: t[CURIOSITY] + t[COURAGE] * 0.6 + a[APT_HERO] * 0.4,
    도적: t[GREED] + (100 - t[COMPASSION]) * 0.6 - t[LOYALTY] * 0.3,
    음유시인: t[SOCIAL] + c.stats.charisma * 0.6,
    기사: c.stats.might * 0.6 + t[LOYALTY] * 0.6 + t[PRIDE] * 0.3,
    농부: 60 + t[PRUDENCE] * 0.3,
    광부: c.stats.might * 0.6 + (c.race === 'dwarf' || c.race === 'kobold' ? 60 : 10),
    대장장이: c.stats.might * 0.5 + t[PRUDENCE] * 0.5 + (c.race === 'dwarf' ? 40 : 0),
    치유사: t[COMPASSION] + c.stats.intellect * 0.5,
    연금술사: c.stats.intellect * 0.6 + t[CURIOSITY] * 0.6 + c.stats.magic * 0.3,
    선원: t[COURAGE] * 0.5 + t[CURIOSITY] * 0.5 + (c.l === 2 ? 20 : -40),
    드루이드: t[FAITH] * 0.6 + c.stats.magic * 0.6,
    주술사: t[FAITH] * 0.5 + c.stats.magic * 0.7,
    암살자: (100 - t[COMPASSION]) * 0.6 + c.stats.might * 0.4 + t[PRUDENCE] * 0.3,
    사령술사: c.stats.magic * 0.8 + (100 - t[COMPASSION]) * 0.4,
    함정꾼: t[PRUDENCE] * 0.6 + c.stats.intellect * 0.5,
    조련사: t[COURAGE] * 0.5 + c.stats.charisma * 0.4 + 20,
  };
  const allowed = (RACE_JOBS[c.race] ?? ROLES).filter(r => score[r] !== undefined);
  const pick = rng.weighted(allowed.length ? allowed : ROLES, r => Math.pow(Math.max(1, score[r] ?? 30), 2.2));
  return pick ?? '전사';
}

/** 직업마다 일하는 땅: 그 칸이 일터로 어울리는가 */
type Spot = (w: World, s: Settlement, k: number) => boolean;
const tileOk = (w: World, l: number, k: number, f: (tid: number) => boolean) => f(w.layers[l].terrain[k]);
const yieldsOf = (w: World, l: number, k: number) => TERRAIN[w.layers[l].terrain[k]].yields;
const FIELD: Spot = (w, s, k) => yieldsOf(w, s.l, k)[0] >= 1.5;
const MINE: Spot = (w, s, k) => { const y = yieldsOf(w, s.l, k); return y[2] + y[3] >= 1.5; };
const WILD: Spot = (w, s, k) => tileOk(w, s.l, k, t => t === TT.FOREST || t === TT.DEEPFOREST || t === TT.SWAMP || t === TT.FUNGUS || t === TT.ISLE);
const SHORE: Spot = (w, s, k) => {
  if (s.l !== 2) return false;
  const L = w.layers[2], x = k % L.w, y = (k / L.w) | 0;
  if (L.terrain[k] === TT.OCEAN) return false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = L.terrain[(y + dy) * L.w + x + dx]; if (t === TT.OCEAN || t === TT.SHALLOW) return true; }
  return false;
};
const BORDER: Spot = (w, s, k) => {
  const L = w.layers[s.l], x = k % L.w, y = (k / L.w) | 0;
  for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) return true;
    if (L.owner[ny * L.w + nx] !== s.faction) return true;
  }
  return false;
};
const ROLE_SPOT: Partial<Record<Role, Spot>> = {
  농부: FIELD, 광부: MINE, 사냥꾼: WILD, 드루이드: WILD, 조련사: WILD, 함정꾼: WILD, 선원: SHORE,
  전사: BORDER, 기사: BORDER, 도적: (w, s, k) => WILD(w, s, k) || BORDER(w, s, k), 암살자: (w, s, k) => WILD(w, s, k) || BORDER(w, s, k),
  노예: (w, s, k) => FIELD(w, s, k) || MINE(w, s, k),
};

/** 오늘 일하러 갈 칸 (2년마다 바뀐다). 없으면 마을 한가운데 */
function workSpot(w: World, c: Character, s: Settlement): Pos {
  const L = w.layers[s.l];
  const f = isAdult(w, c) ? ROLE_SPOT[c.role] : undefined;
  if (f && s.tiles.length > 1) {
    const cands = s.tiles.filter(k => f(w, s, k) && moveCost(L.terrain[k], { race: c.race, flying: RACES[c.race].flying }) > 0);
    if (cands.length) {
      const k = cands[(c.id * 7919 + Math.floor(w.t / 24) * 31) % cands.length];
      return { l: s.l, x: k % L.w, y: (k / L.w) | 0 };
    }
  }
  return s;
}

/** 일터나 집 근처로 걸어서 움직인다 (한 달에 최대 3칸) */
export function wander(w: World, c: Character): void {
  const s = w.settlements[c.home];
  if (!s || !s.alive) return;
  const L = w.layers[s.l];
  const k0 = c.l === s.l ? c.y * L.w + c.x : -1;
  // 영토 밖 멀리 나가 있으면 먼저 돌아온다
  if (c.l !== s.l || (Math.hypot(c.x - s.x, c.y - s.y) > 4 && L.claim[k0] !== s.id)) { relocate(w, c, s); return; }
  const spot = workSpot(w, c, s);
  const m = { race: c.race, flying: RACES[c.race].flying };
  const d = Math.hypot(spot.x - c.x, spot.y - c.y);
  let tx = spot.x, ty = spot.y;
  if (d <= 1.5) { tx = spot.x + w.rngSim.int(-1, 1); ty = spot.y + w.rngSim.int(-1, 1); }
  else if (d > 3) { tx = Math.round(c.x + (spot.x - c.x) * 3 / d); ty = Math.round(c.y + (spot.y - c.y) * 3 / d); }
  if (tx >= 0 && ty >= 0 && tx < L.w && ty < L.h && moveCost(L.terrain[ty * L.w + tx], m) > 0) setPos(c, { l: s.l, x: tx, y: ty });
}

/** 이 고을은 그 직업에 맞는 땅이 얼마나 있는가 */
function roleFit(w: World, c: Character, s: Settlement): number {
  const f = ROLE_SPOT[c.role];
  if (!f) return 1 + s.tier * 0.4;
  let n = 0;
  for (const k of s.tiles) if (f(w, s, k)) n++;
  return 0.2 + n / 6;
}

export function setPos(c: Character, p: Pos): void {
  c.l = p.l; c.x = p.x; c.y = p.y;
}

/** 지금 실제로 걸어갈 수 있는 가까운 유적 (없으면 null) */
export function reachableSite(w: World, c: Character): Site | null {
  const cands = w.sites.filter(s => (s.loot > 0 || s.relic) && s.kind !== 'deep' && approxDist(w, c, s) < 45).sort((a, b) => approxDist(w, c, a) - approxDist(w, c, b));
  return cands.slice(0, 6).find(s => canTravel(w, c, s, 'adventure')) ?? null;
}

/** 탐험을 떠난다: 실제로 유적까지 걸어간다. 도착하면 결과가 난다 (탄생 모드는 유적 입구에서 선택) */
export function startExpedition(w: World, c: Character, siteId?: number): string {
  if (c.act.kind !== 'idle') return '지금은 다른 일로 길 위에 있다.';
  const cands = siteId !== undefined && w.sites[siteId] ? [w.sites[siteId]]
    : w.sites.filter(s => (s.loot > 0 || s.relic) && s.kind !== 'deep' && approxDist(w, c, s) < 45).sort((a, b) => approxDist(w, c, a) - approxDist(w, c, b));
  lastBlocked = null;
  for (const s of cands.slice(0, 6)) {
    if (setTravel(w, c, s, 'adventure', s.id)) {
      const months = Math.max(1, Math.ceil((c.act.path?.length ?? 4) / 4));
      charLog(w, c, `${s.name}을(를) 향해 탐험길에 올랐다.`, 2);
      return `${s.name}을(를) 향해 길을 나섰다. (약 ${months}개월 길)`;
    }
  }
  // 고르는 사이에 전쟁이 나 국경이 닫혔을 수 있다
  if (lastBlocked) return `${lastBlocked}의 국경 수비대에 가로막혀 발길을 돌렸다.`;
  return cands.length ? '짐을 꾸리던 참에 국경이 닫혔다는 소식이 들려왔다. 길은 다음으로 미루었다.' : '근처에는 탐험할 만한 곳이 남아 있지 않았다.';
}

/** 다른 곳으로 옮겨 간다: 가까우면 바로, 멀면 실제로 길을 걸어간다 (순간이동 금지) */
export function relocate(w: World, c: Character, dest: Pos): void {
  if (c.act.kind === 'army' || c.act.kind === 'colonize' || c.act.kind === 'party' || c.act.kind === 'voyage' || c.act.kind === 'fleet' || c.act.kind === 'caravan' || c.act.kind === 'camp') return;
  if (c.l === dest.l && Math.hypot(c.x - dest.x, c.y - dest.y) <= 3) { setPos(c, dest); return; }
  if (c.act.kind === 'travel' && c.act.purpose === 'return' && c.act.dest && c.act.dest.l === dest.l && c.act.dest.x === dest.x && c.act.dest.y === dest.y) return;
  const keep = c.act;
  c.act = { kind: 'idle' };
  if (setTravel(w, c, dest, 'return')) return;
  // 이어진 길이 아예 없을 때만 어쩔 수 없이 옮긴다
  c.act = keep.kind === 'travel' ? { kind: 'idle' } : keep;
  setPos(c, dest);
}

/** 국경을 넘을 수 있는가: 큰 나라, 사이 나쁜 나라, 경계 중인 나라는 쉽게 지나갈 수 없다 */
/** 길목의 국경에 막히는가. roll=false면 확실한 봉쇄(전쟁·적대)만 보고 난수를 쓰지 않는다 */
function borderBlocked(w: World, c: Character, path: number[], roll = true): string | null {
  const mine = w.factions[c.faction];
  const checked = new Set<number>();
  for (let i = 0; i < path.length; i += 2) {
    const p = posOf(w, path[i]);
    const L = w.layers[p.l];
    const o = L.owner[p.y * L.w + p.x];
    if (o < 0 || o === c.faction || checked.has(o)) continue;
    checked.add(o);
    const f = w.factions[o];
    if (!f || !f.alive) continue;
    if (mine && mine.treaties.some(t => t.with === o)) continue;
    const rel = mine ? (mine.relations[o] ?? 0) : -10;
    if ((mine && mine.wars[o] !== undefined) || rel < -30) return f.name;
    const strict = (f.settlements.length >= 4 && rel < 10) || f.posture?.[c.faction] === 'guard';
    if (strict && roll && !w.rngSim.chance(0.1 + c.traits[PRUDENCE] / 500 + c.stats.intellect / 500)) return f.name;
  }
  return null;
}

/** 길을 나설 수 있는가: 길이 없거나 확실히 막혔으면 null, 아니면 길목의 깐깐한 국경(있다면)을 알려 준다.
 *  아무것도 바꾸지 않고 난수도 쓰지 않는다. 깐깐한 국경은 실제로 떠날 때 운에 따라 막힐 수 있다 */
export function travelCheck(w: World, c: Character, dest: Pos, purpose: NonNullable<Character['act']['purpose']>): { strict: string | null } | null {
  if (w.demonLord === c.id && !c.isPlayer && purpose !== 'return' && purpose !== 'flee') return null;
  const path = findPath(w, c, dest, { race: c.race, flying: RACES[c.race].flying }, 30000);
  if (!path) return null;
  const free = purpose === 'return' || purpose === 'duel' || purpose === 'hunt' || purpose === 'flee' || c.race === 'dragon' || isHero(c) || w.demonLord === c.id;
  if (free) return { strict: null };
  if (borderBlocked(w, c, path, false)) return null;
  return { strict: strictBorder(w, c, path) };
}

export function canTravel(w: World, c: Character, dest: Pos, purpose: NonNullable<Character['act']['purpose']>): boolean {
  return !!travelCheck(w, c, dest, purpose);
}

/** 길목에서 검문이 깐깐한 나라 (확률로 막힐 수 있다) */
function strictBorder(w: World, c: Character, path: number[]): string | null {
  const mine = w.factions[c.faction];
  for (let i = 0; i < path.length; i += 2) {
    const p = posOf(w, path[i]);
    const L = w.layers[p.l];
    const o = L.owner[p.y * L.w + p.x];
    if (o < 0 || o === c.faction) continue;
    const f = w.factions[o];
    if (!f || !f.alive || (mine && mine.treaties.some(t => t.with === o))) continue;
    const rel = mine ? (mine.relations[o] ?? 0) : -10;
    if ((f.settlements.length >= 4 && rel < 10) || f.posture?.[c.faction] === 'guard') return f.name;
  }
  return null;
}

/** 마지막으로 길을 막은 나라 (막힌 까닭을 이야기로 풀어 주려고) */
let lastBlocked: string | null = null;

export function setTravel(w: World, c: Character, dest: Pos, purpose: NonNullable<Character['act']['purpose']>, target = -1): boolean {
  // 마왕은 몸소 던전을 헤매지 않는다. 왕좌를 지킨다
  if (w.demonLord === c.id && !c.isPlayer && purpose !== 'return' && purpose !== 'flee') return false;
  const path = findPath(w, c, dest, { race: c.race, flying: RACES[c.race].flying }, 30000);
  if (!path) return false;
  const free = purpose === 'return' || purpose === 'duel' || purpose === 'hunt' || purpose === 'flee' || c.race === 'dragon' || isHero(c) || w.demonLord === c.id;
  if (!free) {
    const blocked = borderBlocked(w, c, path);
    if (blocked) {
      const bf = w.factions.find(f => f.alive && f.name === blocked);
      if (bf && allowsSlavery(w, bf) && !c.isPlayer && w.rngSim.chance(0.06)) {
        const cap = w.settlements[bf.capital];
        if (cap) { enslaveChar(w, c, cap); return false; }
      }
      charLog(w, c, `${blocked}의 국경 수비대에 가로막혀 발길을 돌렸다.`, 1);
      lastBlocked = blocked;
      return false;
    }
  }
  c.act = { kind: 'travel', purpose, dest: { l: dest.l, x: dest.x, y: dest.y }, target, path, months: 0, long: path.length >= 20 };
  return true;
}

function goHome(w: World, c: Character): void {
  const s = w.settlements[c.home];
  c.act = { kind: 'idle' };
  if (s && s.alive) relocate(w, c, s);
}

// ───────────── 죽음 / 각성

export function killChar(w: World, c: Character, cause: string, killer?: Character): void {
  if (c.died >= 0) return;
  const label0 = charLabel(w, c);
  c.died = w.t;
  // 사인은 화면과 책에 그대로 나오므로 조사를 바로잡아 둔다
  cause = fixJosa(cause);
  c.cause = cause;
  onAngelDeath(w, c, killer);
  onHouseDeath(w, c);
  c.act = { kind: 'idle' };
  const age = ageOf(w, c);
  const undead = RACES[c.race].adult === 0;
  charLog(w, c, undead ? `망자로 ${age}년을 떠돈 끝에 ${cause}(으)로 영영 스러졌다.` : `${age}세에 ${cause}(으)로 생을 마감하였다.`, 3);
  if (c.spouse >= 0) {
    const sp = w.chars[c.spouse];
    if (sp && sp.died < 0) { sp.spouse = -1; charLog(w, sp, `배우자 ${c.name}을(를) 잃었다.`, 3); sp.mood -= 20; }
  }
  // 유산
  const heirs = c.children.map(id => w.chars[id]).filter(k => k && k.died < 0);
  if (heirs.length) for (const h of heirs) h.wealth += c.wealth / heirs.length;
  if (c.race === 'dragon' && killer && !c.ancient) {
    w.doom.dragonGrievance++;
    if (c.patronOf !== undefined) {
      const pf = w.factions[c.patronOf];
      if (pf) pf.flags = pf.flags.filter(x => x !== `patron:${c.id}`);
    }
    addNews(w, `용 ${c.name}의 피가 대지를 적셨다. 용들의 원한이 쌓여 간다. (${w.doom.dragonGrievance}/3)`, 4, 'doom', { pos: c, chars: [c.id] });
  }
  onHolderDeath(w, c, killer);
  if (killer) {
    killer.kills++;
    addRel(w, killer, c, -50, false);
    for (const k of heirs) addRel(w, k, killer, -70, false);
  }
  for (const s of w.settlements) if (s.governor === c.id) s.governor = -1;
  if (isHero(c)) w.doom.heroDeaths++;
  if (w.demonLord === c.id) {
    w.demonLord = -1;
    closeRiftsAfterDl(w, c);
    if (killer) w.stats.dlSlain = (w.stats.dlSlain ?? 0) + 1;
    if (killer?.isPlayer && w.player) { w.player.flags ??= {}; w.player.flags.slayDl = w.t; }
    addNews(w, `마왕 ${c.name}${killer ? `이(가) ${charLabel(w, killer)}의 손에` : ''} 쓰러졌다. 세상을 뒤덮었던 어둠이 걷히기 시작하였다.`, 5, 'hero', { pos: c, chars: [c.id, ...(killer ? [killer.id] : [])] });
  }
  const f = w.factions[c.faction];
  const notable = c.fame >= 40 || c.rank >= 2 || (f && f.leader === c.id) || c.race === 'dragon' || isHero(c) || c.isPlayer;
  if (notable && w.demonLord !== c.id) {
    const imp = f && f.leader === c.id ? 4 : c.isPlayer ? 3 : c.fame >= 80 || isHero(c) ? 3 : 2;
    const label = (f && f.leader === c.id ? `${f.name}의 ` : '') + label0;
    const shortLived = RACES[c.race].lifespan[0] < 70;
    const text = cause === '노환' && !undead && c.race !== 'dragon'
      ? (shortLived ? `${label}이(가) 천수를 다하고 눈을 감았다.` : `${label}이(가) ${age}세로 천수를 다하고 세상을 떠났다.`)
      : `${label}이(가) ${c.race === 'dragon' || undead ? '' : `${age}세의 나이에 `}${cause}(으)로 ${undead ? '영영 스러졌다' : '세상을 떠났다'}.`;
    addNews(w, text, imp, killer ? 'war' : 'life', { pos: c, chars: [c.id], facs: f ? [f.id] : [] });
  }
}

export function awaken(w: World, c: Character, kind: 'hero' | 'sage' | 'merchant' | 'seed' | 'king' | 'traitor', why: string): void {
  if (c.awakened.includes(kind)) return;
  c.awakened.push(kind);
  const n = charLabel(w, c);
  switch (kind) {
    case 'hero':
      c.stats.might = clamp(c.stats.might + 20); c.stats.magic = clamp(c.stats.magic + 10); c.fame += 40; c.honor += 30;
      {
        // 핏줄 속의 옛 용사: 몇 대를 건너 다시 깨어난 피
        const anc = findAncestor(w, c, a => a.awakened.includes('hero'));
        const blood = anc ? ` ${anc.gen}대 위의 용사 ${anc.who.name}의 피가 다시 깨어난 것이라 사람들은 수군거렸다.` : '';
        addNews(w, `${why} ${c.name}의 안에 잠들어 있던 용사의 자질이 깨어났다. 사람들은 그를 '용사'라 부르기 시작하였다.${blood}`, 4, 'hero', { pos: c, chars: [c.id] });
      }
      break;
    case 'sage':
      c.stats.intellect = clamp(c.stats.intellect + 15); c.stats.magic = clamp(c.stats.magic + 10); c.fame += 20;
      addNews(w, `${n}이(가) ${why} 깨달음을 얻어 현자의 경지에 이르렀다.`, 2, 'hero', { pos: c, chars: [c.id] });
      break;
    case 'merchant':
      c.fame += 15; c.epithet = c.epithet || EPITHETS.merchant;
      addNews(w, `${c.name}이(가) 막대한 부를 쌓아 '${EPITHETS.merchant}'이라 불리게 되었다.`, 2, 'trade', { pos: c, chars: [c.id] });
      break;
    case 'seed':
      c.stats.magic = clamp(c.stats.magic + 15); c.stats.might = clamp(c.stats.might + 10); c.honor -= 20;
      charLog(w, c, `${why} 마음속 깊은 곳에서 검은 불꽃이 피어올랐다.`, 3);
      break;
    case 'king':
      c.stats.command = clamp(c.stats.command + 10); c.stats.charisma = clamp(c.stats.charisma + 10);
      charLog(w, c, `${why} 왕의 그릇임을 스스로 깨달았다.`, 3);
      break;
    case 'traitor':
      c.epithet = c.epithet || EPITHETS.traitor;
      break;
  }
}

/** 일대일 결투. 승자를 반환 */
export function duel(w: World, a: Character, b: Character, context: string): Character {
  const rng = w.rngSim;
  const pa = charPower(a, w) + rng.normal(0, 18), pb = charPower(b, w) + rng.normal(0, 18);
  const win = pa >= pb ? a : b, lose = win === a ? b : a;
  win.fame += 15 + Math.round(lose.fame * 0.3);
  win.stats.health = clamp(win.stats.health - rng.int(5, 30));
  if (rng.chance(0.75) || lose.race === 'dragon' || w.demonLord === lose.id) {
    if (lose.race === 'dragon' && !win.epithet) win.epithet = EPITHETS.dragonslayer;
    killChar(w, lose, context, win);
  } else {
    lose.stats.health = clamp(lose.stats.health - 40);
    charLog(w, lose, `${win.name}에게 패하여 크게 다쳤다.`, 2);
  }
  return win;
}

// ───────────── 월간 행동

type ActionKey = 'work' | 'train' | 'study' | 'trade' | 'adventure' | 'serve' | 'socialize' | 'court' | 'scheme' | 'pray' | 'crime' | 'hunt' | 'pact' | 'govern' | 'pilgrim';

const WORK_TEXT: Record<Role, string[]> = {
  평민: ['밭을 갈며 한 달을 보냈다.', '가축을 돌보았다.', '이웃의 일손을 도왔다.'],
  전사: ['성벽에서 경비를 섰다.', '동료들과 무기를 손질하였다.', '마을 근처의 짐승을 쫓아냈다.'],
  마법사: ['새 주문을 연구하였다.', '마나의 흐름을 관찰하였다.', '마법 재료를 모았다.'],
  학자: ['오래된 서책을 필사하였다.', '별의 움직임을 기록하였다.', '제자를 가르쳤다.'],
  상인: ['시장에서 장사를 하였다.', '창고의 물품을 정리하였다.', '값을 두고 흥정하였다.'],
  성직자: ['신전에서 설교를 하였다.', '병자를 돌보았다.', '제례를 집전하였다.'],
  사냥꾼: ['숲에서 사냥을 하였다.', '덫을 놓고 기다렸다.', '짐승의 흔적을 쫓았다.'],
  장인: ['공방에서 물건을 만들었다.', '도구를 고쳤다.', '새 기술을 시험하였다.'],
  모험가: ['근처를 정찰하였다.', '여관에서 소문을 모았다.', '지도를 그렸다.'],
  도적: ['뒷골목을 배회하였다.', '수상한 자들과 어울렸다.', '조용히 몸을 숨겼다.'],
  음유시인: ['주점에서 노래를 불렀다.', '새 영웅담을 지었다.', '축제에서 연주하였다.'],
  백수: ['하릴없이 빈둥거렸다.', '낮잠을 늘어지게 잤다.', '일자리를 기웃거렸다.'],
  기사: ['기사단 훈련에 참가하였다.', '영주의 행차를 호위하였다.', '말을 돌보았다.'],
  농부: ['밭을 갈았다.', '씨앗을 뿌렸다.', '수확한 곡식을 창고에 쌓았다.'],
  광부: ['갱도에서 곡괭이질을 하였다.', '새 갱도를 뚫었다.', '광석을 실어 날랐다.'],
  대장장이: ['쇠를 달구어 칼을 벼렸다.', '말발굽을 갈아 끼웠다.', '농기구를 고쳤다.'],
  치유사: ['약초를 달였다.', '다친 이를 치료하였다.', '산모의 해산을 도왔다.'],
  연금술사: ['수상한 물약을 끓였다.', '금속을 녹여 실험하였다.', '실험실에서 작은 폭발을 일으켰다.'],
  선원: ['그물을 손질하였다.', '배를 타고 바다로 나갔다.', '항구에서 짐을 부렸다.'],
  드루이드: ['숲의 정령과 대화하였다.', '병든 나무를 돌보았다.', '계절의 의식을 치렀다.'],
  주술사: ['조상의 영혼을 불러냈다.', '부적을 만들었다.', '북을 두드리며 춤을 추었다.'],
  암살자: ['칼날에 독을 발랐다.', '그림자 속에서 표적을 지켜보았다.', '지붕 위를 소리 없이 달렸다.'],
  사령술사: ['묘지에서 뼈를 골랐다.', '망자의 목소리를 들었다.', '해골 하인에게 일을 시켰다.'],
  함정꾼: ['갱도에 새 함정을 설치하였다.', '덫의 용수철을 갈았다.', '함정에 걸린 침입자를 끌어냈다.'],
  조련사: ['마수에게 먹이를 주었다.', '거미를 길들였다.', '새끼 늑대에게 명령을 가르쳤다.'],
  노예: ['채찍 아래 돌을 날랐다.', '주인의 밭에서 해 질 때까지 일하였다.', '쇠사슬 소리를 들으며 잠들었다.'],
};

function actionScores(w: World, c: Character): Record<ActionKey, number> {
  const t = c.traits.map(v => v / 100);
  const a = c.apt.map(v => v / 100);
  const f = w.factions[c.faction];
  const isLeader = f && f.leader === c.id;
  const isGov = c.rank === 2;
  const role = c.role;
  const s: Record<ActionKey, number> = {
    work: 1.0 + (role === '평민' || role === '장인' || role === '농부' || role === '광부' || role === '대장장이' || role === '선원' ? 0.6 : 0),
    train: 0.2 + t[COURAGE] * 0.6 + (role === '전사' || role === '기사' ? 0.6 : 0) + a[APT_HERO] * 0.3,
    study: 0.15 + t[CURIOSITY] * 0.4 + (role === '학자' || role === '마법사' || role === '연금술사' || role === '사령술사' || role === '드루이드' || role === '주술사' ? 0.8 : 0) + a[APT_SAGE] * 0.4,
    trade: (role === '상인' ? 1.0 : 0.05) + t[GREED] * 0.3 + a[APT_MERCHANT] * 0.4,
    adventure: (role === '모험가' ? 0.8 : 0.05) + t[CURIOSITY] * 0.3 + t[COURAGE] * 0.3 - t[PRUDENCE] * 0.2,
    serve: 0.2 + t[LOYALTY] * 0.6 + t[PRIDE] * 0.2,
    socialize: 0.2 + t[SOCIAL] * 0.7,
    court: c.spouse < 0 && fertile(w, c) ? 0.3 + t[SOCIAL] * 0.5 : 0,
    scheme: c.rank >= 1 && !isLeader ? Math.max(0, t[AMBITION] - 0.5) * 1.6 * (1.2 - t[LOYALTY]) + a[APT_TRAITOR] * 0.3 : 0,
    pray: 0.1 + t[FAITH] * 0.6 + (role === '성직자' || role === '치유사' ? 0.6 : 0),
    crime: Math.max(0, t[GREED] - t[COMPASSION]) * 0.8 + (role === '도적' || role === '암살자' ? 0.8 : 0),
    hunt: isHero(c) && w.demonLord !== c.id ? 1.6 : 0,
    pact: !c.awakened.includes('seed') && c.apt[APT_DEMONLORD] >= 65 && c.traits[COMPASSION] < 40 ? 0.15 + a[APT_DEMONLORD] * 0.2 : 0,
    govern: isLeader ? 2.5 : isGov ? 1.6 : 0,
    pilgrim: t[FAITH] > 0.7 ? 0.08 : 0,
  };
  if (c.stats.health < 35) { s.adventure *= 0.1; s.train *= 0.3; s.hunt *= 0.2; }
  if (c.isPlayer) { s.scheme = 0; s.court = 0; s.pact = 0; applyPlayerPath(w, c, s); }
  return s;
}

function applyPlayerPath(w: World, c: Character, s: Record<ActionKey, number>) {
  const p = w.player?.path;
  if (p === 'warrior') s.train += 1;
  if (p === 'scholar') s.study += 1.2;
  if (p === 'merchant') s.trade += 1.2;
  if (p === 'priest') s.pray += 1.2;
  if (p === 'wanderer') s.adventure += 1;
}

/** 핏줄인가 (부모, 자식, 형제) */
export function kin(a: Character, b: Character): boolean {
  if (a.father === b.id || a.mother === b.id || b.father === a.id || b.mother === a.id) return true;
  return (a.father >= 0 && a.father === b.father) || (a.mother >= 0 && a.mother === b.mother);
}
export function fertile(w: World, c: Character): boolean {
  const R = RACES[c.race];
  // 망자는 아이를 낳지 않는다
  if (c.race === 'undead') return false;
  const age = ageOf(w, c);
  return R.growth > 0 && age >= R.adult && age < R.adult + c.lifespan * 0.45;
}

export function characterMonth(w: World, c: Character): void {
  const rng = w.rngSim;
  c.pl = c.l; c.px = c.x; c.py = c.y;
  if (c.race === 'dragon') { dragonMonth(w, c); return; }
  if (c.act.kind === 'army' || c.act.kind === 'colonize') {
    // 군대가 위치를 갱신한다. 군대가 사라졌으면 귀환
    const army = w.armies[c.act.target ?? -1];
    // 탄생 모드의 인물은 병사로 따라갈 수 있다 (expedition.ts가 챙긴다)
    if (c.isPlayer && w.player?.flags?.armyId === c.act.target) return;
    if (!army || !army.alive || army.commander !== c.id) c.act = { kind: 'idle' };
    return;
  }
  if (c.act.kind === 'party' || c.act.kind === 'voyage' || c.act.kind === 'fleet') return;
  // 상단을 이끄는 중: 상단이 함께 움직인다. 상단이 사라졌으면 일상으로
  // 주둔지를 지키는 중
  if (c.act.kind === 'camp') {
    const k = w.camps?.[c.act.target ?? -1];
    if (!k || !k.alive || k.commander !== c.id) c.act = { kind: 'idle' };
    return;
  }
  if (c.act.kind === 'caravan') {
    const k = w.caravans?.[c.act.target ?? -1];
    if (!k || !k.alive || !k.crew.includes(c.id)) c.act = { kind: 'idle' };
    return;
  }
  if (c.act.kind === 'travel') { travelMonth(w, c); return; }
  // 나이가 들수록 상처가 더디게 아문다
  const old = ageOf(w, c) > c.lifespan * 0.6;
  c.stats.health = clamp(c.stats.health + (old ? 0.8 : 1.5));
  // 험한 일을 하는 이는 일하다 다친다
  const risk = RISK_JOBS[c.role];
  if (risk && isAdult(w, c) && rng.chance(risk)) {
    const dmg = rng.int(8, 28) * clamp(1.2 - c.stats.might / 200, 0.6, 1.2);
    c.stats.health = clamp(c.stats.health - dmg);
    charLog(w, c, rng.pick(INJURY[c.role] ?? INJURY.전사), dmg >= 18 ? 2 : 1);
  }
  if (c.plot > 0) c.plot *= 0.99;
  const age = ageOf(w, c);
  const R = RACES[c.race];
  if (age < R.adult) {
    if (c.home >= 0) wander(w, c);
    if ((w.t - c.born) % 12 === 0 && age > 0 && rng.chance(0.5)) charLog(w, c, rng.pick(CHILD_TEXT), 1);
    return;
  }
  if (!c.isPlayer && c.role === '평민' && (c.title === '' || c.title === 'child')) {
    c.role = chooseRole(w, c);
    c.title = 'adult';
    charLog(w, c, `성인이 되어 ${c.role}의 길을 걷기 시작하였다.`, 2);
    // 절반은 고향에 남고, 절반은 같은 나라에서 그 일에 맞는 고을로 떠난다
    const f = w.factions[c.faction];
    const home = w.settlements[c.home];
    if (f && home && rng.chance(0.5) && w.settlements.every(s => s.governor !== c.id)) {
      const opts = settlementsOf(w, f).filter(s => s.alive && s.id !== home.id && s.l === home.l && s.pop > 40);
      const to = rng.weighted(opts, s => roleFit(w, c, s) * Math.sqrt(s.pop) * (s.id === f.capital ? 0.6 : 1));
      if (to && roleFit(w, c, to) > roleFit(w, c, home) * 0.8) {
        c.home = to.id;
        relocate(w, c, to);
        charLog(w, c, `일거리를 찾아 ${to.name}(으)로 떠났다.`, 2);
      }
    }
    return;
  }
  if (!c.isPlayer && (c.role === '노예' || c.role === '백수')) {
    // 나라나 고을을 다스리는 자가 노예나 백수일 수는 없다
    const rules = w.factions[c.faction]?.leader === c.id || w.settlements.some(s => s.alive && s.governor === c.id);
    if (rules) {
      c.role = chooseRole(w, c);
      charLog(w, c, `다스리는 자리에 걸맞게 ${c.role}의 길을 걷기로 하였다.`, 2);
    } else if (c.role === '백수' && rng.chance(0.04)) {
      // 백수도 언젠가는 밥벌이를 찾는다
      c.role = chooseRole(w, c);
      charLog(w, c, `오랜 방황 끝에 ${c.role}(으)로 살아가기 시작하였다.`, 2);
    }
  }
  if (c.role === '노예') {
    if (!c.isPlayer && rng.chance(0.004 * (0.5 + c.traits[COURAGE] / 100))) {
      freeChar(w, c, '어둠을 틈타 도망쳐');
      c.faction = -1; c.home = -1;
    } else doAction(w, c, 'work');
    return;
  }
  const scores = actionScores(w, c);
  const keys = Object.keys(scores) as ActionKey[];
  const act = rng.weighted(keys, k => Math.pow(scores[k] + rng.float(0, 0.15), 2)) ?? 'work';
  doAction(w, c, act);
}

/** 험한 직업: 달마다 크게 다칠 확률 */
const RISK_JOBS: Record<string, number> = { 전사: 0.02, 기사: 0.015, 모험가: 0.025, 광부: 0.02, 사냥꾼: 0.015, 암살자: 0.02, 도적: 0.015, 선원: 0.015, 조련사: 0.015, 함정꾼: 0.012, 노예: 0.02 };
const INJURY: Record<string, string[]> = {
  전사: ['훈련 중에 칼날에 깊이 베였다.', '싸움터에서 화살을 맞았다.'],
  기사: ['말에서 떨어져 갈비뼈가 부러졌다.', '마상 시합에서 창에 받혔다.'],
  모험가: ['동굴에서 굴러떨어져 다리를 다쳤다.', '괴물의 발톱에 등을 할퀴었다.'],
  광부: ['갱도가 무너져 깔렸다가 겨우 빠져나왔다.', '곡괭이에 발등을 찍혔다.'],
  사냥꾼: ['멧돼지에게 받혀 크게 다쳤다.', '덫을 손보다 손을 다쳤다.'],
  암살자: ['임무 중에 경비병의 칼에 찔렸다.', '지붕에서 미끄러져 떨어졌다.'],
  도적: ['도망치다 담에서 떨어졌다.', '경비병에게 붙잡혀 매질을 당하였다.'],
  선원: ['폭풍 속에서 돛대에 부딪혔다.', '밧줄에 손이 쓸려 살이 벗겨졌다.'],
  조련사: ['길들이던 짐승에게 물렸다.', '짐승의 뒷발에 차였다.'],
  함정꾼: ['자기가 놓은 덫에 걸렸다.'],
  노예: ['고된 노역 끝에 쓰러졌다.', '감독관의 채찍에 등이 찢어졌다.'],
};

const CHILD_TEXT = [
  '또래 아이들과 뛰어놀았다.', '어른들의 옛이야기를 귀담아들었다.', '처음으로 나무 검을 쥐어 보았다.',
  '심한 열병을 앓았으나 이겨냈다.', '글을 배우기 시작하였다.', '밤하늘의 별을 세며 잠들었다.',
];

function doAction(w: World, c: Character, act: ActionKey): void {
  const rng = w.rngSim;
  const f = w.factions[c.faction];
  const home = w.settlements[c.home];
  switch (act) {
    case 'work': {
      wander(w, c);
      c.wealth += rng.float(1, 4) * (c.role === '상인' || c.role === '장인' || c.role === '대장장이' || c.role === '광부' ? 1.6 : c.role === '백수' ? 0.2 : c.role === '노예' ? 0 : 1)
        * (home ? clamp((0.6 + home.dev / 100) * (0.5 + home.stability / 100), 0.4, 1.8) : 1);
      if (rng.chance(0.35)) charLog(w, c, rng.pick(WORK_TEXT[c.role]));
      break;
    }
    case 'train': {
      wander(w, c);
      c.stats.might = clamp(c.stats.might + rng.float(0.05, 0.5) * (1 - c.stats.might / 120));
      c.stats.command = clamp(c.stats.command + rng.float(0, 0.25) * (1 - c.stats.command / 120));
      charLog(w, c, trainLine(w, c));
      break;
    }
    case 'study': {
      c.stats.intellect = clamp(c.stats.intellect + rng.float(0.05, 0.5) * (1 - c.stats.intellect / 120));
      c.stats.magic = clamp(c.stats.magic + rng.float(0, 0.4) * RACES[c.race].magic * (1 - c.stats.magic / 120));
      charLog(w, c, studyLine(w, c));
      if (c.apt[APT_SAGE] >= 75 && c.stats.intellect > 72 && rng.chance(0.02)) awaken(w, c, 'sage', '오랜 연구 끝에');
      break;
    }
    case 'trade': {
      // 아는 나라의 고을로만 교역을 다닌다. 세상이 젊을수록 멀리 가지 않는다
      const dests = w.settlements.filter(s => s.alive && s.id !== c.home && s.l === c.l && dist(s, c) < 24 * reachFactor(w)
        && (s.faction === c.faction || (f && knows(w, f, s.faction) && (f.relations[s.faction] ?? 0) > -10 && f.wars[s.faction] === undefined)));
      const dest = dests.length ? rng.pick(dests) : undefined;
      if (dest && setTravel(w, c, dest, 'trade')) charLog(w, c, `교역품을 싣고 ${dest.name}(으)로 길을 나섰다.`);
      else { c.wealth += rng.float(2, 6); charLog(w, c, marketLine(w, c)); }
      break;
    }
    case 'adventure': {
      // 세상이 젊을 때는 가까운 유적만 기웃거린다 (멀리 정찰·탐험을 다니는 것은 세월이 흐른 뒤)
      const sites = w.sites.filter(s => (s.loot > 0 || s.relic) && s.kind !== 'deep' && knowsRealm(f, s.l) && approxDist(w, c, s) < 30 * reachFactor(w));
      if (sites.length) {
        const site = rng.pick(sites);
        if (setTravel(w, c, site, 'adventure', site.id)) { charLog(w, c, `${site.name}의 소문을 듣고 모험을 떠났다.`, 2); break; }
      }
      wander(w, c);
      charLog(w, c, '모험거리를 찾아 주변을 헤맸다.');
      break;
    }
    case 'serve': {
      const ld = f ? leaderOf(w, f) : null;
      if (ld && ld.id !== c.id) {
        addRel(w, c, ld, rng.float(1, 4));
        c.honor += 1;
        charLog(w, c, serveLine(w, c, ld));
      } else { c.honor += 0.5; charLog(w, c, '공동체를 위해 봉사하였다.'); }
      break;
    }
    case 'socialize': {
      const other = randomNeighbor(w, c);
      if (other) {
        const compat = 10 - Math.abs(c.traits[COMPASSION] - other.traits[COMPASSION]) / 5 - Math.abs(c.traits[PRIDE] - other.traits[PRIDE]) / 8;
        const d = compat + rng.normal(0, 8);
        addRel(w, c, other, d);
        charLog(w, c, socialLine(w, c, other, d > 8 ? 'good' : d < -6 ? 'bad' : 'plain'));
      }
      break;
    }
    case 'court': tryMarry(w, c); break;
    case 'scheme': {
      const ld = f ? leaderOf(w, f) : null;
      if (!ld || ld.id === c.id) break;
      const grudge = Math.max(0, -rel(c, ld.id)) / 25;
      c.plot += rng.float(1, 4) * (c.traits[AMBITION] / 60) * (1 + grudge) * (f.legitimacy < 50 ? 1.6 : 1);
      if (rng.chance(0.4)) charLog(w, c, rng.pick(['은밀히 동조자를 모았다.', `${ld.name}의 약점을 캐었다.`, '밤마다 수상한 자들과 밀담을 나누었다.']));
      if (c.plot >= 100) {
        const cap = w.settlements[w.factions[c.faction]?.capital ?? -1];
        if (cap && (c.l !== cap.l || dist(c, cap) > 6)) relocate(w, c, cap);
        else attemptCoup(w, c);
      }
      else if (c.plot > 50 && rng.chance(0.004 + ld.traits[PRUDENCE] / 8000)) {
        c.plot = 0;
        addRel(w, ld, c, -60);
        charLog(w, c, `음모가 ${ld.name}의 귀에 들어가 동조자들이 흩어졌다.`, 3);
      }
      break;
    }
    case 'pray': {
      c.honor += 0.5; c.mood = clamp(c.mood + 3);
      charLog(w, c, prayLine(w, c));
      break;
    }
    case 'crime': {
      const gain = rng.float(5, 20);
      if (rng.chance(0.12)) {
        c.honor -= 15; c.stats.health = clamp(c.stats.health - 15); c.wealth = Math.max(0, c.wealth - gain);
        charLog(w, c, '도둑질을 하다 붙잡혀 매질을 당하였다.', 2);
      } else {
        c.wealth += gain; c.honor -= 1;
        charLog(w, c, rng.pick(['남의 재물을 몰래 훔쳤다.', '노름판에서 속임수를 썼다.', '밀수에 손을 댔다.']));
      }
      break;
    }
    case 'hunt': heroHunt(w, c); break;
    case 'pact': {
      const nearRift = w.portals.some(p => p.kind === 'rift' && ((p.a.l === c.l && dist(p.a, c) < 30) || (p.b.l === c.l && dist(p.b, c) < 30)));
      if (c.race === 'majin' || c.race === 'demon' || nearRift || rng.chance(0.1)) {
        awaken(w, c, 'seed', c.race === 'majin' || c.race === 'demon' ? '마계의 피가 끓어오르며' : '심연의 속삭임에 귀를 기울인 끝에');
      } else charLog(w, c, '알 수 없는 갈망에 잠을 이루지 못하였다.');
      break;
    }
    case 'govern': {
      const isLeader = f && f.leader === c.id;
      if (isLeader) {
        f.legitimacy = clamp(f.legitimacy + 0.3 + (c.stats.charisma - 50) / 200);
        c.wealth += rng.float(5, 15);
        charLog(w, c, rulerLine(w, c));
      } else {
        const s = w.settlements.find(s => s.governor === c.id && s.alive);
        if (s) {
          s.stability = clamp(s.stability + (c.stats.charisma - 40) / 60 + (c.traits[COMPASSION] - 50) / 100);
          if (c.traits[GREED] > 65) { c.wealth += rng.float(5, 12); s.stability -= 0.5; }
          relocate(w, c, s);
          charLog(w, c, lordLine(w, c, s.name));
        }
      }
      break;
    }
    case 'pilgrim': {
      // 믿는 신앙이 있고, 그 성지를 알 때만 순례를 떠난다 (신앙 없는 세상에는 순례도 없다)
      const holy = pilgrimSite(w, c, f);
      if (holy && setTravel(w, c, holy, 'pilgrim', holy.id)) charLog(w, c, `${holy.name}(으)로 순례를 떠났다.`, 2);
      else charLog(w, c, prayLine(w, c));
      break;
    }
  }
  if (home && c.act.kind === 'idle' && c.l !== home.l) relocate(w, c, home);
}

function randomNeighbor(w: World, c: Character): Character | null {
  const list = w.chars.filter(o => o.died < 0 && o.id !== c.id && o.home === c.home && o.home >= 0 && o.act.kind === 'idle' && o.l === c.l && dist(o, c) < 6);
  return list.length ? w.rngSim.pick(list) : null;
}

export function tryMarry(w: World, c: Character, forced?: Character): boolean {
  const rng = w.rngSim;
  const cands = forced ? [forced] : w.chars.filter(o => o.died < 0 && o.spouse < 0 && o.sex !== c.sex && o.race === c.race
    && fertile(w, o) && o.id !== c.id && !o.isPlayer && o.act.kind === 'idle' && o.role !== '노예'
    && (o.home === c.home || (o.l === c.l && dist(o, c) < 15)) && !kin(c, o));
  if (!cands.length) return false;
  const o = forced ?? rng.weighted(cands, x => 1 + Math.max(0, rel(c, x.id) + 30) + x.stats.charisma * 0.3 + (x.home === c.home ? 20 : 0));
  if (!o) return false;
  if (!forced && rng.chance(0.55)) {
    addRel(w, c, o, rng.float(2, 8));
    charLog(w, c, `${o.name}에게 마음을 품었다.`);
    return false;
  }
  c.spouse = o.id; o.spouse = c.id;
  addRel(w, c, o, 40);
  if (c.house !== undefined && o.house === undefined) o.house = c.house;
  else if (o.house !== undefined && c.house === undefined) c.house = o.house;
  // 혼인하면 한집에 산다 (자리를 지켜야 하는 쪽 집으로)
  if (c.home !== o.home) {
    const ruling = (x: Character) => w.factions[x.faction]?.leader === x.id || w.settlements.some(s => s.alive && s.governor === x.id);
    const [mover, stay] = ruling(o) && !ruling(c) ? [c, o] : [o, c];
    const h = w.settlements[stay.home];
    if (h && h.alive && !mover.isPlayer && !ruling(mover)) { mover.home = h.id; mover.faction = stay.faction; relocate(w, mover, h); }
  }
  const text = `${c.name}과(와) ${o.name}이(가) 혼인하였다.`;
  charLog(w, c, `${o.name}과(와) 혼인하였다.`, 2);
  charLog(w, o, `${c.name}과(와) 혼인하였다.`, 2);
  const f1 = w.factions[c.faction], f2 = w.factions[o.faction];
  const royal = (f1 && f1.leader === c.id) || (f2 && f2.leader === o.id);
  if (royal || c.fame > 60 || o.fame > 60) addNews(w, text, royal ? 3 : 2, 'life', { pos: c, chars: [c.id, o.id] });
  return true;
}

function travelMonth(w: World, c: Character): void {
  const A = c.act;
  const fly = RACES[c.race].flying;
  if (A.path && A.path.length) {
    const p = advance(w, A.path, fly ? MOVE_FLY : MOVE_WALK, { race: c.race, flying: fly });
    if (p) setPos(c, p);
  }
  A.months = (A.months ?? 0) + 1;
  if (A.path && A.path.length && A.months < 150) return;
  if (c.isPlayer && A.purpose === 'adventure' && w.player) {
    const F = (w.player.flags ??= {});
    if (F.siteGate === undefined) { F.siteGate = A.target ?? -1; F.siteGateT = w.t; return; }
    if (w.t - (F.siteGateT ?? w.t) < 6) return;
    delete F.siteGate; delete F.siteGateT;
  }
  arrive(w, c);
}

function arrive(w: World, c: Character): void {
  const rng = w.rngSim;
  const A = c.act;
  c.act = { kind: 'idle' };
  switch (A.purpose) {
    case 'adventure': {
      const site = w.sites[A.target ?? -1];
      if (site) resolveAdventure(w, c, site.id);
      if (c.died < 0) goHome(w, c);
      break;
    }
    case 'trade': {
      const gain = rng.float(10, 40) * (1 + c.apt[APT_MERCHANT] / 60);
      if (rng.chance(0.08)) {
        c.wealth = Math.max(0, c.wealth - gain); c.stats.health = clamp(c.stats.health - 20);
        charLog(w, c, '교역로에서 도적 떼를 만나 물건을 빼앗겼다.', 2);
      } else {
        c.wealth += gain;
        const there = w.settlements.find(s => s.alive && s.l === c.l && dist(s, c) <= 2);
        const g = Math.round(gain);
        charLog(w, c, rng.pick([`교역에서 금화 ${g}닢의 이익을 남겼다.`, `${there ? there.name + '에서 ' : ''}가져간 물건을 모두 팔아 금화 ${g}닢을 남겼다.`,
          `${there ? there.name + '의 ' : ''}상인들과 밤새 흥정한 끝에 금화 ${g}닢을 벌었다.`, `싣고 간 짐을 팔고 그곳 특산물을 사 왔다. (이익 ${g}닢)`, `헐값에 산 물건을 비싸게 넘겨 금화 ${g}닢을 쥐었다.`]));
        if (c.apt[APT_MERCHANT] >= 70 && c.wealth > 400) awaken(w, c, 'merchant', '');
      }
      goHome(w, c);
      break;
    }
    case 'pilgrim': {
      c.honor += 4; c.mood = clamp(c.mood + 10); c.traits[FAITH] = clamp(c.traits[FAITH] + 2);
      onPilgrimArrive(w, c, w.sites[A.target ?? -1]);
      goHome(w, c);
      break;
    }
    case 'hunt': case 'duel': {
      const tgt = w.chars[A.target ?? -1];
      if (tgt && tgt !== c && tgt.died < 0 && tgt.l === c.l && dist(tgt, c) <= 3) {
        const isDL = w.demonLord === tgt.id;
        const ctx = isDL ? '용사와의 결전' : tgt.race === 'dragon' ? '용과의 사투' : '결투';
        addNews(w, `${charLabel(w, c)}이(가) ${charLabel(w, tgt)}에게 도전하였다.`, isDL ? 4 : 3, 'hero', { pos: c, chars: [c.id, tgt.id] });
        if (isDL && isHero(c) && w.rngSim.chance(0.008)) { elope(w, c, tgt); break; }
        const win = duel(w, c, tgt, ctx);
        if (win === c) {
          c.fame += isDL ? 120 : 40;
          addNews(w, isDL
            ? `용사 ${c.name}이(가) 마침내 마왕을 쓰러뜨렸다! 온 세상의 종들이 울렸다.`
            : `${charLabel(w, c)}이(가) ${tgt.name}을(를) 꺾었다.`, isDL ? 5 : 3, 'hero', { pos: c, chars: [c.id, tgt.id] });
        }
      } else charLog(w, c, '목표를 놓쳤다.');
      if (c.died < 0) goHome(w, c);
      break;
    }
    case 'muster': {
      // 집결지에 닿았다: 수비대와 함께 괴수를 기다린다
      c.act = { kind: 'party', target: -2 - (A.target ?? 0) };
      break;
    }
    case 'return': default: {
      const s = w.settlements[c.home];
      if (s && s.alive) setPos(c, s);
      break;
    }
  }
}

export function resolveAdventure(w: World, c: Character, siteId: number, mod: { power?: number; risk?: number; loot?: number; quiet?: boolean } = {}): 'win' | 'fail' | 'dead' {
  const rng = w.rngSim;
  const site = w.sites[siteId];
  const power = charPower(c, w) * (1 + c.traits[PRUDENCE] / 300) * (mod.power ?? 1);
  const danger = site.level * 32 + 10;
  const p = clamp(power / (power + danger), 0.1, 0.92);
  if (rng.chance(p)) {
    const gold = Math.min(site.loot, rng.float(10, 40) * site.level * (mod.loot ?? 1));
    site.loot -= gold;
    c.wealth += gold; c.fame += 4 + site.level * 3;
    c.stats.might = clamp(c.stats.might + 1);
    // 탄생 모드의 선택으로 들어간 경우는 선택 결과가 일대기에 남으므로 여기서는 조용히 적는다
    charLog(w, c, `${site.name}을(를) 탐험하여 금화 ${Math.round(gold)}닢을 얻었다.`, mod.quiet ? 1 : 2);
    if (site.relic) tryTakeRelic(w, c, site.id);
    return 'win';
  } else {
    const dmg = rng.int(15, 50) * (mod.risk ?? 1);
    c.stats.health = clamp(c.stats.health - dmg);
    if (c.stats.health <= 0 || rng.chance(0.12 * site.level / 3 * (mod.risk ?? 1))) {
      killChar(w, c, `${site.name} 탐험 중 괴물의 습격`);
      return 'dead';
    }
    charLog(w, c, `${site.name}에서 괴물에게 쫓겨 간신히 살아 돌아왔다.`, mod.quiet ? 1 : 2);
    return 'fail';
  }
}

function tryTakeRelic(w: World, c: Character, siteId: number): void {
  const rng = w.rngSim;
  const site = w.sites[siteId];
  const relic = site.relic!;
  if (relic.startsWith('art:')) { if (findBuried(w, c, relic)) site.relic = null; return; }
  if (relic === '성검') {
    const worthy = c.apt[APT_HERO] >= 55 && c.traits[COMPASSION] >= 40 && RACES[c.race].align !== 'dark';
    if (worthy) {
      site.relic = null;
      c.items.push('성검');
      c.epithet = EPITHETS.holy;
      awaken(w, c, 'hero', `${site.name}에서 잠들어 있던 성검이 ${c.name}의 손에 뽑혔다.`);
    } else charLog(w, c, '빛나는 검을 발견하였으나 아무리 힘을 주어도 뽑히지 않았다.', 2);
  } else if (relic === '마검') {
    site.relic = null;
    c.items.push('마검');
    c.epithet = c.epithet || EPITHETS.cursed;
    c.traits[COMPASSION] = clamp(c.traits[COMPASSION] - 20);
    addNews(w, `${c.name}이(가) ${site.name}에서 피에 굶주린 마검을 손에 넣었다.`, 3, 'dark', { pos: c, chars: [c.id] });
    if (c.apt[APT_DEMONLORD] >= 50) awaken(w, c, 'seed', '마검의 목소리에 이끌려');
  } else if (relic === '현자의 돌') {
    site.relic = null;
    c.items.push('현자의 돌');
    c.lifespan += 60;
    addNews(w, `${c.name}이(가) 전설의 현자의 돌을 찾아냈다.`, 3, 'hero', { pos: c, chars: [c.id] });
    if (c.apt[APT_SAGE] >= 50) awaken(w, c, 'sage', '현자의 돌의 지혜로');
  } else if (relic === '별철') {
    site.relic = null;
    c.items.push('별철 검');
    addNews(w, `${c.name}이(가) 떨어진 별의 쇠로 검을 벼려냈다.`, 2, 'hero', { pos: c, chars: [c.id] });
  }
  void rng;
}

/** 용사의 토벌 */
function heroHunt(w: World, c: Character): void {
  const rng = w.rngSim;
  let target: Character | null = null;
  if (w.demonLord >= 0 && w.demonLord !== c.id && charKnowsDL(w, c)) target = w.chars[w.demonLord];
  if (!target) {
    const dragons = w.chars.filter(d => d.died < 0 && d.race === 'dragon' && (d.ancient || (d.sleep ?? 0) === 0) && approxDist(w, c, d) < 60);
    if (dragons.length && rng.chance(0.5)) target = rng.pick(dragons);
  }
  if (target && target.died < 0) {
    if (strongEnoughAlone(w, c, target)) {
      if (setTravel(w, c, target, w.demonLord === target.id ? 'duel' : 'hunt', target.id)) {
        charLog(w, c, `누구의 도움도 없이 홀로 ${charLabel(w, target)}을(를) 토벌하러 길을 나섰다.`, 3);
        return;
      }
    } else if ((w.demonLord !== target.id || w.t - (w.stats.lastDemonLord ?? 0) >= 36) && tryHeroParty(w, c, target)) return;
  }
  // 근처 던전 정화
  const sites = w.sites.filter(s => (s.loot > 0 || s.relic) && s.kind !== 'deep' && approxDist(w, c, s) < 35);
  if (sites.length) {
    const s = rng.pick(sites);
    if (setTravel(w, c, s, 'adventure', s.id)) { charLog(w, c, `${s.name}의 괴물을 퇴치하러 떠났다.`, 1); return; }
  }
  c.stats.might = clamp(c.stats.might + 0.5);
  charLog(w, c, '다가올 결전을 대비해 수련하였다.');
}

/** 용사와 마왕이 서로에게 반해 모든 것을 버리고 떠난다 */
export function elope(w: World, h: Character, lord: Character): void {
  const rng = w.rngSim;
  const f = w.factions[lord.faction];
  w.demonLord = -1;
  closeRiftsAfterDl(w, lord);
  lord.awakened = lord.awakened.filter(a => a !== 'demonlord' && a !== 'seed');
  h.awakened = h.awakened.filter(a => a !== 'hero');
  if (f && f.leader === lord.id) f.leader = -1;
  for (const s of w.settlements) if (s.governor === h.id || s.governor === lord.id) s.governor = -1;
  for (const ch of [h, lord]) {
    const sp = w.chars[ch.spouse];
    if (sp && sp !== h && sp !== lord) sp.spouse = -1;
    ch.faction = -1; ch.home = -1; ch.act = { kind: 'idle' };
    ch.epithet = '사랑에 빠진';
  }
  h.spouse = lord.id; lord.spouse = h.id;
  addRel(w, h, lord, 100);
  // 세상 끝 외딴 곳으로
  const L = w.layers[2];
  for (let i = 0; i < 300; i++) {
    const x = rng.int(1, L.w - 2), y = rng.int(1, L.h - 2);
    const k = y * L.w + x;
    if (L.claim[k] >= 0 || moveCost(L.terrain[k], { race: 'human', flying: false }) <= 0) continue;
    // 둘은 손을 잡고 실제로 달아난다
    relocate(w, h, { l: 2, x, y }); relocate(w, lord, { l: 2, x, y });
    break;
  }
  w.stats.elope = (w.stats.elope ?? 0) + 1;
  if (w.player && (w.player.charId === h.id || w.player.charId === lord.id)) { w.player.flags ??= {}; w.player.flags.elope = w.t; }
  const text = `마왕성 옥좌 앞, 서로에게 검을 겨눈 용사 ${h.name}과(와) 마왕 ${lord.name}의 눈이 마주쳤다. 칼끝이 떨렸다. 두 사람은 검을 내려놓고, 용사도 마왕도 아닌 채로 세상 끝을 향해 사랑의 도피를 떠났다.`;
  addNews(w, text, 5, 'hero', { chars: [h.id, lord.id] });
  charLog(w, h, `마왕 ${lord.name}과(와) 사랑에 빠져 모든 것을 버리고 떠났다.`, 5);
  charLog(w, lord, `용사 ${h.name}과(와) 사랑에 빠져 왕좌를 버리고 떠났다.`, 5);
  w.cinematics.push({ kind: 'love', seal: 0, title: '사랑의 도피', text: fixJosa(text) });
}

// ───────────── 용

/** 고대 용의 분노 (깨어난 직후 1 → 잠들 무렵 0) */
export function rageOf(w: World, c: Character): number {
  if (!c.ancient || c.wrathUntil === undefined) return 0;
  const start = c.wrathStart ?? c.wrathUntil - 600;
  return clamp((c.wrathUntil - w.t) / Math.max(1, c.wrathUntil - start), 0, 1);
}

function dragonMonth(w: World, c: Character): void {
  const rng = w.rngSim;
  if (ancientMonth(w, c)) return;
  if (c.act.kind === 'travel') {
    const A = c.act;
    if (A.path && A.path.length) { const p = advance(w, A.path, 9, { race: 'dragon', flying: true }); if (p) setPos(c, p); }
    if (A.path && A.path.length) return;
    c.act = { kind: 'idle' };
    if (A.purpose === 'hunt') {
      const s = w.settlements[A.target ?? -1];
      if (s && s.alive && dist(s, c) < 3) dragonRaid(w, c, s);
      if (c.lair && c.died < 0) setTravel(w, c, c.lair, 'return');
      const raider = c.dragonKind === 'raider' || c.ancient;
      const rage = rageOf(w, c);
      // 배를 채운 용은 둥지에서 쉰다. 분노가 클수록 짧게 쉬지만, 쉬지 않고 날아다니지는 않는다
      c.sleep = c.ancient ? (rage > 0.5 ? rng.int(2, 5) : rng.int(6, 18 + Math.round((1 - rage) * 30))) : rng.int(raider ? 4 : 18, raider ? 24 : 90);
    } else if (A.purpose === 'return' && c.lair && c.l === c.lair.l && Math.hypot(c.x - c.lair.x, c.y - c.lair.y) < 3) setPos(c, c.lair);
    return;
  }
  // 수호룡: 공물을 받고 적을 친다 (배신당하면 그 자리에서 습격형이 된다)
  if (c.dragonKind === 'patron') {
    const tgt = patronMonth(w, c);
    if (tgt && setTravel(w, c, tgt, 'hunt', tgt.id)) {
      charLog(w, c, `${tgt.name}을(를) 향해 날아올랐다.`, 2);
      return;
    }
  }
  if ((c.sleep ?? 0) > 0) {
    c.sleep!--;
    if (c.sleep! % 24 === 0) charLog(w, c, '둥지에서 깊은 잠에 빠져 있다.');
    // 보물 위의 긴 잠에서 깰 때만 포효한다 (습격 뒤의 짧은 휴식은 조용히 지나간다)
    if (c.sleep === 0 && c.deepSleep) { c.deepSleep = false; charLog(w, c, '긴 잠에서 깨어나 하늘을 향해 포효하였다.', 2); }
    return;
  }
  c.stats.health = clamp(c.stats.health + 3);
  const hunger = (c.traits[GREED] + (100 - c.traits[COMPASSION])) / 200 + (c.ancient ? 0.3 : 0);
  const rage = rageOf(w, c);
  const rate = c.ancient ? 0.08 + 0.85 * rage : c.dragonKind === 'raider' ? 0.12 : c.dragonKind === 'patron' ? 0 : 0.015;
  if (rng.chance(c.ancient ? rate : rate * hunger)) {
    const range = c.ancient ? 70 + rage * 80 : c.dragonKind === 'raider' ? 50 : 35;
    const targets = w.settlements.filter(s => s.alive && s.faction !== c.patronOf && approxDist(w, c, s, true) < range && s.pop > 30);
    // 막 불탄 고을은 잿더미뿐이라 한동안 노릴 것이 없다
    const burnt = (t: Settlement) => (t.lastBurned !== undefined && w.t - t.lastBurned < 48 ? 0.1 : 1);
    if (targets.length) {
      // 분노한 고대 용은 보이는 대로, 가까운 곳부터 덮친다
      const s = c.ancient && rage > 0.3
        ? rng.weighted(targets, t => 1 / (1 + approxDist(w, c, t, true)) ** 2 * (t.pop + 50) * burnt(t))!
        : rng.weighted(targets, t => (t.stock[5] + t.pop * 0.1 + 10) * burnt(t))!;
      if (setTravel(w, c, s, 'hunt', s.id)) { charLog(w, c, `${s.name}의 보물 냄새를 맡고 날아올랐다.`, 2); return; }
    }
  }
  if (rng.chance(c.ancient ? 0.02 : c.dragonKind === 'raider' ? 0.03 : 0.08)) {
    c.sleep = rng.int(12, c.dragonKind === 'raider' ? 36 : 120);
    c.deepSleep = true;
    charLog(w, c, '보물 더미 위에서 긴 잠에 들었다.', 1);
  } else if (rng.chance(0.3)) charLog(w, c, rng.pick(['둥지 위를 맴돌았다.', '보물을 세며 흡족해하였다.', '먼 산맥 너머를 노려보았다.']));
}

export function dragonRaid(w: World, c: Character, s: Settlement): void {
  const rng = w.rngSim;
  w.stats.dragonRaids = (w.stats.dragonRaids ?? 0) + 1;
  const f = w.factions[s.faction];
  const rage = rageOf(w, c);
  const killed = Math.round(Math.min(s.pop * 0.6, s.pop * rng.float(0.04, 0.14) * (c.ancient ? 1.2 + 2 * rage : 1)));
  if (c.ancient && rage > 0.2) {
    // 불길은 이름난 자들도 가리지 않는다
    // 불길은 사람을 가리지 않는다 ('나'도)
    disasterStrikes(w, s, 'dragon', `${c.name}의 불길`, 0.08 * Math.max(0.5, rage), c);
    s.dev = Math.max(0, s.dev - rage * 10);
  }
  const gold = s.stock[5] * 0.6;
  s.pop = Math.max(5, s.pop - killed);
  s.stock[5] -= gold; s.stock[0] *= 0.7;
  s.dev = Math.max(0, s.dev - rng.float(2, 7));
  s.stability = clamp(s.stability - 15);
  s.lastAttacked = w.t;
  s.lastBurned = w.t;
  c.wealth += gold; c.fame += 10;
  addNews(w, tpl('{d:이} {s:을} 불태웠다. {n}명이 목숨을 잃고 금고가 텅 비었다.', { d: charLabel(w, c), s: s.name, n: killed }), c.ancient ? 4 : 3, 'dark',
    { pos: s, chars: [c.id], facs: f ? [f.id] : [] });
  // 지역 용감한 자가 맞설 수도 있다
  const defenders = w.chars.filter(d => d.died < 0 && d.home === s.id && d.l === s.l && d.act.kind === 'idle' && dist(d, s) <= 4 && isAdult(w, d) && (isHero(d) || d.traits[COURAGE] > 80) && d.race !== 'dragon');
  const champion = defenders.sort((a, b) => charPower(b, w) - charPower(a, w))[0];
  if (champion && charPower(champion, w) > charPower(c, w) * 0.8 && rng.chance(0.1)) {
    const d = champion;
    addNews(w, `${charLabel(w, d)}이(가) 홀로 ${c.name}에게 맞섰다.`, 3, 'hero', { pos: s, chars: [d.id, c.id] });
    const win = duel(w, d, c, '용과의 사투');
    if (win === d) {
      d.fame += 80;
      addNews(w, `${d.name}이(가) ${c.name}을(를) 쓰러뜨려 '${EPITHETS.dragonslayer}'라 불리게 되었다!`, 4, 'hero', { pos: s, chars: [d.id] });
      if (d.apt[APT_HERO] >= 60) awaken(w, d, 'hero', '용을 쓰러뜨린 그 순간,');
    }
  }
  // 고향이 불탄 용사 후보
  for (const v of w.chars) {
    if (v.died < 0 && v.home === s.id && v.apt[APT_HERO] >= 75 && !isHero(v) && rng.chance(0.15)) {
      awaken(w, v, 'hero', `불타는 ${s.name}의 잿더미 속에서`);
      break;
    }
  }
}

// ───────────── 출생/사망/등장

export function pDeathMonth(w: World, c: Character): number {
  if (c.race === 'angel' && c.seat !== undefined) return angelDeathChance(w, c);
  // 마왕은 병이나 세월로 죽지 않는다. 칼로만 쓰러뜨릴 수 있다
  if (w.demonLord === c.id) return 0;
  const age = (w.t - c.born) / 12;
  const L = c.lifespan;
  let p = age < 5 && RACES[c.race].adult > 0 ? 0.0012 : 0.00025 * Math.min(1, 70 / L);
  if (age > L * 0.7) p += 0.004 * Math.exp((age - L) / (L * 0.07));
  if (c.stats.health < 30) p += (30 - c.stats.health) * 0.0012;
  const home = w.settlements[c.home];
  if (home && home.plague > 0) p += w.diseases[home.disease ?? -1]?.great ? 0.012 : 0.006;
  if (c.items.includes('현자의 돌')) p *= 0.5;
  return Math.min(0.5, p);
}

export function lifecycleMonth(w: World): void {
  const rng = w.rngSim;
  const alive = w.chars.filter(c => c.died < 0);
  const crowd = alive.length;
  for (const c of alive) {
    if (!c.ancient && rng.chance(pDeathMonth(w, c))) {
      const age = ageOf(w, c);
      const home = w.settlements[c.home];
      const cause = c.race === 'angel' ? '소임을 다함' : c.race === 'undead' ? '영혼의 소멸' : home && home.plague > 0 && rng.chance(0.6) ? '역병' : age > c.lifespan * 0.7 ? '노환' : c.stats.health < 30 ? '깊은 상처' : rng.pick(['병', '사고', '열병']);
      killChar(w, c, cause);
      continue;
    }
    // 출산
    if (c.sex === 'F' && c.spouse >= 0 && fertile(w, c)) {
      const sp = w.chars[c.spouse];
      const R = RACES[c.race];
      // 탄생 모드의 집안은 세상 전체의 인구 조절에 묶이지 않는다 (왕가에는 후사가 필요하다)
      const mine = c.isPlayer || !!sp?.isPlayer;
      const fert = Math.min(0.03, R.growth * 4.5) * (c.children.length >= (mine ? 8 : 5) ? 0.15 : 1) * (mine ? 1 : crowd > 900 ? 0.05 : crowd > 650 ? 0.3 : 1);
      // 한집에 살거나 곁에 있으면 아이가 들어선다
      const together = !!sp && (sp.home === c.home || (sp.l === c.l && dist(sp, c) < 8));
      if (sp && sp.died < 0 && together && rng.chance(fert)) {
        const home = w.settlements[c.home];
        const kid = createCharacter(w, { race: c.race, faction: c.faction, home: c.home, pos: home ?? c, born: w.t, father: sp.id, mother: c.id });
        kid.title = 'child';
        charLog(w, c, `자식 ${kid.name}을(를) 낳았다.`, 2);
        charLog(w, sp, `자식 ${kid.name}이(가) 태어났다.`, 2);
        charLog(w, kid, `${home ? home.name + '에서 ' : ''}${sp.name}과(와) ${c.name}의 자식으로 태어났다.`, 3);
        const f = w.factions[c.faction];
        if (f && (f.leader === c.id || f.leader === sp.id)) addNews(w, `${f.name}의 군주 가문에 ${kid.name}이(가) 태어났다.`, 2, 'life', { pos: c, chars: [kid.id], facs: [f.id] });
      }
    }
  }
  // 정착지에서 두각을 나타내는 인물
  for (const s of w.settlements) {
    if (!s.alive || RACES[s.race].noPop || s.race === 'angel') continue;
    const f = w.factions[s.faction];
    if (!f) continue;
    const members = f.settlements.length ? alive.filter(c => c.faction === f.id).length : 0;
    let p = s.pop / 45000;
    if (members < 5) p *= 4;
    if (crowd > 800) p = 0; else if (crowd > 650) p *= 0.15;
    if (rng.chance(p)) {
      const R = RACES[s.race];
      const age = R.adult + rng.int(0, Math.round(R.adult * 0.8 + 5));
      const c = createCharacter(w, { race: s.race, faction: f.id, home: s.id, pos: s, born: w.t - age * 12 - rng.int(0, 11) });
      c.role = chooseRole(w, c);
      c.title = 'adult';
      charLog(w, c, `${s.name}의 이름 없는 ${c.role}(이)었으나, 이 무렵부터 두각을 나타내기 시작하였다.`, 2);
    }
  }
}

/** 지위와 명성에 따른 등급 */
export function updateRank(w: World, c: Character): void {
  const f = w.factions[c.faction];
  if (f && f.leader === c.id) c.rank = 3;
  else if (w.settlements.some(s => s.alive && s.governor === c.id)) c.rank = 2;
  else if (c.fame >= 30 || c.honor >= 50) c.rank = 1;
  else c.rank = 0;
  if (c.fame > 0) c.fame *= 0.9995;
}

export { titleOf };

/** 마왕이 사라지면 붙들려 있던 차원문이 닫힌다. 가장 가까운 문 하나만 남는다 (토벌대가 돌아올 길) */
export function closeRiftsAfterDl(w: World, at: Pos): void {
  if (w.doom.heavenForced) {
    w.doom.heavenForced = false;
    for (const p of w.portals) if (p.kind === 'peak' || p.kind === 'stair') p.open = false;
    rebuildPortalLinks(w); invalidateDist(w);
    addNews(w, '마왕이 사라지자 억지로 열려 있던 하늘의 계단들이 스스로 닫혔다.', 4, 'hero');
  }
  const open = w.portals.filter(p => p.kind === 'rift' && p.open);
  if (open.length <= 1) return;
  const d = (p: typeof open[number]) => Math.min(...[p.a, p.b].map(e => (e.l === at.l ? Math.hypot(e.x - at.x, e.y - at.y) : 999)));
  open.sort((a, b) => d(a) - d(b));
  for (const p of open.slice(1)) p.open = false;
  rebuildPortalLinks(w);
  invalidateDist(w);
  addNews(w, `마왕이 사라지자 그 힘에 붙들려 있던 차원문 ${open.length - 1}개가 굉음과 함께 닫혔다. '${open[0].name}' 하나만이 아직 열려 있다.`, 4, 'hero', { pos: open[0].a });
}

const RESTOCK = ['{s}에 괴물들이 다시 둥지를 틀었다. 어둠 속에 무언가 반짝인다는 소문이 돈다.', '{s}의 무너진 벽 너머로 새 통로가 드러났다는 소문이 돈다.', '도굴꾼들이 놓친 {s}의 깊은 방이 발견되었다.'];
/** 털린 유적도 세월이 지나면 다시 괴물과 보물로 채워진다 */
export function restockSites(w: World): void {
  const rng = w.rngSim;
  for (const s of w.sites) {
    // 털린 유적은 오래 비어 있다 (평균 30년). 그사이 새 괴물과 보물이 깃든다
    if (s.kind === 'deep' || s.loot > 0 || !rng.chance(1 / 360)) continue;
    s.loot = rng.int(40, 120) * s.level;
    if (rng.chance(0.25)) addNews(w, rng.pick(RESTOCK).replace('{s}', s.name), 1, 'nature', { pos: s });
  }
}

/** 그 고을에 사는, 아직 이름이 알려지지 않았던 짝 하나 (인연이 닿을 사람이 없을 때) */
export function makeSuitor(w: World, c: Character, noble = false): Character | null {
  const home = w.settlements[c.home];
  if (!home || !home.alive || home.race !== c.race) return null;
  const R = RACES[c.race];
  const age = Math.max(R.adult, ageOf(w, c) + w.rngSim.int(-6, 4));
  const k = createCharacter(w, { race: c.race, sex: c.sex === 'M' ? 'F' : 'M', faction: home.faction, home: home.id, pos: home, born: w.t - age * 12 });
  k.title = 'adult';
  k.role = chooseRole(w, k);
  if (noble) { k.fame += 25; k.honor += 20; k.wealth += 100; }
  return k;
}
