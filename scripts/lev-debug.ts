import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { awakenLeviathan, isPort } from '../src/sim/sea';
const w = createWorld('SEA-1');
for (let i = 0; i < 12 * 30; i++) tick(w);
console.log('ports', w.settlements.filter(s => isPort(w, s)).length, '/', w.settlements.filter(s => s.alive).length);
console.log('roles', JSON.stringify(w.chars.filter(c => c.died < 0).reduce((a: any, c) => (a[c.role] = (a[c.role] ?? 0) + 1, a), {})));
awakenLeviathan(w);
const V = w.sea.leviathan!;
const name = V.name;
console.log(V.tentacles.map(t => `${t.x},${t.y}`).join(' '));
for (let i = 0; i < 12 * 8; i++) {
  tick(w);
  if (!w.sea.leviathan?.active) { console.log('ended at month', i, w.sea.leviathan); break; }
}
for (const n of w.news.filter(n => n.text.includes(name.split(' ').pop()!) || /연맹/.test(n.text)).slice(0, 30)) console.log(n.t, n.text.slice(0, 140));
console.log('alive tent', w.sea.leviathan?.tentacles.map(t => Math.round(t.hp)).join(','), 'alliance', w.sea.leviathan?.alliance);
