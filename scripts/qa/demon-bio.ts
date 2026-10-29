// 악마의 일대기가 얼마나 채워지는가: 중요도 2 이상 줄의 수
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
const w = createWorld('DB-1');
for (let i = 0; i < 12 * 150; i++) tick(w);
const ds = w.chars.filter(c => c.archdemon);
const n = ds.map(c => c.bio.filter(b => (b.imp ?? 2) >= 2).length).sort((a, b) => a - b);
console.log(`악마 ${ds.length} · 일대기(중요) 줄 평균 ${(n.reduce((a, b) => a + b, 0) / n.length).toFixed(1)} · 중앙 ${n[n.length >> 1]} · 0줄 ${n.filter(x => x <= 1).length}명`);
const top = ds.sort((a, b) => b.bio.length - a.bio.length)[0];
console.log(`예: ${top.name} —`, top.bio.filter(b => (b.imp ?? 2) >= 2).slice(-6).map(b => b.text).join(' / '));
