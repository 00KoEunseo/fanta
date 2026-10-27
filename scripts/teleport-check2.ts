import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir } from '../src/sim/player';
const w = createWorld('TP-1');
for (let i = 0; i < 12 * 15; i++) tick(w);
createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [60, 55, 50, 50, 50, 50, 60, 50, 50, 50] } as any);
const nearPortal = (l: number, x: number, y: number) => w.portals.some(p => [p.a, p.b].some(e => e.l === l && Math.hypot(e.x - x, e.y - y) <= 6));
let jumps = 0, mine = 0, moves = 0;
const kinds: Record<string, number> = {};
const ex: string[] = [];
let n = 0;
for (let i = 0; i < 12 * 120; i++) {
  const before = new Map(w.chars.filter(c => c.died < 0).map(c => [c.id, { l: c.l, x: c.x, y: c.y, k: c.act.kind, p: c.act.purpose, m: c.act.months, pl: c.act.path?.length }]));
  tick(w);
  const P = w.player!;
  if (P.prompt) resolvePlayer(w, P.prompt.choices[(n++ * 7) % P.prompt.choices.length].id);
  if (P.dead) continueAsHeir(w);
  for (const c of w.chars) {
    const b = before.get(c.id);
    if (!b || c.died >= 0 || c.race === 'dragon') continue;
    if (b.l !== c.l || b.x !== c.x || b.y !== c.y) moves++;
    const tele = b.l === c.l ? Math.hypot(b.x - c.x, b.y - c.y) > 12 : !nearPortal(b.l, b.x, b.y);
    if (!tele || c.act.kind === 'voyage' || b.k === 'voyage' || c.act.kind === 'fleet') continue;
    jumps++; if (c.isPlayer) mine++;
    const k = `${b.k}→${c.act.kind}`;
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k === 'travel→idle' && ex.length < 8) ex.push(`${c.name}${c.isPlayer ? '(나)' : ''} ${k} L${b.l}(${b.x},${b.y})→L${c.l}(${c.x},${c.y}) / ${c.log.slice(-2).map(l => l.text.slice(0, 30)).join(' | ')} purpose=${(b as any).p} months=${(b as any).m} pathLeft=${(b as any).pl}`);
  }
}
console.log('이동', moves, '순간이동', jumps, '그중 나', mine, JSON.stringify(kinds));
for (const e of ex) console.log(' ', e);
