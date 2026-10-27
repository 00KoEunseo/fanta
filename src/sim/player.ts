import { RACES, type RaceKey } from '../data/races';
import { knows, knowsRealm } from './contact';
import { makeName } from '../data/names';
import { ADVENTURER_TIRED, JOB_SEARCH, buildPrompt, makeCtx, nearDeath, resolveLife, type LifeEv } from './life';
import { CHILD, RACIAL, ROMANCE, TRAIT } from './lifeData1';
import { JOBS } from './lifeData2';
import { DRAGON, GUARDIAN, POWER } from './lifeData3';
import { ARTFATE, GOVPATH, GUARDIAN2, NEWJOBS, RENOWN, WORKS_EV } from './lifeData4';
import { ECON, SLAVE, TOWER } from './lifeData5';
import { SEA, SEA_START } from './lifeData6';
import { ALLIANCE_EV, ARMY_EV, INVITES, PARTY_EV, TRAVEL_EV } from './expeditionEvents';
import { CAREER, HOUSE, STORY } from './lifeData7';
import { PERIL } from './perilEvents';
import { MILESTONES, watchMilestones } from './milestones';
import { JOB_OFFER } from './lifeData8';
import { ROYAL, royalBirths } from './lifeData9';
import { ARCS, CARE, DL_PERIL, RULE } from './lifeData10';
import { markPeril } from './peril';
/** 씨앗에서 자라는 뒷이야기 (평소 풀에는 넣지 않는다) */
const STORY_FOLLOW = new Set(['st_thief_spared', 'st_thief_jailed', 'st_thief_hired', 'st_loan_back', 'st_loan_gift', 'st_stranger_helped', 'st_stranger_robbed', 'st_rival_lost', 'st_rival_beaten', 'st_rival_feud', 'st_mentor_end', 'st_oath_test', 'st_map_found', 'st_dragon_vengeance', 'st_resistance']);
import { spawnDragon } from './events';
import { ANGEL_LIFESPAN, ANGEL_SEATS, guardianSeat } from './angels';
import { fixJosa } from '../data/text';
import {
  AMBITION, APT_COUNT, APT_DEMONLORD, APT_HERO, APT_KING, COMPASSION, COURAGE, CURIOSITY, FAITH, LOYALTY, PRIDE, SOCIAL, TRAIT_COUNT,
} from '../data/traits';
import { addNews, charLog } from './news';
import type { Character, PlayerPrompt, Settlement, World } from './state';
import { ageOf, dist } from './state';
import {
  addFacRel, addRel, aliveFactions, approxDist, charLabel, clamp, facRel, isAdult, isHero, leaderOf, rel, settlementsOf,
} from './helpers';
import { awaken, createCharacter, travelCheck, duel, fertile, killChar, relocate, setPos, setTravel, startExpedition, tryMarry } from './characters';
import { attemptCoup, declareWar, facDist, launchAttack, makePeace } from './factions';
import { raiseArmy } from './military';
import { becomeDemonLord } from './events';
import { findColonySite } from './settlements';

export type Origin = 'noble' | 'common' | 'orphan';
export interface PlayerOpts {
  name?: string;
  race: RaceKey;
  sex: 'M' | 'F';
  origin: Origin;
  traits?: number[];
  /** 태어날 나라 (없으면 아무 데나) */
  faction?: number;
}

export const PLAYABLE: RaceKey[] = ['human', 'elf', 'darkelf', 'dwarf', 'goblin', 'kobold', 'orc', 'beast', 'majin', 'demon'];

export function birthplaces(w: World, race: RaceKey): Settlement[] {
  return w.settlements.filter(s => s.alive && s.race === race && w.factions[s.faction]?.alive);
}

/** 1.5% 확률로 운명이 선택을 비튼다: 용, 또는 성역의 수호자 */
function specialBirth(w: World, o: PlayerOpts): Character | null {
  const rng = w.rngSim;
  const sanctum = w.settlements.find(s => s.alive && s.flags.includes('sanctum') && w.factions[s.faction]?.race === 'angel');
  if (sanctum && rng.chance(0.5)) {
    const c = createCharacter(w, { race: 'angel', sex: o.sex, faction: sanctum.faction, home: sanctum.id, pos: sanctum, born: w.t - 60 * 12, name: o.name || makeName(rng, 'angel', o.sex) });
    c.awakened.push('guardian');
    const { seat, replaced } = guardianSeat(w);
    if (replaced) {
      replaced.died = w.t; replaced.cause = '빛으로 돌아감';
      charLog(w, replaced, '새로운 수호자에게 자리를 물려주고 빛으로 돌아갔다.', 4);
    }
    c.seat = seat;
    c.lifespan = ANGEL_LIFESPAN;
    c.stats.might = clamp(c.stats.might + 25); c.stats.magic = clamp(c.stats.magic + 30); c.stats.command = clamp(c.stats.command + 15);
    c.items.push('성역의 창');
    c.role = '기사'; c.title = 'adult'; c.epithet = `${ANGEL_SEATS[seat].title} · 성역의 수호자`;
    c.isPlayer = true;
    w.player = { charId: c.id, prompt: null, lastEvents: {}, path: '', results: [], dead: false, flags: {}, generation: 1, special: 'guardian', jobSince: w.t, jobsHad: [] };
    charLog(w, c, `운명이 선택을 비틀었다. ${sanctum.name}의 빛 속에서 성역의 수호자로 깨어났다.`, 4);
    addNews(w, `${sanctum.name}의 빛 속에서 성역의 수호자 ${c.name}이(가) 깨어났다.`, 4, 'hero', { pos: sanctum, chars: [c.id] });
    return c;
  }
  const d = spawnDragon(w, false);
  if (!d) return null;
  if (d.patronOf !== undefined) {
    const pf = w.factions[d.patronOf];
    if (pf) pf.flags = pf.flags.filter(x => x !== `patron:${d.id}`);
    d.patronOf = undefined;
  }
  d.dragonKind = 'recluse';
  d.born = w.t - 100 * 12;
  d.sleep = 0;
  if (o.name) d.name = o.name;
  d.sex = o.sex;
  d.isPlayer = true;
  w.player = { charId: d.id, prompt: null, lastEvents: {}, path: '', results: [], dead: false, flags: {}, generation: 1, special: 'dragon', jobsHad: [] };
  charLog(w, d, '운명이 선택을 비틀었다. 용의 알에서 깨어나, 백 년 만에 둥지를 떠날 날을 맞이하였다.', 4);
  addNews(w, `하늘 어딘가에서 젊은 용 ${d.name}이(가) 처음으로 날개를 펼쳤다.`, 3, 'player', { pos: d, chars: [d.id] });
  return d;
}

