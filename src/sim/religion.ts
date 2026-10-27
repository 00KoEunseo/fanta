// 종교: 세상은 신앙 없이 시작한다.
// 천사를 만난 이들이 하늘을 섬기기 시작하거나, 무너진 신전을 다시 세운 땅에서 신앙심 깊은 이가 가르침을 연다.
// 교리는 창시자의 성정을 닮는다. 신앙은 고을에서 고을로 번지고, 백성 다수가 믿으면 나라의 국교가 된다.
// 같은 신앙의 사람들은 성지로 순례를 가고, 신전에는 신관이, 교단에는 대신관이 선다.
// 성전의 교리를 가진 나라는 이교도를 칠 명분을 얻고, 성지를 빼앗기면 원한을 품는다.
import { RACES } from '../data/races';
import { COMPASSION, COURAGE, CURIOSITY, FAITH, GREED, LOYALTY, PRIDE, PRUDENCE } from '../data/traits';
import { FOOD, GOLD, STONE } from '../data/terrain';
import type { Character, Faction, Settlement, Site, World } from './state';
import { dist } from './state';
import { addNews, charLog } from './news';
import { clamp, isAdult, settlementsOf } from './helpers';
import { knows } from './contact';
import { aggrieve } from './factions';

export type Tenet = 'mercy' | 'holywar' | 'wealth' | 'temperance' | 'obedience' | 'wisdom' | 'blood';
export const TENET_NAME: Record<Tenet, string> = {
  mercy: '자비', holywar: '성전', wealth: '번영', temperance: '절제', obedience: '순종', wisdom: '깨달음', blood: '피의 맹약',
};
export const TENET_DESC: Record<Tenet, string> = {
  mercy: '약한 이를 거두라. 고을이 평안해지고 싸움을 꺼린다',
  holywar: '이교도를 벌하라. 다른 신앙의 나라를 칠 명분이 된다',
  wealth: '부는 신의 축복이다. 신전에 금이 모인다',
  temperance: '덜 먹고 덜 가져라. 흉년을 잘 견딘다',
  obedience: '왕과 신관을 따르라. 군주의 정통성이 굳건해진다',
  wisdom: '배움이 곧 기도다. 학자와 마법사가 우대받는다',
  blood: '피로 맺은 맹세. 싸움을 두려워하지 않는다',
};

export interface Religion {
  id: number;
  name: string;
  deity: string;
  founder: number;
  founderName: string;
  t: number;
  tenets: Tenet[];
  /** 성지 (다시 세운 신전, -1: 아직 없음) */
  holy: number;
  /** 교단의 수장 (대신관) */
  head: number;
  origin: 'angel' | 'temple';
  alive: boolean;
}

/** 다시 세운 신전 */
export interface Temple { faith: number; keeper: number; t: number }

const DEITY_LIGHT = ['새벽의 주', '일곱 별의 여신', '은빛 날개의 주인', '첫 불꽃', '고요한 샘의 어머니', '천칭을 든 이'];
const DEITY_DARK = ['피의 군주', '굶주린 달', '이름 없는 심연', '잿빛 왕관', '뒤틀린 뿌리'];
const DEITY_NEUTRAL = ['대지의 숨결', '산의 노인', '바람의 길손', '깊은 물의 뱀', '돌의 아버지'];
const ORDER = ['가르침', '교단', '성좌회', '맹약', '길'];

/** 빛과 어둠은 서로의 신앙을 받아들이지 않는다 (0: 받아들이지 않음, 1: 거리낌 없음) */
function welcome(w: World, s: Settlement, r: Religion): number {
  const al = RACES[s.race].align;
  const dark = r.tenets.includes('blood') || (r.origin === 'temple' && RACES[w.chars[r.founder]?.race ?? 'human'].align === 'dark');
  const light = r.origin === 'angel' || (r.origin === 'temple' && RACES[w.chars[r.founder]?.race ?? 'human'].align === 'light');
  if (al === 'dark' && light) return 0;
  if (al === 'light' && dark) return 0;
  return 1;
}

const rel = (w: World, id: number | undefined) => (id === undefined ? undefined : w.religions?.[id]);
export const faithOf = (w: World, id: number | undefined): Religion | undefined => { const r = rel(w, id); return r && r.alive ? r : undefined; };

