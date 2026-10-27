// 공공의 적에 맞서는 법: 토벌대, 연맹, 그리고 마왕군과 그 간부들
import { dlSide } from './clash';
import { markPeril } from './peril';
import { RACES } from '../data/races';
import { EPITHETS } from '../data/names';
import { addNews, charLog } from './news';
import { advance, findPath, posOf } from './path';
import type { Character, Faction, Settlement, World } from './state';
import { raiseArmy } from './military';
import { offerParty } from './expedition';
import { LAYER_INFO } from './state';
import { rebuildPortalLinks } from './path';
import { dist } from './state';
import { addFacRel, approxDist, atWar, charLabel, charPower, clamp, factionDistance, isAdult, isHero, leaderOf } from './helpers';
import { awaken, elope, killChar, relocate, setPos } from './characters';
import { declareWar, facDist, invalidateDist, launchAttack, makePeace } from './factions';

export interface Party {
  id: number;
  name: string;
  target: number;
  leader: number;
  members: number[];
  path: number[];
  t: number;
  done: boolean;
  /** 연맹이 편성한 공격대인가 */
  alliance: number;
  /** 사기 (-0.4 ~ 0.5): 결전의 힘에 더해진다 */
  morale?: number;
}

export interface Alliance {
  id: number;
  name: string;
  /** 맞서는 적 (인물 id) */
  enemy: number;
  leader: number;
  members: number[];
  t: number;
  alive: boolean;
}

const FIGHTERS = new Set(['전사', '기사', '모험가', '사냥꾼', '마법사', '성직자', '치유사', '드루이드', '주술사', '암살자', '조련사']);
export const OFFICER_TITLES = ['마왕의 검', '마왕의 그림자', '마왕의 불꽃', '마왕의 방패'];
const DARK_KIN = ['majin', 'demon', 'darkelf', 'goblin', 'kobold', 'undead', 'orc'];

/** 이 나라는 마왕의 강림을 알고 있는가 */
export function knowsDL(w: World, f: Faction | undefined): boolean {
  const dl = w.chars[w.demonLord];
  if (!f || !dl || dl.died >= 0) return false;
  return f.id === dl.faction || f.flags.includes('dlknown');
}
/** 이 인물은 마왕을 아는가: 나라가 알거나, 가까이에서 직접 보았거나 */
export function charKnowsDL(w: World, c: Character): boolean {
  const dl = w.chars[w.demonLord];
  if (!dl || dl.died >= 0) return false;
  return knowsDL(w, w.factions[c.faction]) || approxDist(w, c, dl) < 30;
}
function learnDL(w: World, f: Faction, dl: Character, dlf: Faction, how: string) {
  if (knowsDL(w, f)) return;
  f.flags.push('dlknown');
  const me = w.player && w.chars[w.player.charId];
  if (me && me.died < 0 && me.faction === f.id) markPeril(w, 'dlnews');
  if (RACES[f.race].align === 'light') addFacRel(w, f, dlf, -60);
  addNews(w, `${how} ${f.name}에 마왕 ${dl.name}의 강림 소식이 닿았다.`, f.tier >= 1 ? 3 : 2, 'dark', { facs: [f.id], chars: [dl.id] });
}
/** 매달: 소식이 퍼진다 */
function spreadDLNews(w: World, dl: Character, dlf: Faction) {
  const rng = w.rngSim;
  const known = w.factions.filter(f => f.alive && knowsDL(w, f));
  for (const f of w.factions) {
    if (!f.alive || knowsDL(w, f) || RACES[f.race].noPop && f.race !== 'angel') continue;
    if (f.race === 'angel') {
      if (w.t - (w.stats.lastDemonLord ?? w.t) >= 6) learnDL(w, f, dl, dlf, '천상의 눈이 마계의 어둠을 꿰뚫어 보았다.');
      continue;
    }
    // 실질적인 피해: 마왕군이나 가신과 싸우고 있다
    const vassalFoe = w.factions.some(o => o.alive && o.flags.includes('dlvassal') && atWar(o, f.id));
    if (atWar(dlf, f.id) || vassalFoe) { learnDL(w, f, dl, dlf, '마왕군의 칼끝을 직접 맞고서야'); continue; }
    // 이웃: 국경 너머로 마계의 기운을 본다
    if (facDist(w, f, dlf) < 25) { learnDL(w, f, dl, dlf, '국경 너머에서 들려오는 마계의 북소리로'); continue; }
    // 소문: 이미 아는 나라에서 피난민과 상인이 소식을 옮긴다
    const src = known.find(o => o !== f && facDist(w, f, o) < 45);
    if (src && rng.chance(0.05)) learnDL(w, f, dl, dlf, `${src.name}에서 건너온 피난민들의 입을 통해`);
  }
}

