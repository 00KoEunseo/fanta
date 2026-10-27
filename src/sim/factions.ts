import { caravanMaster, sendCaravan } from './caravan';
import { borderFriction, clearWar, frictionReasons, negotiate, setTransfer } from './warfare';
import { demonsServing } from './demons';
import { CAMP_MAX, ensureCamp, sendToCamp } from './camps';
import { faithWarFactor, faithWarReasons } from './religion';
import { inheritKnown, knownYears, knows } from './contact';
import { RACES, raceAffinity, type RaceKey } from '../data/races';
import { markPeril } from './peril';
import { seaRoute, seaThreatNear } from './sea';
import { findPath } from './path';
import { FOOD, GOLD, MANA, ORE, RES_COUNT, RES_NAMES, STONE, WOOD } from '../data/terrain';
import { makeClanName } from '../data/names';
import {
  AMBITION, APT_KING, APT_TRAITOR, COMPASSION, COURAGE, LOYALTY, PRIDE, PRUDENCE, SOCIAL,
} from '../data/traits';
import { EPITHETS } from '../data/names';
import { addNews, charLog } from './news';
import type { Character, Faction, Settlement, World } from './state';
import { ageOf } from './state';
import {
  addFacRel, addRel, aliveFactions, approxDist, atWar, charLabel, clamp, facRel, factionDistance, isAdult, leaderOf,
  rel, settlementsOf,
} from './helpers';
import { awaken, createCharacter, killChar, relocate, setPos } from './characters';
import { findColonySite, capacity, hasFlag } from './settlements';
import { raiseArmy } from './military';
import { borderNeighbors, updatePosture } from './territory';
import { crownHouse, ensureHouse } from './houses';
import { knowsDL } from './crusade';

export function factionColor(id: number): string {
  const h = (id * 137.508 + 20) % 360;
  const l = 52 + ((id * 7) % 3) * 8;
  return `hsl(${h.toFixed(0)}, 72%, ${l}%)`;
}

export function createFaction(w: World, race: RaceKey, baseName: string, tier = 0): Faction {
  const f: Faction = {
    id: w.factions.length, name: '', baseName, race, color: factionColor(w.factions.length), tier,
    leader: -1, capital: -1, alive: true, founded: w.t, fell: -1,
    relations: {}, wars: {}, truce: {}, posture: {}, treaties: [], flags: [], legitimacy: 60, warWeariness: 0,
    pop: 0, settlements: [], avgDev: 0, military: 0, dynasty: makeClanName(w.rngSim, race), rulers: [],
  };
  f.name = factionName(f);
  // 새 세계(또는 조우를 쓰는 세계)의 세력은 아무도 모른 채로 태어난다
  if (w.factions.length === 0 || w.factions.some(o => o.known)) { f.known = {}; f.realms = []; }
  w.factions.push(f);
  for (const o of w.factions) {
    if (o === f) continue;
    const base = raceAffinity(race, o.race);
    f.relations[o.id] = base;
    o.relations[f.id] = base;
  }
  return f;
}

export function factionName(f: Faction): string {
  return RACES[f.race].factionPatterns[f.tier].replace('{X}', f.baseName);
}

export function aggregate(w: World, f: Faction): void {
  f.settlements = f.settlements.filter(id => w.settlements[id]?.alive && w.settlements[id].faction === f.id);
  const ss = settlementsOf(w, f);
  let pop = 0, dev = 0, mil = 0;
  for (const s of ss) {
    pop += s.pop; dev += s.dev * s.pop;
    const R = RACES[s.race];
    mil += s.pop * 0.12 * R.might * (1 + Math.min(0.4, s.stock[ORE] / (s.pop + 1)));
  }
  let bonus = 1;
  if (f.flags.includes('knights')) bonus += 0.2;
  if (f.flags.includes('ancient_magic')) bonus += 0.25;
  if (hasFlag(f, 'waaagh', w.t)) bonus += 0.3;
  if (f.flags.some(x => x.startsWith('patron:'))) bonus += 0.4;
  if (w.demonLord >= 0 && w.chars[w.demonLord]?.faction === f.id) bonus += 0.5 + Math.min(0.5, demonsServing(w, w.demonLord) * 0.06);
  f.pop = pop;
  f.avgDev = pop > 0 ? dev / pop : 0;
  f.military = mil * bonus;
  if (!f.settlements.includes(f.capital)) {
    const best = ss.sort((a, b) => b.pop - a.pop)[0];
    f.capital = best ? best.id : -1;
  }
}

export function leaderScore(w: World, c: Character): number {
  const age = ageOf(w, c);
  const adult = RACES[c.race].adult;
  return c.stats.charisma * 0.8 + c.stats.command * 0.6 + c.fame * 0.4 + c.honor * 0.15 + c.apt[APT_KING] * 0.3
    + (age >= adult ? 20 : -40) + (c.stats.health < 30 ? -20 : 0);
}

/** 즉위 처리 (공통) */
export function crown(w: World, f: Faction, c: Character, how: string): void {
  const last = f.rulers[f.rulers.length - 1];
  if (last && last.to < 0) last.to = w.t;
  const prev = w.chars[f.leader];
  f.leader = c.id;
  f.rulers.push({ id: c.id, from: w.t, to: -1, how });
  if (c.faction !== f.id) c.faction = f.id;
  for (const s of w.settlements) if (s.governor === c.id) s.governor = -1;
  if (f.capital >= 0) { c.home = f.capital; relocate(w, c, w.settlements[f.capital]); }
  c.rank = 3;
  c.fame += 15 + f.tier * 12;
  c.plot = 0;
  const isKin = prev && (prev.children.includes(c.id) || c.father === prev.id || c.mother === prev.id || prev.spouse === c.id);
  if (!isKin && how !== '건국') {
    const old = f.dynasty;
    f.dynasty = makeClanName(w.rngSim, c.race);
    if (prev) addNews(w, `${old} 왕조가 끝나고 ${f.name}에 ${f.dynasty} 왕조가 열렸다.`, f.tier >= 2 ? 3 : 2, 'politics', { facs: [f.id], chars: [c.id] });
  }
  if (c.apt[APT_KING] >= 65) awaken(w, c, 'king', '군주의 자리에 오르며');
  crownHouse(w, f, c);
}

// ───────────── 계승

