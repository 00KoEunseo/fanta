import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('TERR-1');
const owned = () => w.layers.reduce((a, L) => a + L.owner.reduce((n, o) => n + (o >= 0 ? 1 : 0), 0), 0);
console.log('시작 영토', owned());
for (let y = 1; y <= 100; y++) {
  for (let m = 0; m < 12; m++) tick(w);
  if ([5, 20, 50, 100].includes(y)) {
    const bands = w.armies.filter(a => a.alive && a.goal === 'clear');
    console.log(`${y}년 영토 ${owned()}칸 · 개간대 ${bands.length} (일하는 중 ${bands.filter(a => !a.path.length).length}, 이동 중 ${bands.filter(a => a.path.length).length}, 이끄는 인물 있음 ${bands.filter(a => a.commander >= 0).length}) · 고을 ${w.settlements.filter(s => s.alive).length}`);
  }
}
const ex = w.chars.find(c => c.log.some(l => /개간지로|일구러|밭을 일구|바위를 깨|숲을 베/.test(l.text)));
if (ex) console.log(ex.name, ex.role, ex.log.filter(l => /개간|일구|밭을 일구|숲을 베|바위를 깨|돌아갔다/.test(l.text)).slice(-6).map(l => l.text).join(' / '));
