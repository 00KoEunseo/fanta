import { RACES, type RaceKey, POP_RACES, L_SURFACE, L_SKY } from '../data/races';
import { knows } from './contact';
import { dragonSpat } from './clash';
import { fertile as fertileC, relocate } from './characters';
import { disasterStrikes } from './peril';
import { knowsDL } from './crusade';
import * as T from '../data/terrain';
import { FOOD, GOLD, MANA, ORE, STONE, WOOD } from '../data/terrain';
import { APT_DEMONLORD, APT_HERO, COMPASSION, AMBITION, LOYALTY, APT_TRAITOR, COURAGE, GREED } from '../data/traits';
import { makeClanName, makePlaceName } from '../data/names';
import { addNews, charLog } from './news';
import { fixJosa } from '../data/text';
import { rebuildPortalLinks } from './path';
import type { Character, Faction, NewsCat, Settlement, World } from './state';
import { dateStr, dist, seasonOf, yearOf } from './state';
import {
  addFacRel, addRel, aliveFactions, approxDist, charLabel, clamp, facRel, isAdult, isHero, leaderOf, settlementsOf,
} from './helpers';
import { awaken, createCharacter, duel, killChar } from './characters';
import { aggrieve, createFaction, crown, declareWar, facDist, factionName, invalidateDist, launchAttack, makePeace, secede, transferSettlement } from './factions';
import { foundSettlement, hasFlag, setTimedFlag, findColonySite } from './settlements';
import { brokenCount } from './doom';
import { seatHolder } from './angels';
import { outbreak } from './disease';
import { totalSlaves } from './slavery';
import { pStartTower, startTower } from './towers';
import { assignDragonKind, betrayDragon, checkDragonWrath, makePatron, pSlayPatron, pTreeHarvest, startHarvest } from './calamity';

type Scope = 'world' | 'settlement' | 'faction' | 'char';
export interface Forecast { text: string; imp: number; cat: NewsCat }
export interface EventDef {
  id: string;
  scope: Scope;
  p: (w: World, x: any) => number;
  fire: (w: World, x: any) => void;
  forecast?: (w: World, x: any) => Forecast | null;
}

const once = (f: { flags: string[] }, k: string) => !f.flags.includes(k);
const isLight = (r: RaceKey) => RACES[r].align === 'light';
const facOf = (w: World, s: Settlement) => w.factions[s.faction];

export const EVENTS: EventDef[] = [];
function ev(d: EventDef) { EVENTS.push(d); }
const rng0 = (w: World) => w.rngSim;

// ═════════════ 자연
ev({
  id: 'harvest', scope: 'settlement',
  p: (w, s: Settlement) => (s.l === L_SURFACE && seasonOf(w.t) === 2 ? 0.012 : 0),
  fire: (w, s: Settlement) => {
    s.stock[FOOD] += s.cons[FOOD] * 6; setTimedFlag(s, 'blessed', w.t + 3);
    if (s.tier >= 2) addNews(w, `${s.name}에 유례없는 풍년이 들었다.`, 1, 'nature', { pos: s });
  },
});
ev({
  id: 'drought', scope: 'settlement',
  p: (w, s: Settlement) => (s.l === L_SURFACE && seasonOf(w.t) === 1 ? 0.004 : 0),
  fire: (w, s: Settlement) => {
    setTimedFlag(s, 'drought', w.t + w.rngSim.int(4, 10));
    addNews(w, `${s.name} 일대에 가뭄이 들어 강바닥이 드러났다.`, 2, 'nature', { pos: s, facs: [s.faction] });
  },
});
ev({
  id: 'harsh_winter', scope: 'world',
  p: w => (seasonOf(w.t) === 3 && (w.t % 12) === 11 ? 0.08 : 0),
  fire: w => {
    let n = 0;
    for (const s of w.settlements) if (s.alive && s.l === L_SURFACE && s.y < 45) { s.stock[FOOD] *= 0.6; n++; }
    addNews(w, `${yearOf(w)}년 겨울, 북쪽 땅에 혹한이 몰아쳐 ${n}곳의 정착지가 식량을 잃었다.`, 3, 'nature');
  },
});
ev({
  id: 'earthquake', scope: 'settlement',
  p: (w, s: Settlement) => (s.l === 3 ? 0.0012 : 0.0005),
  fire: (w, s: Settlement) => {
    const dead = Math.round(s.pop * w.rngSim.float(0.03, 0.1));
    s.pop -= dead; s.dev = Math.max(0, s.dev - 6); s.stability = clamp(s.stability - 10);
    addNews(w, `${s.name}에 지진이 일어나 ${dead}명이 무너진 집에 깔렸다.`, s.tier >= 2 ? 3 : 2, 'nature', { pos: s, facs: [s.faction] });
    disasterStrikes(w, s, 'quake', `${s.name} 지진에 깔림`, 0.05);
  },
});
ev({
  id: 'locusts', scope: 'settlement',
  p: (w, s: Settlement) => (s.l === L_SURFACE && seasonOf(w.t) === 1 ? 0.0015 : 0),
  fire: (w, s: Settlement) => {
    s.stock[FOOD] *= 0.4;
    addNews(w, `메뚜기 떼가 ${s.name}의 들판을 휩쓸었다.`, 2, 'nature', { pos: s, facs: [s.faction] });
  },
});
ev({
  id: 'plague', scope: 'settlement',
  p: (w, s: Settlement) => {
    if (s.plague > 0 || s.pop < 700 || RACES[s.race].needs[FOOD] === 0 || s.race === 'demon' || s.race === 'angel') return 0;
    return 0.00008 * Math.min(3, s.pop / 1500);
  },
  fire: (w, s: Settlement) => { outbreak(w, s); },
  forecast: (w, s: Settlement) => ({ text: `${s.name}에 새 병이 돈다`, imp: 3, cat: 'nature' }),
});
ev({
  id: 'mana_storm', scope: 'world',
  p: () => 0.004,
  fire: w => {
    const rng = w.rngSim;
    const closed = w.portals.filter(p => p.kind === 'rift' && !p.open);
    if (closed.length && rng.chance(0.12)) {
      const p = rng.pick(closed);
      p.open = true; rebuildPortalLinks(w); invalidateDist(w);
      addNews(w, `거대한 마나 폭풍이 몰아쳐 '${p.name}'이(가) 찢어지듯 열렸다. 마계의 바람이 새어 나온다.`, 4, 'dark', { pos: p.a });
    } else {
      for (const s of w.settlements) if (s.alive && s.l <= 2) s.stock[MANA] += 30;
      addNews(w, '하늘에 마나 폭풍이 일어 오로라가 대륙을 덮었다. 마법사들의 힘이 일시적으로 강해졌다.', 2, 'nature');
    }
  },
});
ev({
  id: 'meteor', scope: 'world',
  p: () => 0.0012,
  fire: w => {
    const rng = w.rngSim;
    const L = w.layers[L_SURFACE];
    for (let i = 0; i < 50; i++) {
      const x = rng.int(2, L.w - 3), y = rng.int(2, L.h - 3);
      if (T.TERRAIN[L.terrain[y * L.w + x]].move <= 0) continue;
      const hit = w.settlements.find(s => s.alive && s.l === L_SURFACE && Math.hypot(s.x - x, s.y - y) < 3);
      w.sites.push({ id: w.sites.length, l: L_SURFACE, x, y, kind: 'ruin', name: '별이 떨어진 자리', level: 3, loot: 150, relic: '별철' });
      if (hit) {
        const dead = Math.round(hit.pop * 0.15);
        hit.pop -= dead; hit.dev = Math.max(0, hit.dev - 10);
        addNews(w, `하늘에서 떨어진 불덩이가 ${hit.name}을(를) 강타하였다. ${dead}명이 목숨을 잃었다.`, 4, 'nature', { pos: hit });
      } else addNews(w, '밤하늘을 가르며 별 하나가 대지에 떨어졌다. 그 자리엔 낯선 쇠붙이가 박혀 있다고 한다.', 3, 'nature', { pos: { l: L_SURFACE, x, y } });
      return;
    }
  },
});

