import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { spawnDragon } from '../src/sim/events';
import { dateStr } from '../src/sim/state';
const w = createWorld('DR-1');
for (let i = 0; i < 12 * 10; i++) tick(w);
const a1 = spawnDragon(w, true)!, a2 = spawnDragon(w, true)!;
for (const d of [a1, a2]) { d.wrathStart = w.t; d.wrathUntil = w.t + 12 * 40; d.sleep = 0; }
const t0 = w.t;
console.log('고대 용', a1.name, `L${a1.l}(${a1.x},${a1.y})`, a2.name, `L${a2.l}(${a2.x},${a2.y})`);
for (let i = 0; i < 12 * 60; i++) tick(w);
for (const n of w.news.filter(n => n.t >= t0 && /고대 용|맞붙|영역|달아났|쫓아냈|기척/.test(n.text) && /용/.test(n.text)).filter(n => /마주쳤|맞붙|쫓아냈|달아났|물어 찢|영역|사투/.test(n.text)).slice(0, 10)) console.log(dateStr(w, n.t), n.text.slice(0, 120));
console.log('살아남은 고대 용', w.chars.filter(c => c.died < 0 && c.ancient).map(c => c.name).join(', ') || '없음', '| 고대 용 사투', w.stats.ancientDuels ?? 0);
