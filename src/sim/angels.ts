// 열두 천사: 자리마다 칭호와 소임이 있고, 수명이 다하면 후대가 잇는다. 살해당한 자리는 영원히 빈다.
import { makeName, uniqueName } from '../data/names';
import { addNews, charLog } from './news';
import type { Character, Faction, Settlement, World } from './state';
import { addFacRel, clamp, leaderOf } from './helpers';
import { RACES } from '../data/races';
import { hooks } from './hooks';
import { createCharacter, setTravel } from './characters';

export const ANGEL_LIFESPAN = 300;

export const ANGEL_SEATS: { title: string; duty: string }[] = [
  { title: '빛의 천사장', duty: '천군을 이끌고 열두 자리를 다스린다' },
  { title: '검의 천사', duty: '마계와의 전쟁에서 선봉에 선다' },
  { title: '방패의 천사', duty: '천상의 성역을 지킨다' },
  { title: '계시의 천사', duty: '어둠에 맞설 용사를 고른다' },
  { title: '봉인의 천사', duty: '마계로 통하는 균열을 봉한다' },
  { title: '치유의 천사', duty: '지상의 역병을 씻어낸다' },
  { title: '정원의 천사', duty: '세계수와 생명을 돌본다' },
  { title: '바람의 천사', duty: '하늘을 다스리고, 하늘을 넘보는 탑을 경계한다' },
  { title: '기록의 천사', duty: '세계의 연대기를 적는다' },
  { title: '심판의 천사', duty: '타락한 자와 마왕을 심판한다' },
  { title: '별의 천사', duty: '별을 읽어 앞날을 예언한다' },
  { title: '문지기 천사', duty: '천상으로 오르는 계단을 지킨다' },
];

export function seatHolder(w: World, seat: number): Character | null {
  return w.chars.find(c => c.died < 0 && c.race === 'angel' && c.seat === seat) ?? null;
}

/** 자리가 살해로 영원히 비었는지 */
export function seatLost(w: World, seat: number): boolean {
  return !!w.stats[`angelLost${seat}`];
}

function makeAngel(w: World, f: Faction, home: Settlement, seat: number, ageYears: number, name?: string): Character {
  const rng = w.rngSim;
  const sex = rng.chance(0.5) ? 'M' : 'F';
  const c = createCharacter(w, { race: 'angel', sex, faction: f.id, home: home.id, pos: home, born: w.t - ageYears * 12 - rng.int(0, 11), name: name ?? uniqueName(rng, 'angel', sex, n => w.chars.some(a => a.race === 'angel' && a.name === n)) });
  c.seat = seat;
  c.epithet = ANGEL_SEATS[seat].title;
  c.lifespan = ANGEL_LIFESPAN;
  c.role = seat === 4 || seat === 5 ? '성직자' : seat === 8 || seat === 10 ? '학자' : '기사';
  c.title = 'adult';
  c.stats.might = clamp(rng.int(70, 92) + (seat === 1 || seat === 9 ? 8 : 0));
  c.stats.magic = clamp(rng.int(75, 95));
  c.stats.command = clamp(rng.int(55, 85) + (seat === 0 ? 10 : 0));
  c.stats.intellect = clamp(rng.int(60, 90));
  c.stats.charisma = clamp(rng.int(60, 90));
  c.stats.health = 100;
  c.fame = 30 + (seat === 0 ? 30 : 0);
  return c;
}

/** 세계 창조 때 천사 세력에 열두 천사를 세운다 */
export function setupAngels(w: World, f: Faction, home: Settlement): Character {
  const rng = w.rngSim;
  let leader: Character | null = null;
  for (let seat = 0; seat < ANGEL_SEATS.length; seat++) {
    const c = makeAngel(w, f, home, seat, rng.int(50, ANGEL_LIFESPAN - 20));
    charLog(w, c, `${ANGEL_SEATS[seat].title}의 자리에 앉아, ${ANGEL_SEATS[seat].duty}.`, 3);
    if (seat === 0) leader = c;
  }
  return leader!;
}

