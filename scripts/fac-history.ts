import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { dateStr } from '../src/sim/state';
const w = createWorld('IRON-CROWN-1234');
for (let i = 0; i < 1200; i++) tick(w);
const top = w.factions.filter(f => (f.history?.length ?? 0) > 0).sort((a, b) => b.pop - a.pop).slice(0, 2);
for (const f of top) {
  console.log(`== ${f.name} (${f.history!.length}건)`);
  for (const h of f.history!.slice(0, 14)) console.log(' ', dateStr(w, h.t), `[${h.imp}]`, h.text.slice(0, 90));
}