/** 창시자의 성정을 닮은 교리 두세 가지 */
function tenetsOf(c: Character): Tenet[] {
  const t = c.traits;
  const score: [Tenet, number][] = [
    ['mercy', t[COMPASSION]], ['holywar', (t[COURAGE] + t[PRIDE]) / 2], ['wealth', t[GREED]], ['temperance', t[PRUDENCE]],
    ['obedience', t[LOYALTY]], ['wisdom', t[CURIOSITY]],
  ];
  if (RACES[c.race].align === 'dark') score.push(['blood', 60 + (100 - t[COMPASSION]) / 2]);
  score.sort((a, b) => b[1] - a[1]);
  return score.slice(0, score[2][1] > 65 ? 3 : 2).map(s => s[0]);
}

function newReligion(w: World, founder: Character, origin: Religion['origin'], deity?: string): Religion {
  const rng = w.rngSim;
  const al = RACES[founder.race].align;
  const god = deity ?? rng.pick(al === 'dark' ? DEITY_DARK : al === 'light' ? DEITY_LIGHT : DEITY_NEUTRAL);
  w.religions ??= [];
  const used = new Set(w.religions.map(r => r.name));
  // '열두 날개의 하늘의 길'처럼 '의'가 겹치지 않게
  const mk = () => god.includes('의 ') ? `${god} ${rng.pick(['교단', '성좌회'])}` : `${god}의 ${rng.pick(ORDER)}`;
  let name = mk();
  for (let i = 0; used.has(name) && i < 8; i++) name = mk();
  const r: Religion = { id: w.religions.length, name, deity: god, founder: founder.id, founderName: founder.name, t: w.t, tenets: tenetsOf(founder), holy: -1, head: founder.id, origin, alive: true };
  w.religions.push(r);
  founder.faith = r.id;
  founder.fame += 20;
  charLog(w, founder, `${r.name}을(를) 열었다. ${r.tenets.map(x => TENET_NAME[x]).join('·')}을(를) 가르쳤다.`, 4);
  return r;
}

/** 이 나라에서 가르침을 열 만한 신앙심 깊은 이 */
function prophet(w: World, f: Faction): Character | undefined {
  return w.chars.filter(c => c.died < 0 && c.faction === f.id && isAdult(w, c) && c.traits[FAITH] >= 60 && c.role !== '노예' && c.race !== 'dragon' && !c.isPlayer)
    .sort((a, b) => (b.traits[FAITH] + (b.role === '성직자' ? 30 : 0) + b.stats.charisma) - (a.traits[FAITH] + (a.role === '성직자' ? 30 : 0) + a.stats.charisma))[0];
}

const siteOwner = (w: World, s: Site) => { const L = w.layers[s.l]; return w.factions[L.owner[s.y * L.w + s.x]]; };

