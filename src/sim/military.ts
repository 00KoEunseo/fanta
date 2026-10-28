import { relocate } from './characters';
import { warScore } from './warfare';
import { clearMonth } from './pioneer';
import { dist } from './state';
import { RACES } from '../data/races';
import { disasterStrikes, markPeril } from './peril';
import { offerArmy } from './expedition';
import { FOOD, GOLD, ORE, RES_COUNT } from '../data/terrain';
import { COMPASSION, COURAGE, LOYALTY } from '../data/traits';
import { EPITHETS } from '../data/names';
import { addNews, charLog } from './news';
import { MOVE_FLY, MOVE_WALK, advance, findPath, posOf } from './path';
import type { Army, ArmyGoal, Character, Faction, Pos, Settlement, World } from './state';
import { campsMonth, fieldCamp, joinCamp, returnToCamp } from './camps';
import { learn } from './contact';
import { addFacRel, charLabel, clamp, isAdult, leaderOf, rel, charPower } from './helpers';
import { awaken, killChar, setPos } from './characters';
import { aggrieve, fallFaction, invalidateDist, transferSettlement } from './factions';
import { foundSettlement, hasFlag } from './settlements';
import { allowsSlavery, enslaveChar, takeSlaves } from './slavery';

/** 이미 모인 병력으로 그 자리에서 군대를 세운다 (주둔지의 출격) */
export function armyAt(w: World, f: Faction, at: Pos, goal: ArmyGoal, target: Settlement, size: number, path: number[], home: number, cmd: Character | null): Army {
  const a: Army = {
    id: w.armies.length, faction: f.id, race: f.race, commander: cmd ? cmd.id : -1, soldiers: Math.round(size), goal,
    target: target.id, home, path, loot: new Array(RES_COUNT).fill(0), alive: true,
    l: at.l, x: at.x, y: at.y, pl: at.l, px: at.x, py: at.y, age: 0,
  };
  w.armies.push(a);
  if (cmd) { cmd.act = { kind: 'army', target: a.id }; charLog(w, cmd, `주둔지에서 군세 ${a.soldiers}명을 이끌고 ${target.name}(으)로 출격하였다.`, 2); }
  return a;
}

export function raiseArmy(
  w: World, f: Faction, from: Settlement, goal: ArmyGoal, target: Settlement | null, size: number,
  commander?: Character, dest?: Pos,
): Army | null {
  const to = target ?? dest;
  if (!to) return null;
  const mover = { race: from.race, flying: RACES[from.race].flying };
  const path = findPath(w, from, to, mover, 40000);
  if (!path) return null;
  size = Math.min(size, from.pop * 0.5);
  if (size < 10) return null;
  from.pop -= size;
  // 지휘관
  let cmd = commander;
  if (!cmd && goal !== 'colonize' && goal !== 'clear') {
    const ld = leaderOf(w, f);
    const cands = w.chars.filter(c => c.died < 0 && c.faction === f.id && isAdult(w, c) && c.act.kind === 'idle' && c.race !== 'dragon'
      && c.stats.health > 40 && c.id !== f.leader && c.l === from.l && dist(c, from) <= 8 && !c.isPlayer && c.role !== '노예');
    cands.sort((a, b) => (b.stats.command + b.stats.might * 0.5 + b.traits[COURAGE] * 0.2) - (a.stats.command + a.stats.might * 0.5 + a.traits[COURAGE] * 0.2));
    cmd = cands[0];
    // 호전적인 군주는 친히 출정한다
    if (ld && !ld.isPlayer && isAdult(w, ld) && ld.act.kind === 'idle' && ld.l === from.l && dist(ld, from) <= 8 && (goal === 'conquer' || goal === 'holywar') && ld.traits[COURAGE] > 70 && w.rngSim.chance(0.3)) cmd = ld;
  }
  const a: Army = {
    id: w.armies.length, faction: f.id, race: from.race, commander: cmd ? cmd.id : -1, soldiers: Math.round(size), goal,
    target: target ? target.id : -1, home: from.id, path, loot: new Array(RES_COUNT).fill(0), alive: true,
    l: from.l, x: from.x, y: from.y, pl: from.l, px: from.x, py: from.y, dest, age: 0,
  };
  if (goal === 'colonize') a.loot[FOOD] = Math.min(from.stock[FOOD] * 0.3, size);
  from.stock[FOOD] -= a.loot[FOOD];
  w.armies.push(a);
  if (cmd) {
    cmd.act = { kind: goal === 'colonize' || goal === 'clear' ? 'colonize' : 'army', target: a.id };
    const what = goal === 'clear' ? `${a.soldiers}명의 일꾼을 이끌고 개간지로 떠났다.` : goal === 'colonize' ? `이주민 ${a.soldiers}명을 이끌고 새 땅을 찾아 떠났다.`
      : goal === 'raid' ? `약탈대 ${a.soldiers}명을 이끌고 ${target!.name}(으)로 출정하였다.`
        : `군세 ${a.soldiers}명을 이끌고 ${target!.name}(으)로 진군하였다.`;
    charLog(w, cmd, what, 2);
  }
  if (!cmd?.isPlayer) offerArmy(w, a);
  return a;
}