export function succession(w: World, f: Faction): void {
  const rng = w.rngSim;
  const old = w.chars[f.leader];
  const members = w.chars.filter(c => c.died < 0 && c.faction === f.id && c.race !== 'dragon' && c.role !== '노예');
  if (!members.length) {
    // 아무도 없으면 백성 중에서 지도자가 나온다
    const cap = w.settlements[f.capital];
    if (!cap) return;
    const R = RACES[f.race];
    const nc = createCharacter(w, { race: cap.race, faction: f.id, home: cap.id, pos: cap, born: w.t - (R.adult + rng.int(5, 20)) * 12 });
    nc.role = '전사'; nc.title = 'adult';
    nc.stats.charisma = clamp(nc.stats.charisma + 15);
    crown(w, f, nc, '추대');
    charLog(w, nc, `혼란에 빠진 ${f.name}의 백성들이 이름 없는 ${nc.name}을(를) 지도자로 추대하였다.`, 3);
    addNews(w, `지도자를 잃은 ${f.name}의 백성들이 ${nc.name}을(를) 새 ${RACES[f.race].titles[f.tier]}(으)로 추대하였다.`, 3, 'politics', { facs: [f.id], chars: [nc.id], pos: cap });
    return;
  }
  const heirs = old ? old.children.map(id => w.chars[id]).filter(k => k && k.died < 0 && k.faction === f.id) : [];
  heirs.sort((a, b) => a.born - b.born);
  const title = RACES[f.race].titles[f.tier];
  if (f.tier >= 1 && heirs.length) {
    const heir = heirs.find(h => isAdult(w, h)) ?? heirs[0];
    const rivals = members.filter(m => m.id !== heir.id && isAdult(w, m) && m.traits[AMBITION] > 65 && !heirs.includes(m) && !m.isPlayer && m.role !== '노예');
    rivals.sort((a, b) => leaderScore(w, b) - leaderScore(w, a));
    const rival = rivals[0];
    if (rival && leaderScore(w, rival) > leaderScore(w, heir) * 1.25 && rng.chance(0.45) && f.settlements.length >= 2) {
      crown(w, f, heir, '세습');
      addNews(w, `${f.name}의 왕좌를 두고 ${heir.name}과(와) ${rival.name} 사이에 계승 전쟁이 벌어졌다.`, 4, 'politics', { facs: [f.id], chars: [heir.id, rival.id] });
      splitFaction(w, f, rival, '계승 전쟁');
      return;
    }
    crown(w, f, heir, '세습');
    const minor = !isAdult(w, heir);
    if (minor) f.legitimacy = clamp(f.legitimacy - 15);
    addNews(w, minor
      ? `어린 ${heir.name}이(가) ${ageOf(w, heir)}세의 나이로 ${f.name}의 ${title} 자리를 물려받았다. 섭정을 둘러싼 암투가 시작되었다.`
      : `${heir.name}이(가) 부모의 뒤를 이어 ${f.name}의 ${title} 자리에 올랐다.`, f.tier >= 2 ? 3 : 2, 'politics', { facs: [f.id], chars: [heir.id] });
    charLog(w, heir, `${f.name}의 ${title} 자리를 계승하였다.`, 4);
    return;
  }
  // 선출 / 추대
  const adults = members.filter(m => isAdult(w, m));
  const pool = adults.length ? adults : members;
  const hp = (c: Character) => { const h = w.houses[c.house ?? -1]; return h && h.alive && h.head === c.id ? h.prestige * 0.15 : 0; };
  pool.sort((a, b) => leaderScore(w, b) + hp(b) - leaderScore(w, a) - hp(a));
  const pick = rng.chance(0.75) ? pool[0] : pool[Math.min(pool.length - 1, 1)];
  crown(w, f, pick, '추대');
  const how = pick.traits[SOCIAL] > 60 ? '원로들의 추대를 받아' : pick.stats.might > 60 ? '힘으로 경쟁자들을 굴복시키고' : '여러 씨족의 합의로';
  addNews(w, `${pick.name}이(가) ${how} ${f.name}의 새 ${title}이(가) 되었다.`, f.tier >= 2 ? 3 : 2, 'politics', { facs: [f.id], chars: [pick.id] });
  charLog(w, pick, `${how} ${f.name}의 ${title}이(가) 되었다.`, 4);
}

/** 반란 세력이 정착지 일부를 들고 독립한다 */
export function splitFaction(w: World, f: Faction, rebel: Character, why: string): Faction | null {
  const rng = w.rngSim;
  const ss = settlementsOf(w, f).filter(s => s.id !== f.capital);
  if (!ss.length) return null;
  // 반란자에게 우호적인 영주의 정착지, 혹은 무작위
  const take = ss.filter(s => {
    const g = w.chars[s.governor];
    return (g && g.died < 0 && rel(g, rebel.id) > rel(g, f.leader)) || g === rebel || rng.chance(0.3);
  });
  if (!take.length) take.push(rng.pick(ss));
  const seat = take.find(s => s.governor === rebel.id) ?? take.sort((a, b) => b.pop - a.pop)[0];
  const nf = createFaction(w, f.race, seat.name, Math.max(0, Math.min(f.tier, take.length >= 3 ? 2 : 1)));
  nf.legitimacy = 40;
  inheritKnown(w, nf, f);
  for (const s of take) transferSettlement(w, s, nf);
  nf.capital = seat.id;
  // 반란자 편에 선 인물들
  rebel.faction = nf.id;
  rebel.home = seat.id;
  for (const c of w.chars) {
    if (c.died >= 0 || c.faction !== f.id || c.id === rebel.id) continue;
    if (take.some(s => s.id === c.home) && rel(c, rebel.id) >= rel(c, f.leader)) c.faction = nf.id;
  }
  crown(w, nf, rebel, why);
  nf.relations[f.id] = -60; f.relations[nf.id] = -60;
  declareWar(w, nf, f, true);
  addNews(w, `${rebel.name}이(가) ${take.length}개 정착지를 이끌고 ${f.name}에서 떨어져 나와 ${nf.name}을(를) 세웠다.`, 4, 'politics', { facs: [f.id, nf.id], chars: [rebel.id], pos: seat });
  return nf;
}

export function transferSettlement(w: World, s: Settlement, to: Faction): void {
  const from = w.factions[s.faction];
  if (from) {
    from.settlements = from.settlements.filter(id => id !== s.id);
    if (from.capital === s.id) from.capital = -1;
  }
  s.faction = to.id;
  if (!to.settlements.includes(s.id)) to.settlements.push(s.id);
  s.governor = -1;
  w.territoryDirty = true;
}

// ───────────── 반역 / 독립

