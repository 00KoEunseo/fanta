// 탄생 모드에서 '왕', '용사', '마왕'이 되기를 목표로 키울 때 실제로 닿을 확률
// 성향을 목표에 맞추고, 선택지마다 목표에 가까운 말이 든 것을 고른다 (사람이 그렇게 고른다고 가정)
// 사용: npx tsx scripts/qa/goal-odds.ts <목표: king|hero|dl|all> <생애 수> [시작 번호]
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { createPlayer, resolvePlayer } from '../../src/sim/player';
import { ageOf } from '../../src/sim/state';
import { isHero } from '../../src/sim/helpers';
const argv: string[] = (globalThis as any).process.argv;
const goalArg = argv[2] ?? 'all', N = +(argv[3] ?? 8), off = +(argv[4] ?? 0);
// 성향: 용기 야망 탐욕 자비 충성 신앙 호기심 사교성 신중함 명예욕
const PLANS = {
  king: { race: 'human', origin: 'noble', traits: [70, 95, 50, 45, 20, 50, 40, 85, 65, 85], words: ['반역', '왕좌', '반기', '영주', '기사단', '출세', '연회', '혼담', '받아들인다', '나선다', '지원한다', '맡는다', '선포', '군대', '귀족'] },
  hero: { race: 'human', origin: 'orphan', traits: [95, 60, 20, 85, 70, 75, 70, 55, 40, 70], words: ['맞서', '싸운다', '구한다', '뛰어든다', '토벌', '의용군', '지원', '결투', '베어', '최전선', '지킨다', '모험', '떠난다', '들어간다', '도전', '검을 뽑'] },
  dl: { race: 'majin', origin: 'common', traits: [80, 95, 85, 5, 10, 30, 60, 40, 40, 90], words: ['계약', '어둠', '마왕', '피', '받아들인다', '힘을', '배신', '빼앗', '훔친', '금서', '반역', '복수', '죽인', '베어', '강림', '의식을 치른다'] },
} as const;
const goals = goalArg === 'all' ? (['king', 'hero', 'dl'] as const) : [goalArg as keyof typeof PLANS];
for (const g of goals) {
  const plan = PLANS[g];
  let reached = 0, lives = 0; const ages: number[] = []; const notes: string[] = [];
  for (let k = off; k < off + N; k++) {
    const w = createWorld(`GO-${g}-${k}`);
    for (let i = 0; i < 12 * 30; i++) tick(w);
    const c0 = createPlayer(w, { race: plan.race, sex: k % 2 ? 'M' : 'F', origin: plan.origin, traits: [...plan.traits] } as any);
    if (!c0) continue;
    lives++;
    let hit = -1, dlMonths = 0, months = 0; const seen = new Set<string>();
    for (let i = 0; i < 12 * 400 && hit < 0; i++) {
      tick(w);
      const P = w.player!;
      const c = w.chars[P.charId];
      if (P.dead || c.died >= 0) break;
      months++; if (w.demonLord >= 0) dlMonths++;
      if (P.prompt) {
        if (/^(dz_|coup|p_dark|temptation)/.test(P.prompt.eventId)) seen.add(P.prompt.eventId);
        const score = (s: string) => plan.words.reduce((a, wd) => a + (s.includes(wd) ? 1 : 0), 0);
        const best = P.prompt.choices.slice().sort((a, b) => score(b.label + b.desc) - score(a.label + a.desc))[0];
        resolvePlayer(w, best.id);
      }
      const ok = g === 'king' ? w.factions.some(f => f.alive && f.leader === c.id) : g === 'hero' ? isHero(c) : w.demonLord === c.id;
      if (ok) hit = ageOf(w, c);
    }
    const c = w.chars[w.player!.charId];
    if (hit >= 0) { reached++; ages.push(hit); }
    notes.push(`${hit >= 0 ? `✓${hit}세` : `✗(${c.died >= 0 ? `${ageOf(w, c)}세 ${c.cause}` : '생존'})`}${g === 'dl' ? `[씨앗${c.awakened.includes("seed") ? "O" : "X"} 명성${Math.round(c.fame)} 지위${c.rank} 마왕재위${Math.round(dlMonths / Math.max(1, months) * 100)}% ${[...seen].join(',')}]` : ''}`);
  }
  console.log(`${g}: ${reached}/${lives} (${Math.round(reached / Math.max(1, lives) * 100)}%) 평균 ${ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : '-'}세 | ${notes.join(' ')}`);
}
