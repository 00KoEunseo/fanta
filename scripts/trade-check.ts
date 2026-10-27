import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { findPath } from '../src/sim/path';
import { RACES } from '../src/data/races';
import { seaRoute } from '../src/sim/sea';
for (const seed of ['ASH-DRAGON-4821', 'TR-2']) {
  const w = createWorld(seed);
  for (let i = 0; i < 1200; i++) tick(w);
  let total = 0, bad = 0, sea = 0;
  for (const f of w.factions.filter(f => f.alive)) for (const t of f.treaties) {
    if (t.with < f.id) continue;
    total++;
    const a = w.settlements[f.capital], b = w.settlements[w.factions[t.with].capital];
    const p = findPath(w, a, b, { race: f.race, flying: RACES[f.race].flying }, 60000);
    const s = seaRoute(w, a, b);
    if (!p && !isFinite(s)) { bad++; console.log('도달 불가:', f.name, '↔', w.factions[t.with].name); }
    else if ((p?.length ?? Infinity) > 140 && s > 140) console.log('너무 먼 교역:', f.name, p?.length, s);
    if (!p && isFinite(s)) sea++;
  }
  console.log(seed, `교역 ${total}건, 길 없음 ${bad}건, 뱃길로만 닿는 교역 ${sea}건, 끊긴 교역 소식 ${w.news.filter(n => /흐지부지/.test(n.text)).length}`);
}
