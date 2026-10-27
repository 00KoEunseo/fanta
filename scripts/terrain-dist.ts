import { createWorld } from '../src/sim/world';
import { TERRAIN } from '../src/data/terrain';
for (const s of ['AUD-1', 'A1', 'C3', 'D4']) {
  const w = createWorld(s);
  const c: Record<string, number> = {};
  for (const t of w.layers[2].terrain) c[TERRAIN[t].name] = (c[TERRAIN[t].name] ?? 0) + 1;
  console.log(s, JSON.stringify(c));
}
