// 가문: 명예를 중시하는 세력에서 영지와 성지를 대대로 지키는 혈족
import { isAdult } from './helpers';
import { relocate } from './characters';
import { makeClanName } from '../data/names';
import { fixJosa } from '../data/text';
import { addNews } from './news';
import type { Character, Faction, Settlement, World } from './state';
import { approxDist, leaderOf } from './helpers';

export interface House {
  id: number;
  name: string;
  faction: number;
  founder: number;
  head: number;
  /** 대대로 지키는 영지 (-1: 잃음) */
  seat: number;
  /** 지키는 성지 (유적 중 성소, -1: 없음) */
  shrine: number;
  prestige: number;
  royal: boolean;
  t: number;
  alive: boolean;
  history: { t: number; text: string }[];
}

/** 명예를 중시해 가문 제도를 두는 세력인가 */
export function honorFaction(w: World, f: Faction | undefined): boolean {
  if (!f || !f.alive || f.tier < 1) return false;
  if (['human', 'elf', 'dwarf', 'darkelf', 'majin'].includes(f.race)) return true;
  const ld = leaderOf(w, f);
  return !!ld && ld.traits[9] >= 65;
}

export function houseOf(w: World, c: Character): House | undefined {
  return c.house !== undefined ? w.houses[c.house] : undefined;
}

export function houseLog(w: World, h: House, text: string): void {
  h.history.push({ t: w.t, text: fixJosa(text) });
  if (h.history.length > 40) h.history.splice(1, 1);
}

/** 가문을 세운다 (이미 있으면 그대로) */
export function ensureHouse(w: World, c: Character, seat?: Settlement): House | null {
  const f = w.factions[c.faction];
  if (!honorFaction(w, f)) return null;
  const cur = houseOf(w, c);
  if (cur && cur.alive && cur.faction !== f!.id && cur.head !== c.id) {
    // 가주는 다른 나라에 있다: 이 나라에서 출세한 식구는 분가를 세운다
    const branch: House = {
      id: w.houses.length, name: `${cur.name.replace(/ 가문$/, '')} 분가`, faction: f!.id, founder: c.id, head: c.id, seat: seat && seat.faction === f!.id ? seat.id : -1, shrine: -1,
      prestige: Math.round(cur.prestige * 0.3), royal: false, t: w.t, alive: true, history: [],
    };
    w.houses.push(branch);
    houseLog(w, branch, `${c.name}이(가) ${cur.name}에서 갈라져 나와 ${f!.name}에서 분가를 세웠다.`);
    houseLog(w, cur, `${c.name}이(가) ${f!.name}에서 분가를 세웠다.`);
    c.house = branch.id;
    for (const id of c.children) { const k = w.chars[id]; if (k && k.died < 0 && k.house === cur.id) k.house = branch.id; }
    return branch;
  }
  if (cur && cur.alive) {
    if (cur.faction !== f!.id) { cur.faction = f!.id; cur.royal = false; }
    if (seat && cur.seat < 0 && seat.faction === cur.faction && seat.alive) { cur.seat = seat.id; houseLog(w, cur, `${seat.name}을(를) 새 영지로 받았다.`); }
    return cur;
  }
  let name = `${makeClanName(w.rngSim, c.race)} 가문`;
  for (let i = 0; i < 10 && w.houses.some(h => h.alive && h.name === name); i++) name = `${makeClanName(w.rngSim, c.race)} 가문`;
  const h: House = {
    id: w.houses.length, name, faction: f!.id, founder: c.id, head: c.id, seat: seat ? seat.id : -1, shrine: -1,
    prestige: Math.round(c.honor / 2 + c.fame / 3), royal: false, t: w.t, alive: true, history: [],
  };
  w.houses.push(h);
  c.house = h.id;
  // 이미 태어난 자식들도 가문에 든다
  for (const id of c.children) { const k = w.chars[id]; if (k && k.died < 0 && k.house === undefined) k.house = h.id; }
  const sp = w.chars[c.spouse];
  if (sp && sp.died < 0 && sp.house === undefined) sp.house = h.id;
  houseLog(w, h, `${c.name}이(가) ${seat ? `${seat.name}의 영주가 되며 ` : ''}가문을 세웠다.`);
  return h;
}

/** 왕좌에 오른 가문 */
export function crownHouse(w: World, f: Faction, c: Character): void {
  if (!honorFaction(w, f)) return;
  const h = ensureHouse(w, c, w.settlements[f.capital]);
  if (!h) return;
  for (const o of w.houses) if (o.faction === f.id && o.royal && o !== h) { o.royal = false; houseLog(w, o, '왕가의 자리를 잃었다.'); }
  if (!h.royal) {
    h.royal = true;
    h.prestige += 50;
    houseLog(w, h, `${c.name}이(가) ${f.name}의 왕좌에 오르며 왕가가 되었다.`);
    if (h.history.length > 1) addNews(w, `${h.name}이(가) ${f.name}의 왕가가 되었다.`, 2, 'politics', { facs: [f.id], chars: [c.id] });
  }
}