/** 천사가 죽었을 때: 수명이 다했으면 후대가 잇고, 살해당했으면 자리가 영원히 빈다 */
export function onAngelDeath(w: World, c: Character, killer?: Character): void {
  if (c.race !== 'angel' || c.seat === undefined) return;
  const seat = c.seat;
  const title = ANGEL_SEATS[seat].title;
  if (killer || c.cause.includes('전사') || c.cause.includes('공방전') || c.cause.includes('결투') || c.cause.includes('사투')) {
    // 살해당한 자리는 백 년 동안 비었다가, 조금 약한 새 천사가 잇는다
    w.stats[`angelLost${seat}`] = w.t;
    w.stats[`angelPow${seat}`] = Math.round((c.stats.might + c.stats.magic) / 2);
    const left = w.chars.filter(a => a.died < 0 && a.race === 'angel' && a.seat !== undefined).length;
    addNews(w, `${title} ${c.name}이(가) ${killer ? `${killer.name}의 손에 ` : ''}쓰러졌다. 그 자리는 백 년 동안 비어 있을 것이다. 남은 천사는 ${left}명이다.`, 5, 'doom', { chars: [c.id] });
    return;
  }
  const f = w.factions[c.faction];
  const home = w.settlements[c.home] ?? (f ? w.settlements[f.capital] : undefined);
  if (!f || !f.alive || !home || !home.alive) return;
  const heir = makeAngel(w, f, home, seat, 1);
  heir.father = c.id;
  c.children.push(heir.id);
  charLog(w, heir, `${c.name}의 빛을 이어받아 ${title}의 자리에 앉았다.`, 4);
  addNews(w, `${title} ${c.name}이(가) ${ANGEL_LIFESPAN}년의 소임을 마치고 빛으로 돌아갔다. ${heir.name}이(가) 그 자리를 이었다.`, 3, 'hero', { chars: [heir.id], facs: [f.id] });
  if (f.leader === c.id || seat === 0) {
    f.leader = heir.id;
    f.rulers.push({ id: heir.id, from: w.t, to: -1, how: '계승' });
  }
}

/** 매달: 백 년 동안 비었던 자리에 새 천사가 깨어난다 */
export function angelMonth(w: World): void {
  const f = w.factions.find(a => a.alive && a.race === 'angel');
  if (!f) return;
  const home = w.settlements[f.capital];
  if (!home || !home.alive) return;
  for (let seat = 0; seat < ANGEL_SEATS.length; seat++) {
    const lost = w.stats[`angelLost${seat}`];
    if (lost === undefined || w.t - lost < 12 * 100 || seatHolder(w, seat)) continue;
    const prev = w.stats[`angelPow${seat}`] ?? 80;
    const c = makeAngel(w, f, home, seat, 1);
    const rng = w.rngSim;
    c.stats.might = clamp(Math.round(prev * rng.float(0.82, 1)));
    c.stats.magic = clamp(Math.round(prev * rng.float(0.82, 1)));
    delete w.stats[`angelLost${seat}`];
    delete w.stats[`angelPow${seat}`];
    charLog(w, c, `백 년의 공백 끝에 ${ANGEL_SEATS[seat].title}의 자리에 새로 깨어났다.`, 4);
    addNews(w, `백 년 동안 비어 있던 ${ANGEL_SEATS[seat].title}의 자리에 새로운 빛이 깃들었다. ${c.name}이(가) 깨어났다. 옛 천사만큼의 빛은 아직 아니다.`, 4, 'hero', { chars: [c.id], facs: [f.id] });
    if (seat === 0 && !leaderOf(w, f)) { f.leader = c.id; f.rulers.push({ id: c.id, from: w.t, to: -1, how: '계승' }); }
  }
}

/** 천사의 사망 확률: 300년이 차기 전에는 죽지 않는다 */
export function angelDeathChance(w: World, c: Character): number {
  return (w.t - c.born) / 12 >= ANGEL_LIFESPAN ? 1 : 0;
}

/** 운명이 비튼 수호자 탄생: 비었거나 가장 오래된 자리를 차지한다 */
export function guardianSeat(w: World): { seat: number; replaced: Character | null } {
  const alive = w.chars.filter(a => a.died < 0 && a.race === 'angel' && a.seat !== undefined);
  for (let s = 1; s < ANGEL_SEATS.length; s++) {
    if (!alive.some(a => a.seat === s)) {
      delete w.stats[`angelLost${s}`]; delete w.stats[`angelPow${s}`];
      return { seat: s, replaced: null };
    }
  }
  const oldest = alive.filter(a => a.seat !== 0).sort((a, b) => a.born - b.born)[0];
  return { seat: oldest?.seat ?? 2, replaced: oldest ?? null };
}