function armyPower(w: World, a: Army): number {
  const R = RACES[a.race];
  const f = w.factions[a.faction];
  const c = w.chars[a.commander];
  let p = a.soldiers * R.might;
  if (c && c.died < 0) p *= 1 + c.stats.command / 140 + (c.awakened.includes('hero') ? 0.3 : 0) + (w.demonLord === c.id ? 0.8 : 0);
  if (f?.flags.includes('knights')) p *= 1.15;
  if (f?.flags.includes('waaagh')) p *= 1.25;
  if (f?.flags.includes('ancient_magic')) p *= 1.2;
  if (f && hasFlag(f, 'blood_moon', w.t)) p *= 1.3;
  return p;
}

const RACE_FORTIFY: Partial<Record<string, number>> = { dwarf: 1.5, elf: 1.4, angel: 1.6, darkelf: 1.2, kobold: 1.15, undead: 1.2 };

export function garrison(w: World, s: Settlement): number {
  const R = RACES[s.race];
  const f = w.factions[s.faction];
  const isCap = f && f.capital === s.id;
  let d = s.pop * 0.2 * R.might * (isCap ? 1.5 : 1) * (1 + s.dev / 70) * (1 + s.tier * 0.25) * (0.7 + 0.6 * Math.min(1, s.stock[ORE] / (s.pop * 0.2 + 1)));
  const g = w.chars[s.governor];
  if (g && g.died < 0) d *= 1 + g.stats.command / 200;
  if (f?.flags.some(x => x.startsWith('patron:'))) {
    const dragon = w.chars[+f.flags.find(x => x.startsWith('patron:'))!.split(':')[1]];
    if (dragon && dragon.died < 0) d += 300;
  }
  if (f?.flags.includes('knights')) d *= 1.1;
  // 갓 들고 일어선 나라는 결기로 버틴다
  if (f && hasFlag(f, 'uprising', w.t)) d *= 1.5;
  d *= RACE_FORTIFY[s.race] ?? 1;
  if (s.flags.includes('worldtree') || s.flags.includes('sanctum')) d *= 1.8;
  // 다 자란 세계수는 뿌리와 가지로 그 고을을 감싼다
  if (s.flags.includes('worldtree') && w.worldTree?.alive && w.worldTree.sid === s.id && w.worldTree.growth >= 100) d *= 1.4;
  // 천상의 성역은 천군과 열두 천사가 지킨다 (천사가 쓰러질수록 약해진다)
  if (s.flags.includes('sanctum')) {
    const angels = w.chars.filter(c => c.died < 0 && c.race === 'angel' && c.seat !== undefined);
    d += 800 + angels.reduce((t, c) => t + charPower(c, w) * 2.5, 0);
  }
  // 영웅이 지키고 있다
  for (const c of w.chars) if (c.died < 0 && c.home === s.id && c.awakened.includes('hero') && c.act.kind === 'idle') d *= 1.3;
  return d;
}

export function pAttackWin(w: World, a: Army, s: Settlement): number {
  const A = Math.pow(armyPower(w, a), 1.4), D = Math.pow(garrison(w, s), 1.4);
  return A / (A + D);
}

