// 열강: 세상이 한참 굴러간 뒤, 떠돌이 기질의 인물 가운데 아주 강해진 이가 나라를 떠나 홀로 선다.
// 세상에 넷에서 일곱 명뿐이다. 거처를 세우고 성정에 따라 움직인다:
//   수호자 — 가까운 고을의 위기를 막아선다 · 정복자 — 싸움 중인 나라 편에서 적의 고을을 덮친다
//   탐욕자 — 부유한 고을을 턴다 · 명예를 좇는 자 — 강자에게 도전한다 · 전도자 — 믿음을 퍼뜨린다
// 가끔 이름을 얻고 싶은 강자가 열강에게 도전한다.
import { RACES } from '../data/races';
import { AMBITION, COMPASSION, COURAGE, FAITH, GREED, PRIDE } from '../data/traits';
import { GOLD } from '../data/terrain';
import type { Character, Pos, Settlement, World } from './state';
import { ageOf, dist, yearOf } from './state';
import { addNews, charLog } from './news';
import { charPower, clamp, isAdult, isHero } from './helpers';
import { duel, setTravel } from './characters';
import { faithOf, foundFaith, spreadTo } from './religion';

export type Motive = 'guardian' | 'conqueror' | 'greed' | 'glory' | 'prophet';
export const MOTIVE_NAME: Record<Motive, string> = { guardian: '수호자', conqueror: '정복자', greed: '탐욕자', glory: '명예를 좇는 자', prophet: '전도자' };
const EPITHET: Record<Motive, string[]> = {
  guardian: ['성벽', '푸른 방패', '새벽의 파수꾼'], conqueror: ['폭풍', '붉은 깃발', '무릎 꿇리는 자'], greed: ['황금 송곳니', '밤의 손', '굶주린 매'],
  glory: ['무패', '검성', '천 번의 결투'], prophet: ['순례자', '등불', '목소리'],
};
const WANDER_ROLES = new Set(['모험가', '사냥꾼', '전사', '마법사', '도적', '암살자', '드루이드', '성직자', '기사']);

export interface Paragon { since: number; motive: Motive; seat: Pos & { name: string }; task?: { kind: string; target: number; t: number } }

/** 세상에 열강이 몇 명까지 설 수 있는가 (넷에서 시작해 세월이 흐를수록 일곱까지) */
function cap(w: World): number { return Math.min(7, 4 + Math.floor((w.t / 12 - 80) / 80)); }
export const isParagon = (c: Character) => !!c.paragon && c.died < 0;

function motiveOf(c: Character): Motive {
  const t = c.traits;
  const s: [Motive, number][] = [
    ['guardian', t[COMPASSION] + t[COURAGE] * 0.3], ['conqueror', t[AMBITION] + (100 - t[COMPASSION]) * 0.5], ['greed', t[GREED] * 1.2],
    ['glory', t[PRIDE] + t[COURAGE] * 0.4], ['prophet', t[FAITH] * 1.2],
  ];
  return s.sort((a, b) => b[1] - a[1])[0][0];
}

