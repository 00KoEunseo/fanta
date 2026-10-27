// 조우: 세력은 처음에 서로를 모른다.
// 정찰꾼·여행자·탐험가가 낯선 세력의 고을이나 사람과 마주치면(3~4칸 안), 그 자리에서 좋든 나쁘든 첫 만남이 벌어진다.
// 그 사람이 고향으로 돌아와 이야기를 전해야 비로소 나라가 상대의 존재를 알게 된다 (돌아오지 못하면 소식도 함께 사라진다).
// 국경이 맞닿으면 저절로 알게 된다. 서로 모르는 세력끼리는 전쟁도, 교역도, 연맹도 맺지 않는다.
import { RACES, raceAffinity } from '../data/races';
import type { Character, Faction, Settlement, World } from './state';
import { dist, yearOf } from './state';
import { addNews } from './news';
import { addFacRel, isAdult } from './helpers';

/** a가 b를 아는가. 예전 저장(known이 없는 세력)은 모두 안다고 본다. 마왕은 온 세상을 내려다본다 */
export function knows(w: World, a: Faction | undefined, b: Faction | number | undefined): boolean {
  const bid = typeof b === 'number' ? b : b?.id;
  if (!a || bid === undefined || bid < 0) return false;
  if (a.id === bid || !a.known) return true;
  const dl = w.demonLord >= 0 ? w.chars[w.demonLord] : null;
  if (dl && dl.faction === a.id) return true;
  return a.known[bid] !== undefined;
}

/** a가 b를 알게 된다 (처음이면 true) */
export function learn(w: World, a: Faction, b: Faction): boolean {
  if (a === b || !a.known || a.known[b.id] !== undefined) return false;
  a.known[b.id] = w.t;
  return true;
}

/** 새로 갈라져 나온 나라: 옛 나라가 알던 세상을 물려받고, 옛 나라와 그 이웃들도 새 나라를 안다 */
export function inheritKnown(w: World, nf: Faction, parent: Faction | undefined): void {
  if (!parent || !nf.known) return;
  for (const [id, t] of Object.entries(parent.known ?? {})) nf.known[+id] ??= t;
  learn(w, nf, parent); learn(w, parent, nf);
  for (const o of w.factions) if (o.alive && o !== nf && o !== parent && knows(w, o, parent)) learn(w, o, nf);
}

/** 초반에는 멀리 나다니지 않는다: 세상이 열린 지 오래될수록 여행의 반경이 넓어진다 (0.2 → 1, 약 60년에 걸쳐) */
export function reachFactor(w: World): number {
  return Math.min(1, 0.2 + w.t / (12 * 75));
}

/** a가 b를 안 지 몇 해인가 (모르면 -1, 예전 저장은 오래 안 것으로 본다) */
export function knownYears(w: World, a: Faction, b: Faction): number {
  if (!knows(w, a, b)) return -1;
  const t = a.known?.[b.id];
  return t === undefined ? 99 : (w.t - t) / 12;
}

const GOOD = ['서로 경계하다가 이내 불가에 둘러앉아 음식을 나누었다.', '말은 통하지 않았지만 손짓으로 길을 묻고 작은 선물을 주고받았다.', '그들의 사냥을 거들어 주고 환대를 받았다.'];
const BAD = ['수풀 너머에서 화살이 날아왔다. 간신히 몸을 피해 달아났다.', '창끝을 겨눈 파수꾼들에게 쫓겨났다.', '서로 칼을 뽑고 노려보다가 등을 돌렸다.'];

const SEEK = new Set(['adventure', 'trade', 'pilgrim', 'visit', 'hunt', 'duel']);

/** 이미 누군가 이 세력을 만나 소식을 품고 돌아오는 중인가 (첫 만남은 한 번만 이야기가 된다) */
function heard(w: World, f: Faction, o: Faction): boolean {
  f.heard ??= {};
  if (f.heard[o.id] !== undefined) return true;
  f.heard[o.id] = w.t;
  return false;
}

/** 첫 만남: 종족 사이의 감정과 만난 이의 성품에 따라 좋게도, 나쁘게도 흘러간다 */
function firstMeeting(w: World, c: Character, f: Faction, o: Faction, at: Settlement | null): void {
  const rng = w.rngSim;
  const warm = raceAffinity(f.race, o.race) / 100 + (c.traits[3] - 50) / 150 + (c.traits[7] - 50) / 200;
  const good = rng.chance(Math.min(0.9, Math.max(0.1, 0.5 + warm)));
  const line = good ? GOOD[(w.t + c.id) % GOOD.length] : BAD[(w.t + c.id) % BAD.length];
  addFacRel(w, f, o, good ? 8 : -12);
  const where = at ? `${at.name} 근처에서` : '길 위에서';
  addNews(w, `${f.name}의 ${c.role} ${c.name}이(가) ${where} 낯선 ${RACES[o.race].name}들과 마주쳤다. ${line}`, 2, 'politics', { pos: c, chars: [c.id], facs: [f.id, o.id] });
}