export function attemptCoup(w: World, c: Character): void {
  const rng = w.rngSim;
  const f = w.factions[c.faction];
  c.plot = 0;
  if (!f || !f.alive) return;
  const ld = leaderOf(w, f);
  if (!ld || ld.id === c.id) return;
  const members = w.chars.filter(m => m.died < 0 && m.faction === f.id && m.id !== c.id && m.id !== ld.id);
  const sup = members.filter(m => rel(m, c.id) > 25 && rel(m, c.id) > rel(m, ld.id)).length;
  const loy = members.filter(m => rel(m, ld.id) > 25).length;
  const pc = c.stats.command + c.fame * 0.5 + sup * 12 + c.wealth / 25 + c.stats.might * 0.3;
  // 마왕에게 칼을 겨누는 것은 죽음을 각오한 일이다
  const pl = (ld.stats.command + ld.fame * 0.3 + f.legitimacy * 0.8 + loy * 8) * (w.demonLord === ld.id ? 4 : 1);
  const p = pc / (pc + pl);
  const title = RACES[f.race].titles[f.tier];
  if (c.apt[APT_TRAITOR] >= 60) awaken(w, c, 'traitor', '');
  if (rng.chance(p)) {
    const killed = rng.chance(0.6) || ld.traits[PRIDE] > 70;
    if (killed) killChar(w, ld, '반란군의 칼날', c);
    else {
      ld.faction = -1; ld.home = -1;
      charLog(w, ld, '왕좌에서 쫓겨나 망명길에 올랐다.', 4);
    }
    crown(w, f, c, '찬탈');
    if (!c.epithet) c.epithet = EPITHETS.usurper;
    f.legitimacy = 25;
    addNews(w, `${c.name}이(가) 반란을 일으켜 ${title} ${ld.name}을(를) ${killed ? '시해하고' : '몰아내고'} ${f.name}의 왕좌를 차지하였다.`, 4, 'politics', { facs: [f.id], chars: [c.id, ld.id] });
    charLog(w, c, `반란에 성공하여 ${f.name}의 ${RACES[f.race].titles[f.tier]}이(가) 되었다.`, 5);
  } else {
    addRel(w, ld, c, -80);
    const gov = w.settlements.find(s => s.alive && s.governor === c.id);
    if (gov && rng.chance(0.4) && f.settlements.length >= 2) {
      addNews(w, `${c.name}의 반역 음모가 발각되자, 그는 ${gov.name}에서 독립을 선언하였다.`, 3, 'politics', { facs: [f.id], chars: [c.id] });
      secede(w, c, gov);
    } else if (rng.chance(0.7)) {
      addNews(w, `${f.name}에서 ${c.name}의 반역 음모가 발각되었다. ${title} ${ld.name}은(는) 그를 처형하였다.`, 3, 'politics', { facs: [f.id], chars: [c.id, ld.id] });
      killChar(w, c, '반역죄로 처형', ld);
    } else {
      c.faction = -1; c.home = -1;
      addNews(w, `${f.name}에서 반역을 꾀하던 ${c.name}이(가) 국외로 달아났다.`, 2, 'politics', { facs: [f.id], chars: [c.id] });
      charLog(w, c, '반역이 들통나 고향을 등지고 도망쳤다.', 4);
    }
  }
}

export function secede(w: World, c: Character, s: Settlement): Faction {
  const f = w.factions[s.faction];
  const nf = createFaction(w, s.race, s.name, 1);
  inheritKnown(w, nf, f);
  transferSettlement(w, s, nf);
  nf.capital = s.id;
  c.faction = nf.id; c.home = s.id;
  crown(w, nf, c, '독립');
  nf.legitimacy = 45;
  if (f) {
    nf.relations[f.id] = -50; f.relations[nf.id] = -50;
    const ld = leaderOf(w, f);
    if (ld && (ld.traits[PRIDE] > 50 || ld.traits[COMPASSION] < 40)) declareWar(w, f, nf, true);
  }
  addNews(w, `${s.name}의 영주 ${c.name}이(가) ${f ? f.name + '으로부터 ' : ''}독립하여 ${nf.name}을(를) 선포하였다.`, 3, 'politics', { facs: [nf.id, ...(f ? [f.id] : [])], chars: [c.id], pos: s });
  return nf;
}

// ───────────── 국가 승격 (즉위 서사)

export function tierRequirement(w: World, f: Faction): boolean {
  const n = f.settlements.length;
  switch (f.tier) {
    case 0: return n >= 2 || f.pop >= 380;
    case 1: return n >= 3 && f.pop >= 1400 && f.avgDev >= 14;
    case 2: return n >= 7 && f.pop >= 5000 && f.avgDev >= 33 && f.legitimacy >= 50;
    default: return false;
  }
}

export function pTierUp(w: World, f: Faction): number {
  if (RACES[f.race].noPop || f.tier >= 3 || !tierRequirement(w, f)) return 0;
  return 0.05;
}

export function tierUp(w: World, f: Faction): void {
  const rng = w.rngSim;
  const ld = leaderOf(w, f);
  if (!ld) return;
  const R = RACES[f.race];
  const newTier = f.tier + 1;
  const newTitle = R.titles[newTier];
  const oldName = f.name;
  // 경쟁자의 도전
  const rivals = w.chars.filter(m => m.died < 0 && m.faction === f.id && m.id !== ld.id && isAdult(w, m) && m.traits[AMBITION] > 60 && !m.isPlayer && m.role !== '노예');
  rivals.sort((a, b) => leaderScore(w, b) - leaderScore(w, a));
  const rival = rivals[0];
  let king = ld;
  let story: string;
  if (rival && leaderScore(w, rival) > leaderScore(w, ld) * 1.15 && rng.chance(0.5)) {
    const rp = leaderScore(w, rival) + rng.normal(0, 20), lp = leaderScore(w, ld) + f.legitimacy * 0.3 + rng.normal(0, 20);
    if (rp > lp) {
      king = rival;
      story = `${ld.name}이(가) 왕관을 쓰려 하자 ${rival.name}이(가) 반기를 들었다. 백성과 전사들은 ${rival.name}의 편에 섰고, ${rival.name}이(가) 초대 ${newTitle}(으)로 즉위하였다.`;
      if (rng.chance(0.5)) killChar(w, ld, '왕좌를 둘러싼 다툼', rival);
      else { ld.faction = -1; ld.home = -1; charLog(w, ld, '왕관을 빼앗기고 추방당하였다.', 4); }
    } else {
      story = `${rival.name}이(가) 왕관을 노리고 들고일어났으나 패하였다. ${ld.name}은(는) 반역자의 피 위에서 ${newTitle}의 관을 썼다.`;
      killChar(w, rival, '반역 실패 후 처형', ld);
    }
  } else {
    const t = ld.traits;
    if (t[PRIDE] > 70) story = `${ld.name}은(는) 누구의 허락도 구하지 않고 스스로 왕관을 썼다. 그리하여 ${newTitle}이(가) 되었다.`;
    else if (t[SOCIAL] > 65 || ld.stats.charisma > 65) story = `백성들의 환호 속에 ${ld.name}이(가) ${newTitle}(으)로 추대되었다.`;
    else if (ld.stats.might > 60 || t[COURAGE] > 70) story = `수많은 싸움에서 검으로 자신을 증명한 ${ld.name}이(가) 마침내 ${newTitle}의 자리에 올랐다.`;
    else if (ld.apt[APT_KING] > 60) story = `${ld.name}은(는) 흩어진 자들을 하나로 묶어 내어 ${newTitle}의 자리에 올랐다.`;
    else story = `${ld.name}이(가) 원로들의 동의를 얻어 ${newTitle}의 칭호를 받았다.`;
  }
  f.tier = newTier;
  f.name = factionName(f);
  if (king !== ld) crown(w, f, king, '즉위');
  else crownHouse(w, f, king);
  king.fame += 30;
  f.legitimacy = clamp(f.legitimacy + 15);
  const kind = newTier === 1 ? '세력을 넓혀' : newTier === 2 ? '왕국을 세웠다' : '제국을 선포하였다';
  addNews(w, `${oldName}이(가) ${newTier === 1 ? `${f.name}(으)로 거듭났다` : `${f.name}(으)로서 ${kind}`}. ${story}`, newTier >= 2 ? 4 : 3, 'politics',
    { facs: [f.id], chars: [king.id], pos: w.settlements[f.capital] });
  charLog(w, king, `${f.name}의 ${newTitle}(으)로 즉위하였다.`, 5);
  if (king.apt[APT_KING] >= 60) awaken(w, king, 'king', '왕관의 무게를 느끼며');
}

