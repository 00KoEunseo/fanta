declare const process: any;
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { awakenLeviathan } from '../src/sim/sea';
const seed = process.argv[2] ?? 'SEA-1';
const years = +(process.argv[3] ?? 200);
const force = process.argv[4] === 'lev';
const w = createWorld(seed);
const t0 = Date.now();
const popAt: string[] = [];
let levMonths = 0;
for (let i = 0; i < years * 12 && !w.doom.ended; i++) {
  if (force && i === 12 * 30) console.log('강제 각성', awakenLeviathan(w));
  tick(w);
  if (w.sea.leviathan?.active) levMonths++;
  if (i % 600 === 0) popAt.push(`${i / 12}y:${Math.round(w.settlements.filter(s => s.alive).reduce((a, s) => a + s.pop, 0))}`);
}
const S = w.sea;
const grep = (re: RegExp) => w.news.filter(n => re.test(n.text));
console.log(`${years}년, ${(Date.now() - t0) / 1000}s, 멸망 ${w.doom.ended}`);
console.log('인구', popAt.join(' '));
console.log(`해저유적 ${S.sites.length} (발견 ${S.sites.filter(s => s.found).length}), 항해 ${S.voyages.length} (진행 ${S.voyages.filter(v => !v.done).length}), 유랑선단 ${S.fleets.length}, 괴수 ${S.beasts.length} (생존 ${S.beasts.filter(b => b.alive).length}), 심연 ${S.leviathans} (활동 ${levMonths}개월)`);
console.log(`대역병 ${w.diseases.filter(d => d.great).map(d => `${d.name} ${Math.round(((d.ended >= 0 ? d.ended : w.t) - d.t) / 12)}년 사망${Math.round(d.toll ?? 0)} 최대${d.peak}`).join(', ')} / 작은병 ${w.diseases.filter(d => !d.great).length}`);
for (const re of [/교역 협정이 흐지부지/, /뱃길을 열어/, /교역 협정을 맺었다/, /차원의 합/, /연맹을 청하였다/, /쓰러뜨렸다/, /뭍에 올라|닻을 내리고/, /가라앉았다/, /촉수 하나를 베어/, /심연으로 가라앉았다/, /차원문 .*개가 굉음/]) console.log(re.source, grep(re).length);
for (const n of grep(/연맹을 청하였다|심연 토벌 연맹|심연으로 가라앉았다|차원의 합|대역병 '|사라졌다. 살아남은/).slice(0, 12)) console.log(' -', n.text.slice(0, 160));
console.log('봉인', w.doom.seals.map(b => (b ? 1 : 0)).join(''), 'maxBroken', w.stats.maxBroken);
