// 노예: 정착지의 노예 수, 사로잡기·거래·반란·해방
import { relocate } from './characters';
import { RACES, type RaceKey } from '../data/races';
import { FOOD, GOLD } from '../data/terrain';
import { addNews, charLog } from './news';
import type { Character, Faction, Settlement, World } from './state';
import { approxDist, clamp, leaderOf, settlementsOf } from './helpers';
import { TERRAIN } from '../data/terrain';
import { makeClanName } from '../data/names';
import { createFaction, crown, factionName } from './factions';
import { foundSettlement } from './settlements';
import { createCharacter } from './characters';

/** 이 세력은 노예를 부리는가 */
export function allowsSlavery(w: World, f: Faction | undefined): boolean {
  if (!f || !f.alive) return false;
  if (f.flags.includes('abolished')) return false;
  if (f.race === 'elf' || f.race === 'angel') return false;
  const ld = leaderOf(w, f);
  if (['orc', 'goblin', 'darkelf', 'majin', 'demon', 'undead'].includes(f.race)) return !ld || ld.traits[3] < 75;
  return !!ld && (ld.traits[3] < 30 || (ld.traits[2] > 70 && ld.traits[3] < 50));
}

export function slavesOf(s: Settlement): number { return s.slaves ?? 0; }

/** 사로잡은 이들을 노예로 데려간다 */
export function takeSlaves(w: World, to: Settlement, n: number, race: RaceKey): void {
  if (n < 1) return;
  to.slaves = (to.slaves ?? 0) + n;
  if (!to.slaveRace || n > (to.slaves ?? 0) / 2) to.slaveRace = race;
}

/** 매달: 노예의 식량, 반란, 해방, 거래 */
export function slaveryMonth(w: World): void {
  const rng = w.rngSim;
  for (const s of w.settlements) {
    const n = slavesOf(s);
    if (!s.alive || n < 1) continue;
    s.stock[FOOD] = Math.max(0, s.stock[FOOD] - n * 0.6 / 20);
    s.stability = clamp(s.stability - Math.min(2, (n / Math.max(1, s.pop)) * 3));
    // 굶주리면 노예부터 죽는다
    if (s.hunger > 0) s.slaves = n * 0.95;
    const f = w.factions[s.faction];
    // 해방: 노예를 부리지 않는 세력이 차지하면 풀려나 백성이 된다
    if (!allowsSlavery(w, f)) {
      s.pop += n;
      s.slaves = 0;
      if (n >= 20) addNews(w, `${s.name}의 노예 ${Math.round(n)}명이 사슬을 벗고 자유민이 되었다.`, 2, 'politics', { pos: s, facs: f ? [f.id] : [] });
      continue;
    }
    // 반란
    if (n > s.pop * 0.25 && s.stability < 40 && rng.chance(0.004 + (n / Math.max(1, s.pop)) * 0.01)) revolt(w, s);
  }
  // 노예 무역
  if (rng.chance(0.03)) {
    const sellers = w.settlements.filter(s => s.alive && slavesOf(s) > s.pop * 0.3 && allowsSlavery(w, w.factions[s.faction]));
    if (sellers.length) {
      const s = rng.pick(sellers);
      const buyers = w.settlements.filter(b => b.alive && b.faction !== s.faction && allowsSlavery(w, w.factions[b.faction]) && b.stock[GOLD] > 40 && approxDist(w, s, b) < 70);
      if (buyers.length) {
        const b = rng.pick(buyers);
        const k = Math.round(slavesOf(s) * 0.3);
        s.slaves = slavesOf(s) - k; takeSlaves(w, b, k, s.slaveRace ?? s.race);
        const price = Math.min(b.stock[GOLD], k * 0.8);
        b.stock[GOLD] -= price; s.stock[GOLD] += price;
        if (k >= 15) addNews(w, `노예상들이 ${s.name}에서 ${b.name}(으)로 노예 ${k}명을 끌고 가 팔았다.`, 1, 'trade', { pos: b });
      }
    }
  }
}

