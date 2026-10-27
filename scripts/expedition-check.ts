import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
const w = createWorld('XP-1');
for (let i = 0; i < 12 * 20; i++) tick(w);
const c = createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [60, 55, 50, 50, 50, 50, 60, 50, 50, 50] } as any)!;
c.born = w.t - 12 * 25; c.stats.might = 60;
let found = false;
for (let i = 0; i < 12 * 30 && c.died < 0; i++) {
  const before = `L${c.l}(${c.x},${c.y})`;
  tick(w);
  const P = w.player!;
  if (P.prompt) {
    const pr = P.prompt;
    // 모험·탐험 선택지는 '떠난다' 쪽을, 나머지는 첫 번째를 고른다
    const go = pr.choices.find(ch => /탐험을 떠난다|도전한다|길을 떠난다|정면으로|몰래/.test(ch.label)) ?? pr.choices[0];
    const r = resolvePlayer(w, go.id);
    if (/모험의 부름|던전|유적 입구|지도/.test(pr.title) || /길을 나섰다|탐험길/.test(r)) { found = true; console.log(`${i}개월 [${pr.title}] ${go.label} → ${r.slice(0, 80)}`); }
  }
  if (found && c.act.kind === 'travel' && i % 3 === 0) console.log(`   ${i}개월 이동 중 ${before} → L${c.l}(${c.x},${c.y}) 남은 길 ${c.act.path?.length}`);
}