/** 매달: 신전 복구, 천사의 가르침, 전파, 국교, 성직, 성지 */
export function religionMonth(w: World): void {
  w.religions ??= [];
  const rng = w.rngSim;
  // ── 무너진 신전을 다시 세운다 (제 땅 안에 있고, 돌과 금이 있을 때)
  for (const s of w.sites) {
    if (s.kind !== 'shrine' || s.temple || w.t % 12 !== s.id % 12) continue;
    const f = siteOwner(w, s);
    if (!f || !f.alive || !f.known || RACES[f.race].noPop) continue;
    const cap = w.settlements[f.capital];
    if (!cap || cap.stock[STONE] < 60 || cap.stock[GOLD] < 40 || !rng.chance(0.25)) continue;
    let faith = faithOf(w, f.faith);
    let founded = false;
    if (!faith) {
      const p = prophet(w, f);
      if (!p) continue;
      faith = newReligion(w, p, 'temple');
      founded = true;
    }
    cap.stock[STONE] -= 60; cap.stock[GOLD] -= 40;
    s.temple = { faith: faith.id, keeper: -1, t: w.t };
    if (faith.holy < 0) faith.holy = s.id;
    if (founded) {
      f.faith = faith.id;
      addNews(w, `${f.name}이(가) 무너진 ${s.name}을(를) 다시 세웠다. ${w.chars[faith.founder].name}이(가) 그곳에서 '${faith.deity}'을(를) 섬기는 ${faith.name}을(를) 열었다. 교리는 ${faith.tenets.map(x => TENET_NAME[x]).join('·')}이다.`, 4, 'hero', { pos: s, facs: [f.id], chars: [faith.founder] });
    } else addNews(w, `${f.name}이(가) 무너진 ${s.name}을(를) 다시 세워 ${faith.name}에 바쳤다.`, 3, 'growth', { pos: s, facs: [f.id] });
  }
  // ── 천사를 만난 이들: 하늘을 섬기기 시작한다
  for (const f of w.factions) {
    if (!f.alive || f.faith !== undefined || !f.known || RACES[f.race].align === 'dark' || f.race === 'angel' || w.t % 12 !== (f.id + 3) % 12) continue;
    const angels = w.factions.find(o => o.alive && o.race === 'angel' && knows(w, f, o));
    if (!angels || !rng.chance(0.15)) continue;
    let heaven = w.religions.find(r => r.alive && r.origin === 'angel');
    if (!heaven) {
      const ang = w.chars[angels.leader];
      if (!ang || ang.died >= 0) continue;
      heaven = newReligion(w, ang, 'angel', '열두 날개의 하늘');
      addNews(w, `${f.name}의 사람들이 천사들의 모습을 보고 무릎을 꿇었다. '${heaven.deity}'을(를) 섬기는 ${heaven.name}이(가) 땅에 내려왔다.`, 4, 'hero', { facs: [f.id, angels.id] });
    } else addNews(w, `${f.name}이(가) 천사들을 만나고 ${heaven.name}을(를) 받아들였다.`, 3, 'hero', { facs: [f.id, angels.id] });
    f.faith = heaven.id;
    const cap = w.settlements[f.capital];
    if (cap) cap.faith = heaven.id;
  }
  // ── 나라의 국교가 있으면 수도에 새 신전을 세우기도 한다
  for (const f of w.factions) {
    const faith = faithOf(w, f.faith);
    if (!f.alive || !faith || f.tier < 2 || w.t % 12 !== (f.id + 9) % 12 || !rng.chance(1 / 25)) continue;
    const cap = w.settlements[f.capital];
    if (!cap || cap.stock[GOLD] < 120 || cap.stock[STONE] < 80) continue;
    if (w.sites.some(s => s.temple?.faith === faith.id && siteOwner(w, s) === f)) continue;
    cap.stock[GOLD] -= 120; cap.stock[STONE] -= 80;
    const site: Site = { id: w.sites.length, l: cap.l, x: cap.x, y: cap.y, kind: 'shrine', name: `${cap.name} 대신전`, level: 1, loot: 0, relic: null, temple: { faith: faith.id, keeper: -1, t: w.t } };
    w.sites.push(site);
    if (faith.holy < 0) faith.holy = site.id;
    addNews(w, `${f.name}이(가) 수도 ${cap.name}에 ${faith.name}의 대신전을 세웠다.`, 3, 'growth', { pos: cap, facs: [f.id] });
  }
  if (!w.religions.some(r => r.alive)) return;
  // ── 전파: 고을의 신앙이 이웃으로 번진다 (해마다, 고을마다 다른 달에)
  const temples = w.sites.filter(s => s.temple);
  for (const s of w.settlements) {
    if (!s.alive || RACES[s.race].noPop || w.t % 12 !== s.id % 12) continue;
    const f = w.factions[s.faction];
    const pressure = new Map<number, number>();
    const add = (id: number | undefined, v: number, forced = false) => {
      const r = faithOf(w, id);
      if (!r) return;
      // 이웃이나 신전을 통해서는 반대쪽 신앙이 번지지 않는다. 나라가 국교로 강요할 때만 아주 느리게
      const k = forced ? Math.max(welcome(w, s, r), 0.1) : welcome(w, s, r);
      if (k > 0) pressure.set(id!, (pressure.get(id!) ?? 0) + v * k);
    };
    add(f?.faith, 0.12, true);
    for (const o of w.settlements) {
      if (o === s || !o.alive || o.l !== s.l || o.faith === undefined || dist(o, s) > 15) continue;
      const same = o.faction === s.faction;
      if (!same && !(f && knows(w, f, o.faction))) continue;
      add(o.faith, same ? 0.05 : 0.02);
    }
    for (const t of temples) if (t.l === s.l && dist(t, s) <= 10) add(t.temple!.faith, 0.1);
    const best = [...pressure].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[0] === s.faith) continue;
    // 이미 믿는 신앙이 있으면 잘 바뀌지 않는다
    const p = best[1] * (s.faith === undefined ? 1 : 0.3);
    if (rng.chance(Math.min(0.6, p))) s.faith = best[0];
  }
  // ── 국교: 백성 절반 이상이 믿는 신앙
  for (const f of w.factions) {
    if (!f.alive || w.t % 12 !== (f.id + 5) % 12) continue;
    const ss = settlementsOf(w, f);
    const total = ss.reduce((a, s) => a + s.pop, 0);
    if (!total) continue;
    const share = new Map<number, number>();
    for (const s of ss) if (faithOf(w, s.faith)) share.set(s.faith!, (share.get(s.faith!) ?? 0) + s.pop);
    const top = [...share].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / total >= 0.5 && top[0] !== f.faith) {
      const r = w.religions[top[0]];
      f.faith = top[0];
      addNews(w, `${f.name}이(가) ${r.name}을(를) 국교로 삼았다.`, 3, 'politics', { facs: [f.id] });
    }
    // 교리의 축복
    const faith = faithOf(w, f.faith);
    if (!faith) continue;
    for (const s of ss) {
      if (s.faith !== faith.id) continue;
      if (faith.tenets.includes('mercy')) s.stability = clamp(s.stability + 2);
      if (faith.tenets.includes('wealth')) s.stock[GOLD] += s.pop / 400;
      if (faith.tenets.includes('temperance') && f.flags.includes('food_crisis')) s.stock[FOOD] += s.pop * 0.02;
    }
    if (faith.tenets.includes('obedience')) f.legitimacy = clamp(f.legitimacy + 2);
  }
  // ── 사람의 신앙: 고향 고을의 신앙을 따른다 (믿음이 옅은 이는 쉽게 바꾼다)
  for (const c of w.chars) {
    if (c.died >= 0 || c.race === 'dragon' || w.t % 12 !== c.id % 12) continue;
    const home = w.settlements[c.home];
    const hf = home?.faith;
    if (hf === undefined || hf === c.faith || !faithOf(w, hf)) continue;
    const r = faithOf(w, hf)!;
    const ok = home ? welcome(w, { ...home, race: c.race } as Settlement, r) : 1;
    if (c.faith === undefined ? rng.chance(0.5 * ok) : c.traits[FAITH] < 40 && rng.chance(0.2 * ok)) c.faith = hf;
  }
  // ── 성직: 신전마다 신관, 교단마다 대신관 (해마다 1월)
  if (w.t % 12 === 0) for (const r of w.religions) {
    if (!r.alive) continue;
    const clergy = w.chars.filter(c => c.died < 0 && c.faith === r.id && c.role === '성직자' && isAdult(w, c) && !c.isPlayer);
    const worth = (c: Character) => c.traits[FAITH] + c.stats.charisma + c.fame * 0.2;
    const head = w.chars[r.head];
    if (!head || head.died >= 0 || head.faith !== r.id) {
      const nh = clergy.sort((a, b) => worth(b) - worth(a))[0];
      if (nh) {
        r.head = nh.id;
        nh.fame += 15;
        charLog(w, nh, `${r.name}의 대신관이 되었다.`, 4);
        addNews(w, `${nh.name}이(가) ${r.name}의 대신관이 되었다.`, 3, 'politics', { pos: nh, chars: [nh.id] });
      } else r.head = -1;
    }
    for (const t of temples) {
      if (t.temple!.faith !== r.id) continue;
      const k = w.chars[t.temple!.keeper];
      if (k && k.died < 0 && k.faith === r.id) continue;
      const nk = clergy.filter(c => c.id !== r.head && c.l === t.l && dist(c, t) <= 25).sort((a, b) => worth(b) - worth(a))[0];
      t.temple!.keeper = nk ? nk.id : -1;
      if (nk) { nk.fame += 6; charLog(w, nk, `${t.name}의 신관이 되었다.`, 3); }
    }
    // 믿는 이가 모두 사라진 신앙은 잊힌다
    if (!w.settlements.some(s => s.alive && s.faith === r.id) && !w.chars.some(c => c.died < 0 && c.faith === r.id)) {
      r.alive = false;
      addNews(w, `${r.name}을(를) 믿는 이가 더는 남지 않았다. '${r.deity}'의 이름은 잊혔다.`, 3, 'politics');
    }
  }
  // ── 성지를 빼앗겼다: 그 신앙의 나라들이 원한을 품는다
  if (w.t % 12 === 6) for (const r of w.religions) {
    const hs = w.sites[r.holy];
    if (!r.alive || !hs) continue;
    const owner = siteOwner(w, hs);
    if (!owner || !owner.alive || owner.faith === r.id) continue;
    for (const f of w.factions) if (f.alive && f.faith === r.id && knows(w, f, owner)) aggrieve(w, f, owner, `성지 ${hs.name}을(를) 이교도에게 빼앗긴 일`);
  }
}

