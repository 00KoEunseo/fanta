import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
import { setTravel } from '../src/sim/characters';
import { approxDist } from '../src/sim/helpers';
const w = createWorld('XP-1');
for (let i = 0; i < 12 * 20; i++) tick(w);
const c = createPlayer(w, { race: 'human', sex: 'M', origin: 'common', traits: [] } as any)!;
c.born = w.t - 12 * 25;
const sites = w.sites.filter(s => s.loot > 0 && s.kind !== 'deep').sort((a, b) => approxDist(w, c, a) - approxDist(w, c, b));
const site = sites.find(s => setTravel(w, c, s, 'adventure', s.id))!;
console.log("능력치", JSON.stringify(c.stats), c.l, c.x, c.y, c.home, c.act.kind);
console.log('출발', site?.name, '경로', c.act.path?.length);
for (let i = 0; i < 60; i++) {
  tick(w);
  const P = w.player!;
  if (P.prompt) {
    console.log(i, P.prompt.title, P.prompt.choices.map(ch => ch.label + '(' + (ch.preview ?? '') + ')').join(' / '));
    const r = resolvePlayer(w, P.prompt.choices[0].id);
    console.log('  →', r);
    if (/유적 입구/.test(r) || w.player!.flags?.siteGate === undefined && c.act.kind === 'idle' && i > 3) break;
  }
}
console.log('상태', c.act.kind, c.died >= 0 ? '사망' : '생존');