export { leaderOf };

// ───────────── 세상을 지키는 천사의 일

/** 천사의 임무: 역병을 거두고, 굶주린 고을을 축복하고, 마왕의 군세를 막아선다 */
export interface AngelTask { kind: 'heal' | 'bless' | 'stand' | 'redeem'; target: number; t: number }

/** 매달 (천사 한 명, 할 일이 없을 때): 임무를 맡거나 해낸다. 무언가 했으면 true */
export function angelDuty(w: World, c: Character): boolean {
  const rng = w.rngSim;
  const T = c.angelTask;
  if (T) {
    const soul = T.kind === 'redeem' ? w.chars[T.target] : undefined;
    const s = T.kind === 'redeem' ? undefined : w.settlements[T.target];
    const army = T.kind === 'stand' ? w.armies[T.target] : undefined;
    const pos = soul ?? army ?? s;
    if (!pos || (s && !s.alive) || (army && !army.alive) || (soul && soul.died >= 0) || w.t - T.t > 24) { c.angelTask = undefined; return false; }
    if (c.l !== pos.l || Math.hypot(c.x - pos.x, c.y - pos.y) > 3) {
      if (c.act.kind === 'idle') setTravel(w, c, pos, 'quest');
      return true;
    }
    c.angelTask = undefined;
    if (T.kind === 'redeem' && soul) { redeem(w, c, soul); return true; }
    if (T.kind === 'heal' && s && s.plague > 0) {
      s.plague = Math.max(0, Math.floor(s.plague * 0.3));
      c.fame += 5;
      charLog(w, c, `${s.name}의 역병을 거두었다.`, 2);
      addNews(w, `${c.epithet ? c.epithet + ' ' : ''}${c.name}이(가) ${s.name}에 내려와 병자들에게 손을 얹었다. 역병이 물러가기 시작하였다.`, 2, 'hero', { pos: s, chars: [c.id] });
    } else if (T.kind === 'bless' && s) {
      s.stock[0] += s.pop * 0.2; s.stability = clamp(s.stability + 10);
      charLog(w, c, `굶주린 ${s.name}을(를) 축복하였다.`, 2);
      addNews(w, `굶주린 ${s.name}의 곳간에 하늘의 빛이 내렸다. ${c.name}의 축복이었다.`, 2, 'hero', { pos: s, chars: [c.id] });
    } else if (T.kind === 'stand' && army) {
      const cut = Math.round(Math.min(army.soldiers, c.stats.might * rng.float(1.5, 3)));
      army.soldiers -= cut;
      if (army.soldiers < 10) army.alive = false;
      charLog(w, c, `마왕의 군세 앞을 막아섰다.`, 3);
      addNews(w, `${c.epithet ? c.epithet + ' ' : ''}${c.name}이(가) 마왕의 군세 앞에 내려섰다. 빛의 칼날에 ${cut}명이 쓰러졌다.`, 3, 'hero', { pos: army, chars: [c.id] });
    }
    return true;
  }
  if (!rng.chance(0.015)) return false;
  // 할 일을 고른다: 마왕의 군세 > 역병 > 기근 (천사는 온 세상을 내려다본다)
  const dl = w.demonLord >= 0 ? w.chars[w.demonLord] : null;
  const horde = dl ? w.armies.find(a => a.alive && a.faction === dl.faction && (a.goal === 'conquer' || a.goal === 'raid')) : undefined;
  if (horde && rng.chance(0.5)) { c.angelTask = { kind: 'stand', target: horde.id, t: w.t }; return true; }
  const sick = w.settlements.filter(s => s.alive && s.plague > 0 && RACES_LIGHT(s.race)).sort((a, b) => b.pop - a.pop)[0];
  if (sick && rng.chance(0.5)) { c.angelTask = { kind: 'heal', target: sick.id, t: w.t }; return true; }
  const hungry = w.settlements.filter(s => s.alive && s.hunger > 3 && RACES_LIGHT(s.race)).sort((a, b) => b.hunger - a.hunger)[0];
  if (hungry) { c.angelTask = { kind: 'bless', target: hungry.id, t: w.t }; return true; }
  // 어둠에 물든 이를 찾아가 빛으로 돌이킨다 (어둠의 군주를 먼저)
  if (rng.chance(0.18)) {
    const souls = w.chars.filter(o => o.died < 0 && !o.isPlayer && o.l <= 3 && o.race !== 'angel' && o.race !== 'demon' && o.race !== 'dragon' && o.race !== 'undead' && !o.archdemon && !o.paragon && !o.officer
      && w.demonLord !== o.id && (o.awakened.includes('seed') || o.traits[3] < 25 || (RACES_DARK(o.race) && w.factions[o.faction]?.leader === o.id)) && !w.stats[`redeemTried${o.id}`]);
    const soul = rng.weighted(souls, o => (w.factions[o.faction]?.leader === o.id ? 4 : 1) * (o.awakened.includes('seed') ? 2 : 1));
    if (soul) { w.stats[`redeemTried${soul.id}`] = w.t; c.angelTask = { kind: 'redeem', target: soul.id, t: w.t }; return true; }
  }
  return false;
}

