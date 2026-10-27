// 주둔지와 전선: 먼 적국을 칠 때는 국경 길목에 주둔지를 세우고, 병력을 모아 거기서 출격한다.
// 출격한 군대는 싸움이 끝나면 주둔지로 돌아온다. 주둔지는 고향에서 양식을 받고, 끊기면 병사가 흩어진다.
// 적의 군대가 다가오면 주둔지를 두고 싸운다. 전쟁이 끝나면 병사들은 집으로 돌아간다.
import { warScore } from './warfare';
import { RACES } from '../data/races';
import { FOOD } from '../data/terrain';
import type { Army, Character, Faction, Pos, Settlement, World } from './state';
import { dist } from './state';
import { addNews, charLog } from './news';
import { findPath, posOf } from './path';
import { settlementsOf } from './helpers';
import { killChar, relocate } from './characters';
import { armyAt } from './military';

export interface Camp extends Pos {
  id: number;
  name: string;
  faction: number;
  /** 맞서는 세력 */
  enemy: number;
  /** 양식을 대는 고향 고을 */
  home: number;
  soldiers: number;
  commander: number;
  t: number;
  alive: boolean;
  /** 이 주둔지가 노리는 적의 고을 (전선) */
  front: number;
}

const campOf = (w: World, id: number | undefined) => { const c = w.camps?.[id ?? -1]; return c && c.alive ? c : undefined; };
export { campOf };

/** f가 e와 싸우려 세운 살아 있는 주둔지들 */
export function campsAgainst(w: World, f: Faction, e: Faction): Camp[] {
  return (w.camps ?? []).filter(c => c.alive && c.faction === f.id && c.enemy === e.id);
}

/** 출발 고을에서 적 고을로 가는 길목에 주둔지 자리를 고른다: 제 땅이나 빈 땅 가운데 적에 가장 가까운 곳 */
function frontSpot(w: World, f: Faction, from: Settlement, to: Settlement): Pos | null {
  const path = findPath(w, from, to, { race: from.race, flying: RACES[from.race].flying }, 40000);
  if (!path || path.length < 12) return null;
  let best: Pos | null = null;
  for (let i = Math.floor(path.length * 0.35); i < Math.floor(path.length * 0.75); i++) {
    const p = posOf(w, path[i]);
    const L = w.layers[p.l];
    const owner = L.owner[p.y * L.w + p.x];
    if (owner >= 0 && owner !== f.id) continue;
    if (w.settlements.some(s => s.alive && s.l === p.l && dist(s, p) < 3)) continue;
    best = p;
  }
  return best;
}

/** 주둔지를 세운다 (이미 가까이에 있으면 그것을 쓴다) */
/** 주둔지 하나에 모아 두는 병력의 한도 */
export const CAMP_MAX = 120;

export function ensureCamp(w: World, f: Faction, e: Faction, from: Settlement, to: Settlement): Camp | null {
  const near = campsAgainst(w, f, e).find(c => c.l === to.l && dist(c, to) <= 25);
  if (near) return near;
  if (campsAgainst(w, f, e).length >= 2) return null;
  const p = frontSpot(w, f, from, to);
  if (!p) return null;
  w.camps ??= [];
  const camp: Camp = { id: w.camps.length, name: `${from.name} 주둔지`, faction: f.id, enemy: e.id, home: from.id, soldiers: 0, commander: -1, t: w.t, alive: true, front: to.id, l: p.l, x: p.x, y: p.y };
  w.camps.push(camp);
  addNews(w, `${f.name}이(가) ${e.name}과(와)의 싸움을 위해 ${to.name}을(를) 마주 보는 길목에 주둔지를 세웠다.`, 2, 'war', { pos: camp, facs: [f.id, e.id] });
  return camp;
}

