// 브라우저 없이 시뮬레이션을 돌려 보는 검증용 스크립트
// 사용: npm run headless -- [시드] [개월수]
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { serialize, deserialize } from '../src/sim/save';
import { RACES } from '../src/data/races';
import { dateStr } from '../src/sim/state';
import { TERRAIN } from '../src/data/terrain';

const argv: string[] = (globalThis as any).process?.argv ?? [];
const seed = argv[2] ?? 'ASH-DRAGON-4821';
const months = +(argv[3] ?? 1200);

let t0 = performance.now();
const w = createWorld(seed);
console.log(`world created in ${(performance.now() - t0).toFixed(0)}ms: factions=${w.factions.length} chars=${w.chars.length} settlements=${w.settlements.length}`);

// 지상 지도 미리보기
const L = w.layers[2];
let map = '';
for (let y = 0; y < L.h; y += 2) {
  for (let x = 0; x < L.w; x += 1) {
    const s = w.settlements.find(s => s.l === 2 && s.x === x && (s.y === y || s.y === y + 1));
    map += s ? RACES[s.race].glyph : TERRAIN[L.terrain[y * L.w + x]].glyph;
  }
  map += '\n';
}
if (argv.includes('--map')) console.log(map);

t0 = performance.now();
let worst = 0;
for (let i = 0; i < months; i++) {
  const a = performance.now();
  tick(w);
  worst = Math.max(worst, performance.now() - a);
  if (w.doom.ended) { console.log('WORLD ENDED at', dateStr(w)); break; }
  if (i % 240 === 239) {
    const alive = w.factions.filter(f => f.alive);
    console.log(`[${dateStr(w)}] factions=${alive.length} chars=${w.chars.filter(c => c.died < 0).length} pop=${Math.round(alive.reduce((s, f) => s + f.pop, 0))} armies=${w.armies.filter(a => a.alive).length} news=${w.news.length} seals=${w.doom.seals.filter(Boolean).length}`);
  }
}
const el = performance.now() - t0;
console.log(`${months} months in ${el.toFixed(0)}ms (avg ${(el / months).toFixed(1)}ms, worst ${worst.toFixed(0)}ms)`);

console.log('\n== factions ==');
for (const f of w.factions.filter(f => f.alive).sort((a, b) => b.pop - a.pop)) {
  const ld = w.chars[f.leader];
  console.log(`${f.name.padEnd(16)} ${RACES[f.race].name} tier${f.tier} pop=${Math.round(f.pop)} set=${f.settlements.length} dev=${f.avgDev.toFixed(0)} mil=${Math.round(f.military)} wars=${Object.keys(f.wars).length} leader=${ld?.name}`);
}
console.log('\n== top news ==');
for (const n of w.news.filter(n => n.imp >= 4).slice(-40)) console.log(`${dateStr(w, n.t)} [${n.imp}] ${n.text}`);
console.log('\n== eras ==');
for (const e of w.eras) console.log(e.name || '(진행중)', dateStr(w, e.start));
console.log('\n== prophecy ==');
for (const p of w.prophecy) console.log(`${(p.p * 100).toFixed(1)}% ${p.text}`);

const counts: Record<string, number> = {};
for (const n of w.news) counts[n.cat] = (counts[n.cat] || 0) + 1;
console.log('\nnews by cat', counts);

t0 = performance.now();
const json = serialize(w);
const w2 = deserialize(json);
console.log(`save ${(json.length / 1024).toFixed(0)}KB in ${(performance.now() - t0).toFixed(0)}ms, reload chars=${w2.chars.length}`);
tick(w2);
console.log('reloaded world ticks ok:', dateStr(w2));
