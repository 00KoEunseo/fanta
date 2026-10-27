// 한 번에 멀리 움직이는 경우(순간이동)를 찾는다
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir } from '../src/sim/player';
const where = new Map<string, { n: number; player: number; ex: string }>();
(globalThis as any).__tpHook = (c: any, p: any) => {
  if (c.died >= 0) return;
  const far = c.l !== p.l || Math.hypot(c.x - p.x, c.y - p.y) > 12;
  if (!far) return;
  const st = (new Error().stack ?? '').split('\n').slice(2, 5).map(l => l.trim().replace(/^at /, '').replace(/\(.*[\/]src[\/]/, '(').replace(/:\d+\)$/, ')')).join(' ← ');
  const e = where.get(st) ?? { n: 0, player: 0, ex: '' };
  e.n++; if (c.isPlayer) e.player++;
  if (!e.ex) e.ex = `${c.name}(${c.act.kind}) L${c.l}(${c.x},${c.y})→L${p.l}(${p.x},${p.y})`;
  where.set(st, e);
};
const w = createWorld('TP-1');
for (let i = 0; i < 12 * 15; i++) tick(w);
createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [60, 55, 50, 50, 50, 50, 60, 50, 50, 50] } as any);
let n = 0;
for (let i = 0; i < 12 * 120; i++) {
  tick(w);
  const P = w.player!;
  if (P.dead) { if (!continueAsHeir(w)) { P.dead = true; } continue; }
  if (P.prompt) resolvePlayer(w, P.prompt.choices[(n++ * 7) % P.prompt.choices.length].id);
}
for (const [st, e] of [...where].sort((a, b) => b[1].n - a[1].n).slice(0, 18)) console.log(String(e.n).padStart(5), `(나 ${e.player})`, st, '\n        예:', e.ex);