/** 세상을 위협하는 공공의 적 */
export function publicEnemies(w: World): Character[] {
  const out: Character[] = [];
  const dl = w.chars[w.demonLord];
  if (dl && dl.died < 0) out.push(dl);
  for (const d of w.chars) {
    if (d.died >= 0 || d.race !== 'dragon' || d.isPlayer) continue;
    if (d.ancient || (d.dragonKind === 'raider' && d.fame >= 40)) out.push(d);
  }
  return out;
}

/** 마왕이 오래 버티고 땅을 넓힐수록 세상의 결의가 단단해진다 (토벌대 힘 배율) */
export function dlResolve(w: World): number {
  const dl = w.chars[w.demonLord];
  if (!dl || dl.died >= 0) return 1;
  const reign = (w.t - (w.stats.lastDemonLord ?? w.t)) / 12;
  const land = w.factions[dl.faction]?.settlements.length ?? 0;
  return 1 + Math.min(1.8, reign / 25 + land / 25);
}

function enemyPower(w: World, e: Character): number {
  return charPower(e, w) * (w.demonLord === e.id ? 3.0 : e.ancient ? 1.8 : 1.1);
}

function inParty(w: World, c: Character): boolean {
  return c.act.kind === 'party';
}

function canFight(w: World, c: Character, enemy: Character): boolean {
  if (c.died >= 0 || c.isPlayer || c.race === 'dragon' || !isAdult(w, c) || inParty(w, c) || c.act.kind !== 'idle') return false;
  // 악마와 열강은 남의 토벌대에 끼지 않는다 (제 뜻대로 움직인다)
  if (c.officer || w.demonLord === c.id || c.role === '노예' || c.archdemon || c.paragon) return false;
  if (w.factions[c.faction]?.leader === c.id) return false;
  if (w.demonLord === enemy.id && RACES[c.race].align === 'dark') return false;
  if (enemy.patronOf !== undefined && c.faction === enemy.patronOf) return false;
  return isHero(c) || (FIGHTERS.has(c.role) && c.traits[0] > 50 && c.stats.might + c.stats.magic > 90);
}

/** 혼자서도 맞설 만큼 강한가 (아주 드물다) */
export function strongEnoughAlone(w: World, c: Character, enemy: Character): boolean {
  return charPower(c, w) > enemyPower(w, enemy) * 1.3;
}

/** 토벌대를 꾸린다 */
export function formParty(w: World, leader: Character, enemy: Character, allianceId = -1, pool?: Character[]): Party | null {
  const rng = w.rngSim;
  if (w.parties.some(p => !p.done && p.target === enemy.id)) return null;
  // 토벌대는 대장 곁에 있는 이들로 꾸린다 (먼 곳에서 순간이동해 오지 않는다)
  const cands = (pool ?? w.chars.filter(c => c.id !== leader.id && canFight(w, c, enemy)))
    .filter(c => c.l === leader.l && dist(c, leader) <= 8)
    .filter(c => c.id !== leader.id && canFight(w, c, enemy))
    .sort((a, b) => charPower(b, w) - charPower(a, w));
  const n = Math.min(cands.length, rng.int(2, 5) + (w.demonLord === enemy.id ? Math.floor(dlResolve(w) - 1) * 2 : 0));
  if (n < 2) return null;
  const members = [leader, ...cands.slice(0, n)];
  const path = findPath(w, leader, enemy, { race: leader.race, flying: RACES[leader.race].flying }, 40000);
  if (!path) return null;
  const p: Party = {
    id: w.parties.length, name: `${leader.name}의 토벌대`, target: enemy.id, leader: leader.id,
    members: members.map(m => m.id), path, t: w.t, done: false, alliance: allianceId,
  };
  w.parties.push(p);
  for (const m of members) {
    m.act = { kind: 'party', target: p.id };
    setPos(m, leader);
    charLog(w, m, `${charLabel(w, enemy)}을(를) 치기 위해 ${p.name}에 합류하였다.`, 3);
  }
  offerParty(w, p);
  const al = w.alliances[allianceId];
  addNews(w, `${al ? `${al.name}의 이름으로 ` : ''}${charLabel(w, leader)}이(가) ${members.slice(1).map(m => m.name).join(', ')}와(과) 함께 토벌대를 꾸렸다. 목표는 ${charLabel(w, enemy)}이다.`,
    4, 'hero', { pos: leader, chars: members.map(m => m.id) });
  return p;
}

