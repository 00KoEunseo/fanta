// 탄생 모드: 원정 이벤트가 실제로 뜨는지 (선택은 첫 번째 = 대개 '참여')
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir } from '../src/sim/player';
const counts: Record<string, number> = {};
const samples: string[] = [];
for (const seed of ['XP-1', 'XP-2', 'XP-3']) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 20; i++) tick(w);
  createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [] } as any);
  for (let i = 0; i < 12 * 150; i++) {
    tick(w);
    const P = w.player!;
    if (P.dead) { if (!continueAsHeir(w)) break; continue; }
    if (P.prompt) {
      const id = P.prompt.eventId, title = P.prompt.title;
      const ch = P.prompt.choices[0];
      const r = resolvePlayer(w, ch.id);
      if (/^x[pat]_/.test(id)) { counts[title] = (counts[title] ?? 0) + 1; if (samples.length < 14) samples.push(`[${title}] ${ch.label} → ${r.slice(0, 90)}`); }
    }
  }
  const c = w.chars[w.player!.charId];
  console.log(seed, '일대기 마지막:', c.bio.slice(-3).map(b => b.text.slice(0, 50)).join(' / '));
}
console.log(JSON.stringify(counts));
for (const s of samples) console.log(s);