// ═════════════ 발견
ev({
  id: 'ore_vein', scope: 'settlement',
  p: (w, s: Settlement) => (s.l === 3 ? 0.003 : 0.0008),
  fire: (w, s: Settlement) => {
    s.stock[ORE] += 120; s.stock[GOLD] += 40;
    addNews(w, rng0(w).pick([`${s.name}의 광부들이 새로운 광맥을 발견하였다.`, `${s.name}의 갱도 끝에서 반짝이는 광맥이 드러났다.`, `${s.name} 근처 언덕에서 쇠가 섞인 바위가 발견되었다.`, `${s.name}에 새 광맥 소식이 돌자 일꾼들이 몰려들었다.`]), 1, 'growth', { pos: s });
  },
});
ev({
  id: 'ruins_found', scope: 'settlement',
  p: () => 0.0008,
  fire: (w, s: Settlement) => {
    const rng = w.rngSim;
    const L = w.layers[s.l];
    for (let i = 0; i < 20; i++) {
      const x = s.x + rng.int(-8, 8), y = s.y + rng.int(-8, 8);
      if (x < 0 || y < 0 || x >= L.w || y >= L.h || T.TERRAIN[L.terrain[y * L.w + x]].move <= 0) continue;
      const name = `${makePlaceName(rng, 'elf')} ${rng.pick(['고대 유적', '봉인된 무덤', '잊힌 신전'])}`;
      w.sites.push({ id: w.sites.length, l: s.l, x, y, kind: 'ruin', name, level: rng.int(1, 5), loot: rng.int(80, 300), relic: rng.chance(0.08) ? rng.pick(['마검', '현자의 돌']) : null });
      addNews(w, `${s.name} 근처에서 ${name}이(가) 모습을 드러냈다. 모험가들이 몰려들기 시작하였다.`, 2, 'growth', { pos: { l: s.l, x, y } });
      return;
    }
  },
});
ev({
  id: 'dragon_egg', scope: 'world',
  p: w => (w.chars.filter(c => c.died < 0 && c.race === 'dragon').length < 6 ? 0.0015 : 0),
  fire: w => {
    const d = spawnDragon(w, false);
    if (d) addNews(w, `${w.layers[d.l] ? ['천상', '하늘', '지상', '지하', '마계'][d.l] : ''}의 외딴 둥지에서 용의 알이 부화하였다. 새끼 용 ${d.name}이(가) 첫 울음을 터뜨렸다.`, 3, 'nature', { pos: d, chars: [d.id] });
  },
});