export function armiesMonth(w: World): void {
  campsMonth(w);
  for (const a of w.armies) {
    if (!a.alive) continue;
    a.pl = a.l; a.px = a.x; a.py = a.y;
    // 대치 중인 군대는 진지에 머문다
    if (a.hold !== undefined) { syncCommander(w, a); continue; }
    a.age++;
    const fly = RACES[a.race].flying;
    if (a.path.length) {
      const p = advance(w, a.path, fly ? MOVE_FLY : MOVE_WALK, { race: a.race, flying: fly });
      if (p) { a.l = p.l; a.x = p.x; a.y = p.y; }
    }
    syncCommander(w, a);
    if (a.goal === 'clear') { clearMonth(w, a, x => goHomeArmy(w, x)); continue; }
    if (a.path.length && a.age < 150) continue;
    arrive(w, a);
  }
  // 대치가 끝난 군대는 맞붙는다 (상대가 사라졌으면 다시 길을 간다)
  for (const a of w.armies) {
    if (!a.alive || a.hold === undefined || w.t < a.hold) continue;
    const b = w.armies[a.foe ?? -1];
    a.hold = undefined; a.foe = undefined;
    if (b && b.alive && b.foe === a.id) { b.hold = undefined; b.foe = undefined; fieldBattle(w, a, b); }
  }
  // 길에서 마주침: 이번 달 걸어온 길이 서로 스치면 (지나쳐 버리지 않도록) 멈춰 선다
  const live = w.armies.filter(a => a.alive && a.goal !== 'colonize' && a.goal !== 'clear' && a.hold === undefined);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (!a.alive || !b.alive || a.hold !== undefined || b.hold !== undefined || a.l !== b.l || a.faction === b.faction) continue;
    if (a.pl !== a.l || b.pl !== b.l || crossGap(a, b) > 2) continue;
    const fa = w.factions[a.faction], fb = w.factions[b.faction];
    if (!fa || !fb) continue;
    if (fa.wars[b.faction] !== undefined) standoff(w, a, b, fa, fb);
    else meetNeutral(w, a, b, fa, fb);
  }
  if (w.armies.length > 400) w.armies = w.armies.filter((a, i) => a.alive || i >= w.armies.length - 50).map((a, i) => { a.id = i; return a; });
  remapCommanders(w);
}

function remapCommanders(w: World): void {
  for (const a of w.armies) {
    if (!a.alive) continue;
    const c = w.chars[a.commander];
    if (c && (c.act.kind === 'army' || c.act.kind === 'colonize')) c.act.target = a.id;
  }
}

function syncCommander(w: World, a: Army): void {
  const c = w.chars[a.commander];
  if (!c) return;
  if (c.died >= 0) { a.commander = -1; return; }
  c.pl = c.l; c.px = c.x; c.py = c.y;
  setPos(c, a);
}

function disband(w: World, a: Army): void {
  a.alive = false;
  const c = w.chars[a.commander];
  if (c && c.died < 0) {
    c.act = { kind: 'idle' };
    const h = w.settlements[c.home];
    if (h && h.alive) relocate(w, c, h);
  }
}

function goHomeArmy(w: World, a: Army): void {
  if (a.camp !== undefined && !a.toCamp && returnToCamp(w, a)) { a.goal = 'return'; a.age = 0; return; }
  const home = w.settlements[a.home];
  const f = w.factions[a.faction];
  let dest = home && home.alive && home.faction === a.faction ? home : null;
  if (!dest && f) dest = w.settlements[f.capital] ?? null;
  if (!dest) { disband(w, a); return; }
  const path = findPath(w, a, dest, { race: a.race, flying: RACES[a.race].flying }, 40000);
  if (!path) { dest.pop += a.soldiers * 0.5; disband(w, a); return; }
  a.home = dest.id;
  a.goal = 'return';
  a.path = path;
  a.age = 0;
}

