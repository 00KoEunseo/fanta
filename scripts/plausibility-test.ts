// 모든 인생 이벤트를 종족·층별 인물로 만들어 보고, 채워지지 않은 {변수}나 어색한 조합을 찾는다
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, PLAYABLE, birthplaces } from '../src/sim/player';
import { makeCtx, buildPrompt, type LifeEv } from '../src/sim/life';
import { CHILD, ROMANCE, TRAIT, RACIAL } from '../src/sim/lifeData1';
import { JOBS } from '../src/sim/lifeData2';
import { POWER, GUARDIAN, DRAGON } from '../src/sim/lifeData3';
import { WORKS_EV, RENOWN, ARTFATE, GOVPATH, NEWJOBS, GUARDIAN2 } from '../src/sim/lifeData4';
import { RACE_JOBS } from '../src/data/traits';
const ALL: LifeEv[] = [...CHILD, ...ROMANCE, ...TRAIT, ...RACIAL, ...JOBS, ...POWER, ...GUARDIAN, ...DRAGON, ...WORKS_EV, ...RENOWN, ...ARTFATE, ...GOVPATH, ...NEWJOBS, ...GUARDIAN2];
const w = createWorld('ASH-DRAGON-4821');
for (let i = 0; i < 360; i++) tick(w);
let problems = 0, built = 0;
const seen = new Set<string>();
const words: [RegExp, (l: number) => boolean, string][] = [
  [/햇볕|무지개|들판|헛간|비가 오지|천둥/, l => l === 3 || l === 4 || l === 0, '지하·마계·천상에 맞지 않는 날씨/풍경'],
  [/항구|부두|배를 타/, l => l !== 2, '바다 없는 곳의 항구'],
];
for (const race of PLAYABLE) {
  if (!birthplaces(w, race).length) continue;
  for (let k = 0; k < 6; k++) {
    const c = createPlayer(w, { race, sex: k % 2 ? 'F' : 'M', origin: (['noble', 'common', 'orphan'] as const)[k % 3] })!;
    if (!c) continue;
    const jobs = RACE_JOBS[race];
    c.born = w.t - Math.round((k < 2 ? 0.6 : 1.5 + k) * Math.max(10, 20)) * 12;
    if (k >= 2) { c.role = jobs[k % jobs.length]; w.player!.jobSince = w.t - 120; }
    c.stats.might = c.stats.intellect = c.stats.magic = c.stats.charisma = 70;
    for (const ev of ALL) {
      const x = makeCtx(w, c);
      if (!ev.c(x)) continue;
      const p = buildPrompt(x, ev);
      if (!p) continue;
      built++;
      seen.add(ev.id);
      const all = [p.text, ...p.choices.map(ch => ch.label + ' ' + ch.desc)].join(' | ');
      if (/\{\w+\}|\?\w/.test(all)) { problems++; console.log('미치환', race, ev.id, all.slice(0, 120)); }
      for (const [re, bad, why] of words) if (re.test(all) && bad(x.home?.l ?? c.l)) { problems++; console.log(why, race, 'L' + (x.home?.l ?? c.l), ev.id, all.slice(0, 80)); }
    }
    c.isPlayer = false; w.player = null;
  }
}
console.log(`built ${built} prompts, ${seen.size}/${ALL.length} events reachable in sample, problems ${problems}`);
