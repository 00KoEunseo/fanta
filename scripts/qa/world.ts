// 관전 검증: 한 세계를 N년 돌리고 지표를 JSON으로 낸다
// 사용: tsx scripts/qa/world.ts <시드> <년수>
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { serialize, deserialize } from '../../src/sim/save';
import { yearOf } from '../../src/sim/state';
import type { NewsItem } from '../../src/sim/state';
import { templater, countIssues, textIssues } from './common';
const argv: string[] = (globalThis as any).process.argv;
const seed = argv[2] ?? 'QA-1', years = +(argv[3] ?? 300);

// 결정성: 같은 시드를 10년 두 번 돌려 같은지
const fp = (s: string) => { const w = createWorld(s); for (let i = 0; i < 120; i++) tick(w); return `${w.chars.length}/${w.news.length}/${w.factions.map(f => Math.round(f.pop)).join(',')}`; };
const deterministic = fp(seed) === fp(seed);

const w = createWorld(seed);
const all: NewsItem[] = [];
let lastId = -1, worst = 0, doomAt = -1, carSum = 0, carN = 0;
const firsts: Record<string, number> = {};
const t0 = performance.now();
for (let i = 0; i < years * 12; i++) {
  const a = performance.now();
  tick(w);
  worst = Math.max(worst, performance.now() - a);
  for (let k = w.news.length - 1; k >= 0 && w.news[k].id > lastId; k--) {
    const n = w.news[k]; all.push(n);
    for (const [key, re] of [['contact', /처음으로 조우/], ['trade', /교역 협정을 맺었다/], ['war', /전쟁을 선포/]] as [string, RegExp][]) if (re.test(n.text)) firsts[key] = Math.min(firsts[key] ?? 1e9, Math.floor(n.t / 12));
  }
  if (i % 12 === 11) { carSum += (w.caravans ?? []).filter(k => k.alive).length; carN++; }
  lastId = w.nextNewsId - 1;
  if (w.doom.ended) { doomAt = yearOf(w); break; }
}
const ms = (performance.now() - t0) / Math.max(1, all.length ? w.t : 1);
all.sort((a, b) => a.id - b.id);
const tpl = templater(w);
const span = Math.max(1, (w.t - all[0]?.t || 1) / 12);

// 소식 분포와 반복
const byCat: Record<string, number> = {};
for (const n of all) byCat[n.cat] = (byCat[n.cat] ?? 0) + 1;
const tcount = new Map<string, number>();
for (const n of all) { const k = tpl(n.text); tcount.set(k, (tcount.get(k) ?? 0) + 1); }
const top = [...tcount].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [v, k.slice(0, 70)]);
// 상위 소식(imp>=4)에서 같은 틀이 몇 번 되풀이되나
const hi = all.filter(n => n.imp >= 4);
const hiCount = new Map<string, number>();
for (const n of hi) { const k = tpl(n.text); hiCount.set(k, (hiCount.get(k) ?? 0) + 1); }
const hiTop = [...hiCount].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [v, k.slice(0, 70)]);
const imp5 = all.filter(n => n.imp >= 5);
const imp5Count = new Map<string, number>();
for (const n of imp5) { const k = tpl(n.text); imp5Count.set(k, (imp5Count.get(k) ?? 0) + 1); }
const imp5Repeats = [...imp5Count].filter(([k, v]) => v > 1 && !/봉인 붕괴|봉인 회복/.test(k)).map(([k, v]) => [v, k.slice(0, 70)]);

const PAT: [string, RegExp][] = [
  ['용의 도시 방화', /불태웠다\./], ['단명 노환(40세 미만)', /(^|[^0-9])[1-3]?\d세의 나이에 노환/], ['오랜 원한', /오랜 원한이 다시 불붙었다/],
  ['모욕을 잊지 않음', /모욕을 결코 잊지 않았다/], ['천군 강림', /천군이 하늘의 계단을 내려왔다/], ['세계수로 진군', /세계수를 향해 방향을 틀었다/],
  ['천상 진군', /천상으로 진군하였다/], ['용의 포효', /하늘을 향해 포효/],
];
const patterns: Record<string, number> = {};
for (const [k, re] of PAT) patterns[k] = +(all.filter(n => re.test(n.text)).length / span * 100).toFixed(1);

const eras = w.eras.filter(e => e.name).map(e => e.name);
const deaths = w.chars.filter(c => c.died >= 0);
const roles: Record<string, number> = {};
const living = w.chars.filter(c => c.died < 0);
for (const c of living) roles[c.role] = (roles[c.role] ?? 0) + 1;
const roleShares = Object.entries(roles).filter(([r]) => r !== '평민').map(([r, v]) => [r, v / living.length] as const).sort((a, b) => b[1] - a[1]);
const held = new Map<number, number>();
for (const a of w.artifacts) if (a.holder >= 0 && a.tangible) held.set(a.holder, (held.get(a.holder) ?? 0) + 1);
const texts = [...all.map(n => n.text), ...w.chars.flatMap(c => c.bio.map(b => b.text))];

let saveOk = false, saveKB = 0, saveGzKB = 0;
const zlibName = 'node:zlib';
const zlib: any = await import(zlibName);
try { const js = serialize(w); saveKB = Math.round(js.length / 1024); saveGzKB = Math.round(zlib.gzipSync(js).length * 4 / 3 / 1024); const w2 = deserialize(js); tick(w2); saveOk = w2.chars.length >= w.chars.length; } catch { saveOk = false; }

console.log(JSON.stringify({
  seed, years: +(span).toFixed(0), deterministic, saveOk, saveKB, saveGzKB, doomAt,
  perf: { msPerTick: +((performance.now() - t0) / (w.t || 1)).toFixed(1), worst: Math.round(worst) },
  news: { total: all.length, perYear: +(all.length / span).toFixed(1), stored: w.news.length, oldestStoredYear: w.news[0] ? Math.floor(w.news[0].t / 12) : 0, firstYear: all[0] ? Math.floor(all[0].t / 12) : 0,
    catShare: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, +(v / all.length).toFixed(3)])),
    imp4PerYear: +(hi.length / span).toFixed(2), imp5: imp5.length, imp5Repeats, top, hiTop },
  patternsPer100y: patterns,
  eras: { count: eras.length, unique: new Set(eras).size, names: eras },
  early: { firstContact: firsts.contact ?? -1, firstTrade: firsts.trade ?? -1, firstWar: firsts.war ?? -1, caravansAvg: +(carSum / Math.max(1, carN)).toFixed(1) },
  world: { factionsEver: w.factions.length, factionsAlive: w.factions.filter(f => f.alive).length, charsAlive: living.length,
    pop: Math.round(w.factions.filter(f => f.alive).reduce((a, f) => a + f.pop, 0)), deaths: deaths.length,
    sites: (w.sites ?? []).length, sitesDepleted: (w.sites ?? []).filter(s => s.loot <= 0).length,
    topRole: roleShares[0] ? [roleShares[0][0], +roleShares[0][1].toFixed(3)] : null, rareRoles: roleShares.filter(r => r[1] < 0.01).map(r => r[0]),
    maxArtifactsHeld: Math.max(0, ...held.values()), sealsBroken: all.filter(n => /【봉인 붕괴】/.test(n.text)).length },
  text: { counts: countIssues(texts), samples: textIssues(texts, 3) },
}));
