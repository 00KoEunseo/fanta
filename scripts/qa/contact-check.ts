// 초반 흐름: 첫 조우·첫 교역·첫 전쟁이 언제 일어나는가
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { yearOf } from '../../src/sim/state';
const argv: string[] = (globalThis as any).process.argv;
const out: Record<string, unknown>[] = [];
for (const seed of (argv[2] ?? 'CT-1,CT-2,CT-3').split(',')) {
  const w = createWorld(seed);
  const y0 = yearOf(w);
  let firstTrade = -1, firstWar = -1, firstContact = -1, contacts = 0, meet = 0, last = -1;
  const sample: string[] = [];
  for (let i = 0; i < 12 * 100; i++) {
    tick(w);
    for (const n of w.news) {
      if (n.id <= last) continue;
      const y = yearOf(w, n.t) - y0;
      if (/교역 협정을 맺었다/.test(n.text) && firstTrade < 0) firstTrade = y;
      if (/전쟁을 선포/.test(n.text) && firstWar < 0) firstWar = y;
      if (/처음으로 조우/.test(n.text)) { contacts++; if (firstContact < 0) firstContact = y; if (sample.length < 4) sample.push(`${y}년: ${n.text}`); }
      if (/낯선 .+들과 마주쳤다/.test(n.text)) { meet++; if (sample.length < 6) sample.push(`${y}년: ${n.text}`); }
    }
    last = w.nextNewsId - 1;
  }
  const alive = w.factions.filter(f => f.alive);
  const knownPairs = alive.reduce((a, f) => a + (f.known ? alive.filter(o => o !== f && f.known![o.id] !== undefined).length : alive.length - 1), 0);
  out.push({ seed, firstContact, firstTrade, firstWar, contacts, meetings: meet, knownShare: +(knownPairs / Math.max(1, alive.length * (alive.length - 1))).toFixed(2), sample });
}
console.log(JSON.stringify(out, null, 1));
