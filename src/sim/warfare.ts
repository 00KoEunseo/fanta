// 전쟁의 흐름: 이웃끼리 쌓이는 마찰, 전쟁 점수, 그리고 강화 협상.
// - 국경을 맞댄 나라끼리는 해마다 관계가 조금씩 식는다(땅 욕심, 군주의 성정, 이웃 신앙의 침투). 교역·같은 신앙·화친은 마찰을 줄인다
// - 싸움의 결과(함락, 야전, 약탈, 격퇴, 주둔지)가 전쟁 점수로 쌓인다
// - 밀리는 쪽은 공물·국경 고을·포로를 내걸고 강화를 청하고, 이긴 쪽은 만족해야 받아들인다. 버틸 만하면 버틴다
// - 승패가 나지 않으면 양쪽이 아주 지쳐서야 칼을 거둔다 (그래서 십 년, 수십 년 전쟁이 생긴다)
import { AMBITION, COMPASSION, PRIDE, PRUDENCE } from '../data/traits';
import { GOLD } from '../data/terrain';
import type { Faction, Settlement, World } from './state';
import { dist } from './state';
import { addNews } from './news';
import { addFacRel, leaderOf, settlementsOf } from './helpers';
import { allowsSlavery, takeSlaves } from './slavery';

export interface WarState { score: number; since: number; asked?: number }

function ws(f: Faction, eid: number): WarState {
  f.warState ??= {};
  return (f.warState[eid] ??= { score: 0, since: f.wars[eid] ?? 0 });
}

/** 전쟁 점수: winner 쪽에 +n, loser 쪽에 -n */
export function warScore(w: World, winner: Faction | undefined, loser: Faction | undefined, n: number): void {
  if (!winner || !loser || winner === loser || winner.wars[loser.id] === undefined) return;
  ws(winner, loser.id).score += n;
  ws(loser, winner.id).score -= n;
}

export function clearWar(a: Faction, b: Faction): void {
  if (a.warState) delete a.warState[b.id];
  if (b.warState) delete b.warState[a.id];
}

/** 한 해에 한 번: 국경을 맞댄 이웃과의 마찰 */
export function borderFriction(w: World, f: Faction, neighbors: Faction[]): void {
  const ld = leaderOf(w, f);
  if (!ld) return;
  const t = ld.traits;
  const mine = settlementsOf(w, f);
  for (const o of neighbors) {
    if (f.wars[o.id] !== undefined) continue;
    if (f.treaties.some(x => x.with === o.id)) { addFacRel(w, f, o, 1); continue; }
    // 군주의 성정: 야망과 잔혹함은 이웃을 탐내게 하고, 신중함은 참게 한다
    let friction = 2 + (t[AMBITION] - 50) / 12 + (50 - t[COMPASSION]) / 15 + (t[PRIDE] - 50) / 25 - (t[PRUDENCE] - 50) / 25;
    // 이웃의 땅이 더 기름지고 풍요롭다
    if (o.avgDev > f.avgDev + 5) friction += 1.5;
    if (o.pop > f.pop * 0.5 && o.pop < f.pop * 1.2) friction += 0.5; // 만만한 상대
    // 이웃의 신앙이 내 고을로 스며든다
    if (o.faith !== undefined && o.faith !== f.faith) friction += Math.min(3, mine.filter(s => s.faith === o.faith).length * 1.5);
    if (o.faith !== undefined && o.faith === f.faith) friction -= 2;
    if (f.flags.includes('food_crisis')) friction += 2;
    if (friction > 0) addFacRel(w, f, o, -friction * 0.6);
  }
}

