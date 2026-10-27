// 업적: 여러 생애를 무작위 선택으로 살며 해금되는 업적 수 확인
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir, PLAYABLE, birthplaces } from '../src/sim/player';
import { ACHIEVEMENTS, TIER_NAMES, evalAchievements } from '../src/sim/achievements';
const w = createWorld('IRON-CROWN-1234');
const got = new Set<string>();
let lives = 0, n = 0;
const born = () => { const rs = PLAYABLE.filter(r => birthplaces(w, r).length); createPlayer(w, { race: rs[lives % rs.length], sex: 'M', origin: (['noble', 'common', 'orphan'] as const)[lives % 3] }); lives++; };
born();
for (let i = 0; i < 12 * 500 && !w.doom.ended; i++) {
  tick(w);
  const P = w.player!;
  if (P.prompt) { const ch = P.prompt.choices[(n++ * 5 + i) % P.prompt.choices.length]; resolvePlayer(w, ch.id); }
  for (const id of evalAchievements(w, got)) got.add(id);
  if (P.dead && !continueAsHeir(w)) born();
}
for (let t = 0; t < 6; t++) {
  const list = ACHIEVEMENTS.filter(a => a.tier === t);
  console.log(TIER_NAMES[t], `${list.filter(a => got.has(a.id)).length}/${list.length}`, list.filter(a => got.has(a.id)).map(a => a.name).join(', '));
}
console.log('lives', lives);
