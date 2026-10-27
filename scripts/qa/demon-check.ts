// 마계 점검: 악마 예순여섯의 행적, 마족의 수와 하는 일
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { yearOf } from '../../src/sim/state';
const argv: string[] = (globalThis as any).process.argv;
for (const seed of (argv[2] ?? 'DM-1').split(',')) {
  const w = createWorld(seed);
  const y0 = yearOf(w);
  let last = -1; const cnt: Record<string, number> = {}; const lines: string[] = [];
  let idleMajin = 0, allMajin = 0, idleDemon = 0, allDemon = 0;
  for (let i = 0; i < 12 * +(argv[3] ?? 300); i++) {
    tick(w);
    if (i % 12 === 0) for (const c of w.chars) {
      if (c.died >= 0) continue;
      // 노는 인물: 집에 머물며 아무 일(여행·군대·상단·주둔지·임무)도 없는 이
      const idle = c.act.kind === 'idle' && !c.archdemon?.task && !c.paragon?.task;
      if (c.race === 'majin') { allMajin++; if (idle) idleMajin++; }
      if (c.archdemon) { allDemon++; if (idle) idleDemon++; }
    }
    for (const n of w.news) {
      if (n.id <= last) continue;
      for (const [k, re] of [['공양', /제물을 바쳤다/], ['마족 돕기', /마족의 편에 서서/], ['마왕 곁', /마왕 .+의 곁에 섰다/], ['악한 신앙', /속삭임이 스며들었다|퍼뜨리기 시작/], ['역병', /우물에 무언가를/], ['타락', /속삭임에 넘어갔다/], ['용사 도움', /용사 .+에게 힘을 빌려/], ['전쟁 개입', /오래 끄는 전쟁에 끼어들어/], ['마족 전쟁', /마족령|마공국|마국|마제국/]] as [string, RegExp][])
        if (re.test(n.text) && (k !== '마족 전쟁' || /전쟁을 선포/.test(n.text))) { cnt[k] = (cnt[k] ?? 0) + 1; if (lines.length < 10 && k !== '공양' && k !== '마족 전쟁') lines.push(`${yearOf(w, n.t) - y0}년 ${n.text.slice(0, 110)}`); }
    }
    last = w.nextNewsId - 1;
  }
  const demons = w.chars.filter(c => c.archdemon);
  const majinPop = w.settlements.filter(s => s.alive && s.race === 'majin').reduce((a, s) => a + s.pop, 0);
  const allPop = w.settlements.filter(s => s.alive).reduce((a, s) => a + s.pop, 0);
  console.log(`== ${seed} 악마 생존 ${demons.filter(c => c.died < 0).length}/${demons.length}, 마족 인구 ${Math.round(majinPop)} (${(majinPop / allPop * 100).toFixed(1)}%), 노는 마족 ${(idleMajin / Math.max(1, allMajin) * 100).toFixed(0)}%, 노는 악마 ${(idleDemon / Math.max(1, allDemon) * 100).toFixed(0)}%`);
  console.log('   ', JSON.stringify(cnt));
  for (const c of demons.filter(c => c.died >= 0)) console.log(`   (쓰러짐) ${c.name} ${c.cause}`);
  for (const l of lines) console.log('   ', l);
}