// ═════════════ 사회 / 정치
ev({
  id: 'festival', scope: 'settlement',
  p: (w, s: Settlement) => (s.tier >= 2 && s.stability > 65 ? 0.004 : 0),
  fire: (w, s: Settlement) => {
    setTimedFlag(s, 'festival', w.t + 6);
    addNews(w, `${s.name}에서 성대한 축제가 열렸다.`, 1, 'growth', { pos: s });
  },
});
ev({
  id: 'riot', scope: 'settlement',
  p: (w, s: Settlement) => (s.stability < 22 && s.pop >= 50 && !hasFlag(s, 'riot', w.t) ? 0.04 : 0),
  fire: (w, s: Settlement) => {
    const rng = w.rngSim;
    s.pop *= 0.97; s.dev = Math.max(0, s.dev - 2);
    setTimedFlag(s, 'riot', w.t + 36);
    const gov0 = w.chars[s.governor];
    const gov = gov0 && gov0.act.kind === 'idle' && gov0.l === s.l && dist(gov0, s) <= 4 ? gov0 : undefined;
    const f = facOf(w, s);
    if (gov && gov.died < 0 && f && f.capital !== s.id && w.demonLord !== gov.id && rng.chance(0.25)) {
      killChar(w, gov, '폭도들의 손');
      addNews(w, `${s.name}에서 폭동이 일어나 영주 ${gov.name}이(가) 성난 군중에게 살해되었다.`, 3, 'politics', { pos: s, facs: [s.faction] });
    } else if (gov && gov.died < 0 && gov.traits[AMBITION] > 70 && gov.traits[LOYALTY] < 40 && f && f.capital !== s.id) {
      addNews(w, `${s.name}에서 폭동이 일어나자 영주 ${gov.name}은(는) 이를 기회로 삼았다.`, 3, 'politics', { pos: s });
      secede(w, gov, s);
    } else addNews(w, `${s.name}에서 굶주림과 불만에 찬 백성들이 폭동을 일으켰다.`, 2, 'politics', { pos: s, facs: [s.faction] });
    s.stability = clamp(s.stability + 15);
  },
});
ev({
  id: 'cult', scope: 'settlement',
  p: (w, s: Settlement) => (once(s, 'cult') && s.stability < 40 && s.l <= 3 ? 0.0006 : 0),
  fire: (w, s: Settlement) => {
    s.flags.push('cult');
    addNews(w, `${s.name}의 뒷골목에 심연을 숭배하는 비밀 교단이 뿌리를 내렸다.`, 3, 'dark', { pos: s });
  },
});
ev({
  id: 'cult_ritual', scope: 'settlement',
  p: (w, s: Settlement) => (s.flags.includes('cult') ? 0.003 : 0),
  fire: (w, s: Settlement) => {
    const rng = w.rngSim;
    const closed = w.portals.filter(p => p.kind === 'rift' && !p.open);
    s.flags = s.flags.filter(f => f !== 'cult');
    if (closed.length && rng.chance(0.3)) {
      const p = rng.pick(closed);
      p.open = true; rebuildPortalLinks(w); invalidateDist(w);
      addNews(w, `${s.name}의 사교도들이 피의 의식을 치러 '${p.name}'을(를) 열어젖혔다.`, 4, 'dark', { pos: s });
    } else {
      s.pop *= 0.95;
      addNews(w, `${s.name}에서 사교도들의 의식이 발각되어 교단이 일망타진되었다.`, 2, 'dark', { pos: s });
    }
  },
  forecast: (w, s: Settlement) => ({ text: `${s.name}의 사교도들이 차원의 문을 연다`, imp: 4, cat: 'dark' }),
});
ev({
  id: 'tournament', scope: 'faction',
  p: (w, f: Faction) => (f.tier >= 2 && (f.race === 'human' || f.race === 'orc' || f.race === 'beast') ? 0.003 : 0),
  fire: (w, f: Faction) => {
    const rng = w.rngSim;
    const cands = w.chars.filter(c => c.died < 0 && c.faction === f.id && isAdult(w, c) && c.stats.might > 40);
    if (!cands.length) return;
    const win = rng.weighted(cands, c => Math.pow(c.stats.might, 3))!;
    win.fame += 25;
    addNews(w, `${f.name}의 대무술 대회에서 ${win.name}이(가) 우승하여 이름을 떨쳤다.`, 2, 'hero', { facs: [f.id], chars: [win.id] });
    if (win.apt[APT_HERO] >= 80 && rng.chance(0.2)) awaken(w, win, 'hero', '대회의 마지막 일격에서');
  },
});
ev({
  id: 'marriage_alliance', scope: 'faction',
  p: (w, f: Faction) => (f.tier >= 1 ? 0.0025 : 0),
  fire: (w, f: Faction) => {
    const rng = w.rngSim;
    const ld = leaderOf(w, f);
    if (!ld) return;
    const kids = ld.children.map(i => w.chars[i]).filter(k => k && k.died < 0 && k.spouse < 0 && isAdult(w, k) && fertileC(w, k) && !k.isPlayer && k.act.kind === 'idle');
    if (!kids.length) return;
    const others = aliveFactions(w).filter(o => o !== f && o.race === f.race && knows(w, f, o) && facRel(f, o.id) > 0 && !o.wars[f.id]);
    for (const o of rng.shuffle(others)) {
      const ol = leaderOf(w, o);
      if (!ol) continue;
      const okids = ol.children.map(i => w.chars[i]).filter(k => k && k.died < 0 && k.spouse < 0 && isAdult(w, k) && fertileC(w, k) && !k.isPlayer && k.act.kind === 'idle');
      for (const a of kids) {
        const b = okids.find(k => k.sex !== a.sex);
        if (!b) continue;
        a.spouse = b.id; b.spouse = a.id;
        // 신부(신랑)는 상대의 수도로 떠난다
        const bride = a.sex === 'F' ? a : b, groom = bride === a ? b : a;
        const ghome = w.settlements[groom.home];
        if (ghome && ghome.alive) { bride.home = ghome.id; bride.faction = groom.faction; relocate(w, bride, ghome); }
        addFacRel(w, f, o, 35);
        charLog(w, a, `${o.name}의 ${b.name}과(와) 정략결혼을 하였다.`, 3);
        charLog(w, b, `${f.name}의 ${a.name}과(와) 정략결혼을 하였다.`, 3);
        addNews(w, `${f.name}의 ${a.name}과(와) ${o.name}의 ${b.name}이(가) 혼인하여 두 나라가 손을 잡았다.`, 3, 'politics', { facs: [f.id, o.id], chars: [a.id, b.id] });
        return;
      }
    }
  },
});
ev({
  id: 'assassination', scope: 'faction',
  p: (w, f: Faction) => (Object.keys(f.wars).length ? 0.0012 : 0.0002),
  fire: (w, f: Faction) => {
    const ld = leaderOf(w, f);
    if (!ld) return;
    const enemies = Object.keys(f.wars).map(id => w.factions[+id]).filter(Boolean);
    const by = enemies.length ? w.rngSim.pick(enemies) : null;
    if (w.rngSim.chance(w.demonLord === ld.id ? 0.93 : 0.5 + ld.traits[8] / 300)) {
      addNews(w, `${f.name}의 ${charLabel(w, ld)}을(를) 노린 암살 시도가 있었으나 실패하였다.${by ? ` 배후에는 ${by.name}이(가) 있다는 소문이다.` : ''}`, 3, 'politics', { facs: [f.id], chars: [ld.id] });
      if (by) { addFacRel(w, f, by, -20); aggrieve(w, f, by, `${ld.name}을(를) 노린 암살 시도`); }
      return;
    }
    addNews(w, `${f.name}의 ${charLabel(w, ld)}이(가) 암살자의 독검에 쓰러졌다.${by ? ` 배후로 ${by.name}이(가) 지목되었다.` : ''}`, 4, 'politics', { facs: [f.id], chars: [ld.id] });
    aggrieve(w, f, by ?? undefined, `선왕 ${ld.name}이(가) 암살당한 일`);
    killChar(w, ld, '암살');
  },
});
ev({
  id: 'golden_age', scope: 'faction',
  p: (w, f: Faction) => (once(f, 'golden_age') && f.avgDev > 55 && !Object.keys(f.wars).length && f.tier >= 2 ? 0.004 : 0),
  fire: (w, f: Faction) => {
    f.flags.push('golden_age'); f.legitimacy = clamp(f.legitimacy + 20);
    const ld = leaderOf(w, f);
    addNews(w, `${f.name}이(가) 황금기를 맞이하였다.${ld ? ` 사람들은 ${ld.name}의 치세를 칭송하였다.` : ''}`, 3, 'growth', { facs: [f.id], chars: ld ? [ld.id] : [] });
  },
});
ev({
  id: 'betrayal', scope: 'settlement',
  p: (w, s: Settlement) => {
    const g = w.chars[s.governor];
    const f = facOf(w, s);
    if (!g || g.died >= 0 || !f || f.capital === s.id || !Object.keys(f.wars).length) return 0;
    return g.apt[APT_TRAITOR] > 60 && g.traits[LOYALTY] < 40 ? 0.004 : 0;
  },
  fire: (w, s: Settlement) => {
    const g = w.chars[s.governor];
    const f = facOf(w, s);
    const enemies = Object.keys(f.wars).map(id => w.factions[+id]).filter(e => e && e.alive);
    if (!enemies.length) return;
    const e = w.rngSim.pick(enemies);
    awaken(w, g, 'traitor', '');
    transferSettlement(w, s, e);
    g.faction = e.id; s.governor = g.id;
    addNews(w, `${s.name}의 영주 ${g.name}이(가) 성문을 열고 ${e.name}에 투항하였다. ${f.name}은(는) 그를 배신자라 불렀다.`, 3, 'politics', { pos: s, facs: [f.id, e.id], chars: [g.id] });
  },
  forecast: (w, s: Settlement) => ({ text: `${s.name}의 영주가 배신한다`, imp: 3, cat: 'politics' }),
});