/** 한 해에 한 번: 새 열강이 선다, 도전자가 나선다 */
export function paragonYear(w: World): void {
  if (w.t % 12 !== 7 || w.t < 12 * 80) return;
  const rng = w.rngSim;
  const living = w.chars.filter(isParagon);
  if (living.length < cap(w) && rng.chance(0.6)) {
    // 종족마다 고르게: 같은 종족의 열강은 둘까지. 힘은 그 종족의 이름난 이들 평균에 견준다 (본래 강한 종족만 나오지 않도록)
    const perRace = new Map<string, number>();
    for (const p of living) perRace.set(p.race, (perRace.get(p.race) ?? 0) + 1);
    const pool = w.chars.filter(c => c.died < 0 && !c.isPlayer && isAdult(w, c) && c.race !== 'dragon' && c.fame >= 30);
    const avg = new Map<string, number>();
    for (const r of new Set(pool.map(c => c.race))) { const xs = pool.filter(c => c.race === r); avg.set(r, xs.reduce((a, c) => a + charPower(c, w), 0) / xs.length); }
    const cands = w.chars.filter(c => c.died < 0 && !c.paragon && !c.isPlayer && isAdult(w, c) && c.race !== 'dragon' && w.demonLord !== c.id && WANDER_ROLES.has(c.role)
      // 자리가 있는 이(천사의 자리, 마왕군 간부, 군주, 영주)는 그 자리를 버리지 않는다
      && c.seat === undefined && !c.officer && (perRace.get(c.race) ?? 0) < 2
      && c.fame >= 60 && w.factions[c.faction]?.leader !== c.id && !w.settlements.some(s => s.alive && s.governor === c.id) && ageOf(w, c) < c.lifespan * 0.75)
      .map(c => ({ c, p: charPower(c, w) })).filter(x => x.p >= 95 && x.p >= (avg.get(x.c.race) ?? 0) * 1.15)
      .sort((a, b) => b.p / (avg.get(b.c.race) ?? 1) - a.p / (avg.get(a.c.race) ?? 1));
    const pick = cands.length ? rng.pick(cands.slice(0, 5)).c : undefined;
    if (pick) ascend(w, pick);
  }
  // 도전자: 이름을 얻으려는 강자가 열강을 찾아간다
  for (const p of living) {
    if (!rng.chance(0.12)) continue;
    const pp = charPower(p, w);
    const ch = w.chars.filter(c => c.died < 0 && c !== p && !c.paragon && !c.isPlayer && isAdult(w, c) && c.act.kind === 'idle' && c.race !== 'dragon'
      && c.fame >= 40 && (c.traits[PRIDE] > 60 || c.traits[COURAGE] > 70) && charPower(c, w) >= pp * 0.7 && c.l === p.l && dist(c, p) < 60)
      .sort((a, b) => charPower(b, w) - charPower(a, w))[0];
    if (!ch || !setTravel(w, ch, p, 'duel', p.id)) continue;
    addNews(w, `${ch.name}이(가) 열강 ${p.name}에게 도전하러 길을 떠났다.`, 2, 'hero', { pos: ch, chars: [ch.id, p.id] });
  }
}

/** 열강이 된다: 나라를 떠나 홀로 서고, 거처를 세운다 ('나'도 될 수 있다) */
export function ascendParagon(w: World, c: Character): void { ascend(w, c); }
function ascend(w: World, c: Character): void {
  const rng = w.rngSim;
  const motive = motiveOf(c);
  const f = w.factions[c.faction];
  const seatName = `${c.name}의 ${rng.pick(['은거지', '탑', '산채', '거처'])}`;
  c.paragon = { since: w.t, motive, seat: { l: c.l, x: c.x, y: c.y, name: seatName } };
  if (!c.epithet) c.epithet = rng.pick(EPITHET[motive]);
  c.stats.might = clamp(c.stats.might + 15); c.stats.magic = clamp(c.stats.magic + 10); c.stats.health = 100;
  c.fame += 60;
  c.faction = -1; c.home = -1; c.act = { kind: 'idle' };
  charLog(w, c, `${f ? `${f.name}을(를) 떠나 ` : ''}누구의 깃발 아래에도 서지 않는 열강이 되었다. ${seatName}에 머물렀다.`, 5);
  addNews(w, `${c.epithet} ${c.name}이(가) ${f ? `${f.name}을(를) 떠나 ` : ''}홀로 섰다. 세상은 그를 열강이라 불렀다. ${MOTIVE_NAME[motive]}의 길을 걷는다고 한다.`, 4, 'hero', { pos: c, chars: [c.id], facs: f ? [f.id] : [] });
}

/** 매달 (열강 한 사람): 맡은 일을 하거나, 새 일을 찾거나, 거처로 돌아간다 */
export function paragonMonth(w: World, c: Character): void {
  const P = c.paragon!;
  const rng = w.rngSim;
  c.stats.health = clamp(c.stats.health + 3);
  if (c.act.kind !== 'idle') return;
  // 맡은 일의 자리에 닿았다
  if (P.task) {
    const done = resolveTask(w, c, P.task);
    if (done || w.t - P.task.t > 24) P.task = undefined;
    if (!P.task && !(c.l === P.seat.l && dist(c, P.seat) <= 2)) setTravel(w, c, P.seat, 'quest');
    return;
  }
  if (!rng.chance(0.08)) return;
  const task = pickTask(w, c);
  if (!task) { if (!(c.l === P.seat.l && dist(c, P.seat) <= 2)) setTravel(w, c, P.seat, 'quest'); return; }
  const pos = taskPos(w, task);
  if (!pos) return;
  P.task = { ...task, t: w.t };
  if (dist(c, pos) > 2 || c.l !== pos.l) setTravel(w, c, pos, 'quest');
}

