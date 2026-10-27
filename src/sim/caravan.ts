// 상단: 교역 협정을 맺은 나라 사이를 실제로 걸어서 오가는 짐 행렬.
// 뭍길로 이어진 교역은 반년마다 상단을 떠나보내고, 상단은 길을 따라 걷다가 도착하면 짐을 부린다.
// 전쟁 중인 나라의 땅을 지나면 약탈당할 수 있고, 외진 길에서는 도적을 만나기도 한다.
// (뱃길 교역은 지금처럼 바로 오간다)
import { RACES } from '../data/races';
import { RES_NAMES } from '../data/terrain';
import type { Faction, Pos, Settlement, World } from './state';
import { dist } from './state';
import { addNews } from './news';
import { advance, posOf } from './path';
import { clamp } from './helpers';

export interface Caravan extends Pos {
  id: number;
  fac: number;
  partner: number;
  from: number;
  to: number;
  res: number;
  amt: number;
  path: number[];
  pl: number; px: number; py: number;
  alive: boolean;
  t: number;
}

/** 상단을 떠나보낸다.
 *  'sent': 떠났다 · 'blocked': 길목에 싸우는 나라가 있어 이번에는 떠나지 않는다 · 'nopath': 걸어갈 길이 없다(옛 방식으로 바로 넘긴다) */
export function sendCaravan(w: World, f: Faction, o: Faction, a: Settlement, b: Settlement, res: number, amt: number, path: number[] | null): 'sent' | 'blocked' | 'nopath' {
  // 길은 교역로를 잴 때 찾아 둔 것을 쓴다 (상단마다 길을 새로 찾지 않는다)
  if (!path || path.length < 3) return 'nopath';
  // 상인들은 전쟁 중인 땅으로 수레를 끌고 들어가지 않는다
  for (let i = 0; i < path.length; i += 3) {
    const p = posOf(w, path[i]);
    const L = w.layers[p.l];
    const owner = L.owner[p.y * L.w + p.x];
    if (owner >= 0 && f.wars[owner] !== undefined) return 'blocked';
  }
  a.stock[res] -= amt;
  w.caravans ??= [];
  w.caravans.push({ id: w.caravans.length, fac: f.id, partner: o.id, from: a.id, to: b.id, res, amt, path, l: a.l, x: a.x, y: a.y, pl: a.l, px: a.x, py: a.y, alive: true, t: w.t });
  return 'sent';
}

export function caravanMonth(w: World): void {
  const list = w.caravans;
  if (!list?.length) return;
  const rng = w.rngSim;
  for (const k of list) {
    if (!k.alive) continue;
    const f = w.factions[k.fac], o = w.factions[k.partner], dest = w.settlements[k.to];
    // 주인이나 받을 곳이 사라졌다
    if (!f || !f.alive || !dest || !dest.alive) { k.alive = false; continue; }
    k.pl = k.l; k.px = k.x; k.py = k.y;
    const p = advance(w, k.path, 4, { race: f.race, flying: RACES[f.race].flying });
    if (p) { k.l = p.l; k.x = p.x; k.y = p.y; }
    // 지나는 땅의 주인
    const L = w.layers[k.l];
    const owner = w.factions[L.owner[k.y * L.w + k.x]];
    if (owner && owner.alive && owner !== f && f.wars[owner.id] !== undefined && rng.chance(0.2)) {
      k.alive = false;
      const near = w.settlements.filter(s => s.alive && s.faction === owner.id && s.l === k.l).sort((a, b) => dist(a, k) - dist(b, k))[0];
      if (near) near.stock[k.res] += k.amt * 0.6;
      addNews(w, `${f.name}의 상단이 ${owner.name}의 땅에서 약탈당하였다. ${RES_NAMES[k.res]} 수레가 적의 손에 넘어갔다.`, 2, 'trade', { pos: k, facs: [f.id, owner.id] });
      continue;
    }
    // 주인 없는 외진 길에는 도적이 꼬인다: 짐 일부를 빼앗기거나, 드물게 모두 잃는다
    if (!owner && rng.chance(0.002)) {
      const all = rng.chance(0.3);
      w.stats[`caravanLost${f.id}`] = (w.stats[`caravanLost${f.id}`] ?? 0) + 1;
      const v = (w.t + k.id) % 3;
      if (all) {
        k.alive = false;
        addNews(w, [`${f.name}의 상단이 외진 길에서 도적떼를 만나 짐을 모두 잃었다.`, `${f.name}의 상단이 돌아오지 않았다. 빈 수레만 길가에서 발견되었다.`, `${f.name}의 상단이 습격을 받아 호위병까지 모두 쓰러졌다.`][v], 2, 'trade', { pos: k, facs: [f.id] });
        continue;
      }
      k.amt *= 0.5;
      addNews(w, [`${f.name}의 상단이 도적을 만나 짐 절반을 내주고 길을 이었다.`, `${f.name}의 상단 호위병들이 도적을 물리쳤지만 수레 몇 대를 잃었다.`, `${f.name}의 상단이 산길에서 매복을 당했다. 반은 살아남았다.`][v], 1, 'trade', { pos: k, facs: [f.id] });
    }
    if (!k.path.length || (k.l === dest.l && dist(k, dest) <= 1.5)) {
      k.alive = false;
      dest.stock[k.res] += k.amt;
      if (o && o.alive) {
        f.relations[o.id] = clamp((f.relations[o.id] ?? 0) + 1, -100, 100);
        o.relations[f.id] = clamp((o.relations[f.id] ?? 0) + 1, -100, 100);
      }
      // 무사히 닿은 상단은 소식이 되지 않는다 (털린 상단만 소식이 된다). 대신 한 해의 오고 감을 센다
      w.stats[`caravanOk${f.id}`] = (w.stats[`caravanOk${f.id}`] ?? 0) + 1;
    }
  }
  if (list.length > 150) w.caravans = list.filter(k => k.alive).map((k, i) => ({ ...k, id: i }));
}
