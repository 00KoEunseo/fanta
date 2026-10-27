import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import '../src/sim/player';
import '../src/ui/panels';
const w = createWorld('LOAD-1');
for (let i = 0; i < 24; i++) tick(w);
console.log('load ok', w.t);
