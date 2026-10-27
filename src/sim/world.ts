import { Rng, hashString } from '../core/rng';
import { RACES, RACE_KEYS, type RaceKey } from '../data/races';
import * as T from '../data/terrain';
import { TERRAIN } from '../data/terrain';
import { makeClanName } from '../data/names';
import { generateLayers, generatePortals, generateSites } from './worldgen';
import type { Pos, World } from './state';
import { chooseRole, createCharacter } from './characters';
import { aggregate, createFaction, crown, factionName } from './factions';
import { foundSettlement, recomputeTerritory } from './settlements';
import { claimInitial } from './territory';
import { addNews, startEra } from './news';
import { spawnDragon } from './events';
import { setupAngels } from './angels';
import { newSeaState } from './sea';
import { computeProphecy } from './prophecy';
import { yearOf } from './state';

export const WORLD_VERSION = 1;

export function createWorld(seed: string): World {
  const gen = new Rng(seed + ':world');
  const layers = generateLayers(gen);
  const portals = generatePortals(layers, gen);
  const sites = generateSites(layers, new Rng(seed + ':sites'));
  const w: World = {
    seed, version: WORLD_VERSION, t: 0, startYear: 600 + (hashString(seed) % 700),
    rngSim: new Rng(seed + ':sim'),
    layers, portals, sites, settlements: [], factions: [], chars: [], armies: [], news: [], eras: [],
    doom: { seals: [false, false, false, false, false, false, false], ended: false, endText: '', heroDeaths: 0, dragonGrievance: 0 },
    demonLord: -1, prophecy: [], player: null, territoryDirty: true, stats: {}, nextNewsId: 1, corpses: 0, worldTree: null, cinematics: [], artifacts: [], diseases: [], towers: [], parties: [], alliances: [], houses: [], sea: newSeaState(), sealsV: 2,
  };
  startEra(w);
  placeFactions(w, new Rng(seed + ':place'));
  for (const s of w.settlements) claimInitial(w, s, 2);
  for (let i = 0; i < 5; i++) spawnDragon(w, false);
  recomputeTerritory(w);
  for (const f of w.factions) aggregate(w, f);
  w.prophecy = computeProphecy(w);
  addNews(w, `${yearOf(w)}년, 세계가 깨어났다. ${w.factions.length}개의 세력이 저마다의 땅에서 첫발을 내디뎠다.`, 3, 'growth');
  return w;
}

const MIN_DIST: Record<number, number> = { 0: 8, 1: 10, 2: 17, 3: 14, 4: 12 };

function placeFactions(w: World, rng: Rng): void {
  const order: RaceKey[] = RACE_KEYS.filter(r => RACES[r].startFactions > 0);
  for (const race of order) {
    const R = RACES[race];
    for (let i = 0; i < R.startFactions; i++) {
      const pos = race === 'angel' ? findTerrain(w, T.SANCTUM) : pickSite(w, rng, race);
      if (!pos) continue;
      const f = createFaction(w, race, makeClanName(w.rngSim, race));
      const s = foundSettlement(w, { faction: f.id, race, pos, pop: rng.int(R.startPop[0], R.startPop[1]) });
      s.dev = rng.float(0, 6);
      f.capital = s.id;
      f.baseName = s.name;
      f.name = factionName(f);
      if (race === 'elf' && !w.worldTree) { s.flags.push('worldtree'); w.worldTree = { sid: s.id, hp: 100, growth: 100, alive: true }; }
      if (race === 'angel') s.flags.push('sanctum');
      if (race === 'angel') crown(w, f, setupAngels(w, f, s), '건국');
      else populate(w, rng, f.id, s.id);
    }
  }
}

function findTerrain(w: World, tid: number): Pos | null {
  for (const L of w.layers) for (let k = 0; k < L.terrain.length; k++) {
    if (L.terrain[k] === tid) {
      // 성역 중앙 근처
      const x = k % L.w, y = Math.floor(k / L.w);
      if (L.terrain[k + 1] === tid && L.terrain[k + L.w] === tid) return { l: L.id, x: x + 1, y: y + 1 };
    }
  }
  return null;
}

function pickSite(w: World, rng: Rng, race: RaceKey): Pos | null {
  const R = RACES[race];
  let best: Pos | null = null, bs = -Infinity;
  for (let i = 0; i < 500; i++) {
    const l = rng.pick(R.layers);
    const L = w.layers[l];
    const x = rng.int(3, L.w - 4), y = rng.int(3, L.h - 4);
    const tid = L.terrain[y * L.w + x];
    if (TERRAIN[tid].move <= 0 || (R.prefer[tid] ?? 0) <= 0) continue;
    const md = MIN_DIST[l];
    if (w.settlements.some(s => s.l === l && Math.hypot(s.x - x, s.y - y) < md)) continue;
    let score = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const t = L.terrain[ny * L.w + nx];
      score += (R.prefer[t] ?? 0) * 0.8 + TERRAIN[t].yields[T.FOOD] * 0.5 + TERRAIN[t].yields[T.MANA] * 0.2;
    }
    score += rng.float(0, 8);
    if (score > bs) { bs = score; best = { l, x, y }; }
  }
  return best;
}

function populate(w: World, rng: Rng, fid: number, sid: number): void {
  const f = w.factions[fid];
  const s = w.settlements[sid];
  const R = RACES[f.race];
  const life = R.lifespan[0];
  const born = (age: number) => w.t - Math.round(age * 12) - rng.int(0, 11);
  // 장로
  const elderAge = R.adult + (life - R.adult) * rng.float(0.35, 0.6);
  const elder = createCharacter(w, { race: f.race, faction: fid, home: sid, pos: s, born: born(elderAge) });
  elder.stats.charisma = Math.min(100, elder.stats.charisma + 15);
  const spouse = createCharacter(w, { race: f.race, faction: fid, home: sid, pos: s, born: born(elderAge - rng.int(0, 6)), sex: elder.sex === 'M' ? 'F' : 'M' });
  elder.spouse = spouse.id; spouse.spouse = elder.id;
  const kids = rng.int(1, 3);
  for (let i = 0; i < kids; i++) {
    const kidAge = rng.float(1, Math.max(2, elderAge - R.adult));
    createCharacter(w, { race: f.race, faction: fid, home: sid, pos: s, born: born(kidAge), father: elder.sex === 'M' ? elder.id : spouse.id, mother: elder.sex === 'F' ? elder.id : spouse.id });
  }
  const others = rng.int(5, 8);
  for (let i = 0; i < others; i++) {
    const age = R.adult + (life - R.adult) * rng.float(0, 0.55);
    createCharacter(w, { race: f.race, faction: fid, home: sid, pos: s, born: born(age) });
  }
  for (const c of w.chars) {
    if (c.faction !== fid) continue;
    const age = (w.t - c.born) / 12;
    if (age >= R.adult) { c.role = chooseRole(w, c); c.title = 'adult'; }
    else c.title = 'child';
    c.fame = rng.float(0, 15);
  }
  crown(w, f, elder, '건국');
  elder.fame += 10;
}
