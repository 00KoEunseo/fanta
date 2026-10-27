import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
for (const [seed, race, traits] of [['OF-1', 'human', [70, 50, 30, 40, 60, 30, 70, 40, 50, 50]], ['OF-2', 'dwarf', [50, 40, 60, 40, 50, 30, 40, 70, 70, 50]], ['OF-3', 'elf', [40, 40, 30, 80, 50, 85, 60, 50, 50, 50]]] as const) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 15; i++) tick(w);
  const c = createPlayer(w, { race, sex: 'F', origin: 'common', traits: [...traits] } as any)!;
  let shown = 0;
  for (let i = 0; i < 12 * 60 && shown < 3; i++) {
    tick(w);
    const P = w.player!;
    if (P.prompt) {
      const pr = P.prompt;
      if (/^jo_/.test(pr.eventId)) { shown++; console.log(seed, race, `${Math.floor((w.t - c.born) / 12)}세`, `[${pr.title}]`, pr.text.slice(0, 90), '\n    →', pr.choices.map(ch => ch.label).join(' / ')); }
      resolvePlayer(w, pr.choices[/^jo_/.test(pr.eventId) ? 1 : 0].id);
    }
    if (P.dead) break;
  }
}
