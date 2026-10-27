import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const w = createWorld('AUD-1');
let patron = 0, treeOwnerGreedy = 0;
for (let y = 0; y < 200; y++) { for (let m = 0; m < 12; m++) tick(w); patron += w.factions.filter(f => f.alive && f.flags.some(x => x.startsWith('patron:'))).length; }
console.log('수호룡 세력-년', patron, '세계수', JSON.stringify(w.worldTree), '나무 주인', w.factions[w.settlements[w.worldTree?.sid ?? -1]?.faction ?? -1]?.name, w.factions[w.settlements[w.worldTree?.sid ?? -1]?.faction ?? -1]?.race);