export function createPlayer(w: World, o: PlayerOpts): Character | null {
  const rng = w.rngSim;
  if (rng.chance(0.015)) {
    const sp = specialBirth(w, o);
    if (sp) return sp;
  }
  const all = birthplaces(w, o.race);
  const mine = o.faction !== undefined ? all.filter(s => s.faction === o.faction) : [];
  const places = mine.length ? mine : all;
  if (!places.length) return null;
  let home: Settlement;
  let father: number | undefined, mother: number | undefined;
  if (o.origin === 'noble') {
    // 군주나 영주 가문
    const noble = places.map(s => {
      const f = w.factions[s.faction];
      const ld = leaderOf(w, f);
      const lord = ld && ld.home === s.id ? ld : w.chars[s.governor];
      return { s, lord: lord && lord.died < 0 && lord.race === o.race ? lord : null };
    }).filter(x => x.lord);
    const pick = noble.length ? rng.pick(noble) : { s: rng.pick(places), lord: null };
    home = pick.s;
    if (pick.lord) {
      const l = pick.lord;
      if (l.sex === 'M') { father = l.id; mother = l.spouse >= 0 ? l.spouse : undefined; }
      else { mother = l.id; father = l.spouse >= 0 ? l.spouse : undefined; }
    }
  } else home = rng.pick(places);
  // 성격값이 모두 있어야 쓴다 (모자라면 무작위로)
  const traits = o.traits && o.traits.length >= 10 && o.traits.every(v => Number.isFinite(v)) ? [...o.traits] : undefined;
  const c = createCharacter(w, {
    race: o.race, sex: o.sex, faction: home.faction, home: home.id, pos: home, born: w.t,
    father, mother, traits, name: o.name || makeName(rng, o.race, o.sex),
  });
  if (o.origin === 'orphan') {
    c.traits[COURAGE] = clamp(c.traits[COURAGE] + 10);
    c.stats.might = clamp(c.stats.might + 5);
    c.wealth = 0;
    c.apt[APT_HERO] = clamp(c.apt[APT_HERO] + 15);
  }
  if (o.origin === 'noble') { c.wealth += 150; c.honor += 20; c.apt[APT_KING] = clamp(c.apt[APT_KING] + 10); }
  c.isPlayer = true;
  c.title = 'child';
  w.player = { charId: c.id, prompt: null, lastEvents: {}, path: '', results: [], dead: false, flags: {}, generation: 1, jobsHad: [] };
  if (o.origin === 'noble') w.player.flags!.noble = w.t;
  if (o.origin === 'orphan') w.player.flags!.orphan = w.t;
  const fam = father !== undefined ? `${w.chars[father].name}의 자식으로 ` : o.origin === 'orphan' ? '버려진 아이로 ' : '평범한 집안에서 ';
  charLog(w, c, `${home.name}에서 ${fam}태어났다.`, 3);
  addNews(w, `${home.name}에서 ${c.name}이(가) ${fam}태어났다.`, 2, 'player', { pos: home, chars: [c.id] });
  return c;
}

// ───────────── 인생 이벤트

interface LifeEvent {
  id: string;
  cooldown: number;
  once?: boolean;
  chance: number;
  cond: (w: World, c: Character) => boolean;
  build: (w: World, c: Character) => PlayerPrompt | null;
  resolve: (w: World, c: Character, choice: string, data: PlayerPrompt['data']) => string;
}

const LIFE: LifeEvent[] = [];
const ok = (id: string, label: string, desc: string, chance?: number) => ({ id, label, desc, chance });




LIFE.push({
  id: 'war_call', cooldown: 24, chance: 0.1,
  cond: (w, c) => isAdult(w, c) && !!w.factions[c.faction] && Object.keys(w.factions[c.faction].wars).length > 0 && w.factions[c.faction].leader !== c.id && c.act.kind === 'idle',
  build: (w, c) => {
    const f = w.factions[c.faction];
    const e = w.factions[+Object.keys(f.wars)[0]];
    const p = clamp((c.stats.might + c.stats.command * 0.5) / 120 + 0.2, 0.2, 0.9);
    return {
      eventId: 'war_call', title: '징집령', data: { enemy: e.id, p },
      text: `${f.name}과(와) ${e.name}의 전쟁이 한창이다. 징집관이 ${c.name}의 문을 두드렸다.`,
      choices: [
        ok('fight', '최전선에 선다', '승리 시 명성·명예 대폭 상승, 부상·전사 위험', p),
        ok('support', '후방에서 보급을 돕는다', '명예 소폭 상승, 안전'),
        ok('flee', '몰래 달아난다', '명예 크게 하락'),
      ],
    };
  },
  resolve: (w, c, ch, d) => {
    const e = w.factions[+d.enemy];
    if (ch === 'fight') {
      if (w.rngSim.chance(+d.p)) {
        c.fame += 25; c.honor += 20; c.stats.might += 3; c.stats.command += 3;
        addNews(w, `${c.name}이(가) ${e?.name ?? '적'}과(와)의 전투에서 큰 공을 세웠다.`, 2, 'player', { chars: [c.id] });
        if (c.apt[APT_HERO] >= 70 && w.rngSim.chance(0.25)) awaken(w, c, 'hero', '피로 물든 전장 한가운데서');
        return '적진을 돌파하여 큰 공을 세웠다! 모두가 그의 이름을 외쳤다.';
      }
      c.stats.health = clamp(c.stats.health - w.rngSim.int(25, 60));
      if (c.stats.health <= 5) { const nd = nearDeath(w, c, w.player!, '전장에서 입은 상처'); return nd ? `처참한 패배였다. ${nd}` : '치명상을 입었다…'; }
      return '처참한 패배였다. 간신히 목숨만 건졌다.';
    }
    if (ch === 'support') { c.honor += 5; c.wealth = Math.max(0, c.wealth - 10); return '보급 부대에서 묵묵히 일하였다.'; }
    c.honor -= 30; c.fame = Math.max(0, c.fame - 10); c.mood = clamp(c.mood - 10);
    return '밤을 틈타 달아났다. 고향 사람들의 눈길이 차갑다.';
  },
});

LIFE.push({
  id: 'adventure', cooldown: 20, chance: 0.03,
  cond: (w, c) => isAdult(w, c) && c.act.kind === 'idle' && c.stats.health > 40,
  build: (w, c) => {
    // 실제로 갈 수 있는 곳만 소문으로 듣는다 (국경에 막힌 곳을 권하지 않는다)
    const near = w.sites.filter(s => (s.loot > 0 || s.relic) && s.kind !== 'deep' && knowsRealm(w.factions[c.faction], s.l) && approxDist(w, c, s) < 50);
    const sites = w.rngSim.shuffle(near.slice()).slice(0, 4).map(s => ({ s, chk: travelCheck(w, c, s, 'adventure') })).filter(o => o.chk);
    if (!sites.length) return null;
    const { s, chk } = w.rngSim.pick(sites);
    const warn = chk?.strict ? ` 가는 길에 ${chk.strict}의 국경 검문이 깐깐하다고 한다.` : '';
    return {
      eventId: 'adventure', title: '모험의 부름', data: { site: s.id },
      text: `여관에서 ${s.name}에 대한 소문을 들었다. 보물과 괴물이 기다린다고 한다. (위험도 ${'★'.repeat(s.level)})${warn}`,
      choices: [ok('go', '탐험을 떠난다', `${s.name}까지 직접 걸어간다. 도착하면 어떻게 들어갈지 고른다`), ok('stay', '흘려듣는다', '')],
    };
  },
  resolve: (w, c, ch, d) => {
    P0(w).advNo = ch === 'go' ? 0 : (P0(w).advNo ?? 0) + 1;
    if (ch !== 'go') return '모험은 다른 이들의 몫이라 여겼다.';
    return startExpedition(w, c, +d.site);
  },
});