function disband(w: World, p: Party, text?: string) {
  p.done = true;
  for (const id of p.members) {
    const m = w.chars[id];
    if (m && m.died < 0 && m.act.kind === 'party') {
      m.act = { kind: 'idle' };
      const h = w.settlements[m.home];
      if (h && h.alive) relocate(w, m, h);
    }
  }
  if (text) addNews(w, text, 3, 'hero', { chars: p.members });
}

/** 여럿이 하나를 상대한다 */
function teamFight(w: World, p: Party, enemy: Character, label: string): boolean {
  const rng = w.rngSim;
  const alive = p.members.map(id => w.chars[id]).filter(m => m && m.died < 0);
  if (!alive.length) return false;
  let pp = alive.reduce((a, m) => a + charPower(m, w), 0) * (1 + 0.12 * (alive.length - 1));
  if (w.demonLord === enemy.id) pp *= dlResolve(w);
  pp *= 1 + (p.morale ?? 0);
  const pe = enemyPower(w, enemy);
  const win = rng.chance(Math.pow(pp, 1.4) / (Math.pow(pp, 1.4) + Math.pow(pe, 1.4)));
  if (win) {
    const finisher = rng.weighted(alive, m => charPower(m, w))!;
    for (const m of alive) {
      m.stats.health = clamp(m.stats.health - rng.int(10, 40));
      m.fame += 20 + Math.round(enemy.fame * 0.2);
      if (m !== finisher && rng.chance(0.12)) killChar(w, m, `${label}에서 전사`, enemy);
    }
    if (enemy.race === 'dragon' && !finisher.epithet) finisher.epithet = EPITHETS.dragonslayer;
    // '마왕과의 결전' 같은 이름표에서 싸움의 이름만 떼어 '○○ 토벌대와의 결전'으로
    killChar(w, enemy, `${p.name}과(와)의 ${label.replace(/^.+?[과와]의 /, '')}`, finisher);
    if (finisher.apt[1] >= 60 && !isHero(finisher)) awaken(w, finisher, 'hero', `${label}의 마지막 일격을 날린 그 순간,`);
    return true;
  }
  for (const m of alive) {
    if (rng.chance(0.45)) killChar(w, m, `${label}에서 전사`, enemy);
    else m.stats.health = clamp(m.stats.health - rng.int(25, 60));
  }
  return false;
}