// ───────────── 외교 / 전쟁

/** 원한을 새긴다: 훗날 전쟁의 명분으로 꺼내 든다 */
export function aggrieve(w: World, victim: Faction | undefined, culprit: Faction | undefined, why: string): void {
  if (!victim || !culprit || victim === culprit || !victim.alive) return;
  victim.grievances ??= {};
  victim.grievances[culprit.id] = { t: w.t, why };
}

export function declareWar(w: World, a: Faction, b: Faction, silent = false): void {
  if (a.wars[b.id] !== undefined || a === b) return;
  if (!Object.keys(a.wars).length) a.warWeariness = 0;
  if (!Object.keys(b.wars).length) b.warWeariness = 0;
  a.wars[b.id] = w.t; b.wars[a.id] = w.t;
  a.treaties = a.treaties.filter(t => t.with !== b.id);
  b.treaties = b.treaties.filter(t => t.with !== a.id);
  addFacRel(w, a, b, -20);
  if (silent) return;
  const ld = leaderOf(w, a);
  const why = ld ? warReason(w, a, b, ld) : '';
  addNews(w, `${a.name}이(가) ${b.name}에 전쟁을 선포하였다. ${why}`, a.tier >= 2 || b.tier >= 2 ? 4 : 3, 'war', { facs: [a.id, b.id], chars: ld ? [ld.id] : [] });
}

/** 전쟁의 명분: 실제로 있었던 일(빼앗긴 고을, 약탈, 암살의 배후)을 먼저 꺼내고, 없으면 군주의 성정과 형편에서 찾는다.
 *  같은 군주가 늘 같은 말을 하지 않도록 말투를 돌려 쓴다 (난수를 쓰지 않고 날짜와 세력 번호로 고른다) */
function warReason(w: World, a: Faction, b: Faction, ld: Character): string {
  const t = ld.traits;
  const pick = (arr: string[]) => arr[(w.t + a.id * 7 + b.id * 13) % arr.length];
  if (w.demonLord === ld.id) return pick(['마왕은 모든 빛의 종족을 멸하라 명하였다.', '마왕의 군기가 다시 펄럭였다. 어둠은 쉬지 않는다.', `마왕 ${ld.name}은(는) 무릎 꿇지 않은 땅을 용서하지 않았다.`]);
  const g = a.grievances?.[b.id];
  if (g && w.t - g.t < 360) {
    const yrs = Math.floor((w.t - g.t) / 12);
    const when = yrs < 1 ? '얼마 전' : yrs < 3 ? '지난날' : `${yrs}년 전`;
    return pick([`${when} ${g.why}의 원한을 갚을 때가 왔다.`, `${ld.name}은(는) ${when} ${g.why}을(를) 잊지 않았다.`, `${g.why}의 기억이 아직 생생하였다. 복수의 북이 울렸다.`]);
  }
  // 해당하는 명분을 모두 모은 뒤 그중 하나를 고른다 (한 가지 명분이 모든 전쟁을 차지하지 않도록)
  const why: string[] = [...faithWarReasons(w, a, b), ...frictionReasons(w, a, b, isNeighbor(w, a, b))];
  if (a.flags.includes('food_crisis')) why.push(`굶주린 백성들이 ${b.name}의 곡창을 노렸다.`, '곳간이 비자 칼끝이 이웃의 들판을 향하였다.');
  if (Object.keys(b.wars).length >= 2) why.push(`사방에서 공격받는 ${b.name}을(를) 칠 절호의 기회라 여겼다.`, `${b.name}이(가) 여러 적과 싸우는 틈을 노렸다.`);
  if (t[PRIDE] > 70) why.push(`${ld.name}은(는) 모욕을 결코 잊지 않았다.`, `${b.name}의 사신이 무례하였다. ${ld.name}은(는) 그 자리에서 칼을 뽑았다.`, `${ld.name}은(는) 자존심에 난 상처를 피로 씻으려 하였다.`);
  if (t[AMBITION] > 70) why.push(`${ld.name}의 야망은 국경 안에 머물지 않았다.`, `${ld.name}은(는) 지도 위의 ${b.name}을(를) 오래 노려보았다.`, `더 넓은 땅을 원한 ${ld.name}이(가) 마침내 움직였다.`);
  if (t[COMPASSION] < 30) why.push(`${ld.name}은(는) 피를 원하였다.`, `${ld.name}에게 전쟁은 사냥과 다르지 않았다.`, `잔혹한 ${ld.name}은(는) 명분조차 꾸미지 않았다.`);
  if (a.military > b.military * 2) why.push('약한 이웃의 땅이 탐났다.', `${b.name}의 군세가 보잘것없다는 보고가 올라왔다.`);
  const al = RACES[a.race].align, bl = RACES[b.race].align;
  if (al !== 'neutral' && bl !== 'neutral' && al !== bl) why.push('빛과 어둠은 한 하늘을 이고 살 수 없었다.', `${RACES[a.race].name}의 사제들이 성전을 부르짖었다.`);
  if (raceAffinity(a.race, b.race) < -40) why.push(`${RACES[a.race].name}과(와) ${RACES[b.race].name}의 오랜 원한이 다시 불붙었다.`, `${RACES[a.race].name}의 노래는 ${RACES[b.race].name}을(를) 원수로 기억한다.`);
  if (!why.length || Object.keys(a.wars).length === 0) why.push('국경의 분쟁이 끝내 전쟁으로 번졌다.', '국경 마을의 우물 하나를 두고 시작된 다툼이 전쟁이 되었다.', '변경의 소규모 충돌이 걷잡을 수 없이 커졌다.', '사냥터를 두고 벌어진 시비가 피를 불렀다.');
  return pick(why);
}

