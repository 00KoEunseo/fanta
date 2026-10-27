import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { becomeDemonLord, spawnDragon } from '../src/sim/events';
import { dateStr } from '../src/sim/state';
const w = createWorld('IRON-CROWN-1234');
for (let i = 0; i < 360; i++) tick(w);
// 시험: 마왕과 고대 용을 강제로 등장시킨다
const dark = w.factions.find(f => f.alive && (f.race === 'majin' || f.race === 'demon'))!;
becomeDemonLord(w, dark);
spawnDragon(w, true);
const n0 = w.nextNewsId;
for (let i = 0; i < 12 * 60 && !w.doom.ended; i++) tick(w);
const news = w.news.filter(n => n.id >= n0);
const count = (re: RegExp) => news.filter(n => re.test(n.text)).length;
console.log('60년 동안: 단독 도전', count(/에게 도전하였다|홀로 .*맞섰다/), '/ 토벌대 결성', count(/토벌대를 꾸렸다/), '/ 연맹', count(/연맹을\(를\) 맺었다|연맹을 맺었다/), '/ 배신', count(/배신하고/), '/ 마왕군 합류', count(/깃발 아래 무릎/), '/ 간부', count(/간부 '.*'의 자리에/));
for (const n of news.filter(n => /토벌대|연맹|간부|배신하고|무릎|마왕이|마왕을|쓰러뜨렸다/.test(n.text)).slice(0, 22)) console.log(' ', dateStr(w, n.t), n.text.slice(0, 110));
