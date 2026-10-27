import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('A1');
for (let i = 0; i < 12 * 250; i++) tick(w);
console.log('탑', w.towers.length, '서 있음', w.towers.filter(t => t.alive).length, '무너짐', w.towers.filter(t => !t.alive).length, '탑 통로', w.portals.filter(p => p.kind === 'tower').length);
const spots = new Map<string, number>();
for (const t of w.towers) { const k = `${Math.round(t.x / 4)},${Math.round(t.y / 4)}`; spots.set(k, (spots.get(k) ?? 0) + 1); }
console.log('같은 자리(4칸 안)에 겹친 탑', [...spots.values()].filter(n => n > 1).length);
for (const n of w.news.filter(n => /다시 쌓기 시작|바벨탑이라 불렀다/.test(n.text)).slice(0, 6)) console.log(' ', n.text.slice(0, 90));