LIFE.push({
  id: 'temptation', cooldown: 9999, once: true, chance: 0.006,
  cond: (w, c) => isAdult(w, c) && !c.awakened.includes('seed') && (c.apt[APT_DEMONLORD] > 40 || c.traits[AMBITION] > 70 || c.traits[COMPASSION] < 30),
  build: (w, c) => ({
    eventId: 'temptation', title: '심연의 속삭임', data: { p: clamp(c.stats.might / 100 + 0.2, 0.2, 0.85) },
    text: '어둠 속에서 붉은 눈의 사절이 속삭인다. "힘을 원하지 않나? 네 안의 갈망을 나는 알고 있다…"',
    choices: [
      ok('pact', '계약한다', '무력·마력 크게 상승, 명예 하락, 마왕의 씨앗'),
      ok('report', '거절하고 신전에 알린다', '명예·명성 상승'),
      ok('slay', '그 자리에서 베어버린다', '성공 시 명성 대폭 상승 (무력 판정)', clamp(c.stats.might / 100 + 0.2, 0.2, 0.85)),
    ],
  }),
  resolve: (w, c, ch, d) => {
    if (ch === 'pact') {
      awaken(w, c, 'seed', '심연과 계약을 맺고');
      c.apt[APT_DEMONLORD] = clamp(c.apt[APT_DEMONLORD] + 30);
      return '피로 서명하였다. 몸속에 검은 힘이 흘러들었다.';
    }
    if (ch === 'report') { c.honor += 15; c.fame += 10; return '신전의 사제들이 마족 사절을 쫓아냈다.'; }
    if (w.rngSim.chance(+d.p)) { c.fame += 35; c.honor += 10; return '검이 번뜩였다. 사절은 비명과 함께 재가 되었다!'; }
    c.stats.health = clamp(c.stats.health - 40);
    return '사절은 비웃으며 사라졌고, 저주의 상처가 남았다.';
  },
});


LIFE.push({
  id: 'coup', cooldown: 48, chance: 0.03,
  cond: (w, c) => {
    const f = w.factions[c.faction];
    const ld = f ? leaderOf(w, f) : null;
    return !!ld && ld.id !== c.id && c.rank >= 1 && (f.legitimacy < 55 || rel(c, ld.id) < -20 || c.traits[AMBITION] > 70);
  },
  build: (w, c) => {
    const f = w.factions[c.faction];
    const ld = leaderOf(w, f)!;
    return {
      eventId: 'coup', title: '왕좌의 유혹', data: {},
      text: `${f.name}의 귀족 몇이 ${c.name}을(를) 찾아왔다. "${ld.name}은(는) 왕의 그릇이 아닙니다. 당신이 일어선다면 우리가 따르겠습니다."`,
      choices: [
        ok('rebel', '반역을 일으킨다', '성공하면 군주, 실패하면 처형 위험'),
        ok('wait', '때를 기다린다', '음모 진척'),
        ok('loyal', '그들을 고발한다', '군주의 신임·명예 상승'),
      ],
    };
  },
  resolve: (w, c, ch) => {
    const f = w.factions[c.faction];
    const ld = leaderOf(w, f);
    if (ch === 'rebel') {
      attemptCoup(w, c);
      if (c.died >= 0) return '반역은 실패하였다…';
      return f.leader === c.id ? '왕좌를 손에 넣었다!' : '반역은 실패하였으나 목숨은 건졌다.';
    }
    if (ch === 'wait') { c.plot += 40; return '은밀히 세력을 모으기 시작하였다.'; }
    if (ld) addRel(w, c, ld, 30);
    c.honor += 15;
    return '음모를 고발하여 군주의 신임을 얻었다.';
  },
});

LIFE.push({
  id: 'ruler_policy', cooldown: 18, chance: 0.08,
  cond: (w, c) => w.factions[c.faction]?.leader === c.id,
  build: (w, c) => {
    const f = w.factions[c.faction];
    const enemies = aliveFactions(w).filter(o => o !== f && knows(w, f, o) && !f.wars[o.id] && facDist(w, f, o) < 70 && (f.truce[o.id] ?? -1) <= w.t);
    enemies.sort((a, b) => facRel(f, a.id) - facRel(f, b.id));
    const e = enemies[0];
    const choices = [
      ok('develop', '내정에 힘쓴다', '안정도·정통성 상승'),
      ok('expand', '개척을 장려한다', '새 정착지 건설 시도'),
      ok('feast', '성대한 연회를 연다', '재산 소모, 귀족 호감·명성 상승'),
    ];
    if (e) choices.unshift(ok('war', `${e.name}에 전쟁을 선포한다`, `관계 ${Math.round(facRel(f, e.id))}, 군사력 ${Math.round(f.military)} 대 ${Math.round(e.military)}`));
    const peaceWith = Object.keys(f.wars).map(Number)[0];
    if (peaceWith !== undefined) choices.push(ok('peace', `${w.factions[peaceWith].name}과(와) 강화한다`, '전쟁 종료 시도'));
    // 나라의 형편이 회의의 공기를 정한다
    const k = w.t + c.id;
    const mood = peaceWith !== undefined ? [`전선에서 올라온 보고서가 탁자 위에 쌓여 있다. ${w.factions[peaceWith].name}과(와)의 싸움은 끝이 보이지 않는다.`, `상복을 입은 귀족 몇이 회의에 들어왔다. 전쟁은 모든 집에서 누군가를 데려갔다.`][k % 2]
      : f.flags.includes('food_crisis') ? '곡창 관리가 굶주린 고을의 이름을 하나씩 읽어 내려간다.'
      : e && facRel(f, e.id) < -40 ? `${e.name}의 국경 수비대가 늘었다는 보고가 들어왔다. 장군들이 칼자루를 만지작거린다.`
      : ['태평한 해였다. 신하들은 새 일을 벌이자고 저마다 목소리를 높인다.', '봄 회의가 열렸다. 지방에서 올라온 청원서가 산더미다.', '사냥에서 돌아오자 대신들이 기다리고 있었다.'][k % 3];
    return { eventId: 'ruler_policy', title: '어전 회의', data: { e: e ? e.id : -1, peace: peaceWith ?? -1 }, text: `${mood} ${f.name}의 신하들이 ${c.name}의 결정을 기다린다.`, choices };
  },
  resolve: (w, c, ch, d) => {
    const f = w.factions[c.faction];
    if (ch === 'war') {
      const e = w.factions[+d.e];
      if (!e || !e.alive) return '상대는 이미 사라졌다.';
      declareWar(w, f, e); launchAttack(w, f, e, 'conquer');
      return `${e.name}에 선전포고하고 군대를 출정시켰다.`;
    }
    if (ch === 'develop') {
      f.legitimacy = clamp(f.legitimacy + 10);
      for (const s of settlementsOf(w, f)) s.stability = clamp(s.stability + 10);
      return '백성의 삶을 돌보는 데 힘썼다.';
    }
    if (ch === 'expand') {
      const ss = settlementsOf(w, f).sort((a, b) => b.pop - a.pop);
      const from = ss[0];
      const site = from && findColonySite(w, from, from.race, 5, 22);
      if (!site) return '마땅한 땅을 찾지 못하였다.';
      return raiseArmy(w, f, from, 'colonize', null, Math.max(40, from.pop * 0.2), undefined, site) ? '이주민들을 새 땅으로 보냈다.' : '이주 행렬이 길을 찾지 못하였다.';
    }
    if (ch === 'peace') {
      const e = w.factions[+d.peace];
      if (e && e.alive && w.rngSim.chance(0.5 + f.military / (f.military + e.military + 1) * 0.3)) {
        makePeace(w, f, e);
        return `${e.name}과(와)의 강화가 성사되었다.`;
      }
      return '상대는 강화를 거절하였다.';
    }
    c.wealth = Math.max(0, c.wealth - 40); c.fame += 10;
    for (const m of w.chars) if (m.died < 0 && m.faction === f.id && m.id !== c.id) addRel(w, m, c, 5, false);
    return '연회는 사흘 밤낮 이어졌다.';
  },
});

