import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('ART-1');
const row: string[] = [];
for (let y = 1; y <= 300; y++) {
  for (let m = 0; m < 12; m++) tick(w);
  if (y % 50 === 0) row.push(`${y}년: 남음 ${w.artifacts.filter(a => a.lost === undefined).length} / 스러짐 ${w.artifacts.filter(a => a.lost !== undefined).length}`);
}
console.log(row.join('\n'));
for (const n of w.news.filter(n => /세월을 버텨 온/.test(n.text)).slice(-5)) console.log(' -', n.text);
