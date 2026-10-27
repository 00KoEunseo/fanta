import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
for (const seed of ['BEAST-1', 'BEAST-2']) {
  const w = createWorld(seed);
  const still = new Map<number, { x: number; y: number; n: number }>();
  const modes = new Map<number, string[]>();
  let stuck = 0;
  for (let i = 0; i < 12 * 200; i++) {
    tick(w);
    for (const b of w.sea.beasts) {
      if (!b.alive) continue;
      const m = modes.get(b.id) ?? [];
      if (m[m.length - 1] !== b.mode) m.push(b.mode!);
      modes.set(b.id, m);
      const s = still.get(b.id);
      if (s && s.x === b.x && s.y === b.y) s.n++; else still.set(b.id, { x: b.x, y: b.y, n: 0 });
      const n = still.get(b.id)!.n;
      if (n === 60 && b.mode !== 'ashore' && b.mode !== 'rest' && w.t - (b.since ?? 0) >= 60) { stuck++; const t = w.settlements[b.target]; console.log(seed, '멈춤!', b.name, b.mode, 'route', b.route.length, 'pos', b.x, b.y, 'next', b.route.slice(0, 3).map(k => [k % 160, (k / 160) | 0].join(',')).join(' '), 'tgt', t?.name, t?.alive, t ? Math.hypot(t.x - b.x, t.y - b.y).toFixed(1) : '-'); }
    }
  }
  console.log(seed, '괴수', w.sea.beasts.length, '처치', w.sea.beasts.filter(b => !b.alive).length, '멈춤', stuck);
  for (const b of w.sea.beasts) console.log('  ', b.name, b.alive ? '' : '(죽음)', (modes.get(b.id) ?? []).join('→'));
}
