// 탄생 모드의 밀도: 어린 시절에 몇 번 묻는가, 길 위의 일은 얼마나 다양한가, 반역은 얼마나 자주 뜨고 그 뒤는 어떻게 되는가
// 사용: npx tsx scripts/qa/life-density.ts [생애 수] [시작 번호]
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { createPlayer, resolvePlayer } from '../../src/sim/player';
import { ageOf } from '../../src/sim/state';
import { RACES } from '../../src/data/races';
const argv: string[] = (globalThis as any).process.argv;
const N = +(argv[2] ?? 12), off = +(argv[3] ?? 0);
const RACES_P = ['human', 'elf', 'dwarf', 'orc', 'beast', 'darkelf', 'goblin', 'kobold'];
const ORIGINS = ['common', 'noble', 'orphan', 'common'];
const tot = { mismatch: 0, homeflip: 0, warcall: 0, stationed: 0, sortie: 0, lives: 0, childPrompts: 0, childYears: 0, adultPrompts: 0, adultYears: 0, travelPrompts: 0, coup: 0, prison: 0, exile: 0, fallenAway: 0, captured: 0, deaths: 0 };
const childIds = new Set<string>(), travelIds = new Set<string>();
const allIds = new Map<string, number>();
for (let k = off; k < off + N; k++) {
  const w = createWorld(`LD-${k}`);
  for (let i = 0; i < 12 * 20; i++) tick(w);
  const pc = createPlayer(w, { race: RACES_P[k % RACES_P.length], sex: k % 2 ? 'M' : 'F', origin: ORIGINS[k % ORIGINS.length], traits: [55, 55, 55, 55, 55, 55, 55, 55, 55, 55] } as any);
  if (!pc) continue;
  tot.lives++;
  const adult = RACES[pc.race].adult;
  let n = 0, born = w.t, lastAdultT = w.t;
  for (let i = 0; i < 12 * 300; i++) {
    tick(w);
    const P = w.player!;
    const c = w.chars[P.charId];
    if (P.dead || c.died >= 0) { tot.deaths++; console.log(`  죽음 LD-${k} ${c.race} ${ageOf(w, c)}세: ${c.cause} | 마지막: ${c.bio.slice(-3).map(b => b.text).join(' / ')}`); break; }
    { const h = w.settlements[c.home]; if (h && h.alive && c.faction >= 0 && h.faction !== c.faction && c.act.kind !== 'prison' && c.act.kind !== 'travel') tot.mismatch++; }
    if (c.act.kind === 'camp') tot.stationed++;
    if (P.prompt) {
      const id = P.prompt.eventId;
      if (id === 'ms_homeflip') tot.homeflip++;
      if (id === 'war_call') tot.warcall++;
      allIds.set(id, (allIds.get(id) ?? 0) + 1);
      const age = ageOf(w, c);
      if (age < adult) { tot.childPrompts++; childIds.add(id); } else tot.adultPrompts++;
      if (c.act.kind === 'travel') { tot.travelPrompts++; travelIds.add(id); }
      if (id === 'coup') tot.coup++;
      if (id.startsWith('pr_')) tot.prison++;
      if (id === 'ex_exile') tot.exile++;
      if (id === 'xh_fallen_away') tot.fallenAway++;
      // 반역 선택지는 일부러 '반역'을 골라 그 뒤를 본다
      const ch = id === 'coup' ? P.prompt.choices[0] : P.prompt.choices[(n * 5 + 1) % P.prompt.choices.length]; n++;
      const r = resolvePlayer(w, ch.id);
      if (/노예가 되었다|포로로 갇혔다/.test(r)) tot.captured++;
    }
    const age = ageOf(w, c);
    if (age < adult) born = w.t; else lastAdultT = w.t;
  }
  tot.childYears += Math.min(adult, (born - (w.t - 12 * 300)) / 12) > 0 ? adult : 0;
  tot.adultYears += Math.max(0, (lastAdultT - born) / 12);
}
console.log(JSON.stringify({
  ...tot,
  childPerLife: +(tot.childPrompts / Math.max(1, tot.lives)).toFixed(1),
  adultPerYear: +(tot.adultPrompts / Math.max(1, tot.adultYears)).toFixed(2),
  childKinds: childIds.size, travelKinds: travelIds.size,
}));
console.log('어린 시절:', [...childIds].join(' '));
console.log('길 위:', [...travelIds].join(' '));
console.log('가장 잦은:', [...allIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '));