/** 토벌대의 한 달: 행군하고, 간부를 넘고, 적과 싸운다 */
function partyMonth(w: World, p: Party): void {
  const enemy = w.chars[p.target];
  const alive = p.members.map(id => w.chars[id]).filter(m => m && m.died < 0);
  if (!enemy || enemy.died >= 0) { disband(w, p); return; }
  if (alive.length === 0) { p.done = true; return; }
  if (w.t - p.t > 72) { disband(w, p, `${p.name}이(가) 끝내 ${enemy.name}에게 닿지 못하고 흩어졌다.`); return; }
  const lead = w.chars[p.leader]?.died === -1 ? w.chars[p.leader] : alive[0];
  // 목표가 움직이면 길을 다시 잡는다
  if (!p.path.length || (w.t - p.t) % 6 === 0) {
    const np = findPath(w, lead, enemy, { race: lead.race, flying: RACES[lead.race].flying }, 40000);
    if (np) p.path = np;
  }
  const pos = advance(w, p.path, 4, { race: lead.race, flying: RACES[lead.race].flying });
  if (pos) for (const m of alive) { m.pl = m.l; m.px = m.x; m.py = m.y; setPos(m, pos); }
  if (lead.l !== enemy.l || dist(lead, enemy) > 3) return;

  // 마왕성: 간부들이 먼저 막아선다
  if (w.demonLord === enemy.id) {
    const officers = w.chars.filter(o => o.died < 0 && o.officer && o.l === enemy.l && dist(o, enemy) <= 4);
    for (const o of officers) {
      addNews(w, `${p.name}이(가) 마왕군 간부 '${o.officer}' ${o.name}과(와) 맞붙었다.`, 4, 'hero', { pos: o, chars: [o.id, ...p.members] });
      if (!teamFight(w, p, o, '간부와의 결전')) {
        disband(w, p, `${p.name}이(가) 마왕군 간부 ${o.name}에게 막혀 무너졌다.`);
        return;
      }
      addNews(w, `${p.name}이(가) 마왕군 간부 ${o.name}을(를) 쓰러뜨렸다! 마왕의 옥좌가 가까워진다.`, 4, 'hero', { chars: p.members });
    }
  }
  addNews(w, `${p.name}이(가) 마침내 ${charLabel(w, enemy)}과(와) 마주하였다.`, 4, 'hero', { pos: enemy, chars: [enemy.id, ...p.members] });
  const hero = alive.find(m => isHero(m));
  if (hero && w.demonLord === enemy.id && w.rngSim.chance(0.008)) {
    hero.act = { kind: 'idle' };
    p.members = p.members.filter(id => id !== hero.id);
    elope(w, hero, enemy);
    disband(w, p, `${p.name}의 남은 이들은 넋을 잃고 마왕성을 떠났다.`);
    return;
  }
  const won = teamFight(w, p, enemy, w.demonLord === enemy.id ? '마왕과의 결전' : '용과의 결전');
  if (won) {
    disband(w, p, `${p.name}이(가) ${enemy.name}을(를) 쓰러뜨렸다! 살아남은 이들의 이름이 노래가 되었다.`);
  } else disband(w, p, `${p.name}이(가) ${enemy.name} 앞에서 무너졌다. 살아 돌아온 이는 몇 되지 않았다.`);
}

/** 영웅이 토벌대를 꾸리려 한다 (characters.heroHunt 에서 부른다) */
export function tryHeroParty(w: World, hero: Character, enemy: Character): boolean {
  return !!formParty(w, hero, enemy);
}

// ───────────── 연맹

export function allianceOf(w: World, f: Faction): Alliance | undefined {
  return w.alliances.find(a => a.alive && a.members.includes(f.id));
}

function allianceEligible(w: World, f: Faction, enemy: Character): boolean {
  if (!f.alive || !f.settlements.length || RACES[f.race].noPop) return false;
  if (f.flags.includes('dlvassal')) return false;
  if (w.demonLord === enemy.id) return RACES[f.race].align !== 'dark' && enemy.faction !== f.id && knowsDL(w, f);
  if (enemy.patronOf === f.id) return false;
  const cap = w.settlements[f.capital];
  return !!cap && approxDist(w, cap, enemy) < 70;
}

function formAlliance(w: World, enemy: Character): void {
  const rng = w.rngSim;
  const fs = w.factions.filter(f => allianceEligible(w, f, enemy) && !allianceOf(w, f));
  if (fs.length < 2) return;
  fs.sort((a, b) => b.military - a.military);
  const lead = fs[0];
  const members = fs.slice(0, Math.min(fs.length, rng.int(2, 6)));
  const al: Alliance = { id: w.alliances.length, name: `${lead.baseName} 연맹`, enemy: enemy.id, leader: lead.id, members: members.map(f => f.id), t: w.t, alive: true };
  w.alliances.push(al);
  for (const a of members) for (const b of members) {
    if (a.id < b.id) {
      if (a.wars[b.id] !== undefined) makePeace(w, a, b);
      addFacRel(w, a, b, 20);
    }
  }
  const ld = leaderOf(w, lead);
  addNews(w, `${charLabel(w, enemy)}에 맞서 ${members.map(f => f.name).join(', ')}이(가) ${al.name}을(를) 맺었다. ${ld ? `${lead.name}의 ${ld.name}` : lead.name}이(가) 연맹의 수장이 되었다.`,
    4, 'politics', { facs: members.map(f => f.id), chars: [enemy.id, ...(ld ? [ld.id] : [])] });
}

