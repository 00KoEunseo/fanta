import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { birthplaces, createPlayer } from '../src/sim/player';
const w = createWorld('BIRTH-1');
for (let i = 0; i < 24; i++) tick(w);
const facs = [...new Set(birthplaces(w, 'human').map(s => s.faction))];
console.log('인간이 사는 나라', facs.map(id => w.factions[id].name).join(', '));
for (const fid of facs) for (const origin of ['common', 'noble'] as const) {
  w.player = null;
  const c = createPlayer(w, { race: 'human', sex: 'F', origin, faction: fid });
  console.log(w.factions[fid].name, origin, '→', c ? `${w.settlements[c.home].name} (${w.factions[c.faction].name})` : '실패');
}
