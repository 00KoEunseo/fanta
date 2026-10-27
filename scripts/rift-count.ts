import { createWorld } from '../src/sim/world';
import { EVENTS } from '../src/sim/events';
for (const s of ['A1', 'B2', 'C3']) {
  const w = createWorld(s);
  const ev = EVENTS.find(e => e.id === 'rift_convergence')!;
  console.log(s, w.portals.filter(p => p.kind === 'rift').map(p => `${p.a.l}-${p.b.l}${p.open ? '열림' : ''}`).join(' '), 'p', ev.p(w, null));
}