// ═════════════ 영웅 / 어둠
ev({
  id: 'revelation', scope: 'world',
  p: w => {
    if (!w.factions.some(f => f.alive && f.race === 'angel') || !seatHolder(w, 3)) return 0;
    const heroes = w.chars.filter(c => c.died < 0 && isHero(c)).length;
    if (heroes >= 3) return 0;
    return w.demonLord >= 0 ? 0.015 : brokenCount(w) >= 1 ? 0.003 : 0.0006;
  },
  fire: w => {
    const cands = w.chars.filter(c => c.died < 0 && !isHero(c) && isLight(c.race) && isAdult(w, c) && c.apt[APT_HERO] >= 55 && c.race !== 'angel');
    if (!cands.length) return;
    cands.sort((a, b) => b.apt[APT_HERO] - a.apt[APT_HERO]);
    const c = cands[0];
    const angel = w.factions.find(f => f.alive && f.race === 'angel');
    const seer = seatHolder(w, 3);
    awaken(w, c, 'hero', `계시의 천사 ${seer ? seer.name : ''}이(가) 내린 빛줄기가 ${c.name}을(를) 비추었다.`);
    void angel;
  },
  forecast: () => ({ text: '천상의 계시로 새 용사가 선택된다', imp: 4, cat: 'hero' }),
});
ev({
  id: 'demon_lord_ritual', scope: 'faction',
  p: (w, f: Faction) => {
    if (w.demonLord >= 0 || (f.race !== 'majin' && f.race !== 'demon' && f.race !== 'darkelf' && f.race !== 'undead')) return 0;
    { const l0 = leaderOf(w, f); if (!l0 || l0.isPlayer || !isAdult(w, l0)) return 0; }
    const ld = leaderOf(w, f);
    if (!ld || f.tier < 1) return 0;
    const seed = ld.awakened.includes('seed');
    if (!seed && ld.apt[APT_DEMONLORD] < 60) return 0;
    if (f.avgDev < 15) return 0;
    const since = w.t - (w.stats.lastDemonLord ?? -9999);
    if (since < 12 * 50) return 0;
    return (seed ? 0.002 : 0.0006) * (f.race === 'majin' ? 1.5 : 1) * (f.tier >= 2 ? 1.5 : 1);
  },
  fire: (w, f: Faction) => becomeDemonLord(w, f),
  forecast: (w, f: Faction) => ({ text: `${f.name}에서 마왕이 강림한다`, imp: 5, cat: 'dark' }),
});
ev({
  id: 'rift_open', scope: 'world',
  p: w => {
    if (!w.portals.some(p => p.kind === 'rift' && !p.open)) return 0;
    const surge = (w.doom.riftSurge ?? -1) > w.t;
    return surge ? 0.02 : w.demonLord >= 0 ? 0.004 : 0;
  },
  fire: w => {
    const p = w.rngSim.pick(w.portals.filter(p => p.kind === 'rift' && !p.open));
    p.open = true; rebuildPortalLinks(w); invalidateDist(w);
    addNews(w, w.demonLord >= 0
      ? `마왕의 힘에 의해 '${p.name}'이(가) 열렸다. 마계의 군세가 쏟아져 나올 길이 생겼다.`
      : `겹쳐진 두 세계의 틈으로 '${p.name}'이(가) 저절로 찢어졌다. 마계의 바람이 새어 나온다.`, 4, 'dark', { pos: p.a });
  },
  forecast: () => ({ text: '새로운 차원의 균열이 열린다', imp: 4, cat: 'dark' }),
});
ev({
  id: 'rift_convergence', scope: 'world',
  p: w => {
    if ((w.doom.riftSurge ?? -1) > w.t || w.portals.filter(p => p.kind === 'rift' && !p.open).length < 2) return 0;
    // 마왕이 있으면 수십 년, 없어도 백여 년에 한 번 두 세계가 겹친다
    return w.demonLord >= 0 ? 1 / (12 * 40) : 1 / (12 * 120);
  },
  fire: w => {
    const rng = w.rngSim;
    const years = rng.int(8, 20);
    w.doom.riftSurge = w.t + 12 * years;
    w.stats.riftSurges = (w.stats.riftSurges ?? 0) + 1;
    const closed = rng.shuffle(w.portals.filter(p => p.kind === 'rift' && !p.open));
    const opened = closed.slice(0, rng.int(2, 3));
    for (const p of opened) p.open = true;
    rebuildPortalLinks(w); invalidateDist(w);
    const nth = w.stats.riftSurges;
    const gates = `${opened.map(p => `'${p.name}'`).join(', ')}이(가) 한꺼번에 열렸다`;
    addNews(w, nth <= 1
      ? `【차원의 합】 마계와 이 세계가 겹치는 때가 왔다. 하늘이 보랏빛으로 물들고 ${gates}. 현자들은 앞으로 ${years}년 동안 문을 닫기 어려울 것이라 경고하였다.`
      : `【차원의 합】 또다시 두 세계가 겹쳤다. 이 세계에서 ${nth}번째다. 보랏빛 하늘 아래 ${gates}. 문은 ${years}년쯤 닫히지 않을 것이다.`,
      nth <= 1 ? 5 : 4, 'dark', { pos: opened[0]?.a });
  },
  forecast: () => ({ text: '마계와 이 세계가 겹친다 (차원의 합)', imp: 5, cat: 'dark' }),
});
ev({
  id: 'rift_fade', scope: 'world',
  p: w => (w.demonLord < 0 && (w.doom.riftSurge ?? -1) <= w.t && w.portals.filter(p => p.kind === 'rift' && p.open).length >= 2 ? 0.004 : 0),
  fire: w => {
    const p = w.rngSim.pick(w.portals.filter(p => p.kind === 'rift' && p.open));
    p.open = false; rebuildPortalLinks(w); invalidateDist(w);
    addNews(w, `오랜 세월 끝에 '${p.name}'이(가) 스스로 아물어 닫혔다.`, 3, 'nature', { pos: p.a });
  },
});
ev({
  id: 'rift_seal', scope: 'world',
  p: w => {
    const open = w.portals.filter(p => p.kind === 'rift' && p.open).length;
    if (open <= 1) return 0;
    const sealers = w.chars.some(c => c.died < 0 && isAdult(w, c) && (c.awakened.includes('sage') || c.race === 'angel'));
    if (w.demonLord >= 0) return 0;
    return sealers ? 0.005 * ((w.doom.riftSurge ?? -1) > w.t ? 0.15 : 1) : 0;
  },
  fire: w => {
    const rng = w.rngSim;
    const p = rng.pick(w.portals.filter(p => p.kind === 'rift' && p.open));
    const sealers = w.chars.filter(c => c.died < 0 && isAdult(w, c) && (c.awakened.includes('sage') || c.race === 'angel') && c.act.kind === 'idle' && !c.isPlayer
      && Math.min(approxDist(w, c, p.a, true), approxDist(w, c, p.b, true)) < 30);
    if (!sealers.length) return;
    const c = rng.pick(sealers);
    p.open = false; rebuildPortalLinks(w); invalidateDist(w);
    c.fame += 30;
    addNews(w, `${charLabel(w, c)}이(가) 봉인 의식을 펼쳐 '${p.name}'을(를) 닫았다.`, 4, 'hero', { pos: p.a, chars: [c.id] });
  },
  forecast: () => ({ text: '차원의 균열 하나가 봉인된다', imp: 3, cat: 'hero' }),
});
ev({
  id: 'necromancy', scope: 'faction',
  p: (w, f: Faction) => (f.race === 'undead' && w.corpses > 150 ? 0.03 : 0),
  fire: (w, f: Faction) => {
    const cap = w.settlements[f.capital];
    if (!cap) return;
    const raised = Math.round(w.corpses * 0.35);
    w.corpses -= raised;
    cap.pop += raised;
    addNews(w, `${f.name}의 사령술사들이 전장의 시체 ${raised}구를 일으켜 세웠다.`, 3, 'dark', { facs: [f.id], pos: cap });
  },
});
ev({
  id: 'undead_rise', scope: 'world',
  p: w => (!w.factions.some(f => f.alive && f.race === 'undead') && w.corpses > 600 ? 0.01 : 0),
  fire: w => {
    const s = spawnFaction(w, 'undead', Math.min(400, Math.round(w.corpses * 0.4)));
    if (!s) return;
    w.corpses *= 0.5;
    addNews(w, `전쟁터에 버려진 망자들이 무덤을 박차고 일어났다. ${w.factions[s.faction].name}이(가) 출현하였다.`, 4, 'dark', { pos: s, facs: [s.faction] });
  },
});
ev({
  id: 'temptation', scope: 'char',
  p: (w, c: Character) => (!c.awakened.includes('seed') && c.apt[APT_DEMONLORD] >= 75 && c.traits[COMPASSION] < 30 && !c.isPlayer ? 0.002 : 0),
  fire: (w, c: Character) => awaken(w, c, 'seed', '꿈속에서 들려온 마계의 속삭임에 응답하여'),
});