function arrive(w: World, a: Army): void {
  const rng = w.rngSim;
  const f = w.factions[a.faction];
  if (!f || !f.alive) { disband(w, a); return; }
  // 주둔지로 가던 군대는 합류한다 (주둔지가 사라졌으면 고향으로)
  if (a.toCamp) { if (joinCamp(w, a)) return; a.toCamp = false; a.camp = undefined; goHomeArmy(w, a); return; }
  if (a.goal === 'return') {
    const s = w.settlements[a.home];
    if (s && s.alive) {
      s.pop += a.soldiers;
      for (let r = 0; r < RES_COUNT; r++) s.stock[r] += a.loot[r];
    }
    disband(w, a);
    return;
  }
  if (a.goal === 'colonize') { colonize(w, a); return; }
  const s = w.settlements[a.target];
  if (!s || !s.alive || s.faction === a.faction) { goHomeArmy(w, a); return; }
  const def = w.factions[s.faction];
  if (a.goal !== 'raid' && def && f.wars[def.id] === undefined) { goHomeArmy(w, a); return; }
  // 처음 보는 이들의 약탈: 이기든 막아내든, 서로의 존재를 피로 알게 된다
  if (a.goal === 'raid' && def && learn(w, def, f)) {
    learn(w, f, def);
    addNews(w, `처음 보는 ${f.name}의 약탈대가 ${s.name}에 쳐들어왔다. ${def.name}이(가) ${f.name}과(와) 처음으로 조우하였다.`, 3, 'war', { pos: s, facs: [f.id, def.id] });
  }
  const p = pAttackWin(w, a, s);
  const win = rng.chance(p);
  const cmd = w.chars[a.commander];
  const gov = w.chars[s.governor];
  const atk = Math.round(a.soldiers), defN = Math.round(s.pop * 0.2);
  s.lastAttacked = w.t;
  if (win) {
    const lossA = a.soldiers * rng.float(0.05, 0.25);
    const lossD = s.pop * rng.float(0.06, 0.15);
    a.soldiers -= lossA; s.pop -= lossD;
    w.corpses += lossA + lossD;
    if (cmd && cmd.died < 0) { cmd.fame += a.goal === 'raid' ? 4 : 12; cmd.stats.command = clamp(cmd.stats.command + 1); }
    if (a.goal === 'raid') {
      for (const r of [FOOD, GOLD, ORE]) { const take = s.stock[r] * 0.45; s.stock[r] -= take; a.loot[r] += take; }
      s.stability = clamp(s.stability - 12);
      if (def) addFacRel(w, f, def, -15);
      warScore(w, f, def, 3);
      aggrieve(w, def, f, `${s.name}이(가) 약탈당한 일`);
      let captives = 0;
      if (allowsSlavery(w, f)) {
        captives = Math.round(s.pop * rng.float(0.02, 0.06));
        s.pop -= captives;
        const home = w.settlements[a.home];
        if (home && home.alive) takeSlaves(w, home, captives, s.race);
      }
      addNews(w, `${f.name}의 약탈대가 ${s.name}을(를) 습격하여 곡식과 재물을 빼앗아 갔다.${captives >= 5 ? ` ${captives}명이 노예로 끌려갔다.` : ''}`, 2, 'war', { pos: s, facs: [f.id, s.faction], chars: cmd ? [cmd.id] : [] });
      if (cmd && cmd.died < 0) charLog(w, cmd, `${s.name} 약탈에 성공하였다.`, 2);
      goHomeArmy(w, a);
    } else if (rng.chance(def && def.capital === s.id ? 0.45 : 0.75) === false) {
      // 성벽은 버텼다: 포위로 큰 피해만 입힌다
      s.pop -= s.pop * 0.08; s.stability = clamp(s.stability - 15); s.dev = Math.max(0, s.dev - 3);
      for (const r of [FOOD, GOLD]) { const take = s.stock[r] * 0.3; s.stock[r] -= take; a.loot[r] += take; }
      addNews(w, `${f.name}의 군대가 ${s.name}을(를) 포위하여 성 밖을 불태웠으나 성벽은 무너지지 않았다.`, 2, 'war', { pos: s, facs: [f.id, s.faction] });
      if (cmd && cmd.died < 0) charLog(w, cmd, `${s.name}을(를) 포위하였으나 함락하지 못하였다.`, 2);
      goHomeArmy(w, a);
    } else {
      const cap = def && def.capital === s.id;
      aggrieve(w, def, f, `${s.name}을(를) 빼앗긴 일`);
      addNews(w, `${cmd ? charLabel(w, cmd) + '이(가) 이끄는 ' : ''}${f.name}의 군대가 ${s.name}을(를) 함락하였다. (${atk} 대 ${defN})`, cap ? 4 : 3, 'war',
        { pos: s, facs: [f.id, s.faction], chars: cmd ? [cmd.id] : [] });
      if (cmd && cmd.died < 0) {
        charLog(w, cmd, `${s.name}을(를) 함락하였다.`, 3);
        if (cmd.traits[COMPASSION] < 25 && rng.chance(0.4)) {
          const killed = s.pop * 0.3;
          s.pop -= killed;
          w.corpses += killed;
          if (!cmd.epithet) cmd.epithet = EPITHETS.butcher;
          addNews(w, `${cmd.name}은(는) 함락된 ${s.name}에서 학살을 자행하였다.`, 3, 'dark', { pos: s, chars: [cmd.id] });
        }
        if (cmd.fame > 120 && !cmd.epithet) cmd.epithet = EPITHETS.conqueror;
      }
      if (gov && gov.died < 0 && gov.home === s.id && gov.act.kind === 'idle' && gov.l === s.l && dist(gov, s) <= 4) {
        if (rng.chance(w.demonLord === gov.id ? 0.08 : 0.45)) killChar(w, gov, `${s.name} 공방전`, cmd && cmd.died < 0 ? cmd : undefined);
        else { gov.home = -1; charLog(w, gov, `${s.name}이(가) 함락되자 간신히 탈출하였다.`, 3); }
      }
      captureSettlement(w, s, f, cmd);
      s.pop += a.soldiers * 0.4;
      a.soldiers *= 0.6;
      goHomeArmy(w, a);
    }
  } else {
    const lossA = a.soldiers * rng.float(0.3, 0.6);
    const lossD = s.pop * rng.float(0.02, 0.06);
    a.soldiers -= lossA; s.pop -= lossD;
    w.corpses += lossA + lossD;
    const govHere = !!gov && gov.died < 0 && gov.l === s.l && dist(gov, s) <= 4;
    // 같은 적을 한 해에 여러 번 막아내면 일대기에는 한 번만 남긴다
    if (govHere) { gov!.fame += 8; const again = gov!.bio.some(b => b.t > w.t - 12 && b.text.includes(`${f.name}의 공격으로부터`)); charLog(w, gov!, `${f.name}의 공격으로부터 ${s.name}을(를) 지켜냈다.`, again ? 1 : 2); }
    warScore(w, def, f, a.goal === 'raid' ? 2 : 5);
    addNews(w, `${s.name}이(가) ${f.name}의 ${a.goal === 'raid' ? '약탈대' : '공격'}을(를) 막아냈다.`, a.goal === 'raid' ? 1 : 2, 'war', { pos: s, facs: [f.id, s.faction] });
    if (cmd && cmd.died < 0) {
      if (rng.chance(0.18)) killChar(w, cmd, `${s.name} 공략전에서 전사`, govHere ? gov : undefined);
      else charLog(w, cmd, `${s.name} 공략에 실패하고 퇴각하였다.`, 2);
    }
    if (f) f.warWeariness += 6;
    goHomeArmy(w, a);
  }
}

