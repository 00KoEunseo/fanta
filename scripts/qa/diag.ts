// 진단: 층·종족별 인물 분포, 노는 인물, 전쟁 기간과 거리, 교역 거리, 천사의 일대기
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { facDist, tradeRoute } from '../../src/sim/factions';
import { yearOf } from '../../src/sim/state';
import { RACES } from '../../src/data/races';
const argv: string[] = (globalThis as any).process.argv;
const seed = argv[2] ?? 'DG-1', years = +(argv[3] ?? 300);
const w = createWorld(seed);
const wars = new Map<string, number>(); const durations: number[] = []; const warDist: number[] = []; let sameAlign = 0, allWars = 0;
const snap = (tag: string) => {
  const alive = w.chars.filter(c => c.died < 0);
  const byL = [0, 0, 0, 0, 0]; for (const c of alive) byL[c.l]++;
  const byR: Record<string, number> = {}; for (const c of alive) byR[c.race] = (byR[c.race] ?? 0) + 1;
  const pop: Record<string, number> = {}; for (const s of w.settlements) if (s.alive) pop[s.race] = (pop[s.race] ?? 0) + Math.round(s.pop);
  console.log(`[${tag}] 인물 ${alive.length} 층별(천상/하늘/지상/지하/마계) ${byL.join('/')}`);
  console.log(`   인물 종족 ${JSON.stringify(byR)}`);
  console.log(`   인구 종족 ${JSON.stringify(pop)}`);
};
snap('0년');
for (let i = 0; i < years * 12; i++) {
  tick(w);
  // 전쟁의 시작과 끝
  for (const a of w.factions) for (const b of w.factions) {
    if (a.id >= b.id) continue;
    const k = `${a.id}-${b.id}`, at = a.alive && b.alive && a.wars[b.id] !== undefined;
    if (at && !wars.has(k)) { wars.set(k, w.t); allWars++; if (RACES[a.race].align === RACES[b.race].align) sameAlign++; const d = facDist(w, a, b); if (isFinite(d)) warDist.push(d); }
    if (!at && wars.has(k)) { durations.push((w.t - wars.get(k)!) / 12); wars.delete(k); }
  }
  if ((i + 1) % (12 * 100) === 0) snap(`${(i + 1) / 12}년`);
}
const hist = (xs: number[], edges: number[]) => edges.map((e, i) => `${i ? edges[i - 1] : 0}~${e}:${xs.filter(x => x >= (i ? edges[i - 1] : 0) && x < e).length}`).join(' ');
console.log('전쟁 기간(년)', hist(durations, [1, 2, 5, 10, 30, 1000]), '평균', (durations.reduce((a, b) => a + b, 0) / Math.max(1, durations.length)).toFixed(1));
console.log('전쟁 상대 거리', hist(warDist, [15, 30, 50, 80, 9999]), '같은 성향끼리', `${sameAlign}/${allWars}`);
const tr: number[] = [];
for (const f of w.factions) if (f.alive) for (const t of f.treaties) { const o = w.factions[t.with]; if (o && o.alive) tr.push(tradeRoute(w, f, o).d); }
console.log('교역로 길이', hist(tr, [20, 40, 60, 80, 9999]));
// 마족·악마·천사의 직업과 하는 일
for (const r of ['majin', 'demon', 'angel']) {
  const xs = w.chars.filter(c => c.died < 0 && c.race === r);
  const roles: Record<string, number> = {}; for (const c of xs) roles[c.role] = (roles[c.role] ?? 0) + 1;
  const acts: Record<string, number> = {}; for (const c of xs) acts[c.act.kind] = (acts[c.act.kind] ?? 0) + 1;
  console.log(`${r} ${xs.length}명 직업 ${JSON.stringify(roles)} 행동 ${JSON.stringify(acts)}`);
}
// 천사의 일대기 (중요한 줄)
const angels = w.chars.filter(c => c.race === 'angel').sort((a, b) => b.bio.length - a.bio.length).slice(0, 3);
for (const a of angels) { console.log(`== 천사 ${a.name} (${a.role})`); for (const b of a.bio.filter(b => (b.imp ?? 2) >= 2).slice(0, 14)) console.log(`   ${yearOf(w, b.t)}년 ${b.text.slice(0, 90)}`); }
console.log('멸망', w.doom.ended);