/** 주둔지로 가는 군대: 도착하면 주둔지에 합류한다 */
export function sendToCamp(w: World, a: Army, camp: Camp): boolean {
  const path = findPath(w, a, camp, { race: a.race, flying: RACES[a.race].flying }, 40000);
  if (!path) return false;
  a.path = path;
  a.camp = camp.id;
  a.toCamp = true;
  return true;
}

/** 군대가 주둔지에 닿았다: 병사와 지휘관이 합류한다 */
export function joinCamp(w: World, a: Army): boolean {
  const camp = campOf(w, a.camp);
  if (!camp || !a.toCamp) return false;
  camp.soldiers += a.soldiers;
  for (let r = 0; r < a.loot.length; r++) w.settlements[camp.home] && (w.settlements[camp.home].stock[r] += a.loot[r]);
  a.alive = false;
  const c = w.chars[a.commander];
  // 군주와 '나'는 주둔지에 눌러앉지 않는다 (군주는 도성으로, '나'는 출정 결과를 받는다)
  const lord = c && w.factions[c.faction]?.leader === c.id;
  if (c && c.died < 0 && (lord || c.isPlayer)) {
    if (lord) { c.act = { kind: 'idle' }; const h = w.settlements[c.home]; if (h && h.alive) relocate(w, c, h); }
  } else if (c && c.died < 0) {
    const cur = w.chars[camp.commander];
    if (!cur || cur.died >= 0 || cur.act.kind !== 'camp') {
      camp.commander = c.id;
      c.act = { kind: 'camp', target: camp.id };
      charLog(w, c, `${camp.name}을(를) 맡았다.`, 2);
    } else c.act = { kind: 'idle' };
  }
  return true;
}

/** 출격: 주둔지의 병력으로 가까운 적 고을을 친다 (군대는 주둔지 자리에서 떠난다) */
function sortie(w: World, camp: Camp, f: Faction, e: Faction): void {
  const tgt = settlementsOf(w, e).filter(s => s.l === camp.l && dist(s, camp) <= 30).sort((a, b) => dist(a, camp) - dist(b, camp))[0];
  if (!tgt) return;
  const path = findPath(w, camp, tgt, { race: f.race, flying: RACES[f.race].flying }, 40000);
  if (!path) return;
  const n = Math.round(camp.soldiers * 0.7);
  const cmd = w.chars[camp.commander];
  const lead = cmd && cmd.died < 0 && cmd.act.kind === 'camp' ? cmd : null;
  const a = armyAt(w, f, camp, 'conquer', tgt, n, path, camp.home, lead);
  a.camp = camp.id; a.toCamp = false;
  camp.soldiers -= n;
  camp.front = tgt.id;
  if (lead) camp.commander = -1;
}

