// 탄생 모드 검증: 한 생애를 끝까지 살고 지표를 JSON으로 낸다
// 사용: tsx scripts/qa/life.ts <시드> <종족> <출신> <성별>
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { createPlayer, resolvePlayer } from '../../src/sim/player';
import { ageOf, dateStr } from '../../src/sim/state';
import { RACES } from '../../src/data/races';
import { templater, countIssues, textIssues } from './common';
const argv: string[] = (globalThis as any).process.argv;
const [seed = 'QL-1', race = 'human', origin = 'common', sex = 'F'] = argv.slice(2);

const w = createWorld(seed);
for (let i = 0; i < 12 * 20; i++) tick(w);
const pc = createPlayer(w, { race, sex, origin, traits: [55, 55, 55, 55, 55, 55, 55, 55, 55, 55] } as any);
if (!pc) { console.log(JSON.stringify({ seed, race, origin, skipped: true })); (globalThis as any).process.exit(0); }
const adultAge = RACES[pc.race].adult;
type P = { t: number; age: number; id: string; text: string; pick: string; result?: string };
const prompts: P[] = [];
const spouseDeaths: { t: number; name: string }[] = [];
let sp = pc.spouse, n = 0;
for (let i = 0; i < 12 * 400; i++) {
  tick(w);
  const P = w.player!;
  const c = w.chars[P.charId];
  if (c.spouse !== sp) { const o = w.chars[sp]; if (o && o.died >= 0) spouseDeaths.push({ t: w.t, name: o.name }); sp = c.spouse; }
  if (P.dead || c.died >= 0) break;
  if (P.prompt) {
    const ch = P.prompt.choices[(n * 5 + 1) % P.prompt.choices.length]; n++;
    const rec: P = { t: w.t, age: ageOf(w, c), id: P.prompt.eventId, text: P.prompt.text, pick: ch.label };
    resolvePlayer(w, ch.id);
    rec.result = c.bio[c.bio.length - 1]?.text;
    prompts.push(rec);
  }
}
const c = w.chars[w.player!.charId];
const years = Math.max(1, ageOf(w, c));
const tpl = templater(w);
const TRAVELY = /^(xt_|xp_site_gate|adventure)/;
const ids: Record<string, number> = {};
for (const p of prompts) ids[p.id] = (ids[p.id] ?? 0) + 1;
const same = new Map<string, number>();
for (const p of prompts) { const k = tpl(p.text); same.set(k, (same.get(k) ?? 0) + 1); }
const maxSame = [...same].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
const bio = c.bio;
// 같은 달에 같은 금화 수가 두 줄로 남은 경우
let dupBio = 0;
for (let i = 1; i < bio.length; i++) { const a = bio[i - 1], b = bio[i]; const g1 = a.text.match(/금화 \d+닢/)?.[0]; if (a.t === b.t && g1 && b.text.includes(g1)) dupBio++; }
const widowLogged = spouseDeaths.filter(d => bio.some(b => b.t >= d.t - 1 && b.t <= d.t + 13 && b.text.includes(d.name))).length;
const plagueDouble = prompts.filter((p, i) => /plague/.test(p.id) && prompts.slice(0, i).some(q => /plague/.test(q.id) && q.id !== p.id && p.t - q.t <= 3)).length;
const role = c.role;
const out = {
  seed, race, origin, sex, name: c.name, role, ageAtEnd: ageOf(w, c), cause: c.died >= 0 ? c.cause : 'alive',
  prompts: prompts.length, perYear: +(prompts.length / years).toFixed(2), distinct: Object.keys(ids).length,
  travelShare: +(prompts.filter(p => TRAVELY.test(p.id)).length / Math.max(1, prompts.length)).toFixed(2),
  maxSameText: [maxSame[1], maxSame[0].slice(0, 60)],
  topEvents: Object.entries(ids).sort((a, b) => b[1] - a[1]).slice(0, 6),
  spouseDeaths: spouseDeaths.length, widowLogged, widowPrompts: ids.ms_widowed ?? 0,
  minorTravel: prompts.filter(p => p.age < adultAge && TRAVELY.test(p.id)).length,
  impossibleOpt: prompts.filter(p => /떠나지 못하였다/.test(p.result ?? '')).length,
  rankSameAsJob: prompts.filter(p => /^cr_rank/.test(p.id) && p.text.includes(`'${role}'`)).length,
  plagueDouble, dupBio,
  firstWordAge: prompts.find(p => p.id === 'c_firstword')?.age ?? null,
  firstPromptAge: prompts[0]?.age ?? null,
  kids: c.children.length, married: c.spouse >= 0 || spouseDeaths.length > 0,
  text: { counts: countIssues([...prompts.flatMap(p => [p.text, p.result ?? '']), ...bio.map(b => b.text)]), samples: textIssues([...prompts.map(p => p.text), ...bio.map(b => b.text)], 2) },
  lastLines: bio.slice(-4).map(b => `${dateStr(w, b.t)} ${b.text.slice(0, 80)}`),
};
console.log(JSON.stringify(out));
