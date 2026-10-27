import { RACES, type RaceKey } from '../data/races';
import { FOOD, GOLD, MANA, ORE, RES_COUNT, STONE, TERRAIN, WOOD } from '../data/terrain';
import { makePlaceName, uniquePlaceName } from '../data/names';
import { addNews } from './news';
import type { Pos, Settlement, World } from './state';
import { seasonOf } from './state';
import { clamp } from './helpers';
import { claimInitial, rebuildTerritory } from './territory';

export const TIER_RADIUS = [2, 3, 3, 4, 5];
const TIER_POP = [0, 150, 500, 1300, 2800];
const TIER_DEV = [0, 3, 15, 35, 60];

export function hasFlag(s: { flags: string[] }, name: string, t: number): boolean {
  for (const f of s.flags) {
    if (f === name) return true;
    if (f.startsWith(name + ':') && +f.split(':')[1] > t) return true;
  }
  return false;
}

export function setTimedFlag(s: { flags: string[] }, name: string, until: number): void {
  s.flags = s.flags.filter(f => !f.startsWith(name + ':'));
  s.flags.push(`${name}:${until}`);
}

export function foundSettlement(w: World, o: { faction: number; race: RaceKey; pos: Pos; pop: number; name?: string }): Settlement {
  const s: Settlement = {
    id: w.settlements.length,
    name: o.name ?? uniquePlaceName(w.rngSim, o.race, n => w.settlements.some(x => x.alive && x.name === n)),
    l: o.pos.l, x: o.pos.x, y: o.pos.y,
    faction: o.faction, race: o.race,
    pop: o.pop,
    stock: [o.pop * 0.6, 20, 20, 10, 10, 10],
    prod: new Array(RES_COUNT).fill(0), cons: new Array(RES_COUNT).fill(0),
    dev: 0, tier: 0, stability: 60, founded: w.t, governor: -1, plague: 0, hunger: 0,
    tiles: [], alive: true, flags: [], lastAttacked: -999,
  };
  w.settlements.push(s);
  const f = w.factions[o.faction];
  if (f) f.settlements.push(s.id);
  claimInitial(w, s, 1);
  return s;
}

export function recomputeTerritory(w: World): void {
  rebuildTerritory(w);
}

function seasonMul(w: World, s: Settlement): number {
  if (s.l !== 2 && s.l !== 1) return 1;
  return [1.0, 1.15, 1.35, 0.45][seasonOf(w.t)];
}

/** 최대 부양 인구 */
export function capacity(w: World, s: Settlement): number {
  const R = RACES[s.race];
  if (R.noPop) return 0;
  const L = w.layers[s.l];
  let food = 0, mana = 0;
  for (const k of s.tiles) {
    const y = TERRAIN[L.terrain[k]].yields;
    food += y[FOOD]; mana += y[MANA];
  }
  const mul = 1 + s.dev / 100;
  const byFood = R.needs[FOOD] > 0 ? (food * R.prodMul[FOOD] * mul * 0.95 / R.needs[FOOD]) * 20 : Infinity;
  const byMana = R.needs[MANA] >= 0.15 ? (mana * R.prodMul[MANA] * mul / R.needs[MANA]) * 20 * 1.2 : Infinity;
  const cap = Math.min(byFood, byMana);
  return Math.max(60, isFinite(cap) ? cap : 400);
}