LIFE.push({
  id: 'plague', cooldown: 30, chance: 0.5,
  // 같은 역병을 '역병이 번진 고을'(xh_plague)로 이미 물었다면 다시 묻지 않는다
  cond: (w, c) => isAdult(w, c) && (w.settlements[c.home]?.plague ?? 0) > 0 && w.t - (w.player?.lastEvents.xh_plague ?? -999) > 24,
  build: (w, c) => ({
    eventId: 'plague', title: '역병', data: {},
    text: `${w.settlements[c.home].name}에 역병이 돌고 있다. 거리마다 신음 소리가 가득하다.`,
    choices: c.role === '노예' ? [ok('help', '남아서 병자를 돌본다', '명예 대폭 상승, 감염 위험'), ok('hide', '숨을 죽이고 견딘다', '')]
      : [ok('help', '남아서 병자를 돌본다', '명예 대폭 상승, 감염 위험'), ok('flee', '다른 곳으로 피신한다', '명예 하락, 안전')],
  }),
  resolve: (w, c, ch) => {
    if (ch === 'hide') { c.mood = clamp(c.mood - 8); return '사슬에 묶인 채 역병이 지나가기만을 기다렸다.'; }
    if (ch === 'help') {
      c.honor += 25; c.fame += 10;
      if (w.rngSim.chance(0.35)) { c.stats.health = clamp(c.stats.health - 45); return '병자를 돌보다 역병에 걸렸다. 열에 들떠 사경을 헤맨다.'; }
      w.player!.flags ??= {};
      w.player!.flags.ach_plaguesaint = w.t;
      return '밤낮없이 병자를 돌보았다. 사람들은 그를 성자라 불렀다.';
    }
    const f = w.factions[c.faction];
    const other = f && settlementsOf(w, f).find(s => s.id !== c.home && s.plague === 0);
    if (other) { c.home = other.id; relocate(w, c, other); }
    c.honor -= 10;
    return other ? `${other.name}(으)로 피신하였다.` : '피신할 곳이 없어 문을 걸어 잠갔다.';
  },
});

LIFE.push({
  id: 'raid_defense', cooldown: 36, chance: 0.6,
  cond: (w, c) => isAdult(w, c) && w.settlements[c.home]?.lastAttacked === w.t && c.act.kind === 'idle',
  build: (w, c) => ({
    eventId: 'raid_defense', title: '습격', data: { p: clamp((c.stats.might + 30) / 130, 0.2, 0.85) },
    text: `${w.settlements[c.home].name}이(가) 공격받고 있다! 비명과 불길이 치솟는다.`,
    choices: [
      ok('fight', '무기를 들고 맞선다', '명성 상승, 부상 위험', clamp((c.stats.might + 30) / 130, 0.2, 0.85)),
      ok('save', '아이들을 대피시킨다', '명예 상승'),
      ok('hide', '숨는다', ''),
    ],
  }),
  resolve: (w, c, ch, d) => {
    if (ch === 'fight') {
      if (w.rngSim.chance(+d.p)) { c.fame += 20; c.honor += 10; c.stats.might += 2; return '적들을 베어 넘기며 마을을 지켰다!'; }
      c.stats.health = clamp(c.stats.health - 35); return '분전하였으나 큰 상처를 입었다.';
    }
    if (ch === 'save') { c.honor += 15; return '불길 속에서 아이들을 구해냈다.'; }
    return '숨죽인 채 습격이 끝나기를 기다렸다.';
  },
});

LIFE.push({
  id: 'merchant_deal', cooldown: 60, chance: 0.005,
  cond: (w, c) => isAdult(w, c) && c.wealth > 40,
  build: (w, c) => {
    const amt = Math.round(c.wealth * 0.5);
    return {
      eventId: 'merchant_deal', title: '투자 제안', data: { amt },
      text: `낯선 상인이 먼 나라로 떠나는 상단에 금화 ${amt}닢을 투자하라고 권한다. 성공하면 두 배로 돌려준다고 한다.`,
      choices: [ok('invest', '투자한다', '성공 시 2배, 실패 시 전액 손실', 0.5 + c.apt[4] / 400), ok('no', '거절한다', '')],
    };
  },
  resolve: (w, c, ch, d) => {
    if (ch !== 'invest') return '수상한 제안을 거절하였다.';
    const amt = +d.amt;
    if (w.rngSim.chance(0.5 + c.apt[4] / 400)) { c.wealth += amt; return `상단이 무사히 돌아왔다! 금화 ${amt}닢을 벌었다.`; }
    c.wealth -= amt; return '상단은 끝내 돌아오지 않았다. 투자금을 모두 잃었다.';
  },
});

LIFE.push({
  id: 'rival', cooldown: 36, chance: 0.03,
  cond: (w, c) => isAdult(w, c) && Object.entries(c.relations).some(([id, v]) => v < -40 && w.chars[+id]?.died < 0 && w.chars[+id].l === c.l && dist(w.chars[+id], c) < 25),
  build: (w, c) => {
    const [id] = Object.entries(c.relations).filter(([i, v]) => v < -40 && w.chars[+i]?.died < 0 && w.chars[+i].l === c.l && dist(w.chars[+i], c) < 25).sort((a, b) => a[1] - b[1])[0];
    const o = w.chars[+id];
    return {
      eventId: 'rival', title: '숙적', data: { o: o.id },
      text: `숙적 ${charLabel(w, o)}과(와) 길에서 마주쳤다. 오래 묵은 원한이 끓어오른다.`,
      choices: [ok('duel', '결투를 신청한다', '승자는 살고 패자는 죽는다'), ok('reconcile', '손을 내민다', '관계 개선 시도'), ok('ignore', '외면한다', '')],
    };
  },
  resolve: (w, c, ch, d) => {
    const o = w.chars[+d.o];
    if (!o || o.died >= 0) return '그는 이미 세상에 없었다.';
    if (ch === 'duel') { const win = duel(w, c, o, '결투'); return win === c ? `${o.name}을(를) 결투에서 쓰러뜨렸다.` : '결투에서 패하였다…'; }
    if (ch === 'reconcile') {
      if (w.rngSim.chance(0.5)) { addRel(w, c, o, 50); return '오랜 원한을 풀었다.'; }
      return `${o.name}은(는) 내민 손을 뿌리쳤다.`;
    }
    return '고개를 돌려 지나쳤다.';
  },
});