// ═════════════ 종족별 발전 이벤트
function devEvent(id: string, race: RaceKey, minDev: number, p: number, apply: (w: World, f: Faction) => string, imp = 3, cat: NewsCat = 'growth') {
  ev({
    id, scope: 'faction',
    p: (w, f: Faction) => (f.race === race && once(f, id) && f.avgDev >= minDev ? p : 0),
    fire: (w, f: Faction) => { f.flags.push(id); addNews(w, apply(w, f), imp, cat, { facs: [f.id], pos: w.settlements[f.capital] }); },
    forecast: (w, f: Faction) => ({ text: `${f.name}: ${EVENT_LABEL[id] ?? id}`, imp, cat }),
  });
}
const EVENT_LABEL: Record<string, string> = {};
function label(id: string, l: string) { EVENT_LABEL[id] = l; }

label('knights', '기사단 창설');
devEvent('knights', 'human', 25, 0.006, (w, f) => `${f.name}에 기사단이 창설되었다. 강철 갑옷의 기사들이 왕국의 방패가 되었다.`);
label('academy', '마법 학교 설립');
devEvent('academy', 'human', 45, 0.004, (w, f) => `${f.name}의 수도에 마법 학교가 문을 열었다.`);
label('cathedral', '대성당 완공');
devEvent('cathedral', 'human', 65, 0.003, (w, f) => {
  for (const o of w.factions) if (o.race === 'angel') addFacRel(w, f, o, 30);
  return `${f.name}의 대성당이 완공되었다. 천상의 종소리가 들렸다는 이야기가 퍼졌다.`;
});
label('runeforge', '룬 단조술');
devEvent('runeforge', 'dwarf', 30, 0.005, (w, f) => `${f.name}의 대장장이들이 룬 단조의 비법을 완성하였다.`);
label('worldtree_bloom', '세계수 개화');
devEvent('worldtree_bloom', 'elf', 40, 0.004, (w, f) => `${f.name}의 세계수가 천 년 만에 꽃을 피웠다.`, 3);
label('ancient_magic', '고대 마법 복원');
devEvent('ancient_magic', 'elf', 65, 0.003, (w, f) => `${f.name}이(가) 잊힌 고대 마법을 되살려냈다.`, 4, 'hero');
label('spirit_pact', '정령과의 계약');
devEvent('spirit_pact', 'beast', 35, 0.004, (w, f) => `${f.name}의 무당들이 대지의 정령과 계약을 맺었다.`);
label('dark_castle', '마성 건설');
devEvent('dark_castle', 'majin', 40, 0.004, (w, f) => `${f.name}이(가) 핏빛 하늘 아래 거대한 마성을 세웠다.`, 3, 'dark');
label('spider_oracle', '거미 여왕의 신탁');
devEvent('spider_oracle', 'darkelf', 30, 0.004, (w, f) => {
  for (const o of w.factions) if (o.alive && o.race === 'elf') { addFacRel(w, f, o, -40); }
  return `${f.name}의 사제들이 거미 여왕의 신탁을 받았다: "지상의 엘프를 멸하라."`;
}, 3, 'dark');
label('guild', '상인 길드 결성');
ev({
  id: 'guild', scope: 'faction',
  p: (w, f: Faction) => (once(f, 'guild') && f.treaties.length >= 2 ? 0.006 : 0),
  fire: (w, f: Faction) => { f.flags.push('guild'); addNews(w, `${f.name}의 상인들이 대상인 길드를 결성하였다.`, 2, 'trade', { facs: [f.id] }); },
});
ev({
  id: 'deep_dig', scope: 'faction',
  p: (w, f: Faction) => (f.race === 'dwarf' && f.avgDev >= 40 && once(f, 'deep_dig') ? 0.003 : 0),
  fire: (w, f: Faction) => {
    const rng = w.rngSim;
    f.flags.push('deep_dig');
    const r = rng.next();
    const cap = w.settlements[f.capital];
    if (r < 0.4) {
      const deep = w.sites.find(s => s.kind === 'deep');
      const d = spawnDragon(w, true, deep ?? cap);
      if (d) addNews(w, `${f.name}의 광부들이 너무 깊이 팠다. 산 밑에 잠들어 있던 고대 용 ${d.name}이(가) 눈을 떴다.`, 5, 'doom', { pos: d, facs: [f.id], chars: [d.id] });
    } else if (r < 0.65) {
      const p = w.portals.find(p => p.kind === 'rift' && !p.open && (p.a.l === 3 || p.b.l === 3));
      if (p) {
        p.open = true; rebuildPortalLinks(w); invalidateDist(w);
        addNews(w, `${f.name}의 갱도가 마계에 닿았다. '${p.name}'에서 유황 냄새가 피어올랐다.`, 4, 'dark', { pos: p.a, facs: [f.id] });
      }
    } else {
      f.flags.push('mithril');
      addNews(w, `${f.name}의 광부들이 깊은 곳에서 전설의 미스릴 광맥을 발견하였다.`, 3, 'growth', { facs: [f.id], pos: cap });
    }
  },
  forecast: (w, f: Faction) => ({ text: `${f.name}의 광부들이 깊은 곳에 닿는다`, imp: 4, cat: 'doom' }),
});
ev({
  id: 'waaagh', scope: 'faction',
  p: (w, f: Faction) => ((f.race === 'orc' || f.race === 'goblin') && f.tier >= 1 && !hasFlag(f, 'waaagh', w.t) ? 0.0025 : 0),
  fire: (w, f: Faction) => {
    setTimedFlag(f, 'waaagh', w.t + 24);
    const ld = leaderOf(w, f);
    // 같은 종족의 약한 세력을 흡수
    const absorb = aliveFactions(w).filter(o => o !== f && knows(w, f, o) && (o.race === 'orc' || o.race === 'goblin') && o.military < f.military * 0.7 && facDist(w, f, o) < 50 && !f.wars[o.id]);
    for (const o of absorb.slice(0, 2)) {
      for (const sid of [...o.settlements]) transferSettlement(w, w.settlements[sid], f);
      for (const c of w.chars) if (c.died < 0 && c.faction === o.id) c.faction = f.id;
      o.alive = false; o.fell = w.t;
    }
    addNews(w, `와아아아! ${ld ? ld.name + '의 ' : ''}${f.name}이(가) 대침공을 선언하였다.${absorb.length ? ` ${absorb.slice(0, 2).map(o => o.name).join(', ')}이(가) 깃발 아래 합류하였다.` : ''}`, 4, 'war', { facs: [f.id], chars: ld ? [ld.id] : [] });
    for (const o of aliveFactions(w)) if (o !== f && facDist(w, f, o) < 40 && facRel(f, o.id) < 0 && w.rngSim.chance(0.6)) declareWar(w, f, o, true);
  },
  forecast: (w, f: Faction) => ({ text: `${f.name}의 대침공`, imp: 4, cat: 'war' }),
});
ev({
  id: 'dragon_worship', scope: 'faction',
  p: (w, f: Faction) => {
    if (f.race !== 'kobold' || f.flags.some(x => x.startsWith('patron:'))) return 0;
    return w.chars.some(c => c.died < 0 && c.race === 'dragon' && approxDist(w, c, w.settlements[f.capital] ?? c, true) < 50) ? 0.006 : 0;
  },
  fire: (w, f: Faction) => {
    const cap = w.settlements[f.capital];
    const dr = w.chars.filter(c => c.died < 0 && c.race === 'dragon' && !c.ancient && c.dragonKind !== 'patron' && cap && approxDist(w, c, cap, true) < 50);
    if (!dr.length) return;
    const d = w.rngSim.pick(dr);
    makePatron(w, d, f, true);
    addNews(w, `${f.name}의 코볼트들이 ${d.name}을(를) 신으로 섬기기 시작하였다. 용은 그들의 공물을 받아들였다.`, 3, 'dark', { facs: [f.id], chars: [d.id] });
  },
});
ev({
  id: 'blood_moon', scope: 'world',
  p: () => 0.003,
  fire: w => {
    for (const f of w.factions) if (f.alive && (f.race === 'demon' || f.race === 'majin')) setTimedFlag(f, 'blood_moon', w.t + 6);
    addNews(w, '마계의 하늘에 핏빛 달이 떴다. 악마들이 광란에 빠졌다.', 3, 'dark');
  },
});
ev({
  id: 'angel_crusade', scope: 'faction',
  p: (w, f: Faction) => {
    if (f.race !== 'angel' || w.demonLord < 0) return 0;
    const dl = w.chars[w.demonLord];
    // 같은 마왕에게 성전을 선포하는 것은 3년에 한 번까지
    const last = w.stats[`crusade${dl?.id}`];
    if (last !== undefined && w.t - last < 36) return 0;
    return dl && !f.wars[dl.faction] && knowsDL(w, f) ? 0.05 : 0;
  },
  fire: (w, f: Faction) => {
    const dl = w.chars[w.demonLord];
    const e = w.factions[dl.faction];
    if (!e || !e.alive) return;
    declareWar(w, f, e, true);
    const again = w.stats[`crusade${dl.id}`] !== undefined;
    w.stats[`crusade${dl.id}`] = w.t;
    addNews(w, again ? `${f.name}의 천군이 다시 칼을 뽑았다. 마왕 ${dl.name}과(와)의 싸움은 끝나지 않았다.` : `${f.name}의 천군이 하늘의 계단을 내려왔다. 마왕 ${dl.name}을(를) 향한 성전이 선포되었다.`, again ? 3 : 4, 'hero', { facs: [f.id, e.id] });
    launchAttack(w, f, e, 'holywar');
  },
});
ev({
  id: 'worldtree_regrow', scope: 'faction',
  p: (w, f: Faction) => {
    if (f.tier < 1 || w.worldTree?.alive || RACES[f.race].align !== 'light') return 0;
    // 엘프가 가장 먼저 나서지만, 빛의 나라라면 누구든 새싹을 심을 수 있다
    return f.race === 'elf' ? 0.004 : 0.0012;
  },
  fire: (w, f: Faction) => {
    const cap = w.settlements[f.capital];
    if (!cap) return;
    for (const s of w.settlements) s.flags = s.flags.filter(x => x !== 'worldtree_burned');
    cap.flags.push('worldtree');
    w.worldTree = { sid: cap.id, hp: 60, growth: 0, alive: true };
    addNews(w, `${f.name}의 드루이드들이 ${cap.name}에 세계수의 새싹을 심었다. 이 새싹이 자라 하늘을 덮는 날, 봉인도 되살아날 것이다.`, 4, 'hero', { pos: cap, facs: [f.id] });
  },
});
ev({
  id: 'babel', scope: 'faction',
  p: (w, f: Faction) => (leaderOf(w, f)?.isPlayer ? 0 : pStartTower(w, f)),
  fire: (w, f: Faction) => { startTower(w, f); },
  forecast: (w, f: Faction) => ({ text: `${f.name}이(가) 하늘에 닿는 탑을 쌓기 시작한다`, imp: 4, cat: 'politics' }),
});
ev({
  id: 'abolition', scope: 'faction',
  p: (w, f: Faction) => {
    const ld = leaderOf(w, f);
    return ld && ld.traits[COMPASSION] > 70 && !f.flags.includes('abolished') && totalSlaves(w, f) > 0 ? 0.01 : 0;
  },
  fire: (w, f: Faction) => {
    const ld = leaderOf(w, f)!;
    const n = Math.round(totalSlaves(w, f));
    f.flags.push('abolished');
    addNews(w, `${f.name}의 ${ld.name}이(가) 노예제를 폐지하였다. ${n}명이 사슬에서 풀려났다. 귀족들은 이를 갈았다.`, 3, 'politics', { facs: [f.id], chars: [ld.id] });
  },
});
ev({
  id: 'dragon_wrath', scope: 'world',
  p: w => (w.doom.dragonGrievance >= 3 ? 1 : 0),
  fire: w => checkDragonWrath(w),
});
ev({
  id: 'slay_patron', scope: 'faction',
  p: (w, f: Faction) => pSlayPatron(w, f),
  fire: (w, f: Faction) => {
    const id = +f.flags.find(x => x.startsWith('patron:'))!.split(':')[1];
    const d = w.chars[id];
    if (d && d.died < 0) betrayDragon(w, d, f, 'slay');
  },
  forecast: (w, f: Faction) => ({ text: `${f.name}이(가) 수호룡을 배신한다`, imp: 4, cat: 'dark' }),
});
ev({
  id: 'patron_offer', scope: 'faction',
  p: (w, f: Faction) => (f.tier >= 1 && !f.flags.some(x => x.startsWith('patron:')) ? 0.0008 : 0),
  fire: (w, f: Faction) => {
    const cap = w.settlements[f.capital];
    const dr = w.chars.filter(c => c.died < 0 && c.race === 'dragon' && c.dragonKind === 'recluse' && cap && approxDist(w, c, cap, true) < 50);
    if (!dr.length || !cap || cap.stock[GOLD] < 50) return;
    cap.stock[GOLD] -= 50;
    makePatron(w, w.rngSim.pick(dr), f);
  },
});
ev({
  id: 'human_greed', scope: 'faction',
  p: (w, f: Faction) => {
    if (f.race !== 'human' || f.avgDev < 30 || hasFlag(f, 'greed_dig', w.t)) return 0;
    const ld = leaderOf(w, f);
    return ld && ld.traits[GREED] >= 65 ? 0.002 : 0;
  },
  fire: (w, f: Faction) => {
    const rng = w.rngSim;
    const ld = leaderOf(w, f)!;
    const cap = w.settlements[f.capital];
    setTimedFlag(f, 'greed_dig', w.t + 12 * 50);
    const r = rng.next();
    const ancientAlive = w.chars.some(c => c.died < 0 && c.ancient);
    if (r < 0.3 && !ancientAlive) {
      const deep = w.sites.find(s => s.kind === 'deep');
      const d = spawnDragon(w, true, deep ?? cap);
      if (d) addNews(w, `${f.name}의 ${ld.name}이(가) 전설의 보물을 찾아 금지된 심연을 파헤치게 하였다. 그곳에 잠들어 있던 고대 용 ${d.name}이(가) 눈을 떴다.`, 5, 'doom', { pos: d, facs: [f.id], chars: [ld.id, d.id] });
      return;
    }
    const dragons = w.chars.filter(c => c.died < 0 && c.race === 'dragon' && !c.ancient && cap && approxDist(w, c, cap, true) < 60);
    if (r < 0.65 && dragons.length && cap) {
      const d = rng.pick(dragons);
      cap.stock[GOLD] += d.wealth * 0.5 + 200;
      d.wealth *= 0.5;
      if (d.patronOf !== undefined) { const pf = w.factions[d.patronOf]; if (pf) pf.flags = pf.flags.filter(x => x !== `patron:${d.id}`); d.patronOf = undefined; }
      d.dragonKind = 'raider';
      d.sleep = 0;
      w.doom.dragonGrievance++;
      addNews(w, `${f.name}의 ${ld.name}이(가) 보낸 도굴꾼들이 ${d.name}의 둥지에서 보물을 훔쳐 냈다. 깨어난 용은 복수를 맹세하였다. (용의 원한 ${w.doom.dragonGrievance}/3)`, 4, 'dark', { facs: [f.id], chars: [ld.id, d.id] });
      return;
    }
    if (cap) cap.stock[GOLD] += 150;
    addNews(w, `${f.name}의 ${ld.name}이(가) 보낸 탐사대가 옛 왕들의 금고를 찾아냈다.`, 2, 'trade', { facs: [f.id], chars: [ld.id] });
  },
  forecast: (w, f: Faction) => ({ text: `${f.name}의 탐욕이 잠든 것을 깨운다`, imp: 4, cat: 'doom' }),
});
ev({
  id: 'tree_harvest', scope: 'faction',
  p: (w, f: Faction) => pTreeHarvest(w, f),
  fire: (w, f: Faction) => startHarvest(w, f),
  forecast: (w, f: Faction) => ({ text: `${f.name}이(가) 세계수를 베기 시작한다`, imp: 4, cat: 'doom' }),
});
// ═════════════ 이스터에그 (극악의 확률)
ev({
  id: 'egg_elf_orc', scope: 'world',
  p: () => 0.00015,
  fire: w => {
    const age = (c: Character) => (w.t - c.born) / 12;
    const elf = w.chars.find(c => c.died < 0 && c.race === 'elf' && c.spouse < 0 && age(c) >= 40 && !c.isPlayer);
    const orc = elf && w.chars.find(c => c.died < 0 && c.race === 'orc' && c.spouse < 0 && c.sex !== elf.sex && age(c) >= 16 && !c.isPlayer);
    if (!elf || !orc) return;
    elf.spouse = orc.id; orc.spouse = elf.id;
    addRel(w, elf, orc, 100);
    const fe = w.factions[elf.faction], fo = w.factions[orc.faction];
    if (fe && fo && fe !== fo) addFacRel(w, fe, fo, 50);
    const text = `엘프 ${elf.name}과(와) 오크 ${orc.name}이(가) 국경의 샘가에서 만나 사랑에 빠졌다. 두 종족은 경악하였으나, 그해 국경에서는 단 한 번의 싸움도 일어나지 않았다.`;
    addNews(w, text, 4, 'life', { chars: [elf.id, orc.id] });
    w.cinematics.push({ kind: 'love', seal: 0, title: '엘프와 오크의 사랑', text: fixJosa(text) });
  },
});
ev({
  id: 'egg_dragon_duel', scope: 'world',
  p: w => (w.chars.filter(c => c.died < 0 && c.race === 'dragon' && !c.ancient && !c.isPlayer).length >= 2 ? 0.0004 : 0),
  fire: w => {
    const ds = w.chars.filter(c => c.died < 0 && c.race === 'dragon' && !c.ancient && !c.isPlayer);
    const a = w.rngSim.pick(ds);
    const b = ds.filter(d => d !== a && (d.sleep ?? 0) === 0 && approxDist(w, a, d, true) < 40).sort((x, y) => approxDist(w, a, x, true) - approxDist(w, a, y, true))[0];
    if (!b || (a.sleep ?? 0) > 0) return;
    // 일반 용끼리는 죽기까지 싸우지 않는다: 영역 다툼
    dragonSpat(w, a, b);
  },
});
ev({
  id: 'egg_truce', scope: 'world',
  p: w => (w.factions.filter(f => f.alive && Object.keys(f.wars).length).length >= 4 && seasonOf(w.t) === 3 ? 0.0004 : 0),
  fire: w => {
    let n = 0;
    for (const f of w.factions) {
      if (!f.alive) continue;
      for (const id of Object.keys(f.wars).map(Number)) { const e = w.factions[id]; if (e && e.alive && f.id < e.id) { makePeace(w, f, e); n++; } }
    }
    addNews(w, `그해 겨울, 이유를 아는 이는 아무도 없었다. 모든 전장에서 병사들이 무기를 내려놓고 함께 노래를 불렀다. ${n}개의 전쟁이 하룻밤 새 끝났다.`, 5, 'hero');
  },
});
ev({
  id: 'egg_mushroom_king', scope: 'faction',
  p: (w, f: Faction) => (f.race === 'goblin' ? 0.00008 : 0),
  fire: (w, f: Faction) => {
    f.legitimacy = clamp(f.legitimacy + 40);
    for (const s of settlementsOf(w, f)) s.stability = clamp(s.stability + 30);
    addNews(w, `${f.name}의 고블린들이 동굴 깊은 곳에서 사람 키만 한 버섯을 발견하고 그것을 왕으로 추대하였다. 버섯 왕은 아무 말도 하지 않았고, 그 치세는 고블린 역사상 가장 평화로웠다.`, 4, 'politics', { facs: [f.id] });
  },
});
ev({
  id: 'egg_sky_whale', scope: 'world',
  p: () => 0.0002,
  fire: w => {
    for (const c of w.chars) if (c.died < 0) c.mood = clamp(c.mood + 15);
    addNews(w, '하늘 층에 산만 한 고래가 구름을 헤엄쳐 지나갔다. 그 그림자 아래에서 모든 이가 잠시 말을 잃고 하늘을 올려다보았다.', 4, 'nature');
  },
});
ev({
  id: 'egg_drinking', scope: 'world',
  p: w => (w.factions.some(f => f.alive && f.race === 'dwarf') && w.factions.some(f => f.alive && f.race === 'elf') ? 0.0002 : 0),
  fire: w => {
    const d = w.factions.find(f => f.alive && f.race === 'dwarf')!, e = w.factions.find(f => f.alive && f.race === 'elf')!;
    const dl = leaderOf(w, d), el = leaderOf(w, e);
    if (!dl || !el) return;
    addFacRel(w, d, e, 50);
    const winner = w.rngSim.chance(0.8) ? dl : el;
    addNews(w, `${d.name}의 ${dl.name}과(와) ${e.name}의 ${el.name}이(가) 국경에서 술 시합을 벌였다. 사흘 뒤 마지막까지 서 있던 것은 ${winner.name}이었다. 두 나라는 그날부터 형제가 되었다.`, 4, 'politics', { facs: [d.id, e.id], chars: [dl.id, el.id] });
  },
});

