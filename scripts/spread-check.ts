import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('SPREAD-1');
for (let i = 0; i < 12 * 60; i++) tick(w);
let atCap = 0, total = 0, onCenter = 0;
const caps = new Set(w.factions.filter(f => f.alive).map(f => f.capital));
for (const c of w.chars) {
  if (c.died >= 0 || c.race === 'dragon') continue;
  total++;
  if (caps.has(c.home)) atCap++;
  const h = w.settlements[c.home];
  if (h && c.l === h.l && Math.hypot(c.x - h.x, c.y - h.y) <= 2) onCenter++;
}
const set = w.settlements.filter(s => s.alive);
console.log('인물', total, '수도가 고향', atCap, `(${Math.round(atCap / total * 100)}%)`, '고향 2칸 안', onCenter, `(${Math.round(onCenter / total * 100)}%)`, '정착지', set.length, '수도', caps.size, '수도 인구 비중', Math.round(set.filter(s => caps.has(s.id)).reduce((a, s) => a + s.pop, 0) / set.reduce((a, s) => a + s.pop, 0) * 100) + '%');
const byRole: Record<string, number[]> = {};
for (const c of w.chars) {
  if (c.died >= 0 || c.race === 'dragon') continue;
  const h = w.settlements[c.home];
  if (!h || c.l !== h.l) continue;
  (byRole[c.role] ??= []).push(Math.hypot(c.x - h.x, c.y - h.y));
}
console.log(Object.entries(byRole).filter(([, v]) => v.length >= 5).map(([r, v]) => `${r} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}칸`).join(' · '));
