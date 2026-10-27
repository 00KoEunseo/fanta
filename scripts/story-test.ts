import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir } from '../src/sim/player';
import { storySummary } from '../src/sim/lifeData7';
import { dateStr } from '../src/sim/state';
const counts: Record<string, number> = {};
let lives = 0, deaths: string[] = [];
for (const seed of ['ST-1', 'ST-2', 'ST-3']) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 15; i++) tick(w);
  createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [60, 55, 50, 50, 50, 50, 60, 50, 50, 50] } as any);
  let n = 0;
  for (let i = 0; i < 12 * 200; i++) {
    tick(w);
    const P = w.player!;
    if (P.dead) {
      const c = w.chars[P.charId]; lives++; deaths.push(`${c.cause}(${Math.floor((c.died - c.born) / 12)}세)`);
      if (lives <= 2) { console.log('── 생애 요약', seed); for (const l of storySummary(w, c)) console.log('  ', l); for (const b of c.bio.filter(b => (b.imp ?? 2) >= 3).slice(-12)) console.log('   ', dateStr(w, b.t), b.text.slice(0, 100)); }
      if (!continueAsHeir(w)) break; continue;
    }
    if (P.prompt) {
      const id = P.prompt.eventId;
      if (/^(st_|cr_|hs_|xh_)/.test(id)) counts[id] = (counts[id] ?? 0) + 1;
      const ch = P.prompt.choices[(n++ * 7) % P.prompt.choices.length];
      resolvePlayer(w, ch.id);
    }
  }
}
console.log('생애', lives, '사인', deaths.join(', '));
console.log(JSON.stringify(counts));