LIFE.push({
  id: 'child_born', cooldown: 0, chance: 1,
  cond: (w, c) => c.children.some(id => w.chars[id]?.born === w.t),
  build: (w, c) => {
    const kid = w.chars[c.children.find(id => w.chars[id]?.born === w.t)!];
    const names = [kid.name, makeName(w.rngSim, kid.race, kid.sex), makeName(w.rngSim, kid.race, kid.sex)];
    return {
      eventId: 'child_born', title: '탄생', data: { k: kid.id, n0: names[0], n1: names[1], n2: names[2] },
      text: `${c.name}의 ${kid.sex === 'M' ? '아들' : '딸'}이 태어났다! 이름을 무엇으로 지을까?`,
      choices: names.map((n, i) => ok('n' + i, n, '')),
    };
  },
  resolve: (w, c, ch, d) => {
    const kid = w.chars[+d.k];
    kid.name = String(d[ch]);
    c.mood = clamp(c.mood + 20);
    return `아이의 이름을 ${kid.name}(으)로 지었다.`;
  },
});



LIFE.push({
  id: 'old_age', cooldown: 9999, once: true, chance: 0.3,
  cond: (w, c) => ageOf(w, c) > c.lifespan * 0.78,
  build: (w, c) => ({
    eventId: 'old_age', title: '황혼', data: {},
    text: `${c.name}의 머리카락이 하얗게 셌다. 남은 날들을 어떻게 보낼 것인가?`,
    choices: [
      ok('memoir', '회고록을 쓴다', '명성 상승'),
      ok('teach', '후계자를 가르친다', '자녀의 능력 상승'),
      ok('journey', '마지막 여행을 떠난다', '행복 상승'),
    ],
  }),
  resolve: (w, c, ch) => {
    if (ch === 'memoir') { c.fame += 20; return '평생의 이야기를 책으로 남겼다.'; }
    if (ch === 'teach') {
      for (const id of c.children) { const k = w.chars[id]; if (k && k.died < 0) { k.stats.command += 5; k.stats.intellect += 5; addRel(w, c, k, 20); } }
      return '자식들에게 평생의 지혜를 전하였다.';
    }
    c.mood = clamp(c.mood + 30); return '젊은 날 꿈꾸던 땅들을 둘러보았다.';
  },
});

LIFE.push({
  id: 'parent_death', cooldown: 0, chance: 1,
  cond: (w, c) => ageOf(w, c) >= Math.max(6, RACES[c.race].adult * 0.5) && [c.father, c.mother].some(id => id >= 0 && w.chars[id]?.died === w.t - 1),
  build: (w, c) => {
    const p = w.chars[[c.father, c.mother].find(id => id >= 0 && w.chars[id]?.died === w.t - 1)!];
    const killer = Object.entries(p.relations).find(([id, v]) => v <= -50 && w.chars[+id]?.died < 0 && w.chars[+id].kills > 0);
    const choices = [ok('mourn', '장례를 성대히 치른다', '명예 상승, 재산 소모'), ok('inherit', '유품을 정리하고 앞날을 생각한다', '재산 상승')];
    if (killer) choices.push(ok('revenge', `${w.chars[+killer[0]].name}에게 복수를 맹세한다`, '원수와의 관계 악화, 용기 상승'));
    return {
      eventId: 'parent_death', title: '이별', data: { p: p.id, k: killer ? +killer[0] : -1 },
      text: `${p.name}이(가) ${p.cause}(으)로 세상을 떠났다. ${c.name}의 마음 한구석이 무너져 내렸다.`, choices,
    };
  },
  resolve: (w, c, ch, d) => {
    c.mood = clamp(c.mood - 15);
    if (ch === 'mourn') { c.honor += 10; c.wealth = Math.max(0, c.wealth - 20); return '많은 이들이 장례에 찾아와 고인을 기렸다.'; }
    if (ch === 'revenge') {
      const k = w.chars[+d.k];
      if (k) addRel(w, c, k, -60, false);
      c.traits[COURAGE] = clamp(c.traits[COURAGE] + 10);
      return `${k?.name ?? '원수'}의 이름을 가슴에 새겼다.`;
    }
    c.wealth += 30; return '슬픔을 묻고 남겨진 것들을 정리하였다.';
  },
});

LIFE.push({
  id: 'mentor', cooldown: 9999, once: true, chance: 0.04,
  cond: (w, c) => isAdult(w, c) && ageOf(w, c) < RACES[c.race].adult + 15,
  build: (w, c) => {
    const masters = w.chars.filter(o => o.died < 0 && o.id !== c.id && o.home === c.home && isAdult(w, o) && (o.stats.might > 70 || o.stats.magic > 60 || o.stats.intellect > 70));
    if (!masters.length) return null;
    const m = w.rngSim.pick(masters);
    const kind = m.stats.magic > 60 ? 'magic' : m.stats.might > 70 ? 'sword' : 'book';
    const what = { magic: '마법', sword: '검술', book: '학문' }[kind];
    return {
      eventId: 'mentor', title: '스승', data: { m: m.id, kind },
      text: `${charLabel(w, m)}이(가) ${c.name}의 재능을 알아보고 ${what}을(를) 가르쳐 주겠다고 한다.`,
      choices: [ok('learn', '제자가 된다', `${what} 능력 크게 상승, 스승과의 인연`), ok('no', '홀로 길을 찾는다', '')],
    };
  },
  resolve: (w, c, ch, d) => {
    const m = w.chars[+d.m];
    if (ch !== 'learn' || !m) return '스승 없이 자신의 길을 가기로 하였다.';
    if (d.kind === 'magic') c.stats.magic = clamp(c.stats.magic + 15);
    else if (d.kind === 'sword') c.stats.might = clamp(c.stats.might + 15);
    else c.stats.intellect = clamp(c.stats.intellect + 15);
    addRel(w, c, m, 40);
    return `${m.name}의 가르침 아래 몇 해를 보냈다. 몰라보게 성장하였다.`;
  },
});

