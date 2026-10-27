// 직업·명품·이스터에그 점검
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { RACE_JOBS } from '../src/data/traits';
import { dateStr } from '../src/sim/state';
const w = createWorld('ASH-DRAGON-4821');
for (let i = 0; i < 1200; i++) tick(w);
let bad = 0;
for (const c of w.chars) {
  if (c.race === 'dragon' || c.role === '평민' || c.role === '백수') continue;
  if (!(RACE_JOBS[c.race] ?? []).includes(c.role)) bad++;
}
console.log('NPC 종족-직업 불일치:', bad, '/', w.chars.length);
console.log('명품', w.artifacts.length);
for (const a of w.artifacts.slice(0, 8)) console.log(` ${a.makerName}의 ${a.kind} 「${a.name}」 holder=${w.chars[a.holder]?.name ?? '-'} story=${a.story.map(s => s.text).join(' / ')}`);
for (const n of w.news) if (/고래|술 시합|버섯|샘가|맞붙었다|노래를 불렀다/.test(n.text)) console.log(dateStr(w, n.t), n.text);
