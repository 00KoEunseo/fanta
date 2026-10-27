import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
const evs: Record<string, number> = {};
for (const [i, seed] of ['MA-1', 'MA-2', 'MA-3', 'MA-4', 'MA-5', 'MA-6', 'MA-7', 'MA-8'].entries()) {
  const w = createWorld(seed);
  for (let k = 0; k < 12 * 15; k++) tick(w);
  const c = createPlayer(w, { race: 'human', sex: i % 2 ? 'F' : 'M', origin: i % 2 ? 'common' : 'noble', traits: [55, 60, 50, 50, 50, 50, 50, 60, 50, 50] } as any)!;
  let married = -1;
  for (let k = 0; k < 12 * 70 && c.died < 0; k++) {
    tick(w);
    const P = w.player!;
    if (c.spouse >= 0 && married < 0) married = Math.floor((w.t - c.born) / 12);
    if (P.prompt) {
      const pr = P.prompt;
      if (/혼|청혼|인연|결혼|짝|사랑|후계|후사|후궁|국혼/.test(pr.title)) evs[pr.title] = (evs[pr.title] ?? 0) + 1;
      // 혼인·청혼 선택지는 받아들이고, 나머지는 첫 번째
      const yes = pr.choices.find(ch => /청혼|혼인한다|받아들인다|맞이한다|곁에 들인다|양자/.test(ch.label));
      resolvePlayer(w, (yes ?? pr.choices[0]).id);
    }
    if (P.dead) break;
  }
  const kids = c.children.length;
  console.log(seed, c.sex, `${Math.floor(((c.died >= 0 ? c.died : w.t) - c.born) / 12)}세`, '첫 혼인', married >= 0 ? `${married}세` : '없음', '자녀', kids, '배우자', c.spouse >= 0 ? '있음' : '없음', '군주', w.factions[c.faction]?.leader === c.id, '영주', w.settlements.some(s => s.governor === c.id));
}
console.log(JSON.stringify(evs));