/** 이번 달 두 군대가 걸어온 길 사이의 가장 가까운 거리 (같은 시각끼리 견준다), 그리고 그 시각 */
function closest(a: Army, b: Army): { d: number; t: number } {
  let best = { d: Infinity, t: 1 };
  for (let s = 0; s <= 6; s++) {
    const t = s / 6;
    const d = Math.hypot(a.px + (a.x - a.px) * t - (b.px + (b.x - b.px) * t), a.py + (a.y - a.py) * t - (b.py + (b.y - b.py) * t));
    if (d < best.d) best = { d, t };
  }
  return best;
}
const crossGap = (a: Army, b: Army) => closest(a, b).d;

/** 전쟁 중인 두 군대가 길에서 맞닥뜨렸다: 그 자리에 진을 치고 대치하다가 맞붙는다 */
function standoff(w: World, a: Army, b: Army, fa: Faction, fb: Faction): void {
  const rng = w.rngSim;
  // 스친 자리로 되돌아가 마주 선다
  const { t } = closest(a, b);
  for (const x of [a, b]) { x.x = Math.round(x.px + (x.x - x.px) * t); x.y = Math.round(x.py + (x.y - x.py) * t); syncCommander(w, x); }
  const until = w.t + rng.int(1, 3);
  a.hold = until; a.foe = b.id;
  b.hold = until; b.foe = a.id;
  const near = w.settlements.filter(s => s.alive && s.l === a.l).sort((p, q) => dist(p, a) - dist(q, a))[0];
  const where = near && dist(near, a) < 14 ? `${near.name} 근처 들판에서` : '길 위에서';
  addNews(w, `${fa.name}의 군대(${Math.round(a.soldiers)})와 ${fb.name}의 군대(${Math.round(b.soldiers)})가 ${where} 맞닥뜨렸다. 양쪽이 진을 치고 서로를 노려본다.`, 2, 'war', { pos: a, facs: [fa.id, fb.id] });
}

