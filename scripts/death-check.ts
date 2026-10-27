import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('DEATH-1');
for (let i = 0; i < 12 * 200; i++) tick(w);
const by: Record<string, Record<string, number>> = {};
for (const c of w.chars) {
  if (c.died < 0 || c.race === 'dragon' || (w.t - c.born) / 12 < 16) continue;
  const cause = /노환|소임|소멸/.test(c.cause) ? '노환' : /상처|무리/.test(c.cause) ? '상처(건강)' : /전사|공방전|결전|습격|괴물|탐험|결투|사투|토벌/.test(c.cause) ? '싸움·모험' : /역병|병|열병/.test(c.cause) ? '병' : /사고/.test(c.cause) ? '사고' : '기타';
  (by[c.role] ??= {})[cause] = ((by[c.role] ??= {})[cause] ?? 0) + 1;
}
for (const [r, m] of Object.entries(by).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y) - Object.values(a[1]).reduce((x, y) => x + y)).slice(0, 14)) {
  const n = Object.values(m).reduce((x, y) => x + y);
  console.log(r.padEnd(5), n, Object.entries(m).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(' · '));
}
console.log('수호룡 생긴 횟수', w.news.filter(n => /수호룡이 되었다/.test(n.text)).length, '수호룡 살해', w.news.filter(n => /수호룡/.test(n.text) && /죽|베|배신/.test(n.text)).length);