export function makePeace(w: World, a: Faction, b: Faction): void {
  const began = a.wars[b.id] ?? w.t;
  delete a.wars[b.id]; delete b.wars[a.id];
  clearWar(a, b);
  const until = w.t + w.rngSim.int(60, 150);
  a.truce[b.id] = until; b.truce[a.id] = until;
  addFacRel(w, a, b, 25);
  for (const ar of w.armies) {
    if (!ar.alive) continue;
    const tgt = w.settlements[ar.target];
    if ((ar.faction === a.id && tgt?.faction === b.id) || (ar.faction === b.id && tgt?.faction === a.id)) {
      if (ar.goal === 'conquer' || ar.goal === 'raid') ar.goal = 'return';
    }
  }
  // 전쟁의 길이와 형편에 따라 끝맺음의 말이 다르다 (난수 없이 고른다)
  const yrs = Math.floor((w.t - began) / 12);
  const pick = (arr: string[]) => arr[(w.t + a.id + b.id) % arr.length];
  const tail = yrs >= 10 ? pick([`${yrs}년을 끈 싸움이었다.`, `${yrs}년 만에 국경에 다시 연기가 걷혔다.`, `한 세대를 삼킨 ${yrs}년의 전쟁이었다.`])
    : yrs < 1 ? pick(['칼을 뽑은 지 한 해도 되지 않아서였다.', '싸움은 짧았다.'])
    : Math.max(a.warWeariness, b.warWeariness) > 50 ? pick(['양쪽 모두 지쳐 있었다.', '과부와 고아만 늘어난 싸움이었다.', '곳간도 병사도 바닥이 나 있었다.'])
    : pick(['사신들이 오가며 국경을 다시 그었다.', '인질을 주고받고 맹세를 새겼다.', '변경의 성채 몇 곳이 주인을 바꾸었다.', '']);
  addNews(w, `${a.name}과(와) ${b.name}이(가) 강화를 맺고 전쟁을 끝냈다.${tail ? ' ' + tail : ''}`, 3, 'war', { facs: [a.id, b.id] });
}

const distCache = new WeakMap<World, { t: number; m: Map<string, number> }>();
export function facDist(w: World, a: Faction, b: Faction): number {
  let c = distCache.get(w);
  if (!c || w.t - c.t >= 6 || w.t < c.t) { c = { t: w.t, m: new Map() }; distCache.set(w, c); }
  const k = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
  let d = c.m.get(k);
  if (d === undefined) { d = factionDistance(w, a, b); c.m.set(k, d); }
  return d;
}
export function invalidateDist(w: World): void { distCache.delete(w); routeCache.delete(w); }

const routeCache = new WeakMap<World, Map<string, { t: number; d: number; sea: boolean; path?: number[]; from?: number }>>();
/** 교역로를 따라 걷는 길 (수도 a → 수도 b 방향). 교역로를 잰 길을 그대로 다시 쓴다 */
export function tradePath(w: World, a: Faction, b: Faction): number[] | null {
  const r = tradeRoute(w, a, b);
  const c = routeCache.get(w)?.get(a.capital < b.capital ? `${a.capital}-${b.capital}` : `${b.capital}-${a.capital}`);
  if (!c || !c.path || r.sea) return null;
  return c.from === a.capital ? c.path.slice() : c.path.slice().reverse();
}

/** 수도와 수도를 잇는 실제 교역로 (뭍길 또는 뱃길). 길이(칸)와 뱃길 여부 */
export function tradeRoute(w: World, a: Faction, b: Faction): { d: number; sea: boolean } {
  const A = w.settlements[a.capital], B = w.settlements[b.capital];
  if (!A || !B || !A.alive || !B.alive) return { d: Infinity, sea: false };
  let m = routeCache.get(w);
  if (!m) { m = new Map(); routeCache.set(w, m); }
  const k = A.id < B.id ? `${A.id}-${B.id}` : `${B.id}-${A.id}`;
  const c = m.get(k);
  if (c && w.t - c.t < 24 && w.t >= c.t) return c;
  // 상단은 걸어서 간다 (날개 있는 종족끼리는 날아서)
  const flying = RACES[a.race].flying && RACES[b.race].flying;
  const path = findPath(w, A, B, { race: a.race, flying }, 40000);
  let d = path ? path.length : Infinity, sea = false;
  const sd = seaRoute(w, A, B);
  if (sd + 8 < d) { d = sd + 8; sea = true; }
  const r = { t: w.t, d, sea, path: path ?? undefined, from: A.id };
  m.set(k, r);
  return r;
}
// 이보다 먼 교역로는 열지 않는다 (먼 길은 짐이 상하고 도적이 많다)
const TRADE_REACH = 80;

/** 국경을 맞댄 이웃 (해마다 다시 잰다: 땅을 훑는 일이라 매달 하기엔 무겁다) */
const nbCache = new WeakMap<World, Map<number, { t: number; ids: Set<number> }>>();
export function isNeighbor(w: World, a: Faction, b: Faction): boolean {
  let m = nbCache.get(w);
  if (!m) { m = new Map(); nbCache.set(w, m); }
  let c = m.get(a.id);
  if (!c || w.t - c.t >= 12 || w.t < c.t) { c = { t: w.t, ids: new Set(borderNeighbors(w, a).map(o => o.id)) }; m.set(a.id, c); }
  return c.ids.has(b.id);
}

export function pWarMonth(w: World, a: Faction, b: Faction): number {
  if (a === b || !a.alive || !b.alive || atWar(a, b.id)) return 0;
  // 모르는 세력과는 싸울 일도 없다
  // 갓 알게 된 상대는 한동안 지켜본다
  if (knownYears(w, a, b) < 1) return 0;
  if ((a.truce[b.id] ?? -1) > w.t) return 0;
  if (RACES[a.race].noPop || !a.settlements.length || !b.settlements.length) return 0;
  const r = facRel(a, b.id);
  const dl = w.demonLord >= 0 ? w.chars[w.demonLord] : null;
  let special = 1;
  if (dl && dl.faction === a.id && RACES[b.race].align === 'light') special = 4;
  if (dl && dl.faction === b.id && RACES[a.race].align === 'light' && knowsDL(w, a)) special = 3;
  if (a.flags.includes('dlvassal') && RACES[b.race].align === 'light') special = 2.5;
  if (a.flags.includes('dlvassal') && dl && b.id === dl.faction) return 0;
  if (r > -30 && special === 1) return 0;
  const ld = leaderOf(w, a);
  const aggr = RACES[a.race].aggression * 0.6 + (ld ? ((100 - ld.traits[COMPASSION]) + ld.traits[AMBITION] + ld.traits[PRIDE] * 0.5) / 250 : 0.3)
    - (ld ? ld.traits[PRUDENCE] / 400 : 0);
  const ratio = a.military / Math.max(1, b.military);
  const powerF = ratio < 0.8 ? ratio * 0.25 : Math.min(2.5, ratio);
  const d = facDist(w, a, b);
  if (!isFinite(d)) return 0;
  // 전쟁은 대개 이웃끼리: 국경을 맞댄 나라는 더 자주, 멀리 있는 나라는 훨씬 드물게
  const neighbor = isNeighbor(w, a, b);
  const distF = (neighbor ? 1.5 : 1) * (d < 25 ? 1 : Math.exp(-(d - 25) / 12));
  const warsF = 1 / (1 + Object.keys(a.wars).length * 1.5);
  const pile = special === 1 ? Math.pow(0.7, Object.keys(b.wars).length) : 1;
  const hunger = a.flags.includes('food_crisis') ? 1.6 : 1;
  const young = a.tier === 0 ? 0.4 : 1;
  const p = (Math.max(5, -r - 30) / 70) * Math.max(0.05, aggr) * powerF * distF * warsF * pile * hunger * special * young * faithWarFactor(w, a, b) * 0.008;
  return Math.min(0.05, p);
}

