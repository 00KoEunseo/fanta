// 플레이어 모드 자동 진행 테스트: 선택지를 무작위로 고르며 여러 생애를 산다
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir, PLAYABLE, birthplaces, LIFE_EVENT_COUNT } from '../src/sim/player';
import { dateStr } from '../src/sim/state';
const argv: string[] = (globalThis as any).process?.argv ?? [];
const w = createWorld(argv[2] ?? 'OAK-ROSE-42');
const maxLives = +(argv[3] ?? 12);
for (let i = 0; i < 120; i++) tick(w);
let lives = 0, choices = 0, months = 0;
const seen: Record<string, number> = {};
const jobs = new Set<string>();
function born() {
  const races = PLAYABLE.filter(r => birthplaces(w, r).length);
  createPlayer(w, { race: races[lives % races.length], sex: lives % 2 ? 'F' : 'M', origin: (['noble', 'common', 'orphan'] as const)[lives % 3] });
  lives++;
  const P = w.player!;
  if (P.special) console.log('** special birth:', P.special);
}
born();
for (let i = 0; i < 12 * 600 && lives <= maxLives; i++) {
  tick(w);
  months++;
  const P = w.player!;
  const c = w.chars[P.charId];
  jobs.add(c.role);
  if (P.prompt) {
    seen[P.prompt.eventId] = (seen[P.prompt.eventId] ?? 0) + 1;
    const pick = P.prompt.choices[(i * 7) % P.prompt.choices.length];
    const r = resolvePlayer(w, pick.id);
    choices++;
    if (choices <= 30) console.log(dateStr(w), `${c.name}(${c.role})`, `[${P.prompt?.title ?? ''}${Object.keys(seen).length}]`, pick.label, '→', r);
  }
  if (w.player!.dead) {
    const d = w.chars[w.player!.charId];
    console.log(`-- ${d.name} 사망 ${dateStr(w)} (${d.cause}) 직업 ${d.role} 명성 ${Math.round(d.fame)}`);
    if (lives % 3 === 0 || !continueAsHeir(w)) born();
  }
  if (w.doom.ended) { console.log('world ended'); break; }
}
console.log(`lives ${lives}, choices ${choices}, months ${months}, 1 choice per ${(months / choices).toFixed(1)} months`);
console.log(`distinct events ${Object.keys(seen).length} / ${LIFE_EVENT_COUNT()}`);
console.log('jobs seen', [...jobs].join(','));
