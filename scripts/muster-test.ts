import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { dateStr } from '../src/sim/state';
let shown = 0;
for (const seed of ['BEAST-1', 'BEAST-2', 'SEA-1']) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 150; i++) tick(w);
  const ms = w.sea.musters ?? [];
  console.log(seed, '수비대', ms.length, '괴수', w.sea.beasts.length, '처치', w.sea.beasts.filter(b => !b.alive).length);
  for (const n of w.news.filter(n => /해안 수비대|앞장섰다|수비대도 흩어졌다/.test(n.text)).slice(0, 4)) { if (shown++ < 9) console.log('  ', dateStr(w, n.t), n.text.slice(0, 150)); }
}
