import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
import { dateStr } from '../src/sim/state';
const argv: string[] = (globalThis as any).process?.argv ?? [];
const w = createWorld(argv[2]);
for (let i = 0; i < 240; i++) tick(w);
const pc = createPlayer(w, { race: argv[3], sex: 'F', origin: argv[4], traits: [55,55,55,55,55,55,55,55,55,55] } as any)!;
let n = 0, sp = -1;
for (let i = 0; i < 12 * 120; i++) {
  tick(w);
  const P = w.player!; if (P.dead) break;
  const c = w.chars[P.charId];
  if (c.spouse !== sp) { const o = w.chars[sp]; console.log(dateStr(w), 'spouse', sp, '->', c.spouse, o ? `old: died=${o.died} spouse=${o.spouse} cause=${o.cause}` : ''); sp = c.spouse; }
  if (P.prompt) { const ch = P.prompt.choices[(n * 5 + 1) % P.prompt.choices.length]; n++; resolvePlayer(w, ch.id); }
}