/** 국경 마찰에서 나온 전쟁의 명분 (마찰이 쌓인 이웃일 때) */
export function frictionReasons(w: World, a: Faction, b: Faction, neighbor: boolean): string[] {
  if (!neighbor) return [];
  const out = [`국경의 기름진 골짜기를 두고 ${a.name}과(와) ${b.name}이(가) 오래 다투어 왔다.`, `${b.name}이(가) ${a.name}의 앞길을 가로막고 있었다.`];
  if (b.faith !== undefined && b.faith !== a.faith && settlementsOf(w, a).some(s => s.faith === b.faith)) out.push(`${b.name}의 사제들이 국경을 넘어 이교를 퍼뜨린다는 소문이 돌았다.`);
  if (b.avgDev > a.avgDev + 5) out.push(`풍요로운 ${b.name}의 땅이 탐났다.`);
  return out;
}

/** 강화 협상 (반년에 한 번, 전쟁 쌍마다): 밀리는 쪽이 조건을 내걸고, 이긴 쪽이 만족하면 끝난다. 끝났으면 true */
export function negotiate(w: World, f: Faction, e: Faction, makePeace: (w: World, a: Faction, b: Faction) => void): boolean {
  const rng = w.rngSim;
  const sf = ws(f, e.id), se = ws(e, f.id);
  const years = (w.t - (f.wars[e.id] ?? w.t)) / 12;
  // 누가 밀리는가
  const loser = sf.score < se.score ? f : e, winner = loser === f ? e : f;
  const lscore = Math.min(sf.score, se.score);
  // 지친 정도: 양쪽 모두 아주 지쳤으면 승패 없이 칼을 거둔다 (오래 끄는 전쟁의 끝)
  if (f.warWeariness > 140 && e.warWeariness > 140 && Math.abs(sf.score) < 40 && rng.chance(0.08)) {
    makePeace(w, f, e);
    return true;
  }
  if (lscore > -35) return false;
  // 갓 시작한 전쟁은 크게 무너지지 않는 한 쉽게 무릎 꿇지 않는다
  if (years < 2 && lscore > -80) return false;
  // 버틸 만하면 버틴다: 군세가 비등하고 아직 크게 무너지지 않았다
  const ratio = loser.military / Math.max(1, winner.military);
  if (ratio > 0.7 && lscore > -90 && rng.chance(0.75)) return false;
  // 같은 상대에게 너무 자주 청하지 않는다
  const sl = ws(loser, winner.id);
  if (sl.asked !== undefined && w.t - sl.asked < 12) return false;
  sl.asked = w.t;
  // 이긴 쪽이 바라는 것: 점수가 클수록, 군주가 탐욕스러울수록 많이
  const wl = leaderOf(w, winner);
  const greed = wl ? 1 + (wl.traits[AMBITION] - 50) / 100 + (50 - wl.traits[COMPASSION]) / 150 : 1;
  const want = (-lscore) * greed;
  // 진 쪽이 내놓을 수 있는 것 (가벼운 것부터)
  const offer: string[] = [];
  let value = 0;
  const lcap = w.settlements[loser.capital];
  const gold = lcap ? Math.min(lcap.stock[GOLD] * 0.6, 400) : 0;
  if (gold > 20) { value += gold / 8; offer.push(`금 ${Math.round(gold)}`); }
  let ceded: Settlement | undefined;
  if (value < want) {
    // 이긴 쪽에 가장 가까운 국경 고을 하나 (수도는 내주지 않는다)
    const wcap = w.settlements[winner.capital];
    ceded = settlementsOf(w, loser).filter(s => s.id !== loser.capital).sort((a, b) => (wcap && a.l === wcap.l ? dist(a, wcap) : 999) - (wcap && b.l === wcap.l ? dist(b, wcap) : 999))[0];
    if (ceded) { value += 25 + ceded.pop / 40; offer.push(`${ceded.name}`); }
  }
  let captives = 0;
  if (value < want && allowsSlavery(w, winner) && lcap) {
    captives = Math.round(Math.min(lcap.pop * 0.08, 200));
    if (captives >= 10) { value += captives / 6; offer.push(`포로 ${captives}명`); } else captives = 0;
  }
  const accept = value >= want * 0.8 || (years > 15 && value >= want * 0.5);
  if (!accept) {
    if (rng.chance(0.35)) addNews(w, `${loser.name}이(가) ${offer.join(', ') || '빈손'}을(를) 내걸고 강화를 청하였으나, ${winner.name}은(는) 물리쳤다. 싸움은 계속된다.`, 2, 'war', { facs: [loser.id, winner.id] });
    return false;
  }
  // 조건을 치른다
  const wcap = w.settlements[winner.capital];
  if (gold > 20 && lcap && wcap) { lcap.stock[GOLD] -= gold; wcap.stock[GOLD] += gold; }
  if (ceded) transfer(w, ceded, winner);
  if (captives && lcap && wcap) { lcap.pop -= captives; takeSlaves(w, wcap, captives, lcap.race); }
  makePeace(w, f, e);
  addNews(w, `${loser.name}이(가) ${offer.join(', ')}을(를) 내주고 ${winner.name}에게 강화를 청하였다. ${winner.name}이(가) 받아들였다.${years >= 10 ? ` ${Math.floor(years)}년을 끈 전쟁이 끝났다.` : ''}`, 3, 'war', { facs: [loser.id, winner.id], pos: ceded ?? lcap });
  addFacRel(w, loser, winner, -10);
  return true;
}

