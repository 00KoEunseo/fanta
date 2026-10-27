import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('BEAST-1');
const still = new Map<number, number>();
const last = new Map<number, string>();
outer: for (let i = 0; i < 12 * 200; i++) {
  tick(w);
  for (const b of w.sea.beasts) {
    if (!b.alive) continue;
    const key = `${b.x},${b.y}`;
    still.set(b.id, last.get(b.id) === key ? (still.get(b.id) ?? 0) + 1 : 0);
    last.set(b.id, key);
    if ((still.get(b.id) ?? 0) === 30 && b.mode === 'approach') {
      for (let k = 0; k < 4; k++) { const r0 = b.route.length; tick(w); console.log('t', w.t, 'id', b.id, 'parity', w.t % 2, b.id % 2, 'route', r0, '→', b.route.length, 'pos', b.x, b.y, 'mode', b.mode, 'hp', Math.round(b.hp)); }
      break outer;
    }
  }
}
