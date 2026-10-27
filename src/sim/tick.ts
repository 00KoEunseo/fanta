import { RACES } from '../data/races';
import { raiseArmy } from './military';
import { assignPioneers } from './pioneer';
import { clashMonth, dragonClashes } from './clash';
import { updateStories } from './stories';
import { addNews } from './news';
import { eraTick } from './news';
import type { World } from './state';
import { dist } from './state';
import { characterMonth, lifecycleMonth, restockSites, updateRank } from './characters';
import { factionMonth, homelessMonth } from './factions';
import { armiesMonth } from './military';
import { abandonCheck, recomputeTerritory, settlementMonth } from './settlements';
import { territoryMonth } from './territory';
import { EVENTS } from './events';
import { doomTick } from './doom';
import { worldTreeMonth } from './calamity';
import { diseaseMonth } from './disease';
import { slaveryMonth } from './slavery';
import { towerMonth } from './towers';
import { angelMonth } from './angels';
import { crusadeMonth } from './crusade';
import { housesMonth } from './houses';
import { seaMonth } from './sea';
import { artifactMonth } from './artifacts';
import { computeProphecy } from './prophecy';
import { playerTick } from './player';
import { seasonFiller } from './seasonal';
import { expeditionMonth } from './expedition';
import { isAdult } from './helpers';

/** 한 달 진행 */
export function tick(w: World): void {
  if (w.doom.ended) return;
  w.t++;
  recomputeTerritory(w);

  for (const s of w.settlements) if (s.alive && !RACES[s.race].noPop) settlementMonth(w, s);
  if (w.t % 3 === 0) for (const s of w.settlements) abandonCheck(w, s);
  diseaseMonth(w);
  slaveryMonth(w);
  towerMonth(w);
  angelMonth(w);
  territoryMonth(w);
  assignPioneers(w, (w2, f, from, size, cmd, dest) => raiseArmy(w2, f, from, 'clear', null, size, cmd, dest));

  for (const f of w.factions) if (f.alive) factionMonth(w, f);

  for (const c of w.chars) {
    if (c.died >= 0) continue;
    homelessMonth(w, c);
    characterMonth(w, c);
    updateRank(w, c);
  }
  armiesMonth(w);
  crusadeMonth(w);
  housesMonth(w);
  seaMonth(w);
  clashMonth(w);
  dragonClashes(w);
  worldTreeMonth(w);
  artifactMonth(w);
  runEvents(w);
  lifecycleMonth(w);
  if (w.territoryDirty) recomputeTerritory(w);
  doomTick(w);
  eraTick(w);
  w.corpses *= 0.97;
  w.prophecy = computeProphecy(w);
  expeditionMonth(w);
  restockSites(w);
  seasonFiller(w);
  updateStories(w);
  playerTick(w);
}

function runEvents(w: World): void {
  const rng = w.rngSim;
  for (const ev of EVENTS) {
    if (w.doom.ended) return;
    switch (ev.scope) {
      case 'world':
        if (rng.chance(ev.p(w, null))) ev.fire(w, null);
        break;
      case 'settlement':
        for (const s of w.settlements) if (s.alive && rng.chance(ev.p(w, s))) ev.fire(w, s);
        break;
      case 'faction':
        for (const f of w.factions) if (f.alive && rng.chance(ev.p(w, f))) ev.fire(w, f);
        break;
      case 'char':
        for (const c of w.chars) if (c.died < 0 && c.race !== 'dragon' && isAdult(w, c) && rng.chance(ev.p(w, c))) ev.fire(w, c);
        break;
    }
  }
}

function spreadPlague(w: World): void {
  const rng = w.rngSim;
  const sick = w.settlements.filter(s => s.alive && s.plague > 0);
  for (const s of sick) {
    for (const o of w.settlements) {
      if (!o.alive || o.plague > 0 || o.l !== s.l || RACES[o.race].needs[0] === 0) continue;
      const d = dist(o, s);
      if (d > 22) continue;
      if (rng.chance(0.015 * (1 - d / 25))) {
        o.plague = rng.int(8, 24);
        addNews(w, `${s.name}의 역병이 ${o.name}까지 번졌다.`, 2, 'nature', { pos: o, facs: [o.faction] });
      }
    }
  }
}