/** 싸우지 않는 두 나라의 군대가 길에서 마주쳤다 */
function meetNeutral(w: World, a: Army, b: Army, fa: Faction, fb: Faction): void {
  const rng = w.rngSim;
  if (a.soldiers < 30 || b.soldiers < 30 || !rng.chance(0.4)) return;
  const r = Math.min(fa.relations[fb.id] ?? 0, fb.relations[fa.id] ?? 0);
  if (r >= 25) {
    addFacRel(w, fa, fb, 2);
    if (rng.chance(0.3)) addNews(w, `길에서 마주친 ${fa.name}과(와) ${fb.name}의 군대가 깃발을 내려 인사하고 서로 길을 비켜 주었다.`, 1, 'politics', { pos: a, facs: [fa.id, fb.id] });
    return;
  }
  if (r > -30) return;
  // 사이가 나쁜 나라의 군대: 칼자루를 쥔 채 지나치거나, 드물게 시비가 칼부림이 된다
  if (rng.chance(0.12)) {
    const la = a.soldiers * rng.float(0.05, 0.15), lb = b.soldiers * rng.float(0.05, 0.15);
    a.soldiers -= la; b.soldiers -= lb; w.corpses += la + lb;
    addFacRel(w, fa, fb, -15);
    aggrieve(w, fb, fa, '길에서 벌어진 칼부림');
    addNews(w, `길에서 마주친 ${fa.name}과(와) ${fb.name}의 군대 사이에 시비가 붙어 칼부림이 벌어졌다. 전쟁은 아니었으나 양쪽 모두 피를 흘렸다.`, 2, 'war', { pos: a, facs: [fa.id, fb.id] });
  } else {
    addFacRel(w, fa, fb, -4);
    if (rng.chance(0.3)) addNews(w, `${fa.name}과(와) ${fb.name}의 군대가 길에서 마주쳤다. 양쪽 병사들은 칼자루를 쥔 채 서로를 지나쳤다.`, 1, 'war', { pos: a, facs: [fa.id, fb.id] });
  }
}

function fieldBattle(w: World, a: Army, b: Army): void {
  const rng = w.rngSim;
  const pa = Math.pow(armyPower(w, a), 1.3), pb = Math.pow(armyPower(w, b), 1.3);
  const aw = rng.chance(pa / (pa + pb));
  const win = aw ? a : b, lose = aw ? b : a;
  const losses = lose.soldiers * rng.float(0.4, 0.8);
  lose.soldiers -= losses;
  win.soldiers -= win.soldiers * rng.float(0.05, 0.25);
  w.corpses += losses;
  const fw = w.factions[win.faction], fl = w.factions[lose.faction];
  warScore(w, fw, fl, 8);
  const cw = w.chars[win.commander], cl = w.chars[lose.commander];
  addNews(w, `${fw.name}의 군대가 들판에서 ${fl.name}의 군대를 격파하였다.`, 3, 'war', { pos: win, facs: [fw.id, fl.id], chars: [cw?.id, cl?.id].filter((x): x is number => x !== undefined) });
  if (cw && cw.died < 0) { cw.fame += 10; charLog(w, cw, `${fl.name}의 군대를 야전에서 격파하였다.`, 2); }
  if (cl && cl.died < 0 && rng.chance(w.demonLord === cl.id ? 0.03 : 0.25)) killChar(w, cl, '야전에서 전사', cw && cw.died < 0 ? cw : undefined);
  if (lose.soldiers < 10) disband(w, lose);
  else goHomeArmy(w, lose);
  fl.warWeariness += 5;
  // 이긴 군대는 싸운 자리에 진지를 세우고 버틴다 (전선이 그만큼 앞으로 나아간다)
  const tgt = w.settlements[win.target];
  if ((win.goal === 'conquer' || win.goal === 'holywar') && !win.toCamp && win.camp === undefined && tgt && tgt.alive && tgt.l === win.l && dist(tgt, win) > 8) {
    const camp = fieldCamp(w, fw, fl, win, win.home);
    if (camp) { win.camp = camp.id; win.toCamp = true; joinCamp(w, win); }
  }
}

