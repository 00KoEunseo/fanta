import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { expandStyle } from '../src/sim/territory';
import { OCEAN, SHALLOW } from '../src/data/terrain';
const w = createWorld('TERR-1');
for (let i = 0; i < 12 * 60; i++) tick(w);
const L = w.layers[2];
const ch = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
for (let y = 0; y < L.h; y += 2) {
  let row = '';
  for (let x = 0; x < L.w; x += 1) {
    const k = y * L.w + x, o = L.owner[k], t = L.terrain[k];
    row += o >= 0 ? ch[o % ch.length] : t === OCEAN || t === SHALLOW ? '~' : '.';
  }
  console.log(row);
}
for (const f of w.factions.filter(f => f.alive && w.settlements[f.capital]?.l === 2)) console.log(ch[f.id % ch.length], f.name, expandStyle(w, f), f.settlements.length + '곳');