/** 신앙이 전쟁에 미치는 무게: 같은 신앙끼리는 덜 싸우고, 성전의 교리는 이교도를 노린다 */
export function faithWarFactor(w: World, a: Faction, b: Faction): number {
  const fa = faithOf(w, a.faith), fb = faithOf(w, b.faith);
  if (!fa) return 1;
  let k = 1;
  if (fb && fa.id === fb.id) k *= 0.6;
  else if (fa.tenets.includes('holywar')) k *= 1.6;
  if (fa.tenets.includes('mercy')) k *= 0.8;
  if (fa.tenets.includes('blood')) k *= 1.3;
  return k;
}

/** 신앙에서 나온 전쟁의 명분 (없으면 빈 배열) */
export function faithWarReasons(w: World, a: Faction, b: Faction): string[] {
  const fa = faithOf(w, a.faith), fb = faithOf(w, b.faith);
  if (!fa || fa.id === fb?.id || !fa.tenets.includes('holywar')) return [];
  const head = w.chars[fa.head];
  return [
    `${fa.name}의 ${head && head.died < 0 ? `대신관 ${head.name}` : '사제들'}이(가) ${fb ? `${fb.name}을(를) 섬기는 이교도` : '신을 모르는 자들'}을(를) 벌하라고 외쳤다.`,
    `'${fa.deity}'의 이름으로 성전이 선포되었다.`,
  ];
}