ev({
  id: 'resurgence', scope: 'world',
  p: w => {
    const dead = POP_RACES.filter(r => r !== 'undead' && r !== 'angel' && !w.factions.some(f => f.alive && f.race === r));
    return dead.length ? 0.004 * dead.length : 0;
  },
  fire: w => {
    const dead = POP_RACES.filter(r => r !== 'undead' && r !== 'angel' && !w.factions.some(f => f.alive && f.race === r));
    const lastFell = (r: RaceKey) => Math.max(...w.factions.filter(f => f.race === r).map(f => f.fell));
    const ready = dead.filter(r => w.t - lastFell(r) > 240);
    if (!ready.length) return;
    const r = w.rngSim.pick(ready);
    const s = spawnFaction(w, r, w.rngSim.int(80, 140));
    if (s) addNews(w, `오랫동안 자취를 감추었던 ${RACES[r].name}의 유민들이 ${s.name}에 다시 모여 ${w.factions[s.faction].name}을(를) 세웠다.`, 3, 'growth', { pos: s, facs: [s.faction] });
  },
});
ev({
  id: 'sage_prophecy', scope: 'char',
  p: (w, c: Character) => (c.awakened.includes('sage') && w.prophecy.length ? 0.004 : 0),
  fire: (w, c: Character) => {
    const top = w.prophecy[0];
    if (!top) return;
    addNews(w, `현자 ${c.name}이(가) 예언하였다: "머지않아 ${top.text}." 사람들은 그 말을 두려워하였다.`, 2, 'hero', { chars: [c.id] });
  },
});
ev({
  id: 'comet_omen', scope: 'world',
  p: w => (brokenCount(w) >= 3 ? 0.02 : 0),
  fire: w => addNews(w, `불길한 징조: ${['붉은 혜성이 사흘 밤낮으로 하늘에 걸렸다.', '바다가 거꾸로 흐른다는 소문이 돌았다.', '모든 신전의 성화가 한날한시에 꺼졌다.'][w.t % 3]}`, 3, 'doom'),
});
ev({
  id: 'wanderer_hero', scope: 'char',
  p: (w, c: Character) => (!isHero(c) && c.apt[APT_HERO] >= 75 && c.fame > 40 && c.traits[COURAGE] > 55 && isLight(c.race) ? 0.002 : 0),
  fire: (w, c: Character) => awaken(w, c, 'hero', '수많은 모험 끝에'),
});