let transfer: (w: World, s: Settlement, f: Faction) => void = () => {};
/** 고을을 넘기는 함수 (factions.ts가 넣어 준다: 서로를 불러오는 고리를 피하려고) */
export function setTransfer(fn: (w: World, s: Settlement, f: Faction) => void): void { transfer = fn; }

/** 군주인 '나'가 밀리는 전쟁에서 조건을 내걸고 강화를 청한다. 결과 문장을 돌려준다 */
export function offerTerms(w: World, loser: Faction, winner: Faction, kind: 'gold' | 'land'): string {
  const sl = ws(loser, winner.id);
  const wl = leaderOf(w, winner);
  const greed = wl ? 1 + (wl.traits[AMBITION] - 50) / 100 + (50 - wl.traits[COMPASSION]) / 150 : 1;
  const want = Math.max(10, -sl.score) * greed;
  const lcap = w.settlements[loser.capital], wcap = w.settlements[winner.capital];
  let value = 0, what = '';
  let ceded: Settlement | undefined;
  if (kind === 'gold') {
    const gold = lcap ? Math.min(lcap.stock[GOLD] * 0.8, 600) : 0;
    value = gold / 8; what = `금 ${Math.round(gold)}`;
    if (value >= want * 0.8 && lcap && wcap) { lcap.stock[GOLD] -= gold; wcap.stock[GOLD] += gold; }
  } else {
    ceded = settlementsOf(w, loser).filter(s => s.id !== loser.capital).sort((a, b) => (wcap && a.l === wcap.l ? dist(a, wcap) : 999) - (wcap && b.l === wcap.l ? dist(b, wcap) : 999))[0];
    if (!ceded) return '내줄 만한 고을이 수도밖에 남지 않았다. 사신은 빈손으로 돌아왔다.';
    value = 25 + ceded.pop / 40; what = ceded.name;
  }
  if (value < want * 0.8) {
    addNews(w, `${loser.name}이(가) ${what}을(를) 내걸고 강화를 청하였으나, ${winner.name}은(는) 물리쳤다.`, 2, 'war', { facs: [loser.id, winner.id] });
    return `${winner.name}은(는) ${what}(으)로는 모자라다며 사신을 돌려보냈다.`;
  }
  if (ceded) transfer(w, ceded, winner);
  peaceFn(w, loser, winner);
  addNews(w, `${loser.name}이(가) ${what}을(를) 내주고 ${winner.name}에게 강화를 청하였다. ${winner.name}이(가) 받아들였다.`, 3, 'war', { facs: [loser.id, winner.id] });
  return `${what}을(를) 내주고 강화를 맺었다. 궁정에 무거운 침묵이 내려앉았다.`;
}

let peaceFn: (w: World, a: Faction, b: Faction) => void = () => {};
export function setPeace(fn: (w: World, a: Faction, b: Faction) => void): void { peaceFn = fn; }