function taskPos(w: World, t: { kind: string; target: number }): Pos | undefined {
  if (t.kind === 'duel') return w.chars[t.target];
  return w.settlements[t.target];
}

/** 성정에 맞는 일을 고른다 */
function pickTask(w: World, c: Character): { kind: string; target: number } | null {
  const P = c.paragon!;
  const near = (s: Settlement) => s.alive && s.l === c.l && dist(s, P.seat) <= 40;
  switch (P.motive) {
    case 'guardian': {
      // 군대나 용에게 위협받는 가까운 고을
      const army = w.armies.find(a => a.alive && (a.goal === 'conquer' || a.goal === 'raid') && near(w.settlements[a.target] ?? ({ alive: false } as Settlement)));
      if (army) return { kind: 'defend', target: army.target };
      const drg = w.chars.find(d => d.died < 0 && d.race === 'dragon' && d.act.kind === 'travel' && d.act.purpose === 'hunt' && w.settlements[d.act.target ?? -1] && near(w.settlements[d.act.target!]));
      if (drg) return { kind: 'defend', target: drg.act.target! };
      return null;
    }
    case 'conqueror': {
      const at = w.settlements.filter(s => near(s) && w.factions[s.faction] && Object.keys(w.factions[s.faction].wars).length > 0 && s.faction !== P.task?.target);
      const s = at.sort((a, b) => a.pop - b.pop)[0];
      return s ? { kind: 'assault', target: s.id } : null;
    }
    case 'greed': {
      const s = w.settlements.filter(near).sort((a, b) => b.stock[GOLD] - a.stock[GOLD])[0];
      return s && s.stock[GOLD] > 50 ? { kind: 'plunder', target: s.id } : null;
    }
    case 'glory': {
      // 마왕은 명예의 결투 상대가 아니다 (마왕을 쓰러뜨리는 일은 용사와 토벌대의 몫)
      const foe = w.chars.filter(o => o.died < 0 && o !== c && o.l === c.l && dist(o, c) < 60 && w.demonLord !== o.id && !o.officer && (isParagon(o) || isHero(o) || (o.race === 'dragon' && !o.ancient) || o.fame > 150))
        .sort((a, b) => charPower(b, w) - charPower(a, w))[0];
      return foe ? { kind: 'duel', target: foe.id } : null;
    }
    case 'prophet': {
      const r = faithOf(w, c.faith);
      if (!r) return { kind: 'found', target: -1 };
      const s = w.settlements.filter(o => near(o) && o.faith !== r.id && !RACES[o.race].noPop).sort((a, b) => dist(a, c) - dist(b, c))[0];
      return s ? { kind: 'preach', target: s.id } : null;
    }
  }
  return null;
}