LIFE.push({
  id: 'famine', cooldown: 36, chance: 0.4,
  cond: (w, c) => isAdult(w, c) && (w.settlements[c.home]?.hunger ?? 0) >= 2,
  build: (w, c) => ({
    eventId: 'famine', title: '기근', data: {},
    text: `${w.settlements[c.home].name}의 곳간이 바닥났다. 아이들이 배고픔에 울고 있다.`,
    choices: [ok('share', '가진 것을 나눈다', '재산 하락, 명예·인지도 상승'), ok('hoard', '곡식을 사재기한다', '재산 상승, 명예 하락'), ok('hunt', '사냥을 나간다', '무력 판정', clamp((c.stats.might + 20) / 100, 0.2, 0.9))],
  }),
  resolve: (w, c, ch) => {
    const s = w.settlements[c.home];
    if (ch === 'share') { const g = Math.min(c.wealth, 40); c.wealth -= g; c.honor += 15; c.fame += 8; if (s) s.stock[0] += g; return '곳간을 열어 이웃들과 나누었다.'; }
    if (ch === 'hoard') { c.wealth += 30; c.honor -= 15; return '비싼 값에 곡식을 되팔았다. 원망의 눈초리가 따갑다.'; }
    if (w.rngSim.chance(clamp((c.stats.might + 20) / 100, 0.2, 0.9))) { if (s) s.stock[0] += 25; c.fame += 5; const l = s?.l ?? c.l; return l === 3 ? '굴 깊은 곳에서 눈먼 도마뱀을 잡아 돌아왔다.' : l === 4 ? '잿빛 황야에서 불도마뱀을 잡아 돌아왔다.' : l <= 1 ? '구름 사이를 나는 새들을 잡아 돌아왔다.' : '큰 사슴을 잡아 마을에 돌아왔다.'; }
    c.stats.health = clamp(c.stats.health - 20); return '빈손으로 돌아왔고, 짐승에게 물려 다쳤다.';
  },
});

// ───────────── 진행

const P0 = (w: World): Record<string, number> => (w.player!.flags ??= {});

export function playerTick(w: World): void {
  // 처지가 크게 바뀌었는지는 선택지가 떠 있어도 매달 살핀다
  watchMilestones(w);
  const P = w.player;
  if (P && !P.dead && w.chars[P.charId]?.died < 0) royalBirths(w, w.chars[P.charId]);
  if (!P || P.prompt || P.dead) return;
  const c = w.chars[P.charId];
  if (!c) return;
  if (c.died >= 0) { P.dead = true; return; }
  const rng = w.rngSim;
  const setPrompt = (prompt: PlayerPrompt, id: string) => {
    prompt.text = fixJosa(prompt.text);
    for (const ch of prompt.choices) { ch.label = fixJosa(ch.label); ch.desc = fixJosa(ch.desc); }
    P.lastEvents[id] = w.t;
    P.seen ??= {};
    P.seen[id] = (P.seen[id] ?? 0) + 1;
    P.prompt = prompt;
  };
  // 자주 겪은 일일수록 다시 찾아오기까지 오래 걸린다 (같은 장면이 한 생애에 수십 번 되풀이되지 않도록)
  const cdFor = (id: string, base: number) => base * (1 + 0.5 * Math.min(6, P.seen?.[id] ?? 0));
  const isDragon = c.race === 'dragon';
  // 무리에서 부르는 소리 (토벌대, 출정, 유적 입구): 오면 바로 묻는다
  {
    const x = makeCtx(w, c);
    for (const ev of INVITES) {
      if (!ev.c(x)) continue;
      const prompt = buildPrompt(x, ev);
      if (prompt) { setPrompt(prompt, ev.id); return; }
    }
    // 혼자인 성인에게는 인연이 찾아온다 (신분이 높을수록 혼담이 잦다)
    const mourning = P.flags?.mourning !== undefined && w.t - P.flags.mourning < 12;
    if (!mourning && c.spouse < 0 && c.act.kind !== 'army' && c.act.kind !== 'party' && c.act.kind !== 'voyage' && isAdult(w, c) && P.flags?.noMarry === undefined && c.race !== 'undead' && c.race !== 'dragon' && c.role !== '노예') {
      const high = x.isLeader || x.isGov || (c.house !== undefined && w.houses[c.house]?.head === c.id) || P.flags?.noble !== undefined;
      const hurry = P.flags?.hurryMatch !== undefined && w.t - P.flags.hurryMatch < 24;
      if (rng.chance(hurry ? 0.2 : high ? 0.08 : 0.05)) {
        for (const ev of [...(high ? ROYAL.filter(e => e.id === 'rl_match') : []), ...ROMANCE.filter(e => e.id === 'r_meet' || e.id === 'r_noble_match'), ...HOUSE.filter(e => e.id === 'hs_match')]) {
          const last = P.lastEvents[ev.id];
          if ((ev.once && last !== undefined) || (last !== undefined && w.t - last < (ev.cd ?? 24))) continue;
          if (!ev.c(x) || !fitsLife(w, c, ev.id)) continue;
          const prompt = buildPrompt(x, ev);
          if (prompt) { setPrompt(prompt, ev.id); return; }
        }
      }
    }
    // 인생의 큰 변화 (나라가 바뀜, 배우자의 죽음, 자리에 오름, 사슬)
    for (const ev of MILESTONES) {
      const last = P.lastEvents[ev.id];
      if (last !== undefined && w.t - last < (ev.cd ?? 12)) continue;
      if (!ev.c(x)) continue;
      const prompt = buildPrompt(x, ev);
      if (prompt) { setPrompt(prompt, ev.id); return; }
    }
    // 쓰러진 몸, 마지막 말
    for (const ev of CARE) {
      const last = P.lastEvents[ev.id];
      if ((ev.once && last !== undefined) || (last !== undefined && w.t - last < (ev.cd ?? 12))) continue;
      if (!ev.c(x)) continue;
      const prompt = buildPrompt(x, ev);
      if (prompt) { setPrompt(prompt, ev.id); return; }
    }
    // 마왕군이 내 고을로 오고 있다
    if (w.demonLord >= 0 && x.home && P.flags?.peril_dlarmy === undefined) {
      const dlf = w.chars[w.demonLord]?.faction ?? -1;
      const home = x.home;
      if (dlf >= 0 && c.faction !== dlf && w.armies.some(a => a.alive && a.target === home.id && (a.goal === 'conquer' || a.goal === 'raid')
        && (a.faction === dlf || w.factions[a.faction]?.flags.includes('dlvassal')) && a.l === home.l && dist(a, home) < 25)) markPeril(w, 'dlarmy', home);
    }
    // 세상의 재앙에 휘말렸다
    for (const ev of [...PERIL, ...DL_PERIL]) {
      const last = P.lastEvents[ev.id];
      if (!fitsLife(w, c, ev.id)) continue;
      if (last !== undefined && w.t - last < (ev.cd ?? 6)) continue;
      if (!ev.c(x)) continue;
      const prompt = buildPrompt(x, ev);
      if (prompt) { setPrompt(prompt, ev.id); return; }
    }
    // 인연의 상대가 먼저 세상을 떠났다
    for (const s of P.seeds ?? []) {
      const o = typeof s.data.oId === 'number' ? w.chars[s.data.oId] : undefined;
      if (o && o.died >= 0) {
        P.seeds = P.seeds!.filter(q => q !== s);
        charLog(w, c, `${o.name}의 부고를 들었다. ${s.note}의 인연은 그렇게 끝이 났다.`, 3);
        break;
      }
    }
    // 지난 선택이 돌아온다 (무르익은 인연)
    if (P.seeds?.some(s => s.due <= w.t) && c.act.kind === 'idle' && rng.chance(0.3)) {
      for (const ev of STORY) {
        if (!STORY_FOLLOW.has(ev.id) || !fitsLife(w, c, ev.id)) continue;
        if (!ev.c(x)) continue;
        const prompt = buildPrompt(x, ev);
        if (prompt) { setPrompt(prompt, ev.id); return; }
      }
    }
    // 무리와 함께 움직이는 동안에는 그 무리의 일만 일어난다
    const group = c.act.kind === 'party' ? PARTY_EV : c.act.kind === 'army' ? ARMY_EV : c.act.kind === 'travel' ? TRAVEL_EV : null;
    if (group) {
      // 부모 손에 이끌려 길을 가는 아이에게 길 위의 사건은 일어나지 않는다
      if (!isAdult(w, c)) return;
      if (!rng.chance(c.act.kind === 'travel' ? 0.06 : 0.09)) return;
      const eligible = group.filter(ev => { const last = P.lastEvents[ev.id]; return (last === undefined || w.t - last >= cdFor(ev.id, ev.cd ?? 12)) && ev.c(x); });
      const ev = eligible.length ? rng.pick(eligible) : null;
      const prompt = ev && buildPrompt(x, ev);
      if (prompt && ev) setPrompt(prompt, ev.id);
      return;
    }
  }
  // 바다 위에서는 바다의 일만 일어난다
  if (c.act.kind === 'voyage') {
    if (!rng.chance(0.04)) return;
    const x = makeCtx(w, c);
    const eligible = SEA.filter(ev => { const last = P.lastEvents[ev.id]; return (last === undefined || w.t - last >= (ev.cd ?? 48)) && ev.c(x); });
    const ev = eligible.length ? rng.pick(eligible) : null;
    const prompt = ev && buildPrompt(x, ev);
    if (prompt && ev) setPrompt(prompt, ev.id);
    return;
  }
  // 1) 꼭 짚어야 할 순간들 (용에게는 해당 없음)
  const isGuardian = c.awakened.includes('guardian');
  for (const ev of isDragon ? [] : isGuardian ? LIFE.filter(e => GUARDIAN_LIFE.has(e.id)) : c.role === '노예' ? LIFE.filter(e => SLAVE_LIFE.has(e.id)) : LIFE) {
    const last = P.lastEvents[ev.id];
    if (ev.once && last !== undefined) continue;
    if (last !== undefined && w.t - last < cdFor(ev.id, ev.cooldown)) continue;
    if (!fitsLife(w, c, ev.id) || !ev.cond(w, c)) continue;
    // 모험의 부름을 거듭 흘려들었다면 소문도 덜 들린다
    const shy = ev.id === 'adventure' ? Math.pow(0.6, P.flags?.advNo ?? 0) : 1;
    if (!rng.chance(Math.min(1, ev.chance * 1.5 * shy))) continue;
    const prompt = ev.build(w, c);
    if (!prompt) continue;
    setPrompt(prompt, ev.id);
    return;
  }
  const x = makeCtx(w, c);
  // 2) 직업 찾기 / 모험가의 권태
  // 일을 구하러 나서기 전에, 누군가 먼저 일을 권하러 오기도 한다
  for (const [ev, cd, chance] of (isDragon || isGuardian ? [] : [[JOB_OFFER[0], 18, 0.3], [JOB_SEARCH, 4, 0.5], [ADVENTURER_TIRED, 36, 0.03]]) as [LifeEv, number, number][]) {
    const last = P.lastEvents[ev.id];
    if (last !== undefined && w.t - last < cd) continue;
    if (!fitsLife(w, c, ev.id) || !ev.c(x) || !rng.chance(chance)) continue;
    const prompt = buildPrompt(x, ev);
    if (prompt) { setPrompt(prompt, ev.id); return; }
  }
  // 3) 인생의 여러 순간들
  const special = x.c.race === 'dragon' || x.c.awakened.includes('guardian');
  const rate = x.stage < 1 ? 0.022 : special ? 0.05 : 0.03;
  if (!rng.chance(rate)) return;
  const base = isDragon ? DRAGON : isGuardian ? POOL_GUARDIAN : c.role === '노예' ? POOL_SLAVE : c.race === 'undead' ? POOL_HUMAN.filter(e => !UNDEAD_SKIP.has(e.id)) : POOL_HUMAN;
  const eligible = base.filter(ev => {
    const last = P.lastEvents[ev.id];
    if (!fitsLife(w, c, ev.id)) return false;
    if (ev.once && last !== undefined) return false;
    if (last !== undefined && w.t - last < cdFor(ev.id, ev.cd ?? 48)) return false;
    return ev.c(x);
  });
  for (let i = 0; i < 4 && eligible.length; i++) {
    const ev = rng.weighted(eligible, e => (e.w ?? 1) * (GUARDIAN.includes(e) || DRAGON.includes(e) || POWER.includes(e) || GOVPATH.includes(e) || ARTFATE.includes(e) ? 2.5 : 1))!;
    const prompt = buildPrompt(x, ev);
    if (prompt) { setPrompt(prompt, ev.id); return; }
    eligible.splice(eligible.indexOf(ev), 1);
  }
}