/** 가주가 죽었을 때: 맏이가 잇고, 핏줄이 끊기면 단절 */
export function onHouseDeath(w: World, c: Character): void {
  const h = houseOf(w, c);
  if (!h || !h.alive || h.head !== c.id) return;
  const kids = c.children.map(id => w.chars[id]).filter(k => k && k.died < 0 && k.house === h.id).sort((a, b) => a.born - b.born);
  const heir = kids[0] ?? w.chars.filter(m => m.died < 0 && m.house === h.id).sort((a, b) => a.born - b.born)[0];
  if (heir) {
    h.head = heir.id;
    houseLog(w, h, `${c.name}이(가) 세상을 떠나고 ${heir.name}이(가) 가주가 되었다.`);
    const seat = w.settlements[h.seat];
    const f = w.factions[h.faction];
    // 영지는 가문을 따라 대물림된다
    const fit = isAdult(w, heir) && heir.role !== '노예' && heir.faction === seat?.faction && !w.settlements.some(o => o.alive && o.governor === heir.id) && heir.act.kind === 'idle';
    if (seat && seat.alive && seat.faction === h.faction && f && f.capital !== seat.id && (seat.governor < 0 || seat.governor === c.id) && !heir.isPlayer && fit) { seat.governor = heir.id; heir.home = seat.id; relocate(w, heir, seat); }
    return;
  }
  h.alive = false;
  h.royal = false;
  houseLog(w, h, `마지막 핏줄 ${c.name}이(가) 세상을 떠나 가문이 끊어졌다.`);
  addNews(w, `${h.name}의 핏줄이 끊어졌다. 한때 ${w.settlements[h.seat]?.name ?? '영지'}를 지키던 이름이 역사 속으로 사라졌다.`, 2, 'politics', { facs: [h.faction] });
}

/** 매달: 명망, 성지 수호, 영지 상실 */
export function housesMonth(w: World): void {
  const rng = w.rngSim;
  // 가문 제도가 생기기 전부터 영지를 다스리던 영주들도 가문을 세운다
  if (w.t % 6 === 0) for (const s of w.settlements) {
    const g = w.chars[s.governor];
    if (s.alive && g && g.died < 0 && g.house === undefined && honorFaction(w, w.factions[s.faction])) ensureHouse(w, g, s);
  }
  for (const h of w.houses) {
    if (!h.alive) continue;
    const head = w.chars[h.head];
    if (!head || head.died >= 0) { if (head) onHouseDeath(w, head); continue; }
    // 가주가 다른 세력으로 넘어가면 가문도 따라간다
    if (head.faction >= 0 && head.faction !== h.faction) {
      h.faction = head.faction;
      if (h.royal) { h.royal = false; houseLog(w, h, '나라를 잃고 왕가의 자리에서 내려왔다.'); }
      houseLog(w, h, `${w.factions[h.faction]?.name ?? '다른 나라'}에 몸을 의탁하였다.`);
    }
    const seat = w.settlements[h.seat];
    if (seat && (!seat.alive || seat.faction !== h.faction)) {
      houseLog(w, h, `대대로 지켜 온 ${seat.name}을(를) 잃었다.`);
      h.seat = -1;
      h.prestige = Math.max(0, h.prestige - 20);
    }
    // 명망: 구성원의 명성과 명예
    if (w.t % 12 === h.id % 12) {
      const members = w.chars.filter(m => m.died < 0 && m.house === h.id);
      h.prestige += Math.round(members.reduce((a, m) => a + Math.max(0, m.fame) * 0.02 + Math.max(0, m.honor) * 0.01, 0));
      if (h.royal) h.prestige += 3;
    }
    // 가까운 성지를 지킨다
    if (h.shrine < 0 && seat && rng.chance(0.05)) {
      const taken = new Set(w.houses.filter(o => o.alive).map(o => o.shrine));
      const sh = w.sites.find(s => s.kind === 'shrine' && !taken.has(s.id) && approxDist(w, seat, s) < 20);
      if (sh) { h.shrine = sh.id; h.prestige += 15; houseLog(w, h, `${sh.name}을(를) 지키는 성지의 수호 가문이 되었다.`); }
    }
  }
}

export function membersOf(w: World, h: House): Character[] {
  return w.chars.filter(m => m.house === h.id).sort((a, b) => (a.died < 0 ? 0 : 1) - (b.died < 0 ? 0 : 1) || a.born - b.born);
}
