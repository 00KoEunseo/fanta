import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { dateStr } from '../src/sim/state';
const argv: string[] = (globalThis as any).process?.argv ?? [];
for (const seed of (argv[2] ?? 'A,B,C').split(',')) {
  const w = createWorld(seed);
  const hist: string[] = [];
  let prev = '';
  for (let i = 0; i < +(argv[3] ?? 1200); i++) {
    tick(w);
    const cur = w.doom.seals.map(s => (s ? 1 : 0)).join('');
    if (cur !== prev) { hist.push(`${Math.floor(w.t / 12)}y:${cur}`); prev = cur; }
    if (w.doom.ended) { hist.push('END ' + dateStr(w)); break; }
  }
  console.log(seed, hist.join(' '));
}