/** 맡은 일을 해낸다 (그 자리에 닿았을 때). 끝났으면 true */
function resolveTask(w: World, c: Character, t: { kind: string; target: number }): boolean {
  const rng = w.rngSim;
  if (t.kind === 'found') {
    const r = foundFaith(w, c);
    if (r) addNews(w, `열강 ${c.name}이(가) 떠도는 길 위에서 '${r.deity}'의 가르침을 열었다. 교리는 ${r.tenets.length}가지였다.`, 3, 'hero', { pos: c, chars: [c.id] });
    return true;
  }
  const pos = taskPos(w, t);
  if (!pos || (pos as Settlement).alive === false || c.l !== pos.l || dist(c, pos) > 3) return false;
  const s = w.settlements[t.target];
  switch (t.kind) {
    case 'defend': {
      const army = w.armies.find(a => a.alive && a.target === t.target && a.l === s.l && dist(a, s) <= 6);
      if (army) {
        const cut = Math.round(Math.min(army.soldiers, charPower(c, w) * rng.float(0.8, 1.6)));
        army.soldiers -= cut;
        if (army.soldiers < 10) army.alive = false;
        c.fame += 12;
        charLog(w, c, `${s.name}을(를) 노리던 ${w.factions[army.faction]?.name ?? '적'}의 군대를 홀로 막아섰다.`, 3);
        addNews(w, `열강 ${c.name}이(가) ${s.name} 앞에 홀로 서서 ${w.factions[army.faction]?.name ?? '적'}의 군세 ${cut}명을 꺾었다.`, 3, 'hero', { pos: s, chars: [c.id], facs: [army.faction, s.faction] });
        return true;
      }
      const drg = w.chars.find(d => d.died < 0 && d.race === 'dragon' && d.l === s.l && dist(d, s) <= 5);
      if (drg) {
        const win = duel(w, c, drg, '열강과의 사투');
        addNews(w, win === c ? `열강 ${c.name}이(가) ${s.name}을(를) 덮친 용 ${drg.name}을(를) 물리쳤다.` : `열강 ${c.name}이(가) 용 ${drg.name}에게 맞섰으나 밀려났다.`, 3, 'hero', { pos: s, chars: [c.id, drg.id] });
        return true;
      }
      return w.t - (c.paragon?.task?.t ?? w.t) > 6;
    }
    case 'assault': {
      if (!s || !s.alive) return true;
      const killed = Math.round(s.pop * rng.float(0.03, 0.08));
      s.pop -= killed; s.stability = clamp(s.stability - 15); s.lastAttacked = w.t;
      c.fame += 8;
      const enemyOf = Object.keys(w.factions[s.faction]?.wars ?? {}).map(Number)[0];
      const ally = w.factions[enemyOf];
      charLog(w, c, `${ally ? `${ally.name} 편에 서서 ` : ''}${s.name}을(를) 덮쳤다.`, 3);
      addNews(w, `열강 ${c.name}이(가) ${ally ? `${ally.name} 편에 서서 ` : ''}${s.name}을(를) 덮쳤다. ${killed}명이 쓰러지고 성벽이 무너졌다.`, 3, 'war', { pos: s, chars: [c.id], facs: [s.faction] });
      return true;
    }
    case 'plunder': {
      if (!s || !s.alive) return true;
      const take = s.stock[GOLD] * 0.35;
      s.stock[GOLD] -= take; c.wealth += take; s.stability = clamp(s.stability - 8);
      charLog(w, c, `${s.name}의 금고를 털었다. 금화 ${Math.round(take)}닢.`, 3);
      addNews(w, `열강 ${c.name}이(가) ${s.name}의 금고를 털어 갔다. 막아서는 자가 없었다.`, 3, 'dark', { pos: s, chars: [c.id], facs: [s.faction] });
      return true;
    }
    case 'duel': {
      const foe = w.chars[t.target];
      if (!foe || foe.died >= 0) return true;
      const win = duel(w, c, foe, '열강의 결투');
      addNews(w, win === c ? `열강 ${c.name}이(가) ${foe.name}에게 도전하여 꺾었다. 그 이름이 더 높아졌다.` : `열강 ${c.name}이(가) ${foe.name}에게 도전하였으나 무릎을 꿇었다.`, 3, 'hero', { pos: c, chars: [c.id, foe.id] });
      return true;
    }
    case 'preach': {
      if (!s || !s.alive) return true;
      const r = faithOf(w, c.faith);
      if (r && spreadTo(w, s, r)) {
        charLog(w, c, `${s.name}에서 ${r.name}을(를) 전하였다.`, 2);
        addNews(w, `열강 ${c.name}의 설교에 ${s.name} 사람들이 ${r.name}을(를) 받아들였다.`, 2, 'hero', { pos: s, chars: [c.id] });
      }
      return true;
    }
  }
  return true;
}

/** 열강이 지금 무엇을 하는가 (화면용) */
export function paragonDoing(w: World, c: Character): string {
  const P = c.paragon;
  if (!P) return '';
  const t = P.task;
  if (!t) return `${P.seat.name}에 머무는 중`;
  const s = w.settlements[t.target], foe = w.chars[t.target];
  return { defend: `${s?.name ?? ''}을(를) 지키러`, assault: `${s?.name ?? ''}을(를) 치러`, plunder: `${s?.name ?? ''}을(를) 털러`, duel: `${foe?.name ?? ''}에게 도전하러`, preach: `${s?.name ?? ''}에 설교하러`, found: '가르침을 열러' }[t.kind] ?? '';
}

export const paragonSince = (w: World, c: Character) => (c.paragon ? yearOf(w, c.paragon.since) : 0);