/** 천사가 돌보는 이들: 어둠의 종족이 아닌 고을 */
const RACES_LIGHT = (r: string) => r !== 'majin' && r !== 'demon' && r !== 'undead';

const RACES_DARK = (r: string) => r === 'orc' || r === 'goblin' || r === 'darkelf' || r === 'majin';

/** 회개: 천사가 어둠에 물든 이 앞에 내려와 빛으로 돌이키려 한다. 군주가 돌아서면 나라도 길을 바꾼다 */
function redeem(w: World, a: Character, o: Character): void {
  const rng = w.rngSim;
  const p = 0.35 + (a.stats.charisma - 50) / 200 - (o.traits[9] - 50) / 200 - (o.awakened.includes('seed') ? 0.1 : 0);
  if (!rng.chance(Math.max(0.1, Math.min(0.7, p)))) {
    charLog(w, o, `천사 ${a.name}이(가) 찾아와 손을 내밀었으나 뿌리쳤다.`, 2);
    addNews(w, `${a.epithet ? a.epithet + ' ' : ''}${a.name}이(가) ${o.name} 앞에 내려와 빛으로 돌아오라 하였으나, ${o.name}은(는) 비웃으며 등을 돌렸다.`, 2, 'hero', { pos: o, chars: [a.id, o.id] });
    return;
  }
  o.traits[3] = clamp(o.traits[3] + 35);
  o.traits[4] = clamp(o.traits[4] + 15);
  o.awakened = o.awakened.filter(k => k !== 'seed');
  o.honor += 10;
  a.fame += 8;
  charLog(w, o, `천사 ${a.name}의 빛 앞에 무릎을 꿇고 회개하였다.`, 4);
  charLog(w, a, `${o.name}을(를) 빛으로 돌이켰다.`, 3);
  const f = w.factions[o.faction];
  const ruler = !!f && f.leader === o.id;
  const deeds: string[] = [];
  if (ruler && f) {
    // 나라가 길을 바꾼다: 마왕의 깃발을 내리고, 사슬을 풀고, 빛의 나라들과 화해한다
    if (f.flags.includes('dlvassal')) { f.flags = f.flags.filter(x => x !== 'dlvassal'); deeds.push('마왕의 깃발을 내렸다'); }
    if (!f.flags.includes('abolished')) { f.flags.push('abolished'); deeds.push('노예들의 사슬을 풀었다'); }
    let made = 0;
    for (const e of w.factions) {
      if (!e.alive || e === f || RACES[e.race].align !== 'light') continue;
      addFacRel(w, f, e, 25);
      if (f.wars[e.id] !== undefined && rng.chance(0.6)) { hooks.makePeace(w, f, e); made++; }
    }
    if (made) deeds.push(`빛의 나라 ${made}곳과 칼을 거두었다`);
  }
  addNews(w, `${a.epithet ? a.epithet + ' ' : ''}${a.name}이(가) ${f && ruler ? `${f.name}의 ` : ''}${o.name} 앞에 내려왔다. 빛 속에서 ${o.name}이(가) 무릎을 꿇고 회개하였다.${deeds.length ? ` 그날로 ${deeds.join(', ')}.` : ''}`, ruler ? 4 : 3, 'hero', { pos: o, chars: [a.id, o.id], facs: f ? [f.id] : [] });
}