function stockMonths(w: World, f: Faction, r: number): number {
  let stock = 0, cons = 0, prod = 0;
  for (const s of settlementsOf(w, f)) { stock += s.stock[r]; cons += s.cons[r]; prod += s.prod[r]; }
  if (cons <= 0) return 99;
  return (stock + (prod - cons) * 3) / cons;
}

/** 진영의 월간 의사결정 */
export function factionMonth(w: World, f: Faction): void {
  const rng = w.rngSim;
  aggregate(w, f);
  if (!f.settlements.length) { fallFaction(w, f); return; }
  if (!leaderOf(w, f)) succession(w, f);
  const ld = leaderOf(w, f);
  f.legitimacy = clamp(f.legitimacy + (ld ? (ld.stats.charisma - 45) / 300 + 0.05 : -0.5));

  // 무역 협정 이행
  for (const t of f.treaties) {
    const o = w.factions[t.with];
    if (!o || !o.alive) continue;
    const a = w.settlements[f.capital], b = w.settlements[o.capital];
    if (!a || !b) continue;
    // 바다 괴수가 뱃길을 막으면 물자가 오가지 못한다
    if (w.t % 12 === f.id % 12 || w.t % 12 === (f.id + 6) % 12) {
      const r = tradeRoute(w, f, o);
      if (r.d > TRADE_REACH * 1.3) {
        t.since = -1;
        continue;
      }
    }
    if (t.since < 0) continue;
    const route = tradeRoute(w, f, o);
    if (route.sea && (seaThreatNear(w, a) || seaThreatNear(w, b))) continue;
    const amt = Math.min(a.stock[t.give] * 0.06, 6 + a.pop / 150);
    // 교역에는 반드시 사람이 든다: 한 해에 한 번, 한 해치 짐을 싣고 떠난다
    if (w.t % 12 === (f.id + t.with) % 12) {
      // 멀수록 실어 나르는 양이 준다
      const eff = Math.max(0.35, Math.min(1, 1.25 - route.d / 80));
      const shipment = Math.min(a.stock[t.give] * 0.5, amt * 12 * eff);
      if (route.sea) {
        // 뱃길은 상인이 배를 빌려 띄운다 (배는 지도에 그리지 않는다)
        const master = caravanMaster(w, f, a);
        if (master) { a.stock[t.give] -= shipment; b.stock[t.give] += shipment; master.wealth += shipment * 0.03; charLog(w, master, `${RES_NAMES[t.give]}을(를) 배에 실어 ${o.name}(으)로 보냈다.`); }
      } else {
        const r = sendCaravan(w, f, o, a, b, t.give, shipment, tradePath(w, f, o));
        // 걸어갈 길이 없는 교역(드문 경우)도 사람이 있어야 오간다
        if (r === 'nopath' && caravanMaster(w, f, a)) { a.stock[t.give] -= shipment; b.stock[t.give] += shipment; }
      }
    }
    f.relations[o.id] = clamp((f.relations[o.id] ?? 0) + 0.15, -100, 100);
  }
  // 길이 끊긴 교역은 깨진다
  for (const t of f.treaties.filter(t => t.since < 0)) {
    const o = w.factions[t.with];
    if (o) {
      o.treaties = o.treaties.filter(x => x.with !== f.id);
      addNews(w, `${f.name}과(와) ${o.name} 사이의 길이 끊겨 교역 협정이 흐지부지되었다.`, 2, 'trade', { facs: [f.id, o.id] });
    }
  }
  f.treaties = f.treaties.filter(t => t.since >= 0 && w.factions[t.with]?.alive);

  // 영주 임명
  assignGovernors(w, f);
  if (w.t % 12 === f.id % 12) { const nb = borderNeighbors(w, f); updatePosture(w, f, nb); borderFriction(w, f, nb); }

  // 식량 위기 표시
  const foodM = stockMonths(w, f, FOOD);
  f.flags = f.flags.filter(x => x !== 'food_crisis');
  if (foodM < 2.5 && RACES[f.race].needs[FOOD] > 0) f.flags.push('food_crisis');

  // 승격
  if (rng.chance(pTierUp(w, f))) tierUp(w, f);
  else if (f.tier > 0 && f.pop < 150 * f.tier && rng.chance(0.02)) {
    f.tier--;
    const old = f.name;
    f.name = factionName(f);
    addNews(w, `쇠락한 ${old}이(가) ${f.name}(으)로 격하되었다.`, 2, 'politics', { facs: [f.id] });
  }

  // 전쟁 수행
  const wars = Object.keys(f.wars).map(Number);
  for (const eid of wars) {
    const e = w.factions[eid];
    if (!e || !e.alive) { delete f.wars[eid]; continue; }
    f.warWeariness += 1;
    const active = w.armies.some(a => a.alive && a.faction === f.id && (a.goal === 'conquer' || a.goal === 'holywar') && w.settlements[a.target]?.faction === eid);
    if (!active && rng.chance(0.22)) launchAttack(w, f, e, 'conquer');
    const pPeace = Math.max(0, (f.warWeariness + e.warWeariness - 30) / 900) * (ld ? 0.5 + ld.traits[PRUDENCE] / 100 : 1)
      * (w.demonLord >= 0 && (w.chars[w.demonLord]?.faction === f.id || w.chars[w.demonLord]?.faction === e.id) ? 0.2 : 1);
    const treeHeld = w.worldTree?.alive && w.settlements[w.worldTree.sid]?.faction === e.id && f.race === 'elf';
    // 연맹이 맞서는 적(마왕 등)과는 연맹이 살아 있는 동안 따로 강화하지 않는다 (강화했다가 다음 달 다시 선포하는 일을 막는다)
    const swornBy = (m: Faction, foe: Faction) => w.alliances.some(al => al.alive && al.members.includes(m.id) && w.chars[al.enemy]?.died < 0 && w.chars[al.enemy]?.faction === foe.id);
    const sworn = swornBy(f, e) || swornBy(e, f);
    const dlWar = w.demonLord >= 0 && (w.chars[w.demonLord]?.faction === f.id || w.chars[w.demonLord]?.faction === e.id);
    if (treeHeld || sworn) continue;
    if (dlWar) { if (rng.chance(pPeace)) makePeace(w, f, e); continue; }
    // 반년에 한 번, 밀리는 쪽이 조건을 내걸고 강화를 청한다
    if (f.id < e.id && w.t % 6 === (f.id + e.id) % 6) negotiate(w, f, e, makePeace);
  }
  if (!wars.length) f.warWeariness = Math.max(0, f.warWeariness - 1);

  // 엘프는 불타는 세계수를 되찾으러 나선다
  if (f.race === 'elf' && w.worldTree?.alive) {
    const ts = w.settlements[w.worldTree.sid];
    const owner = ts && w.factions[ts.faction];
    if (owner && owner !== f && RACES[owner.race].align === 'dark') {
      if (!atWar(f, owner.id)) {
        declareWar(w, f, owner, true);
        if (!f.flags.includes(`crusade:${ts.id}`)) {
          f.flags.push(`crusade:${ts.id}`);
          addNews(w, `${f.name}이(가) 불타는 세계수를 구하기 위해 ${owner.name}에 성전을 선포하였다.`, 4, 'hero', { facs: [f.id, owner.id], pos: ts });
        }
      }
      const going = w.armies.some(a => a.alive && a.faction === f.id && a.target === ts.id);
      if (!going && rng.chance(0.25)) {
        const src = settlementsOf(w, f).sort((a, b) => b.pop - a.pop)[0];
        if (src && src.pop > 80) raiseArmy(w, f, src, 'conquer', ts, Math.max(30, src.pop * 0.3));
      }
    }
  }
  // 선전포고 판단
  for (const o of w.factions) {
    if (o.alive && o !== f && rng.chance(pWarMonth(w, f, o))) { declareWar(w, f, o); break; }
  }

  if (!rng.chance(0.25)) return;
  // 식량 부족 → 교역 또는 약탈
  if (f.flags.includes('food_crisis')) {
    const tradeBias = RACES[f.race].trade + (ld ? (ld.traits[SOCIAL] + ld.traits[PRUDENCE]) / 250 : 0);
    const raidBias = RACES[f.race].aggression + (ld ? ((100 - ld.traits[COMPASSION]) + ld.traits[COURAGE]) / 250 : 0);
    if (rng.chance(tradeBias / (tradeBias + raidBias)) && tryTrade(w, f, FOOD)) return;
    launchRaid(w, f);
    return;
  }
  // 그 외 부족한 자원은 교역으로
  for (const r of [ORE, WOOD, STONE, MANA]) {
    if (stockMonths(w, f, r) < 2 && rng.chance(0.3) && tryTrade(w, f, r)) return;
  }
  // 탐욕스러운 지도자는 평시에도 약탈
  if (ld && ld.traits[COMPASSION] < 35 && ld.traits[2] > 60 && rng.chance(0.08 * RACES[f.race].aggression)) { launchRaid(w, f); return; }
  // 개척
  tryColonize(w, f);
}