function allianceMonth(w: World, al: Alliance): void {
  const rng = w.rngSim;
  const enemy = w.chars[al.enemy];
  al.members = al.members.filter(id => w.factions[id]?.alive);
  if (!enemy || enemy.died >= 0) {
    al.alive = false;
    addNews(w, `${enemy ? `${enemy.name}이(가) 쓰러지자 ` : ''}${al.name}은(는) 소임을 다하고 해산하였다.`, 3, 'politics', { facs: al.members });
    return;
  }
  if (!al.members.includes(al.leader)) al.leader = al.members.sort((a, b) => w.factions[b].military - w.factions[a].military)[0] ?? -1;
  if (al.members.length < 2) {
    al.alive = false;
    addNews(w, `${al.name}이(가) 깨졌다. 남은 나라들은 각자 살길을 찾았다.`, 3, 'politics', { facs: al.members });
    return;
  }
  // 배신: 탐욕스럽고 잔혹한 군주는 연맹을 등진다
  for (const id of al.members) {
    if (id === al.leader) continue;
    const f = w.factions[id];
    const ld = leaderOf(w, f);
    if (!ld || ld.isPlayer) continue;
    const treacherous = ld.traits[3] < 30 && (ld.traits[2] > 65 || ld.apt[5] > 60);
    if (treacherous && rng.chance(0.004)) {
      al.members = al.members.filter(x => x !== id);
      const victim = w.factions[al.leader];
      if (victim && victim.alive) declareWar(w, f, victim, true);
      const toDl = w.demonLord === enemy.id && RACES[f.race].align !== 'light';
      if (toDl) f.flags.push('dlvassal');
      addNews(w, `${f.name}의 ${ld.name}이(가) ${al.name}을(를) 배신하고 ${toDl ? '마왕의 편에 섰다' : `${victim?.name ?? '연맹'}의 등에 칼을 꽂았다`}.`, 4, 'politics', { facs: [f.id, al.leader], chars: [ld.id] });
      return;
    }
  }
  const lead = w.factions[al.leader];
  if (!lead) return;
  // 마왕의 나라로 연합 원정
  if (w.demonLord === enemy.id) {
    const dlf = w.factions[enemy.faction];
    if (dlf && dlf.alive) for (const id of al.members) {
      const f = w.factions[id];
      if (f.wars[dlf.id] === undefined) declareWar(w, f, dlf, true);
      if (rng.chance(id === al.leader ? 0.15 : 0.06)) launchAttack(w, f, dlf, 'holywar');
    }
  }
  // 연맹 공격대: 회원국의 최강자들
  if (w.t - al.t >= 12 && !w.parties.some(p => !p.done && p.target === enemy.id) && rng.chance(0.06)) {
    const champs = w.chars.filter(c => al.members.includes(c.faction) && canFight(w, c, enemy)).sort((a, b) => charPower(b, w) - charPower(a, w));
    const leaderChamp = champs.find(c => isHero(c) && c.faction === al.leader) ?? champs.find(c => c.faction === al.leader) ?? champs[0];
    if (leaderChamp) {
      const p = formParty(w, leaderChamp, enemy, al.id, champs.slice(0, 8));
      if (p) p.name = `${al.name} 공격대`;
    }
  }
}

// ───────────── 마왕군

