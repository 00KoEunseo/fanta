import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { capacity } from '../src/sim/settlements';
import { RACES } from '../src/data/races';
const w = createWorld('REP-1');
const hungry: Record<string, number> = {}, lowStab: Record<string, number> = {}, cnt: Record<string, number> = {};
let samples = 0;
for (let i = 0; i < 12 * 100; i++) {
  tick(w);
  if (i % 12) continue;
  samples++;
  for (const s of w.settlements) {
    if (!s.alive) continue;
    const k = `${RACES[s.race].name}/L${s.l}`;
    cnt[k] = (cnt[k] ?? 0) + 1;
    if (s.hunger > 0) hungry[k] = (hungry[k] ?? 0) + 1;
    if (s.stability < 22) lowStab[k] = (lowStab[k] ?? 0) + 1;
  }
}
for (const k of Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])) console.log(k.padEnd(10), '고을-년', cnt[k], '굶주림', Math.round((hungry[k] ?? 0) / cnt[k] * 100) + '%', '안정도<22', Math.round((lowStab[k] ?? 0) / cnt[k] * 100) + '%');
const s = w.settlements.filter(s => s.alive && s.hunger > 0).slice(0, 5);
for (const x of s) console.log(' 예', x.name, RACES[x.race].name, 'pop', Math.round(x.pop), 'cap', Math.round(capacity(w, x)), 'tiles', x.tiles.length, 'prod', x.prod[0].toFixed(1), 'cons', x.cons[0].toFixed(1), 'stab', Math.round(x.stability));
