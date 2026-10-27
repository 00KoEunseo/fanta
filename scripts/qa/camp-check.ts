// 주둔지: 얼마나 세워지고, 출격·합류·철수·함락이 실제로 일어나는가
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { yearOf } from '../../src/sim/state';
const argv: string[] = (globalThis as any).process.argv;
for (const seed of (argv[2] ?? 'CP-1').split(',')) {
  const w = createWorld(seed);
  const y0 = yearOf(w);
  let last = -1, maxAlive = 0, sum = 0, n = 0, joins = 0, sorties = 0; const cnt: Record<string, number> = {}; const lines: string[] = [];
  for (let i = 0; i < 12 * +(argv[3] ?? 200); i++) {
    tick(w);
    const alive = (w.camps ?? []).filter(c => c.alive);
    maxAlive = Math.max(maxAlive, alive.length); sum += alive.length; n++;
    for (const c of w.chars) if (c.died < 0 && c.log.length && c.log[c.log.length - 1].t === w.t) { const t = c.log[c.log.length - 1].text; if (/을\(를\) 맡았다|을 맡았다|를 맡았다/.test(t)) joins++; if (/주둔지에서 군세/.test(t)) sorties++; }
    for (const nw of w.news) {
      if (nw.id <= last) continue;
      for (const [k, re] of [['세움', /주둔지를 세웠다/], ['거둠', /거두고 병사들을/], ['짓밟힘', /짓밟았다/], ['막아냄', /공격을 막아냈다/], ['탈영', /달아났다\./], ['버려짐', /버려졌다/]] as [string, RegExp][])
        if (re.test(nw.text)) { cnt[k] = (cnt[k] ?? 0) + 1; if (lines.length < 6) lines.push(`${yearOf(w, nw.t) - y0}년 ${nw.text.slice(0, 110)}`); }
    }
    last = w.nextNewsId - 1;
  }
  console.log(`== ${seed} 주둔지 누적 ${(w.camps ?? []).length}, 동시 최대 ${maxAlive}, 평균 ${(sum / n).toFixed(1)}, 지휘관 합류 ${joins}, 지휘 출격 ${sorties}`, JSON.stringify(cnt));
  for (const l of lines) console.log('   ', l);
}
