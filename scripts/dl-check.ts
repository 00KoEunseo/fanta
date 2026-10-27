declare const process: any;
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const seeds = (process.argv[2] ?? 'A1,B2,C3,D4').split(',');
const years = +(process.argv[3] ?? 400);
for (const seed of seeds) {
  const w = createWorld(seed);
  let dl = -1, start = 0, surfMonths = 0, armyOnSurf = 0, captured = 0, maxOpen = 0, surgeSeen = 0;
  const reigns: string[] = [];
  const capBefore = new Map<number, number>();
  for (let i = 0; i < years * 12 && !w.doom.ended; i++) {
    tick(w);
    const open = w.portals.filter(p => p.kind === 'rift' && p.open).length;
    maxOpen = Math.max(maxOpen, open);
    if ((w.doom.riftSurge ?? -1) === w.t + 0) surgeSeen++;
    if (w.demonLord !== dl) {
      if (dl >= 0) { const c = w.chars[dl]; reigns.push(`${Math.round((w.t - start) / 12)}y(${c.cause || '?'}) 지상군${armyOnSurf}회 지상점령${captured}`); }
      dl = w.demonLord; start = w.t; armyOnSurf = 0; captured = 0;
      if (dl >= 0) { const f = w.factions[w.chars[dl].faction]; capBefore.set(dl, f ? f.settlements.filter(id => w.settlements[id].l === 2).length : 0); }
    }
    if (dl >= 0) {
      const fid = w.chars[dl].faction;
      if (w.armies.some(a => a.alive && a.faction === fid && a.l === 2)) { armyOnSurf++; }
      const f = w.factions[fid];
      if (f) captured = Math.max(captured, f.settlements.filter(id => w.settlements[id].l === 2).length - (capBefore.get(dl) ?? 0));
      if (open >= 4) surfMonths++;
    }
  }
  if (dl >= 0) reigns.push(`${Math.round((w.t - start) / 12)}y(재위중) 지상군${armyOnSurf}회 지상점령${captured}`);
  console.log(seed, `마왕 ${reigns.length}명`, reigns.join(' | '), `최대 열린 균열 ${maxOpen}, 4개이상 ${surfMonths}개월, 차원문봉인 ${w.doom.seals[6]}, 진군 ${w.stats.dlMarches ?? 0}회, 천도 ${w.stats.dlMoves ?? 0}, 계단개방 ${w.stats.heavenForced ?? 0}, 마왕탑 ${w.towers.filter(t => t.demon).map(t => Math.round(t.progress)).join("/") || 0}, 성역침공 ${w.news.filter(n => /천상의 성역으로 진군/.test(n.text)).length}, 하늘의왕좌 ${w.stats.skyThrone ?? 0}, 세계멸망 ${w.doom.ended}${w.doom.ended ? `(${w.t/12|0}년, ${w.doom.endText.slice(0, 40)})` : ""}`);
}