const POOL: LifeEv[] = [...CHILD, ...ROMANCE, ...TRAIT, ...RACIAL, ...JOBS, ...POWER, ...GUARDIAN, ...DRAGON,
  ...WORKS_EV, ...RENOWN, ...ARTFATE, ...GOVPATH, ...NEWJOBS, ...GUARDIAN2, ...ECON, ...SLAVE, ...TOWER, ...SEA_START, ...ALLIANCE_EV, ...STORY.filter(e => !STORY_FOLLOW.has(e.id)), ...CAREER, ...HOUSE, JOB_OFFER[1], ...ROYAL, ...RULE, ...ARCS];
const POOL_HUMAN: LifeEv[] = POOL.filter(e => !DRAGON.includes(e));
/** 돈벌이·출세와 무관한 성역의 수호자에게 어울리는 것들 */
const MONEY_TRAITS = new Set(['t_greedy_purse', 't_cruel_chance', 't_prudent_invest', 't_reckless_bet', 't_traitor_whisper', 't_social_party', 't_loyal_test']);
const POOL_GUARDIAN: LifeEv[] = [...GUARDIAN, ...GUARDIAN2, ...TRAIT.filter(e => !MONEY_TRAITS.has(e.id)), ...RACIAL.filter(e => e.id === 'rc_angel_descent'),
  ...POWER.filter(e => e.id.startsWith('p_hero'))];