// ───────────── 보조

export function becomeDemonLord(w: World, f: Faction): void {
  const ld = leaderOf(w, f);
  if (!ld || w.demonLord >= 0) return;
  w.demonLord = ld.id;
  const fallen = ld.awakened.includes('hero');
  if (fallen) { ld.awakened = ld.awakened.filter(a => a !== 'hero'); w.doom.heroDeaths++; }
  w.stats.lastDemonLord = w.t;
  w.doom.heroDeaths = 0;
  if (!ld.awakened.includes('seed')) ld.awakened.push('seed');
  ld.awakened.push('demonlord');
  ld.stats.might = clamp(ld.stats.might + 30); ld.stats.magic = clamp(ld.stats.magic + 30); ld.stats.command = clamp(ld.stats.command + 20);
  ld.fame += 150;
  ld.lifespan = Math.max(ld.lifespan, (w.t - ld.born) / 12 + 1000);
  const p = w.portals.find(p => p.kind === 'rift' && !p.open);
  if (p) { p.open = true; rebuildPortalLinks(w); invalidateDist(w); }
  addNews(w, `${dateStr(w)}, ${f.name}의 ${ld.name}이(가) 피의 의식을 마치고 마왕으로 강림하였다. 하늘이 검게 물들고 모든 종족이 두려움에 떨었다.${fallen ? ' 한때 용사라 불리던 자의 타락이었다.' : ''}`, 5, 'dark', { facs: [f.id], chars: [ld.id], pos: ld });
  charLog(w, ld, '마왕으로 강림하였다.', 5);
}