function dlMonth(w: World): void {
  const rng = w.rngSim;
  const dl = w.chars[w.demonLord];
  if (!dl || dl.died >= 0) {
    // 마왕이 사라지면 간부와 가신들도 흩어진다
    for (const c of w.chars) if (c.officer) { c.officer = undefined; }
    for (const f of w.factions) f.flags = f.flags.filter(x => x !== 'dlknown');
    for (const f of w.factions) if (f.flags.includes('dlvassal')) {
      f.flags = f.flags.filter(x => x !== 'dlvassal');
      if (f.alive) addNews(w, `마왕이 쓰러지자 ${f.name}은(는) 마왕군에서 이탈하였다.`, 2, 'politics', { facs: [f.id] });
    }
    return;
  }
  const dlf = w.factions[dl.faction];
  if (!dlf || !dlf.alive) return;
  spreadDLNews(w, dl, dlf);
  // 마계와 지하의 어둠이 마왕 밑으로 (소식을 들은 이들만)
  for (const f of w.factions) {
    if (!f.alive || f === dlf || f.flags.includes('dlvassal') || allianceOf(w, f) || !knowsDL(w, f)) continue;
    if (!DARK_KIN.includes(f.race)) continue;
    const cap = w.settlements[f.capital];
    if (!cap || (cap.l !== 3 && cap.l !== 4 && f.race !== 'undead')) continue;
    if ((f.relations[dlf.id] ?? 0) < -40 || !rng.chance(0.03)) continue;
    f.flags.push('dlvassal');
    if (f.wars[dlf.id] !== undefined) makePeace(w, f, dlf);
    addFacRel(w, f, dlf, 40);
    addNews(w, `${f.name}이(가) 마왕 ${dl.name}의 깃발 아래 무릎을 꿇었다. 마왕군의 세가 불어났다.`, 4, 'dark', { facs: [f.id, dlf.id], chars: [dl.id] });
  }
  // 간부 임명
  const officers = w.chars.filter(c => c.died < 0 && c.officer);
  // 강림하자마자 간부를 모두 세우고, 빈자리는 이따금 채운다
  const fresh = w.t - (w.stats.lastDemonLord ?? 0) <= 1;
  for (let k = officers.length; k < OFFICER_TITLES.length && (fresh || rng.chance(0.08)); k++) {
    const used = new Set(w.chars.filter(c => c.died < 0 && c.officer).map(o => o.officer));
    const title = OFFICER_TITLES.find(t => !used.has(t))!;
    const pool = w.chars.filter(c => c.died < 0 && !c.officer && c.id !== dl.id && !c.isPlayer && isAdult(w, c) && c.race !== 'dragon' && c.act.kind === 'idle' && c.role !== '노예'
      && (c.faction === dlf.id || w.factions[c.faction]?.flags.includes('dlvassal')) && w.factions[c.faction]?.leader !== c.id);
    const pick = pool.sort((a, b) => charPower(b, w) - charPower(a, w))[0];
    if (pick) {
      pick.officer = title;
      pick.faction = dlf.id;
      pick.home = dlf.capital;
      const cap = w.settlements[dlf.capital];
      if (cap) relocate(w, pick, cap);
      pick.stats.might = clamp(pick.stats.might + 12); pick.stats.magic = clamp(pick.stats.magic + 12);
      pick.epithet = title;
      addNews(w, `${pick.name}이(가) 마왕군 간부 '${title}'의 자리에 올랐다.`, 3, 'dark', { chars: [pick.id, dl.id], facs: [dlf.id] });
    } else break;
  }
  // 마왕은 문 하나는 반드시 열어 둔다
  if (!w.portals.some(p => p.kind === 'rift' && p.open)) {
    const p = w.portals.find(p => p.kind === 'rift');
    if (p) { p.open = true; rebuildPortalLinks(w); invalidateDist(w); addNews(w, `마왕 ${dl.name}이(가) 손을 휘젓자 닫혔던 '${p.name}'이(가) 다시 찢어졌다.`, 4, 'dark', { pos: p.a, chars: [dl.id] }); }
  }
  const reign = (w.t - (w.stats.lastDemonLord ?? w.t)) / 12;
  // 천도: 오래 버틴 마왕은 하늘에 가까운 곳으로 본거지를 옮긴다
  const cap = w.settlements[dlf.capital];
  if (cap && reign >= 5 && rng.chance(1 / 48)) {
    const nest = w.settlements.filter(s => s.alive && s.faction === dlf.id && s.l < cap.l && s.pop >= 150)
      .sort((a, b) => a.l - b.l || b.pop - a.pop)[0];
    if (nest) {
      dlf.capital = nest.id;
      dl.home = nest.id;
      relocate(w, dl, nest);
      for (const o of officers) { o.home = nest.id; relocate(w, o, nest); }
      w.stats.dlMoves = (w.stats.dlMoves ?? 0) + 1;
      addNews(w, `마왕 ${dl.name}이(가) 본거지를 ${cap.name}에서 ${LAYER_INFO[nest.l].name}의 ${nest.name}(으)로 옮겼다. ${nest.l === 1 ? '이제 마왕의 옥좌가 구름 위에 떠 있다.' : '마왕의 그림자가 햇빛 아래로 올라왔다.'}`,
        4, 'dark', { pos: nest, facs: [dlf.id], chars: [dl.id] });
    }
  }
  // 하늘 계단을 억지로 연다 (30년 넘게 집권한 마왕)
  if (reign >= 30 && !w.doom.heavenForced && rng.chance(1 / 120)) {
    const gates = w.portals.filter(p => (p.kind === 'peak' || p.kind === 'stair') && !p.open);
    if (gates.length) {
      for (const p of gates) p.open = true;
      w.doom.heavenForced = true;
      rebuildPortalLinks(w); invalidateDist(w);
      w.stats.heavenForced = (w.stats.heavenForced ?? 0) + 1;
      addNews(w, `마왕 ${dl.name}이(가) 하늘을 향해 손을 뻗었다. 닫혀 있던 구름 계단과 천상의 계단이 비명을 지르며 억지로 열렸다. 이제 날개 없는 마왕군도 하늘을 오를 수 있다.`,
        5, 'doom', { chars: [dl.id], facs: [dlf.id] });
    }
  }
  // 마왕군의 진군: 해마다 꼴로 마계의 군세가 문을 넘는다
  if (w.t - (w.stats.lastDemonLord ?? 0) >= 6 && rng.chance(1 / 14)) dlMarch(w, dl, dlf, officers);
  // 가신들도 빛의 나라를 친다
  for (const f of w.factions) {
    if (!f.alive || !f.flags.includes('dlvassal') || !rng.chance(1 / 36)) continue;
    const foes = w.factions.filter(o => o.alive && o.settlements.length && RACES[o.race].align === 'light');
    const e = foes.sort((a, b) => factionDistance(w, f, a) - factionDistance(w, f, b))[0];
    if (!e || !isFinite(factionDistance(w, f, e))) continue;
    if (!atWar(f, e.id)) declareWar(w, f, e, true);
    if (launchAttack(w, f, e, 'conquer')) addNews(w, `마왕군의 가신 ${f.name}이(가) ${e.name}을(를) 향해 군대를 일으켰다.`, 3, 'war', { facs: [f.id, e.id] });
  }
  // 간부는 마왕 곁을 지킨다
  for (const o of officers) {
    if (o.act.kind === 'idle' && (o.l !== dl.l || dist(o, dl) > 3)) { o.home = dlf.capital; relocate(w, o, dl); }
  }
}

