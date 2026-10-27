import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, PLAYABLE } from '../src/sim/player';
const w = createWorld('SEASON-1');
for (let i = 0; i < 120; i++) tick(w);
const c = createPlayer(w, { race: 'human', name: '테스트', sex: 'M', origin: 'common' } as any);
let n = 0;
for (let i = 0; i < 12 * 40 && n < 2000; i++) { tick(w); if (w.player?.prompt) w.player.prompt = null; n++; }
const me = w.chars[w.player!.charId];
for (const b of me.bio.slice(-25)) console.log(b.imp, b.text);