/** 정착지 점령 */
export function captureSettlement(w: World, s: Settlement, f: Faction, by?: Character): void {
  const rng = w.rngSim;
  const old = w.factions[s.faction];
  const wasCapital = old && old.capital === s.id;
  warScore(w, f, old, wasCapital ? 50 : 30);
  transferSettlement(w, s, f);
  s.stability = 25;
  if (allowsSlavery(w, f) && old && old.race !== f.race) {
    const k = Math.round(s.pop * rng.float(0.08, 0.2));
    s.pop -= k;
    takeSlaves(w, s, k, s.race);
    if (k >= 10) addNews(w, `${f.name}은(는) ${s.name}의 주민 ${k}명을 노예로 삼았다.`, 2, 'war', { pos: s, facs: [f.id] });
  }
  s.dev = Math.max(0, s.dev * 0.85);
  invalidateDist(w);
  // 특별한 장소
  if (s.flags.includes('sanctum') && RACES[f.race].align === 'dark') {
    addNews(w, `천상의 성역이 ${f.name}에게 짓밟혔다. 하늘에서 빛이 사라졌다.`, 5, 'doom', { pos: s, facs: [f.id] });
    const lord = w.chars[w.demonLord];
    // 마왕의 나라든, 마왕에게 무릎 꿇은 가신의 나라든: 마왕의 깃발 아래 성역이 떨어지면 하늘의 왕좌는 마왕의 것이다
    if (lord && lord.died < 0 && (lord.faction === f.id || f.flags.includes('dlvassal')) && !w.doom.ended) {
      w.doom.ended = true;
      w.stats.skyThrone = 1;
      w.doom.endText = `${lord.faction === f.id ? '' : `마왕의 가신 ${f.name}이(가) 성역의 문을 부수었다. `}마왕 ${lord.name}의 군세가 천상의 성역을 짓밟았다. 마지막 천사가 날개를 접었고, 마왕은 빛의 옥좌에 앉아 하늘을 지배하였다. 이제 하늘도 땅도 마왕의 것이다. 세계의 역사는 마왕의 연대기로 바뀌었다.`;
      addNews(w, `【하늘의 왕좌】 ${w.doom.endText}`, 5, 'doom', { pos: s, chars: [lord.id] });
      w.cinematics.push({ kind: 'end', seal: -2, title: '하늘의 왕좌', text: w.doom.endText });
    }
  }
  // 함락의 밤: 칼끝은 누구도 가리지 않는다 (마왕군이라면 더더욱)
  const dlTook = w.demonLord >= 0 && w.chars[w.demonLord]?.faction === f.id;
  disasterStrikes(w, s, 'fallen', `${s.name} 함락 때 목숨을 잃음`, dlTook ? 0.2 : 0.06, by);
  // 주민 인물들의 운명
  for (const c of w.chars) {
    // 길을 떠난 사이 고향이 떨어졌다: 소식이 길 위의 '나'에게 닿는다
    if (c.isPlayer && c.died < 0 && c.home === s.id && c.act.kind !== 'idle' && c.act.kind !== 'army' && c.act.kind !== 'prison') { markPeril(w, 'fallenAway', s); continue; }
    if (c.died >= 0 || c.home !== s.id || c.act.kind !== 'idle') continue;
    if (!old) continue;
    if (c.id === old.leader) continue;
    // '나'의 거취는 내가 정한다 (함락의 선택지가 뜬다)
    if (c.isPlayer) { markPeril(w, 'fallen', s); continue; }
    // 천사는 무릎 꿇지 않는다: 제 나라의 다른 땅으로 물러나거나, 홀로 남아 되찾을 날을 기다린다
    if (c.race === 'angel') {
      const other = old.settlements.map(id => w.settlements[id]).find(x => x && x.alive && x.faction === old.id);
      if (other) { c.home = other.id; relocate(w, c, other); charLog(w, c, `${s.name}을(를) 빼앗기고 ${other.name}(으)로 물러났다. 되찾을 날을 맹세하였다.`, 3); }
      else { c.home = -1; c.faction = -1; charLog(w, c, `${s.name}을(를) 빼앗겼다. 무릎 꿇지 않고 하늘을 떠돌며 되찾을 날을 기다린다.`, 3); }
      continue;
    }
    if (c.traits[LOYALTY] > 55 || rel(c, old.leader) > 30) {
      const other = old.settlements.map(id => w.settlements[id]).find(x => x && x.alive && x.faction === old.id);
      if (other) { c.home = other.id; relocate(w, c, other); charLog(w, c, `${s.name}이(가) 함락되자 ${other.name}(으)로 피난하였다.`, 2); }
      else { c.home = -1; c.faction = -1; }
    } else if (allowsSlavery(w, f) && old.race !== f.race && rng.chance(0.3)) {
      enslaveChar(w, c, s);
    } else {
      c.faction = f.id;
      charLog(w, c, `${s.name}이(가) 함락되자 ${f.name}에 투항하였다.`, 2);
    }
    // 고향을 잃은 용사 후보
    if (c.apt[1] >= 75 && RACES[f.race].align === 'dark' && !c.awakened.includes('hero') && rng.chance(0.25)) {
      awaken(w, c, 'hero', `고향 ${s.name}이(가) 어둠의 군세에 짓밟히던 날,`);
    }
  }
  if (old) {
    const ld = leaderOf(w, old);
    if (wasCapital && ld && ld.home === s.id && ld.act.kind === 'idle') {
      if (rng.chance(0.35)) killChar(w, ld, `수도 ${s.name} 함락`, by && by.died < 0 ? by : undefined);
      else charLog(w, ld, `수도 ${s.name}을(를) 잃고 도주하였다.`, 4);
    }
    old.legitimacy = clamp(old.legitimacy - (wasCapital ? 25 : 8));
    if (!old.settlements.length) fallFaction(w, old);
    else if (wasCapital) {
      const next = old.settlements.map(id => w.settlements[id]).sort((x, y) => y.pop - x.pop)[0];
      old.capital = next.id;
      const ld2 = leaderOf(w, old);
      if (ld2) { ld2.home = next.id; relocate(w, ld2, next); }
      addNews(w, `${old.name}은(는) 수도를 ${next.name}(으)로 옮겼다.`, 2, 'politics', { facs: [old.id], pos: next });
    }
  }
}