function assignGovernors(w: World, f: Faction): void {
  const ld = leaderOf(w, f);
  for (const s of settlementsOf(w, f)) {
    if (s.id === f.capital) { s.governor = ld ? ld.id : -1; continue; }
    const g = w.chars[s.governor];
    if (g && g.died < 0 && g.faction === f.id) continue;
    s.governor = -1;
    const used = new Set(w.settlements.filter(x => x.alive).map(x => x.governor));
    const cands = w.chars.filter(c => c.died < 0 && c.faction === f.id && isAdult(w, c) && !used.has(c.id) && c.id !== f.leader && c.race !== 'dragon' && !c.isPlayer
      && c.act.kind === 'idle' && c.role !== '노예' && approxDist(w, c, s) < 30);
    if (!cands.length) continue;
    cands.sort((a, b) => govScore(b) - govScore(a));
    const pick = cands[0];
    s.governor = pick.id;
    pick.home = s.id;
    relocate(w, pick, s);
    pick.honor += 10;
    charLog(w, pick, `${ld ? ld.name + '에 의해 ' : ''}${s.name}의 영주로 임명되었다.`, 3);
    ensureHouse(w, pick, s);
    if (s.tier >= 2) addNews(w, `${pick.name}이(가) ${s.name}의 영주로 임명되었다.`, 1, 'politics', { facs: [f.id], chars: [pick.id] });
  }
  function govScore(c: Character) {
    return c.traits[LOYALTY] * 0.5 + (ld ? rel(c, ld.id) * 0.6 : 0) + c.fame * 0.5 + c.stats.command * 0.4 + c.honor * 0.2
      + (ld && (ld.children.includes(c.id) || ld.spouse === c.id) ? 40 : 0);
  }
}

function tryTrade(w: World, f: Faction, need: number): boolean {
  const rng = w.rngSim;
  const surplus = (o: Faction, r: number) => stockMonths(w, o, r);
  // 서로 안 지 다섯 해는 지나야 믿고 물건을 주고받는다
  const partners = aliveFactions(w).filter(o => o !== f && knownYears(w, f, o) >= 5 && knownYears(w, o, f) >= 5 && !atWar(f, o.id) && facRel(f, o.id) > -15
    && !f.treaties.some(t => t.with === o.id) && facDist(w, f, o) < 70 && surplus(o, need) > 8)
    .filter(o => tradeRoute(w, f, o).d <= TRADE_REACH);
  if (!partners.length) return false;
  // 가까운 상대일수록 이문이 남는다: 거리에 따라 크게 줄어드는 무게로 고른다
  const o = rng.weighted(partners, p => (50 + facRel(f, p.id)) * Math.exp(-tradeRoute(w, f, p).d / 25))!;
  // 상대가 원하는 것
  let give = -1, gm = 0;
  for (let r = 0; r < RES_COUNT; r++) {
    if (r === need) continue;
    const mine = surplus(f, r), theirs = surplus(o, r);
    const v = mine - theirs;
    if (mine > 4 && v > gm) { gm = v; give = r; }
  }
  if (give < 0) give = GOLD;
  f.treaties.push({ with: o.id, give, get: need, since: w.t });
  o.treaties.push({ with: f.id, give: need, get: give, since: w.t });
  addFacRel(w, f, o, 10);
  addNews(w, `${f.name}과(와) ${o.name}이(가) ${tradeRoute(w, f, o).sea ? '뱃길을 열어 ' : ''}교역 협정을 맺었다. (${RES_NAMES[give]} ↔ ${RES_NAMES[need]})`, 2, 'trade', { facs: [f.id, o.id] });
  return true;
}

export function launchRaid(w: World, f: Faction): void {
  const rng = w.rngSim;
  const targets = w.settlements.filter(s => {
    if (!s.alive || s.faction === f.id) return false;
    const o = w.factions[s.faction];
    if (!o || (o.truce[f.id] ?? -1) > w.t) return false;
    // 모르는 이웃이라도 굶주린 무리는 가까운 낯선 고을의 연기를 보고 쳐들어간다 (그 약탈이 첫 조우가 된다)
    if (!knows(w, f, o) && !f.flags.includes('food_crisis')) return false;
    if (facRel(f, o.id) > 15 || f.treaties.some(t => t.with === o.id)) return false;
    return true;
  });
  let best: Settlement | null = null, bs = -Infinity, src: Settlement | null = null;
  for (const s of targets) {
    const near = nearestOwn(w, f, s);
    if (!near) continue;
    const d = approxDist(w, near, s);
    // 굶주린 무리는 모르는 땅이라도 먹을 것을 찾아 멀리까지 나선다
    if (d > 32) continue;
    const score = s.stock[FOOD] + s.stock[GOLD] * 2 - s.pop * 0.3 - d * 3;
    if (score > bs) { bs = score; best = s; src = near; }
  }
  if (!best || !src) return;
  const size = Math.max(15, src.pop * 0.12);
  const army = raiseArmy(w, f, src, 'raid', best, size);
  if (army) {
    const o = w.factions[best.faction];
    if (o) addFacRel(w, f, o, -12);
    if (rng.chance(0.4)) addNews(w, `${f.name}의 약탈대가 ${best.name}(으)로 향하였다.`, 2, 'war', { facs: [f.id, best.faction], pos: src });
  }
}