/** 매달 */
export function crusadeMonth(w: World): void {
  const rng = w.rngSim;
  dlMonth(w);
  for (const p of w.parties) if (!p.done) partyMonth(w, p);
  for (const al of w.alliances) if (al.alive) allianceMonth(w, al);
  for (const e of publicEnemies(w)) {
    // 연맹 결성
    if (!w.alliances.some(a => a.alive && a.enemy === e.id) && rng.chance(w.demonLord === e.id ? 0.08 : 0.03)) formAlliance(w, e);
    // 용사나 이름난 모험가가 스스로 토벌대를 꾸린다
    const waited = w.demonLord === e.id ? w.t - (w.stats.lastDemonLord ?? 0) >= 36 : true;
    if (waited && !w.parties.some(p => !p.done && p.target === e.id) && rng.chance(0.03 * (w.demonLord === e.id ? dlResolve(w) : 1))) {
      const leaders = w.chars.filter(c => canFight(w, c, e) && (isHero(c) || c.fame >= 60) && approxDist(w, c, e) < 90 && (w.demonLord !== e.id || charKnowsDL(w, c)))
        .sort((a, b) => (isHero(b) ? 1000 : 0) + charPower(b, w) - (isHero(a) ? 1000 : 0) - charPower(a, w));
      if (leaders[0]) formParty(w, leaders[0], e);
    }
  }
  if (w.parties.length > 300) w.parties = w.parties.filter(p => !p.done);
}