function revolt(w: World, s: Settlement): void {
  const rng = w.rngSim;
  const n = slavesOf(s);
  const race = s.slaveRace ?? s.race;
  const f = w.factions[s.faction];
  if (!rng.chance(0.12)) {
    const dead = Math.round(n * rng.float(0.3, 0.6));
    s.slaves = n - dead;
    w.corpses += dead;
    s.stability = clamp(s.stability - 10);
    addNews(w, `${s.name}의 노예들이 사슬을 끊고 들고일어났으나 진압되었다. ${dead}명이 처형되었다.`, 3, 'politics', { pos: s, facs: f ? [f.id] : [] });
    return;
  }
  // 성공: 해방민의 나라
  s.slaves = 0;
  const free = Math.round(n * 0.7);
  s.pop = Math.max(10, s.pop - n * 0.1);
  const nf = spawnFree(w, s, race, free);
  addNews(w, nf
    ? `${s.name}의 노예 ${free}명이 반란에 성공하여 주인들을 몰아내고 ${nf.name}을(를) 세웠다!`
    : `${s.name}의 노예들이 반란에 성공해 사슬을 끊고 흩어졌다.`, 4, 'politics', { pos: s, facs: [s.faction, ...(nf ? [nf.id] : [])] });
}

/** 해방민이 세운 나라 (주인공이 이끌면 그가 군주가 된다) */
export function spawnFree(w: World, near: Settlement, race: RaceKey, pop: number, leader?: Character): Faction | null {
  const rng = w.rngSim;
  const L = w.layers[near.l];
  for (let i = 0; i < 80; i++) {
    const x = near.x + rng.int(-10, 10), y = near.y + rng.int(-10, 10);
    if (x < 1 || y < 1 || x >= L.w - 1 || y >= L.h - 1) continue;
    const k = y * L.w + x;
    if (L.claim[k] >= 0 || TERRAIN[L.terrain[k]].move <= 0) continue;
    if (w.settlements.some(s => s.alive && s.l === near.l && Math.hypot(s.x - x, s.y - y) < 4)) continue;
    const f = createFaction(w, race, makeClanName(rng, race));
    const s = foundSettlement(w, { faction: f.id, race, pos: { l: near.l, x, y }, pop });
    f.capital = s.id; f.baseName = s.name; f.name = factionName(f);
    f.flags.push('abolished');
    const R = RACES[race];
    const ld = leader ?? createCharacter(w, { race, faction: f.id, home: s.id, pos: s, born: w.t - (R.adult + rng.int(5, 20)) * 12 });
    if (!leader) { ld.title = 'adult'; ld.role = '전사'; }
    ld.faction = f.id; ld.home = s.id;
    if (!ld.epithet) ld.epithet = '해방자';
    crown(w, f, ld, '해방');
    if (ld.role === '노예') ld.role = '전사';
    return f;
  }
  return null;
}

/** 인물을 노예로 만든다 */
export function enslaveChar(w: World, c: Character, captor: Settlement): void {
  for (const f of w.factions) if (f.leader === c.id) f.leader = -1;
  c.officer = undefined;
  c.role = '노예';
  c.faction = captor.faction;
  c.home = captor.id;
  c.wealth = 0;
  c.act = { kind: 'idle' };
  // 노예상의 땅까지 끌려간다 (걸어서)
  relocate(w, c, captor);
  for (const s of w.settlements) if (s.governor === c.id) s.governor = -1;
  charLog(w, c, `${captor.name}에 노예로 끌려갔다.`, 4);
  if (c.isPlayer && w.player) { w.player.flags ??= {}; w.player.flags.slave = w.t; }
}

/** 노예에서 풀려난다 */
export function freeChar(w: World, c: Character, how: string): void {
  c.role = '백수';
  if (c.isPlayer && w.player?.flags) delete w.player.flags.slave;
  charLog(w, c, `${how} 자유의 몸이 되었다.`, 4);
}

/** 이 정착지 근처의 노예 부리는 세력 */
export function slaverNear(w: World, c: Character): Settlement | null {
  const ss = w.settlements.filter(s => s.alive && s.faction !== c.faction && allowsSlavery(w, w.factions[s.faction]) && approxDist(w, c, s) < 45);
  return ss.sort((a, b) => approxDist(w, c, a) - approxDist(w, c, b))[0] ?? null;
}

export function totalSlaves(w: World, f: Faction): number {
  return settlementsOf(w, f).reduce((a, s) => a + slavesOf(s), 0);
}

export { RACES };
