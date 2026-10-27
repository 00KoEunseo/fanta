import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('XP-1');
const show = (y: number) => {
  const by: Record<string, string> = {};
  for (const l of [0, 1, 2, 3, 4]) { const s = w.sites.filter(s => s.l === l && s.kind !== 'deep'); by['L' + l] = `${s.filter(x => x.loot > 0).length}/${s.length}`; }
  console.log(y + '년', JSON.stringify(by), '총 유적', w.sites.length);
};
show(0);
for (let y = 1; y <= 100; y++) { for (let m = 0; m < 12; m++) tick(w); if ([5, 20, 50, 100].includes(y)) show(y); }
