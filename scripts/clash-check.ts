import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { becomeDemonLord, spawnDragon } from '../src/sim/events';
import { awakenLeviathan } from '../src/sim/sea';
import { RACES } from '../src/data/races';
import { dateStr } from '../src/sim/state';
for (const seed of ['CL-1', 'CL-2']) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 25; i++) tick(w);
  const f = w.factions.filter(f => f.alive && RACES[f.race].align === 'dark' && f.settlements.length).sort((a, b) => b.pop - a.pop)[0];
  becomeDemonLord(w, f);
  const d = spawnDragon(w, true);
  if (d) { d.wrathStart = w.t; d.wrathUntil = w.t + 12 * 30; }
  awakenLeviathan(w);
  const t0 = w.t;
  for (let i = 0; i < 12 * 15; i++) tick(w);
  console.log('──', seed, '마왕', w.demonLord >= 0 ? '생존' : '사망', '고대 용', w.chars.some(c => c.died < 0 && c.ancient) ? '생존' : '사망', '심연', w.sea.leviathan?.active ? '활동' : '물러남', '멸망', w.doom.ended);
  for (const n of w.news.filter(n => n.t >= t0 && /(마왕|고대 용).*(고대 용|심연|촉수|괴수)|심연의 군주.*계약|길들여진|세계수를 향해/.test(n.text)).slice(0, 10)) console.log(' ', dateStr(w, n.t), n.text.slice(0, 120));
}