/** 순례지: 그 사람의 신앙의 성지 (다시 세운 신전, 갈 수 있는 층에 있고 그 땅의 주인을 아는 곳) */
export function pilgrimSite(w: World, c: Character, f: Faction | undefined): Site | undefined {
  const r = faithOf(w, c.faith);
  if (!r) return undefined;
  const cands = w.sites.filter(s => s.temple?.faith === r.id);
  const reachable = cands.filter(s => { const o = siteOwner(w, s); return !o || o.id === c.faction || knows(w, f, o); });
  const holy = reachable.find(s => s.id === r.holy);
  return holy ?? reachable.sort((a, b) => (a.l === c.l ? dist(a, c) : 999) - (b.l === c.l ? dist(b, c) : 999))[0];
}

/** 신관·대신관 칭호 (없으면 null) */
export function clergyTitle(w: World, c: Character): string | null {
  const r = faithOf(w, c.faith);
  if (!r) return null;
  if (r.head === c.id) return '대신관';
  if (w.sites.some(s => s.temple?.keeper === c.id)) return '신관';
  return null;
}

/** 순례자가 성지에 닿았다 */
export function onPilgrimArrive(w: World, c: Character, s: Settlement | Site | undefined): void {
  const r = faithOf(w, c.faith);
  if (!r) return;
  c.traits[FAITH] = clamp(c.traits[FAITH] + 3);
  charLog(w, c, `${r.name}의 성지에서 '${r.deity}'께 기도를 올렸다.`, 2);
  void s;
}