export function spawnDragon(w: World, ancient: boolean, near?: { l: number; x: number; y: number }): Character | null {
  const rng = w.rngSim;
  let pos: { l: number; x: number; y: number } | null = null;
  if (near) pos = { l: near.l, x: near.x, y: near.y };
  else {
    for (let i = 0; i < 200 && !pos; i++) {
      const l = rng.chance(0.5) ? L_SKY : L_SURFACE;
      const L = w.layers[l];
      const x = rng.int(1, L.w - 2), y = rng.int(1, L.h - 2);
      const t = L.terrain[y * L.w + x];
      if (t === T.MOUNTAIN || t === T.ISLE || t === T.PEAK) pos = { l, x, y };
    }
  }
  if (!pos) return null;
  if (ancient && pos.l !== L_SURFACE && pos.l !== L_SKY) {
    // 땅 밑에서 깨어난 고대 용은 산을 뚫고 지상으로 솟는다
    const src = w.layers[pos.l], L = w.layers[L_SURFACE];
    const tx = Math.round((pos.x / src.w) * L.w), ty = Math.round((pos.y / src.h) * L.h);
    let best: { l: number; x: number; y: number } | null = null, bd = Infinity;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const t = L.terrain[y * L.w + x];
      if (t !== T.MOUNTAIN && t !== T.HILL && t !== T.PEAK) continue;
      const d2 = (x - tx) ** 2 + (y - ty) ** 2;
      if (d2 < bd) { bd = d2; best = { l: L_SURFACE, x, y }; }
    }
    if (best) pos = best;
  }
  const d = createCharacter(w, { race: 'dragon', faction: -1, home: -1, pos, born: w.t - (ancient ? rng.int(2000, 4000) : 0) * 12 });
  d.role = '모험가'; d.title = 'adult';
  d.lair = { ...pos };
  d.sleep = ancient ? 0 : rng.int(0, 24);
  if (!ancient) assignDragonKind(w, d);
  if (ancient) {
    d.ancient = true;
    d.dragonKind = 'raider';
    d.wrathUntil = w.t + rng.int(40, 80) * 12;
    d.wrathStart = w.t;
    d.lifespan = (w.t - d.born) / 12 + 800;
    d.stats.might = 100; d.stats.magic = 90;
    d.epithet = '고대의';
  }
  return d;
}

/** 빈 땅에 새 세력을 세운다 */
export function spawnFaction(w: World, race: RaceKey, pop: number): Settlement | null {
  const rng = w.rngSim;
  const R = RACES[race];
  for (let i = 0; i < 300; i++) {
    const l = rng.pick(R.layers);
    const L = w.layers[l];
    const x = rng.int(2, L.w - 3), y = rng.int(2, L.h - 3);
    const k = y * L.w + x;
    const tid = L.terrain[k];
    if (L.claim[k] >= 0 || T.TERRAIN[tid].move <= 0 || (R.prefer[tid] ?? 0) <= 0) continue;
    if (w.settlements.some(s => s.alive && s.l === l && Math.hypot(s.x - x, s.y - y) < 8)) continue;
    const f = createFaction(w, race, makeClanName(rng, race));
    const s = foundSettlement(w, { faction: f.id, race, pos: { l, x, y }, pop });
    f.capital = s.id;
    f.baseName = s.name;
    f.name = factionName(f);
    const age = R.adult + rng.int(5, 30);
    const c = createCharacter(w, { race, faction: f.id, home: s.id, pos: s, born: w.t - age * 12 });
    c.title = 'adult'; c.role = '전사';
    crown(w, f, c, '건국');
    for (let j = 0; j < 3; j++) {
      const m = createCharacter(w, { race, faction: f.id, home: s.id, pos: s, born: w.t - (R.adult + rng.int(0, 40)) * 12 });
      m.title = 'adult';
    }
    return s;
  }
  return null;
}

