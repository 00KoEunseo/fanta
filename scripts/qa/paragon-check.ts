// 열강: 언제, 몇 명이 서고, 무엇을 하고, 도전자는 오는가
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { yearOf } from '../../src/sim/state';
import { MOTIVE_NAME } from '../../src/sim/paragon';
import { charPower } from '../../src/sim/helpers';
const argv: string[] = (globalThis as any).process.argv;
for (const seed of (argv[2] ?? 'PG-1').split(',')) {
  const w = createWorld(seed);
  const y0 = yearOf(w);
  let last = -1, maxAlive = 0, first = -1; const cnt: Record<string, number> = {}; const lines: string[] = [];
  for (let i = 0; i < 12 * +(argv[3] ?? 250); i++) {
    tick(w);
    const alive = w.chars.filter(c => c.died < 0 && c.paragon).length;
    maxAlive = Math.max(maxAlive, alive);
    for (const n of w.news) {
      if (n.id <= last) continue;
      for (const [k, re] of [['등장', /열강이라 불렀다/], ['수호', /홀로 서서|물리쳤다/], ['정복', /편에 서서|를 덮쳤다|을 덮쳤다/], ['약탈', /금고를 털어/], ['결투', /도전하여 꺾었다|무릎을 꿇었다/], ['설교', /설교에/], ['도전자', /도전하러 길을/], ['창시', /떠도는 길 위에서/]] as [string, RegExp][])
        if (re.test(n.text)) { cnt[k] = (cnt[k] ?? 0) + 1; if (k === '등장' && first < 0) first = yearOf(w, n.t) - y0; if (lines.length < 8) lines.push(`${yearOf(w, n.t) - y0}년 ${n.text.slice(0, 110)}`); }
    }
    last = w.nextNewsId - 1;
  }
  const ever = w.chars.filter(c => c.paragon);
  console.log(`== ${seed} 첫 등장 ${first}년, 누적 ${ever.length}명, 동시 최대 ${maxAlive}`, JSON.stringify(cnt));
  for (const c of ever) console.log(`   ${c.died >= 0 ? '(고인) ' : ''}${c.epithet} ${c.name} ${c.race}/${c.role} ${MOTIVE_NAME[c.paragon!.motive]} 힘 ${Math.round(charPower(c, w))} ${c.died >= 0 ? c.cause : ''}`);
  for (const l of lines) console.log('   ', l);
}