export function settlementMonth(w: World, s: Settlement): void {
  const rng = w.rngSim;
  const R = RACES[s.race];
  const f = w.factions[s.faction];
  const L = w.layers[s.l];
  // 일손(15명당 한 칸)은 가장 기름진 땅부터 일군다. 굶주리면 식량 땅이 먼저다
  const sum = new Array(RES_COUNT).fill(0);
  const hands = (s.pop + (s.slaves ?? 0) * 0.9) / 15;
  const foodFirst = R.needs[FOOD] > 0 && (s.hunger > 0 || s.stock[FOOD] < s.cons[FOOD] * 6) ? 3 : 1.2;
  const worth = (y: number[]) => y[FOOD] * foodFirst * R.prodMul[FOOD] + y[WOOD] * 0.5 + y[STONE] * 0.4 + y[ORE] * 0.7 + y[MANA] * (R.needs[MANA] > 0 ? 1 : 0.3) + y[GOLD];
  const ranked = hands >= s.tiles.length ? s.tiles : s.tiles.slice().sort((a, b) => worth(TERRAIN[L.terrain[b]].yields) - worth(TERRAIN[L.terrain[a]].yields));
  let left = hands;
  for (const k of ranked) {
    if (left <= 0) break;
    const part = Math.min(1, left);
    const y = TERRAIN[L.terrain[k]].yields;
    for (let r = 0; r < RES_COUNT; r++) sum[r] += y[r] * part;
    left -= part;
  }
  const wf = 1;
  const stabMul = 0.6 + 0.4 * (s.stability / 100);
  const devMul = 1 + s.dev / 100;
  const fBonus = f ? factionProdBonus(f.flags, w.t) : null;
  for (let r = 0; r < RES_COUNT; r++) {
    let p = sum[r] * wf * R.prodMul[r] * devMul * stabMul;
    if (r === FOOD) {
      p *= seasonMul(w, s);
      if (hasFlag(s, 'drought', w.t)) p *= 0.35;
      if (hasFlag(s, 'blessed', w.t)) p *= 1.4;
    }
    if (fBonus) p *= fBonus[r];
    s.prod[r] = p;
    s.cons[r] = R.needs[r] * s.pop / 20;
  }
  s.prod[GOLD] += s.pop / 500 * devMul;
  // 발전에 드는 자재
  const devWood = s.pop / 300, devStone = s.pop / 450;
  for (let r = 0; r < RES_COUNT; r++) s.stock[r] += s.prod[r] - s.cons[r];

  // 식량
  const needFood = s.cons[FOOD];
  if (s.stock[FOOD] < 0) {
    const deficit = -s.stock[FOOD];
    s.stock[FOOD] = 0;
    const dead = Math.min(s.pop * 0.06, deficit * 20 * 0.3 + 1);
    s.pop -= dead;
    s.hunger++;
    s.stability = clamp(s.stability - 3);
    if (s.hunger === 4 || s.hunger % 24 === 0) addNews(w, rng.pick([`${s.name}에 기근이 들어 백성들이 굶주리고 있다.`, `${s.name}의 곳간이 바닥났다. 아이들이 풀뿌리를 캐 먹는다.`, `${s.name}에서 굶주린 이들이 길가에 쓰러지고 있다.`, `흉년이 든 ${s.name}에서 곡식 한 줌이 금값이 되었다.`]), s.tier >= 2 ? 2 : 1, 'nature', { pos: s, facs: f ? [f.id] : [] });
  } else s.hunger = Math.max(0, s.hunger - 1);
  // 마나 부족 (언데드/천사 등)
  if (s.stock[MANA] < 0) {
    s.stock[MANA] = 0;
    if (R.needs[MANA] >= 0.15) { s.pop *= 0.99; s.stability = clamp(s.stability - 1); }
  }
  for (const r of [WOOD, STONE, ORE, GOLD]) if (s.stock[r] < 0) s.stock[r] = 0;

  // 인구 증가
  const cap = capacity(w, s);
  if (s.hunger === 0 && (needFood === 0 || s.stock[FOOD] > needFood * 1.5)) {
    let g = R.growth * (1 - s.pop / cap);
    if (s.race === 'undead') g = R.growth * 0.6 * (1 - s.pop / cap) + Math.min(0.004, w.corpses / Math.max(1, s.pop) * 0.01);
    s.pop += s.pop * g;
  }
  if (s.pop > cap * 1.15) s.pop -= s.pop * 0.004;
  if (s.plague > 0) {
    s.plague--;
    const d = s.disease !== undefined && s.disease >= 0 ? w.diseases[s.disease] : undefined;
    s.pop -= s.pop * (d ? d.mortality * rng.float(0.7, 1.3) : rng.float(0.006, 0.02));
    s.stability = clamp(s.stability - 1);
  }

  // 발전도
  if (s.hunger > 0) s.dev = Math.max(0, s.dev - 0.2);
  else if (s.stock[WOOD] > devWood * 3 && s.stock[STONE] > devStone * 3) {
    s.stock[WOOD] -= devWood; s.stock[STONE] -= devStone;
    const gold = Math.min(1, s.stock[GOLD] / (s.pop / 50 + 1));
    s.dev = Math.min(100, s.dev + (0.08 + 0.1 * gold) * stabMul * (1 - s.dev / 105));
  } else s.dev = Math.max(0, s.dev - 0.02);

  // 안정도
  let target = 55 + (f ? (f.legitimacy - 50) / 4 : 0) - s.hunger * 4 - (s.plague > 0 ? 10 : 0);
  if (f && Object.keys(f.wars).length) target -= 6;
  const gov = w.chars[s.governor];
  if (gov && gov.died < 0) target += (gov.stats.charisma - 45) / 6;
  if (hasFlag(s, 'festival', w.t)) target += 10;
  s.stability = clamp(s.stability + (target - s.stability) * 0.05);

  // 창고 한도
  const capStock = 150 + s.pop * 2;
  for (let r = 0; r < RES_COUNT; r++) if (s.stock[r] > capStock) s.stock[r] = capStock;
  if (s.pop < 5) s.pop = 5;

  updateTier(w, s);
}

function factionProdBonus(flags: string[], t: number): number[] | null {
  if (!flags.length) return null;
  const m = [1, 1, 1, 1, 1, 1];
  if (hasFlag({ flags }, 'tree_heart', t)) { m[MANA] *= 1.8; m[GOLD] *= 1.5; m[WOOD] *= 1.6; m[FOOD] *= 1.2; }
  if (flags.includes('guild')) m[GOLD] *= 1.3;
  if (flags.includes('worldtree_bloom')) { m[MANA] *= 1.4; m[FOOD] *= 1.15; }
  if (flags.includes('runeforge')) m[ORE] *= 1.3;
  if (flags.includes('mithril')) m[GOLD] *= 1.25;
  if (flags.includes('spirit_pact')) m[FOOD] *= 1.2;
  if (flags.includes('academy')) m[MANA] *= 1.2;
  return m;
}

