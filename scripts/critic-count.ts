import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('CRIT-1');
const pats: [string, RegExp][] = [['천군 강림', /천군이 하늘의 계단을 내려왔다/], ['세계수로 방향', /세계수를 향해 방향을 틀었다/], ['모욕 잊지 않음', /모욕을 결코 잊지 않았다/], ['오랜 원한', /오랜 원한이 다시 불붙었다/], ['용 불태움', /을\(를\)? ?불태웠다|를 불태웠다|을 불태웠다/], ['포효', /하늘을 향해 포효/], ['천상 진군', /천상으로 진군하였다/], ['노환(40세 미만 군주)', /([1-3]\d)세의 나이에 노환/]];
const cnt: Record<string, number> = {}; const seen = new Set<number>();
let total = 0, imp5 = 0;
for (let i = 0; i < 12 * 300; i++) {
  tick(w);
  for (const n of w.news) { const id = (n as any).id ?? (n.t * 100000 + n.text.length * 7 + n.text.charCodeAt(3)); if (seen.has(id)) continue; seen.add(id); total++; if (n.imp >= 5) imp5++; for (const [k, r] of pats) if (r.test(n.text)) cnt[k] = (cnt[k] ?? 0) + 1; }
  for (const c of w.chars) for (const b of c.bio) if (/포효/.test(b.text)) {}
}
console.log('total news', total, 'imp5', imp5, cnt);
const sites = (w as any).sites ?? [];
console.log('sites', sites.length, 'alive', sites.filter((s: any) => s.alive !== false).length);
