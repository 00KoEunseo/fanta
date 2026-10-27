// 내 나라가 함락·멸망할 때 선택지가 뜨는지
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
import { captureSettlement } from '../src/sim/military';
import { fallFaction } from '../src/sim/factions';
const w = createWorld('FALL-1');
for (let i = 0; i < 12 * 20; i++) tick(w);
const c = createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [60, 55, 50, 50, 50, 50, 60, 50, 50, 50] } as any)!;
c.born = w.t - 12 * 25;
for (let i = 0; i < 3; i++) { tick(w); if (w.player!.prompt) resolvePlayer(w, w.player!.prompt.choices[0].id); }
const home = w.settlements[c.home];
const mine = w.factions[c.faction];
const enemy = w.factions.find(f => f.alive && f.id !== mine.id && f.settlements.length)!;
console.log('내 나라', mine.name, '고향', home.name, '→ 함락시킬 나라', enemy.name);
captureSettlement(w, home, enemy);
for (const id of [...mine.settlements]) captureSettlement(w, w.settlements[id], enemy);
fallFaction(w, mine);
console.log('함락 직후 내 소속', w.factions[c.faction]?.name ?? '없음');
for (let i = 0; i < 6; i++) {
  tick(w);
  const P = w.player!;
  if (P.prompt) { console.log(`+${i + 1}개월 선택지: [${P.prompt.title}] ${P.prompt.text.slice(0, 70)}`); console.log('   선택:', P.prompt.choices.map(ch => ch.label).join(' / ')); console.log('   →', resolvePlayer(w, P.prompt.choices[P.prompt.choices.length > 1 ? 1 : 0].id).slice(0, 80)); }
}
console.log('최종 소속', w.factions[c.faction]?.name ?? '없음', '고향', w.settlements[c.home]?.name);
