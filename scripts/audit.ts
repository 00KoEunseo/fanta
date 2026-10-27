// 버려진 이벤트 찾기: 세계 이벤트 발동 횟수 + 인생 이벤트 조건 충족 여부
declare const process: any;
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { EVENTS } from '../src/sim/events';
import { makeCtx, type LifeEv } from '../src/sim/life';
import { CHILD, ROMANCE, TRAIT, RACIAL } from '../src/sim/lifeData1';
import { JOBS } from '../src/sim/lifeData2';
import { POWER, GUARDIAN, DRAGON } from '../src/sim/lifeData3';
import { WORKS_EV, RENOWN, ARTFATE, GOVPATH, NEWJOBS, GUARDIAN2 } from '../src/sim/lifeData4';
import { ECON, SLAVE, TOWER } from '../src/sim/lifeData5';
import { SEA, SEA_START } from '../src/sim/lifeData6';
const POOLS: Record<string, LifeEv[]> = { CHILD, ROMANCE, TRAIT, RACIAL, JOBS, POWER, GUARDIAN, DRAGON, WORKS_EV, RENOWN, ARTFATE, GOVPATH, NEWJOBS, GUARDIAN2, ECON, SLAVE, TOWER, SEA, SEA_START };
const ALL = Object.entries(POOLS).flatMap(([k, a]) => a.map(e => [k, e] as const));
const fires = new Map<string, number>(EVENTS.map(e => [e.id, 0]));
for (const e of EVENTS) { const f = e.fire; e.fire = (w: any, x: any) => { fires.set(e.id, (fires.get(e.id) ?? 0) + 1); return f(w, x); }; }
const ok = new Map<string, number>(ALL.map(([, e]) => [e.id, 0]));
const errs = new Map<string, string>();
for (const seed of (process.argv[2] ?? 'AUD-1,AUD-2').split(',')) {
  const w = createWorld(seed);
  for (let y = 0; y < +(process.argv[3] ?? 300); y++) {
    for (let m = 0; m < 12; m++) tick(w);
    if (y % 5) continue;
    const alive = w.chars.filter(c => c.died < 0);
    for (const c of alive) {
      w.player = { charId: c.id, prompt: null, lastEvents: {}, path: '', results: [], dead: false, flags: {}, jobSince: w.t - 120 } as any;
      const x = makeCtx(w, c);
      for (const [, e] of ALL) {
        try { if (e.c(x)) ok.set(e.id, ok.get(e.id)! + 1); } catch (er) { errs.set(e.id, String(er).slice(0, 80)); }
      }
      // 바다 위의 일은 항해 중일 때
      if (c.act.kind === 'voyage') for (const e of SEA) if (e.c(x)) ok.set(e.id, ok.get(e.id)! + 1);
    }
    w.player = null;
  }
}
console.log('── 한 번도 발동하지 않은 세계 이벤트');
console.log([...fires].filter(([, n]) => n === 0).map(([k]) => k).join(', '));
console.log('── 조건이 한 번도 충족되지 않은 인생 이벤트 (플래그 필요한 것 포함)');
for (const [k, e] of ALL) if (!ok.get(e.id)) console.log(` [${k}] ${e.id} ${e.t}`);
for (const [k, v] of errs) console.log(' 오류', k, v);