/** 매달: 보급, 출격, 공격받음, 철수 */
export function campsMonth(w: World): void {
  const list = w.camps;
  if (!list?.length) return;
  const rng = w.rngSim;
  for (const camp of list) {
    if (!camp.alive) continue;
    const f = w.factions[camp.faction], e = w.factions[camp.enemy];
    const home = w.settlements[camp.home];
    // 전쟁이 끝났거나 한쪽이 사라졌다: 철수
    if (!f || !f.alive || !e || !e.alive || f.wars[e.id] === undefined || !home || !home.alive || home.faction !== f.id) {
      breakCamp(w, camp, f && e && f.alive && e.alive ? `${f.name}이(가) ${camp.name}을(를) 거두고 병사들을 집으로 돌려보냈다.` : '');
      continue;
    }
    // 보급: 병사 100명당 한 달 양식 2
    const need = camp.soldiers * 0.02;
    if (home.stock[FOOD] >= need) home.stock[FOOD] -= need;
    else {
      const lost = Math.round(camp.soldiers * 0.08);
      camp.soldiers -= lost;
      if (lost >= 10 && rng.chance(0.2)) addNews(w, `양식이 끊긴 ${camp.name}에서 병사 ${lost}명이 달아났다.`, 2, 'war', { pos: camp, facs: [f.id] });
    }
    // 지휘관이 자리를 떠났으면 비운다
    const cmd = w.chars[camp.commander];
    if (cmd && (cmd.died >= 0 || cmd.act.kind !== 'camp' || cmd.act.target !== camp.id)) camp.commander = -1;
    if (cmd && cmd.died < 0 && cmd.act.kind === 'camp') { cmd.pl = cmd.l; cmd.px = cmd.x; cmd.py = cmd.y; cmd.l = camp.l; cmd.x = camp.x; cmd.y = camp.y; }
    // 적의 군대가 주둔지로 들이닥쳤다
    const raider = w.armies.find(a => a.alive && a.faction === e.id && a.l === camp.l && Math.abs(a.x - camp.x) <= 2 && Math.abs(a.y - camp.y) <= 2 && (a.goal === 'conquer' || a.goal === 'raid' || a.goal === 'holywar'));
    if (raider) {
      const d = camp.soldiers * 1.2 + 20, at = raider.soldiers;
      if (rng.chance(at / (at + d))) {
        raider.soldiers *= 0.75;
        addNews(w, `${e.name}의 군대가 ${f.name}의 ${camp.name}을(를) 짓밟았다. 살아남은 병사들은 흩어졌다.`, 3, 'war', { pos: camp, facs: [f.id, e.id] });
        if (cmd && cmd.died < 0 && rng.chance(0.3)) { cmd.act = { kind: 'idle' }; killChar(w, cmd, `${camp.name} 함락 때 전사`); }
        warScore(w, e, f, 10);
        breakCamp(w, camp, '');
        continue;
      }
      warScore(w, f, e, 4);
      raider.soldiers *= 0.55; camp.soldiers *= 0.85;
      addNews(w, `${f.name}의 ${camp.name}이(가) ${e.name}의 공격을 막아냈다.`, 2, 'war', { pos: camp, facs: [f.id, e.id] });
    }
    // 오래 버틴 주둔지는 해마다 병사를 교대로 집에 돌려보낸다 (고을이 비지 않도록)
    if (w.t - camp.t > 60 && (w.t - camp.t) % 12 === 0 && camp.soldiers > 30) {
      const back = Math.round(camp.soldiers * 0.3);
      camp.soldiers -= back; home.pop += back;
    }
    if (camp.soldiers < 8 && w.t - camp.t > 24) { breakCamp(w, camp, `병사가 다 흩어진 ${camp.name}이(가) 버려졌다.`); continue; }
    // 병력이 모이면 출격한다 (이미 나가 있는 군대가 없을 때)
    const out = w.armies.some(a => a.alive && a.camp === camp.id && !a.toCamp);
    if (!out && camp.soldiers >= 40 && rng.chance(0.25)) sortie(w, camp, f, e);
  }
  if (list.length > 120) w.camps = list.filter(c => c.alive).map((c, i) => ({ ...c, id: i }));
}

/** 주둔지를 거둔다: 지휘관은 집으로, 병사는 고향 고을로 */
export function breakCamp(w: World, camp: Camp, news: string): void {
  camp.alive = false;
  const home = w.settlements[camp.home];
  if (home && home.alive && home.faction === camp.faction) home.pop += camp.soldiers;
  camp.soldiers = 0;
  const c = w.chars[camp.commander];
  if (c && c.died < 0 && c.act.kind === 'camp') {
    c.act = { kind: 'idle' };
    if (home && home.alive) relocate(w, c, home);
  }
  if (news) addNews(w, news, 2, 'war', { pos: camp, facs: [camp.faction] });
}

/** 출격했던 군대가 주둔지로 돌아갈 수 있는가 */
export function returnToCamp(w: World, a: Army): boolean {
  const camp = campOf(w, a.camp);
  if (!camp) return false;
  return sendToCamp(w, a, camp);
}

export const campCommander = (w: World, c: Character): Camp | undefined => (c.act.kind === 'camp' ? campOf(w, c.act.target) : undefined);