export function launchAttack(w: World, f: Faction, e: Faction, goal: 'conquer' | 'holywar'): boolean {
  const ess = settlementsOf(w, e);
  let best: Settlement | null = null, src: Settlement | null = null, bs = -Infinity;
  for (const s of ess) {
    const near = nearestOwn(w, f, s);
    if (!near) continue;
    const d = approxDist(w, near, s);
    if (d > 60) continue;
    const score = -d * 2 - s.pop * 0.05 + (s.id === e.capital ? 10 : 0) + near.pop * 0.02;
    if (score > bs) { bs = score; best = s; src = near; }
  }
  if (!best || !src || src.pop < 60) return false;
  const size = Math.max(25, src.pop * 0.2 + (src.id !== f.capital ? (w.settlements[f.capital]?.pop ?? 0) * 0.05 : 0));
  // 먼 적국은 곧장 들이치지 않는다: 길목에 주둔지를 세우고 병력을 모은 뒤 거기서 출격한다
  if (src.l === best.l && approxDist(w, src, best) > 14) {
    const camp = ensureCamp(w, f, e, src, best);
    if (camp) {
      // 주둔지가 이미 넉넉하면 더 보내지 않는다 (병력은 주둔지에서 출격한다)
      if (camp.soldiers >= CAMP_MAX) return false;
      const a = raiseArmy(w, f, src, goal, best, Math.min(size, CAMP_MAX - camp.soldiers + 10));
      if (!a) return false;
      if (!sendToCamp(w, a, camp)) return true;
      return true;
    }
  }
  return !!raiseArmy(w, f, src, goal, best, size);
}

function nearestOwn(w: World, f: Faction, p: Settlement): Settlement | null {
  let best: Settlement | null = null, bd = Infinity;
  for (const s of settlementsOf(w, f)) {
    if (s.pop < 40) continue;
    const d = approxDist(w, s, p);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function tryColonize(w: World, f: Faction): void {
  const rng = w.rngSim;
  const R = RACES[f.race];
  if (R.noPop) return;
  const ss = settlementsOf(w, f);
  if (ss.length >= 3 + f.tier * 4) return;
  if (w.armies.some(a => a.alive && a.faction === f.id && a.goal === 'colonize')) return;
  const crowded = ss.filter(s => s.pop > 220 && s.pop > capacity(w, s) * 0.6);
  if (!crowded.length) return;
  const from = rng.pick(crowded);
  if (!R.layers.includes(from.l) && !rng.chance(0.3)) return;
  const site = findColonySite(w, from, from.race);
  if (!site) return;
  // 이주를 이끌 인물
  const cands = w.chars.filter(c => c.died < 0 && c.faction === f.id && isAdult(w, c) && c.id !== f.leader && c.act.kind === 'idle'
    && !w.settlements.some(s => s.alive && s.governor === c.id) && c.l === from.l && Math.hypot(c.x - from.x, c.y - from.y) <= 8 && !c.isPlayer);
  const leader = cands.length ? rng.weighted(cands, c => 10 + c.traits[6] + c.traits[AMBITION] + c.traits[COURAGE] * 0.5) ?? null : null;
  const size = Math.max(40, from.pop * 0.25);
  raiseArmy(w, f, from, 'colonize', null, size, leader ?? undefined, site);
}

export function fallFaction(w: World, f: Faction): void {
  if (!f.alive) return;
  { const me = w.player && w.chars[w.player.charId]; if (me && me.died < 0 && me.faction === f.id) markPeril(w, 'fall', w.settlements[me.home], f.id); }
  f.alive = false;
  f.fell = w.t;
  const last = f.rulers[f.rulers.length - 1];
  if (last && last.to < 0) last.to = w.t;
  for (const o of w.factions) { delete o.wars[f.id]; o.treaties = o.treaties.filter(t => t.with !== f.id); }
  f.wars = {};
  const ld = leaderOf(w, f);
  addNews(w, `${f.name}이(가) 멸망하였다.${ld ? ` 마지막 ${RACES[f.race].titles[f.tier]} ${ld.name}은(는) 몸을 피하였다.` : ''}`, 4, 'war', { facs: [f.id] });
  for (const c of w.chars) {
    if (c.died >= 0 || c.faction !== f.id) continue;
    c.faction = -1; c.home = -1;
    charLog(w, c, `조국 ${f.name}이(가) 멸망하여 떠돌이가 되었다.`, 3);
  }
}

/** 떠돌이 인물은 다른 세력에 의탁한다 */
export function homelessMonth(w: World, c: Character): void {
  const rng = w.rngSim;
  if (c.home >= 0 && w.settlements[c.home]?.alive && c.faction >= 0) return;
  // 열강은 어느 나라에도 깃들지 않는다
  if (c.race === 'dragon' || c.act.kind !== 'idle' || c.paragon || c.archdemon) return;
  // 나라를 잃은 '나'는 먼저 스스로 거취를 고른다 (한 해 동안은 기다린다)
  if (c.isPlayer && w.player && ['peril_fall', 'peril_fallen'].some(k => (w.player!.flags?.[k] ?? -99) >= w.t - 12)) return;
  if (c.faction >= 0 && w.factions[c.faction]?.alive) {
    const cap = w.settlements[w.factions[c.faction].capital];
    if (cap) { c.home = cap.id; relocate(w, c, cap); return; }
  }
  { const sp = w.chars[c.spouse]; const sh = sp && sp.died < 0 ? w.settlements[sp.home] : undefined;
    if (sh && sh.alive && sp!.faction >= 0) { c.home = sh.id; c.faction = sp!.faction; relocate(w, c, sh); return; } }
  if (!rng.chance(0.08)) return;
  const opts = w.settlements.filter(s => s.alive && approxDist(w, c, s) < 60);
  if (!opts.length) return;
  const s = rng.weighted(opts, o => (o.race === c.race ? 5 : 1) * (RACES[o.race].align === RACES[c.race].align ? 2 : 0.3) * (1 + o.pop / 500))!;
  c.home = s.id; c.faction = s.faction;
  relocate(w, c, s);
  const sp = w.chars[c.spouse];
  if (sp && sp.died < 0 && sp.act.kind === 'idle' && (sp.home < 0 || !w.settlements[sp.home]?.alive || sp.faction < 0)) { sp.home = s.id; sp.faction = s.faction; relocate(w, sp, s); }
  charLog(w, c, `${s.name}에 몸을 의탁하여 ${w.factions[s.faction].name}의 일원이 되었다.`, 2);
}



// 강화 조건으로 고을을 넘길 때 쓴다
setTransfer((w, s, f) => transferSettlement(w, s, f));
