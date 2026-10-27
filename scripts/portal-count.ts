import { createWorld } from '../src/sim/world';
for (const s of ['AUD-1', 'A1', 'B2', 'C3', 'D4', 'SEA-1']) {
  const w = createWorld(s);
  const L = w.layers[2];
  let m = 0;
  for (let i = 0; i < L.terrain.length; i++) if (L.terrain[i] === 7) m++;
  const cnt = (k: string) => w.portals.filter(p => p.kind === k).length;
  console.log(s, '산', m, 'cave', cnt('cave'), 'peak', cnt('peak'), 'stair', cnt('stair'), 'rift', cnt('rift'));
}
