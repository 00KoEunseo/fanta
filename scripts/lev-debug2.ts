import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { awakenLeviathan } from '../src/sim/sea';
for (const seed of ['SEA-1', 'SEA-2', 'SEA-3']) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 30; i++) tick(w);
  const pop0 = w.settlements.filter(s => s.alive && s.l === 2).reduce((a, s) => a + s.pop, 0);
  awakenLeviathan(w);
  let m = 0;
  for (; m < 12 * 80 && w.sea.leviathan?.active; m++) tick(w);
  const pop1 = w.settlements.filter(s => s.alive && s.l === 2).reduce((a, s) => a + s.pop, 0);
  const V = w.sea.leviathan!;
  console.log(seed, '활동', (m / 12).toFixed(1), '년, 촉수', V.tentacles.filter(t => !t.alive).length, '/', V.tentacles.length, '지상 인구', Math.round(pop0), '→', Math.round(pop1), '멸망', w.doom.ended);
}