function colonize(w: World, a: Army): void {
  const rng = w.rngSim;
  const f = w.factions[a.faction];
  const dest = a.dest ?? a;
  const L = w.layers[dest.l];
  const k = dest.y * L.w + dest.x;
  const tooClose = w.settlements.some(s => s.alive && s.l === dest.l && Math.hypot(s.x - dest.x, s.y - dest.y) < 4);
  if ((L.claim[k] >= 0 && L.owner[k] !== f.id) || tooClose) { goHomeArmy(w, a); return; }
  const s = foundSettlement(w, { faction: f.id, race: a.race, pos: dest, pop: a.soldiers });
  s.stock[FOOD] += a.loot[FOOD];
  invalidateDist(w);
  const c = w.chars[a.commander];
  a.alive = false;
  if (c && c.died < 0) {
    c.act = { kind: 'idle' };
    c.home = s.id;
    s.governor = c.id;
    c.fame += 15; c.honor += 10;
    if (!c.epithet && rng.chance(0.3)) c.epithet = EPITHETS.founder;
    charLog(w, c, `이주민 ${Math.round(a.soldiers)}명과 함께 ${s.name}을(를) 세우고 그곳의 영주가 되었다.`, 3);
    addNews(w, `${c.name}이(가) 이주민 ${Math.round(a.soldiers)}명을 이끌고 새 땅에 ${s.name}을(를) 세웠다. (${f.name})`, 2, 'growth', { pos: s, facs: [f.id], chars: [c.id] });
  } else addNews(w, `${f.name}의 이주민들이 새 땅에 ${s.name}을(를) 세웠다.`, 2, 'growth', { pos: s, facs: [f.id] });
}