function desiredTier(w: World, s: Settlement): number {
  const f = w.factions[s.faction];
  const isCap = f && f.capital === s.id;
  let t = 0;
  for (let i = 1; i < 5; i++) {
    if (s.pop >= TIER_POP[i] && s.dev >= TIER_DEV[i] && (i < 4 || isCap)) t = i;
  }
  return t;
}

function updateTier(w: World, s: Settlement): void {
  const want = desiredTier(w, s);
  const R = RACES[s.race];
  const f = w.factions[s.faction];
  if (want > s.tier) {
    s.tier++;
    w.territoryDirty = true;
    const name = R.settlementTiers[s.tier];
    if (s.tier >= 2) addNews(w, `${s.name}이(가) ${name}(으)로 성장하였다.`, s.tier >= 3 ? 3 : 2, 'growth', { pos: s, facs: f ? [f.id] : [] });
  } else if (want < s.tier && s.pop < TIER_POP[s.tier] * 0.6) {
    s.tier--;
    w.territoryDirty = true;
    if (s.tier >= 1) addNews(w, `쇠락한 ${s.name}이(가) ${R.settlementTiers[s.tier]}(으)로 몰락하였다.`, 2, 'growth', { pos: s, facs: f ? [f.id] : [] });
  }
}

/** 새 정착지 후보지 찾기 */
export function findColonySite(w: World, from: Settlement, race: RaceKey, minD = 6, maxD = 14): Pos | null {
  const rng = w.rngSim;
  const R = RACES[race];
  const L = w.layers[from.l];
  let best: Pos | null = null, bs = -Infinity;
  for (let i = 0; i < 70; i++) {
    const ang = rng.float(0, Math.PI * 2), d = rng.float(minD, maxD);
    const x = Math.round(from.x + Math.cos(ang) * d), y = Math.round(from.y + Math.sin(ang) * d);
    if (x < 1 || y < 1 || x >= L.w - 1 || y >= L.h - 1) continue;
    const k = y * L.w + x;
    if ((L.claim[k] >= 0 && L.owner[k] !== from.faction) || TERRAIN[L.terrain[k]].move <= 0) continue;
    if (w.settlements.some(s => s.alive && s.l === from.l && Math.hypot(s.x - x, s.y - y) < 5.5)) continue;
    let score = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const nk = ny * L.w + nx;
      if (L.claim[nk] >= 0 && L.owner[nk] !== from.faction) { score -= 1; continue; }
      const tid = L.terrain[nk];
      const T = TERRAIN[tid];
      score += (R.prefer[tid] ?? 0) + T.yields[FOOD] * 0.6 + (T.yields[ORE] + T.yields[MANA] + T.yields[GOLD]) * 0.25;
    }
    score -= d * 0.15;
    if (score > bs) { bs = score; best = { l: from.l, x, y }; }
  }
  return bs > 8 ? best : null;
}

/** 사람이 거의 남지 않은 고을은 몇 해를 버티다 버려진다 */
export function abandonCheck(w: World, s: Settlement): void {
  if (!s.alive || RACES[s.race].noPop || s.flags.includes('sanctum') || s.flags.includes('worldtree')) return;
  const mark = s.flags.find(x => x.startsWith('dwindle:'));
  if (s.pop >= 20) { if (mark) s.flags = s.flags.filter(x => x !== mark); return; }
  if (s.pop >= 12) return;
  if (!mark) { s.flags.push(`dwindle:${w.t}`); return; }
  if (w.t - +mark.split(':')[1] < 36) return;
  s.alive = false;
  s.governor = -1;
  const f = w.factions[s.faction];
  const L = w.layers[s.l];
  // 남은 이들은 같은 나라의 가까운 고을로 떠난다
  const refuge = w.settlements.filter(o => o.alive && o.faction === s.faction && o.l === s.l).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
  if (refuge) refuge.pop += s.pop;
  for (const c of w.chars) if (c.died < 0 && c.home === s.id) { c.home = refuge ? refuge.id : -1; if (!refuge) c.faction = -1; }
  w.sites.push({ id: w.sites.length, l: s.l, x: s.x, y: s.y, kind: 'ruin', name: `버려진 ${s.name}`, level: 1, loot: Math.round(20 + s.dev * 2), relic: null });
  w.territoryDirty = true;
  for (let k = 0; k < L.claim.length; k++) if (L.claim[k] === s.id) L.claim[k] = -1;
  addNews(w, `사람이 하나둘 떠나간 ${s.name}이(가) 끝내 버려졌다. 빈 집들 사이로 바람만 드나든다.${refuge ? ` 마지막 주민들은 ${refuge.name}(으)로 떠났다.` : ''}`, 2, 'nature', { pos: s, facs: f ? [f.id] : [] });
}