/** 매달: 길 위의 만남, 돌아온 이의 이야기, 맞닿은 국경 */
export function contactMonth(w: World): void {
  const alive = w.factions.filter(f => f.alive && f.known);
  if (alive.length < 2) return;
  for (const c of w.chars) {
    if (c.died >= 0 || c.race === 'dragon' || !isAdult(w, c)) continue;
    const f = w.factions[c.faction];
    if (!f || !f.alive || !f.known) continue;
    const home = w.settlements[c.home];
    // 돌아온 이가 들려주는 이야기
    if (c.carry?.length && home && home.alive && c.l === home.l && dist(c, home) <= 3) {
      for (const oid of c.carry) {
        const o = w.factions[oid];
        if (!o || !o.alive || !learn(w, f, o)) continue;
        addNews(w, `${c.name}이(가) ${home.name}에 돌아와 ${o.name}의 존재를 알렸다. ${f.name}이(가) ${o.name}과(와) 처음으로 조우하였다.`, 3, 'politics', { pos: home, chars: [c.id], facs: [f.id, o.id] });
      }
      c.carry = [];
      continue;
    }
    // 낯선 이를 만나는 것은 뜻을 품고 길을 나선 이들뿐이다 (집으로 돌아가거나 피난하는 길은 셈하지 않는다)
    const A = c.act;
    const exploring = (A.kind === 'travel' && SEEK.has(A.purpose ?? '')) || A.kind === 'party';
    if (!exploring) continue;
    // 세상이 젊을 때는 낯선 기척을 알아채는 일도 드물다
    const r = reachFactor(w);
    if (!w.rngSim.chance(0.25 * r * r * r)) continue;
    // 낯선 고을
    for (const s of w.settlements) {
      if (!s.alive || s.l !== c.l || s.faction === f.id || dist(s, c) > 4) continue;
      const o = w.factions[s.faction];
      if (!o || !o.alive || !o.known || knows(w, f, o) || c.carry?.includes(o.id)) continue;
      if (!heard(w, f, o)) firstMeeting(w, c, f, o, s);
      (c.carry ??= []).push(o.id);
      // 고을 사람들은 낯선 이를 직접 보았으니 바로 안다
      if (learn(w, o, f)) addNews(w, `${s.name} 사람들이 처음 보는 ${f.name}의 사람을 맞닥뜨렸다. ${o.name}이(가) ${f.name}의 존재를 알게 되었다.`, 3, 'politics', { pos: s, facs: [o.id, f.id] });
    }
    // 길 위에서 마주친 낯선 나그네
    for (const d of w.chars) {
      if (d === c || d.died >= 0 || d.l !== c.l || d.faction === f.id || d.act.kind !== 'travel' || Math.abs(d.x - c.x) > 3 || Math.abs(d.y - c.y) > 3) continue;
      const o = w.factions[d.faction];
      if (!o || !o.alive || !o.known || knows(w, f, o) || c.carry?.includes(o.id)) continue;
      if (!heard(w, f, o)) firstMeeting(w, c, f, o, null);
      (c.carry ??= []).push(o.id);
      if (!knows(w, o, f) && !d.carry?.includes(f.id)) (d.carry ??= []).push(f.id);
    }
  }
  // 맞닿은 국경 (한 해에 한 번씩 살핀다)
  for (const f of alive) {
    if (w.t % 12 !== f.id % 12) continue;
    for (const sid of f.settlements) {
      const s = w.settlements[sid];
      if (!s || !s.alive) continue;
      const L = w.layers[s.l];
      for (const k of s.tiles) {
        const x = k % L.w, y = (k - x) / L.w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
          const o = w.factions[L.owner[ny * L.w + nx]];
          if (!o || o === f || !o.alive || !o.known || knows(w, f, o)) continue;
          learn(w, f, o); learn(w, o, f);
          addNews(w, `${yearOf(w)}년, 국경이 맞닿았다. ${f.name}과(와) ${o.name}이(가) 처음으로 조우하였다.`, 3, 'politics', { pos: { l: s.l, x: nx, y: ny }, facs: [f.id, o.id] });
        }
      }
    }
  }
}
