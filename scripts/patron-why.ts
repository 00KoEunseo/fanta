import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { approxDist } from '../src/sim/helpers';
const w = createWorld('AUD-1');
for (let y = 1; y <= 60; y++) {
  for (let m = 0; m < 12; m++) tick(w);
  if (y % 20) continue;
  const dr = w.chars.filter(c => c.died < 0 && c.race === 'dragon');
  console.log(`${y}년 용`, dr.map(d => `${d.dragonKind}@L${d.l}`).join(' '));
  for (const f of w.factions.filter(f => f.alive && f.tier >= 1)) {
    const cap = w.settlements[f.capital];
    const near = dr.filter(d => d.dragonKind === 'recluse').map(d => Math.round(approxDist(w, d, cap, true)));
    console.log(' ', f.name, 'L' + cap.l, '금', Math.round(cap.stock[5]), '은둔용 거리', near.join(','));
  }
}