/** 마계의 군세가 차원문을 넘어 빛의 땅으로 진군한다 */
function dlMarch(w: World, dl: Character, dlf: Faction, officers: Character[]): void {
  const rng = w.rngSim;
  const own = w.settlements.filter(s => s.alive && s.faction === dlf.id && s.pop > 60);
  if (!own.length) return;
  let best: { src: Settlement; t: Settlement; d: number } | null = null;
  for (const t of w.settlements) {
    if (!t.alive || t.faction === dlf.id || t.l > 2 || RACES[t.race].align !== 'light') continue;
    const tf = w.factions[t.faction];
    if (!tf || !tf.alive || tf.flags.includes('dlvassal')) continue;
    for (const s of own) {
      const d = approxDist(w, s, t) - (t.l === 2 ? 15 : 0) + t.pop * 0.005;
      if (d < (best?.d ?? Infinity)) best = { src: s, t, d };
    }
  }
  // 가끔은 세계수를 노린다 (빛의 땅의 뿌리를 끊으려)
  const tree = w.worldTree?.alive ? w.settlements[w.worldTree.sid] : undefined;
  // 마왕의 땅이 세계수 가까이 닿아 있을 때만
  if (tree && tree.alive && tree.faction !== dlf.id && !dlSide(w, tree.faction) && rng.chance(0.15)) {
    for (const s of own) {
      const d = approxDist(w, s, tree);
      if (isFinite(d) && d < 60) { best = { src: s, t: tree, d }; break; }
    }
    if (best?.t === tree) addNews(w, `마왕 ${dl.name}의 군세가 세계수를 향해 방향을 틀었다. 빛의 땅의 뿌리를 끊으려는 것이다.`, 5, 'doom', { pos: tree, facs: [dlf.id, tree.faction] });
  }
  // 하늘로 가는 길이 열려 있으면 더 가까운 길로 천상의 성역을 노린다
  const sanctum = w.settlements.find(s => s.alive && s.flags.includes('sanctum') && s.faction !== dlf.id);
  // 성역은 오래 군림하며 땅을 넓힌 마왕만 노린다. 한 번 실패하면 한 세대는 다시 엄두를 내지 못한다
  const reignY = (w.t - (w.stats.lastDemonLord ?? w.t)) / 12;
  if (sanctum && reignY >= 20 && dlf.settlements.length >= 6 && w.t - (w.stats.lastSanctumMarch ?? -9999) >= 12 * 25 && rng.chance(0.15)) {
    for (const s of own) {
      const d = approxDist(w, s, sanctum);
      if (isFinite(d) && (!best || best.t !== sanctum || d < best.d)) best = { src: s, t: sanctum, d };
    }
  }
  if (!best || !isFinite(best.d)) return;
  const tf = w.factions[best.t.faction];
  if (best.t === sanctum) {
    w.stats.lastSanctumMarch = w.t;
    const viaTower = w.towers.some(t => t.alive && t.demon && t.progress >= 200);
    addNews(w, `마왕 ${dl.name}의 군세가 ${viaTower ? '마왕탑을 타고' : '억지로 연 하늘 계단을 밟고'} 천상의 성역으로 진군한다! 열두 천사가 칼을 뽑았다.`, 5, 'doom', { pos: sanctum, facs: [dlf.id, tf.id], chars: [dl.id] });
  }
  if (!atWar(dlf, tf.id)) declareWar(w, dlf, tf, true);
  const cmd = officers.find(o => o.died < 0 && o.act.kind === 'idle' && o.l === best!.src.l && dist(o, best!.src) <= 8);
  const a = raiseArmy(w, dlf, best.src, 'conquer', best.t, Math.max(60, best.src.pop * 0.3), cmd);
  if (!a) return;
  // 마계에서 불러낸 군세가 더해진다
  // 차원의 합이 오면 마계의 문이 넓어져 더 많은 군세가 쏟아진다
  const surge = (w.doom.riftSurge ?? -1) > w.t ? 1.6 : 1;
  const horde = Math.round((rng.int(150, 350) + dlf.settlements.length * 25) * surge);
  a.soldiers += horde;
  w.stats.dlMarches = (w.stats.dlMarches ?? 0) + 1;
  addNews(w, `마왕 ${dl.name}의 명으로 마계의 군세 ${Math.round(a.soldiers)}이(가) ${best.src.name}을(를) 떠나 ${tf.name}의 ${best.t.name}(으)로 진군하였다.${cmd ? ` 선봉은 ${charLabel(w, cmd)}이(가) 맡았다.` : ''}`,
    4, 'dark', { pos: best.src, facs: [dlf.id, tf.id], chars: [dl.id, ...(cmd ? [cmd.id] : [])] });
}
