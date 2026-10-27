import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { dateStr } from '../src/sim/state';
const w = createWorld('ASH-DRAGON-4821');
for (let i = 0; i < 1200; i++) tick(w);
console.log('가문', w.houses.length, '존속', w.houses.filter(h => h.alive).length, '왕가', w.houses.filter(h => h.alive && h.royal).length, '성지 수호', w.houses.filter(h => h.shrine >= 0).length);
const top = w.houses.filter(h => h.history.length > 2).sort((a, b) => b.prestige - a.prestige).slice(0, 2);
for (const h of top) {
  console.log(`== ${h.name} (${w.factions[h.faction]?.name}) 명망 ${h.prestige} 식구 ${w.chars.filter(c => c.house === h.id && c.died < 0).length}`);
  for (const x of h.history.slice(0, 10)) console.log('  ', dateStr(w, x.t), x.text);
}
