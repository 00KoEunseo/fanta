import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer } from '../src/sim/player';
import { findPath } from '../src/sim/path';
import { approxDist } from '../src/sim/helpers';
const w = createWorld('XP-1');
for (let i = 0; i < 12 * 20; i++) tick(w);
const c = createPlayer(w, { race: 'human', sex: 'M', origin: 'common' } as any)!;
console.log('위치', c.l, c.x, c.y, '지형', w.layers[c.l].terrain[c.y * w.layers[c.l].w + c.x], 'act', c.act.kind);
for (const s of w.sites.filter(s => s.loot > 0 && s.kind !== 'deep').sort((a, b) => approxDist(w, c, a) - approxDist(w, c, b)).slice(0, 5)) {
  const p = findPath(w, c, s, { race: c.race, flying: false }, 30000);
  console.log(s.name, 'L' + s.l, Math.round(approxDist(w, c, s)), '경로', p ? p.length : null);
}
