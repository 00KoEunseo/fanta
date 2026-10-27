// 종교: 언제 생기고, 얼마나 퍼지고, 순례·성직·전쟁 명분이 실제로 일어나는가
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { yearOf } from '../../src/sim/state';
import { TENET_NAME } from '../../src/sim/religion';
const argv: string[] = (globalThis as any).process.argv;
for (const seed of (argv[2] ?? 'RL-1').split(',')) {
  const w = createWorld(seed);
  const y0 = yearOf(w);
  let last = -1; const lines: string[] = []; const cnt: Record<string, number> = {};
  for (let i = 0; i < 12 * +(argv[3] ?? 200); i++) {
    tick(w);
    for (const n of w.news) {
      if (n.id <= last) continue;
      for (const [k, re] of [['창시', /을\(를\)? 열었다|가르침.*열었다|땅에 내려왔다|을 열었다|를 열었다/], ['신전 복구', /다시 세워|다시 세웠다/], ['국교', /국교로 삼았다/], ['대신관', /대신관이 되었다/], ['성전 명분', /이교도|성전이 선포/], ['잊힘', /이름은 잊혔다/], ['대신전', /대신전을 세웠다/]] as [string, RegExp][])
        if (re.test(n.text)) { cnt[k] = (cnt[k] ?? 0) + 1; if (lines.length < 10 && k !== '대신관') lines.push(`${yearOf(w, n.t) - y0}년 ${n.text.slice(0, 120)}`); }
    }
    last = w.nextNewsId - 1;
  }
  const pilgrims = w.chars.filter(c => c.bio.some(b => /순례를 떠났다/.test(b.text))).length;
  console.log(`== ${seed}`, JSON.stringify(cnt), '순례한 인물', pilgrims);
  for (const r of w.religions ?? []) {
    const sets = w.settlements.filter(s => s.alive && s.faith === r.id);
    console.log(`  ${r.alive ? '' : '(잊힘) '}${r.name} — 창시 ${r.founderName}, 교리 ${r.tenets.map(t => TENET_NAME[t]).join('·')}, 고을 ${sets.length}, 국교 ${w.factions.filter(f => f.alive && f.faith === r.id).length}, 대신관 ${w.chars[r.head]?.name ?? '없음'}, 종족 ${[...new Set(sets.map(s => s.race))].join('/')}`);
  }
  for (const l of lines) console.log('   ', l);
}