const GUARDIAN_LIFE = new Set(['raid_defense', 'parent_death', 'child_born']);
/** 노예의 삶: 사슬 속의 선택들과 성향 */
const POOL_SLAVE: LifeEv[] = [...SLAVE, ...TRAIT.filter(e => !MONEY_TRAITS.has(e.id)), ...RACIAL];
const SLAVE_LIFE = new Set(['raid_defense', 'parent_death', 'child_born', 'plague', 'old_age']);
/** 언데드는 사랑과 출산을 겪지 않는다 */
const UNDEAD_SKIP = new Set([...ROMANCE.map(e => e.id), 'c_teen_love', 'c_firstword', 'c_sick', 'hs_match', 'rc_elder_legacy', 'old_age', 'plague']);
/** 신분과 처지에 맞지 않는 이벤트 */
// 군주는 던전을 헤매거나 일자리를 구하러 다니지 않는다
const LEADER_SKIP = new Set(['adventure', 'job_search', 'jo_offer', 'j_fired', 'e_capital', 'e_riot', 'e_boom', 'e_crowded', 't_traitor_whisper', 'j_war_promote', 'j_idle_nap', 'j_idle_odd', 'j_idle_scam', 'j_idle_parent', 'st_stranger_robbed', 'st_stranger_helped', 'w_장인', 'gp_trial', 'gp_offer']);
const GOV_SKIP = new Set(['e_riot', 'e_capital', 'j_fired', 'j_war_promote', 'st_stranger_helped', 'gp_offer']);
const ORPHAN_SKIP = new Set(['c_firstword', 'c_lost', 'c_teen_rebel', 'j_idle_parent']);
const SLAVE_SKIP = new Set(['rc_elf_century', 'rc_orc_waaagh', 'rc_dwarf_forge', 'rc_human_ambition', 'rc_darkelf_intrigue', 't_lonely_hermit', 't_kind_beggar', 't_faith_vision',
  'xh_quake', 'xh_fall', 'st_stranger_helped', 'st_thief_hired', 'st_loan', 'hs_found', 'hs_match']);
/** 이 인물에게 이 이벤트가 어울리는가 */
function fitsLife(w: World, c: Character, id: string): boolean {
  const P = w.player!;
  const f = w.factions[c.faction];
  if (f && f.leader === c.id && LEADER_SKIP.has(id)) return false;
  if (GOV_SKIP.has(id) && w.settlements.some(s => s.alive && s.governor === c.id)) return false;
  if (P.flags?.orphan !== undefined && ORPHAN_SKIP.has(id)) return false;
  if (c.role === '노예' && SLAVE_SKIP.has(id)) return false;
  if (RACES[c.race].needs[0] === 0 && UNDEAD_SKIP.has(id)) return false;
  return true;
}
const POOL_MAP = new Map<string, LifeEv>([...POOL, ...SEA, ...STORY, ...PERIL, ...MILESTONES, ...JOB_OFFER, ...INVITES, ...PARTY_EV, ...ARMY_EV, ...TRAVEL_EV, ...CARE, ...DL_PERIL, JOB_SEARCH, ADVENTURER_TIRED].map(e => [e.id, e]));
export const LIFE_EVENT_COUNT = () => POOL.length + LIFE.length + 2;

export function resolvePlayer(w: World, choiceId: string): string {
  const P = w.player;
  if (!P || !P.prompt) return '';
  const c = w.chars[P.charId];
  const title = P.prompt.title;
  const data = P.prompt.data;
  const id = P.prompt.eventId;
  const chosen = P.prompt.choices.find(ch => ch.id === choiceId)?.label ?? '';
  P.prompt = null;
  P.flags ??= {};
  P.flags.lastResolve = w.t;
  if (!c) return '';
  const before = { 재산: c.wealth, 명성: c.fame, 명예: c.honor, 체력: c.stats.health, 무력: c.stats.might, 지력: c.stats.intellect, 마력: c.stats.magic, 통솔: c.stats.command, 매력: c.stats.charisma };
  const role0 = c.role;
  let text = '';
  const pe = POOL_MAP.get(id);
  if (pe) text = resolveLife(makeCtx(w, c), pe, choiceId, data);
  else {
    const ev = LIFE.find(e => e.id === id);
    if (!ev) return '';
    text = fixJosa(ev.resolve(w, c, choiceId, data));
  }
  for (const k of Object.keys(c.stats) as (keyof Character['stats'])[]) c.stats[k] = clamp(c.stats[k]);
  c.wealth = Math.max(0, c.wealth);
  // 무엇을 골랐는지도 함께 남겨야 이야기가 이어진다
  const line = `[${title}] ${chosen ? `${chosen} — ` : ''}${text}`;
  P.results.push({ t: w.t, text: line });
  if (P.results.length > 100) P.results.shift();
  charLog(w, c, line, 3);
  // 그 선택으로 죽었다면, 선택이 죽음보다 먼저 적혀야 한다
  if (c.died >= 0 && c.bio.length >= 2 && c.bio[c.bio.length - 1].text === line) {
    const i = c.bio.findIndex(b => b.t === w.t && /생을 마감하였다/.test(b.text));
    if (i >= 0 && i < c.bio.length - 1) c.bio.splice(i, 0, c.bio.pop()!);
  }
  if (c.died >= 0) P.dead = true;
  // 무엇이 달라졌는가
  const after = { 재산: c.wealth, 명성: c.fame, 명예: c.honor, 체력: c.stats.health, 무력: c.stats.might, 지력: c.stats.intellect, 마력: c.stats.magic, 통솔: c.stats.command, 매력: c.stats.charisma };
  const diff = (Object.keys(before) as (keyof typeof before)[]).map(k => [k, after[k] - before[k]] as const).filter(([, d]) => Math.abs(d) >= 0.5)
    .map(([k, d]) => `${k} ${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}`);
  if (c.role !== role0) diff.push(`직업 ${role0} → ${c.role}`);
  return diff.length ? `${text} 【변화】 ${diff.join(' · ')}` : text;
}

/** 사망 후 자식으로 이어하기 */
export function continueAsHeir(w: World): boolean {
  const P = w.player;
  if (!P) return false;
  const c = w.chars[P.charId];
  const kids = c.children.map(id => w.chars[id]).filter(k => k && k.died < 0).sort((a, b) => a.born - b.born);
  if (!kids.length) return false;
  // 생전에 뒤를 맡긴 자식이 살아 있으면 그가 잇는다
  const named = w.chars[P.flags?.heir ?? -1];
  const k = named && named.died < 0 && kids.includes(named) ? named : kids[0];
  k.isPlayer = true;
  w.player = { charId: k.id, prompt: null, lastEvents: {}, path: '', results: [], dead: false, flags: {}, generation: (P.generation ?? 1) + 1, jobsHad: [], jobSince: w.t };
  for (const key of ['wokeAncient', 'minerDragon', 'calmAncient', 'saved', 'dragonKills', 'treeMade', 'slayDl', 'elope']) if (P.flags?.[key]) w.player.flags![key] = P.flags[key];
  charLog(w, k, `부모 ${c.name}의 뜻을 이어받았다.`, 3);
  return true;
}

export function playerSummary(w: World): { lines: string[]; bio: string[] } {
  const P = w.player!;
  const c = w.chars[P.charId];
  const lines = [
    `${c.name} (${RACES[c.race].name}, ${ageOf(w, c)}세)`,
    `사인: ${c.cause || '—'}`,
    `최고 명성 ${Math.round(c.fame)} · 명예 ${Math.round(c.honor)} · 재산 ${Math.round(c.wealth)}`,
    `자녀 ${c.children.length}명 · 처치 ${c.kills}`,
  ];
  const bio = c.bio.map(b => b.text);
  return { lines, bio };
}
