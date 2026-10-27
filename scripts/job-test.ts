import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, PLAYABLE, birthplaces } from '../src/sim/player';
import { makeCtx, buildPrompt, JOB_SEARCH } from '../src/sim/life';
const w = createWorld('ASH-DRAGON-4821');
for (let i = 0; i < 120; i++) tick(w);
for (const race of PLAYABLE) {
  if (!birthplaces(w, race).length) continue;
  const labels = new Set<string>();
  for (let k = 0; k < 30; k++) {
    const c = createPlayer(w, { race, sex: 'M', origin: 'common' })!;
    c.born = w.t - 80 * 12;
    const p = buildPrompt(makeCtx(w, c), JOB_SEARCH);
    p?.choices.forEach(ch => labels.add(ch.desc.replace('성공하면 ', '')));
    c.isPlayer = false; w.player = null;
  }
  console.log(race, [...labels].join(','));
}
