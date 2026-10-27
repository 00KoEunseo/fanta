// 특수 탄생(용/수호자)과 그 선택지들이 오류 없이 도는지 확인
const argv2: string | undefined = ((globalThis as any).process?.argv ?? [])[2];
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
import { dateStr } from '../src/sim/state';
const w = createWorld('STAR-GATE-1000');
for (let i = 0; i < 1500; i++) tick(w);
let tries = 0;
while (w.player?.special !== (argv2 ?? 'guardian') && tries < 3000) {
  tries++;
  createPlayer(w, { race: 'human', sex: 'M', origin: 'common' });
  if (w.player?.special !== (argv2 ?? 'guardian')) { const c = w.chars[w.player!.charId]; c.isPlayer = false; w.player = null; }
}
console.log('special after', tries, 'tries:', w.player?.special);
const P = w.player!;
const c = w.chars[P.charId];
for (let i = 0; i < 12 * 120 && !P.dead; i++) {
  tick(w);
  if (w.player!.prompt) {
    const pr = w.player!.prompt;
    const pick = pr.choices[0];
    console.log(dateStr(w), `[${pr.title}]`, pr.text.slice(0, 60), '→', pick.label, '→', resolvePlayer(w, pick.id));
  }
  if (w.doom.ended) break;
}
console.log(c.name, c.race, 'alive', c.died < 0, 'flags', JSON.stringify(w.player!.flags));
