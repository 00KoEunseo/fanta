import { setTravel } from './characters';
import { RACES } from '../data/races';
import { FOOD, GOLD, MANA, WOOD } from '../data/terrain';
import { EPITHETS } from '../data/names';
import { addNews, charLog } from './news';
import type { Character, Faction, Settlement, World } from './state';
import { approxDist, charLabel, charPower, clamp, leaderOf } from './helpers';
import { setTimedFlag } from './settlements';
import { killChar } from './characters';
import { spawnDragon } from './events';

// ───────────── 세계수: 체력과 유지비

const TREE_UPKEEP = { mana: 3, food: 3, wood: 1 };

export function worldTreeMonth(w: World): void {
  const T = w.worldTree;
  if (!T || !T.alive) return;
  const s = w.settlements[T.sid];
  if (!s || !s.alive) { fellTree(w, '돌볼 이가 모두 사라져'); return; }
  const f = w.factions[s.faction];
  const dark = f && RACES[f.race].align === 'dark';
  const before = T.hp;
  if (dark) {
    T.hp -= 2;
    if (!s.flags.includes('tree_burning')) {
      s.flags.push('tree_burning');
      addNews(w, `${f.name}이(가) 세계수의 뿌리에 불을 놓았다. 세계수가 서서히 타들어 가고 있다.`, 4, 'doom', { pos: s, facs: [f.id] });
    }
  } else if (T.felling) {
    T.hp -= 4;
  } else if (T.growth >= 100) {
    // 다 자란 세계수는 지키는 이에게 베푼다: 따로 돌볼 비용 없이 스스로 아물고, 마나와 열매를 내준다
    T.hp = Math.min(100, T.hp + 0.6);
    s.stock[MANA] += 4;
    s.stock[FOOD] += 3;
    s.stability = Math.min(100, s.stability + 0.3);
  } else if (s.stock[MANA] >= TREE_UPKEEP.mana && s.stock[FOOD] >= TREE_UPKEEP.food) {
    // 심고 키우는 동안에만 손이 간다
    s.stock[MANA] -= TREE_UPKEEP.mana;
    s.stock[FOOD] -= TREE_UPKEEP.food;
    s.stock[WOOD] = Math.max(0, s.stock[WOOD] - TREE_UPKEEP.wood);
    T.hp = Math.min(100, T.hp + 0.6);
    T.growth = Math.min(100, T.growth + 0.45);
    if (T.growth >= 100) addNews(w, `${s.name}의 세계수가 마침내 하늘을 덮을 만큼 자랐다. 숲의 정령들이 돌아왔다. 이제 세계수가 그 땅을 지키고 먹일 것이다.`, 4, 'hero', { pos: s, facs: f ? [f.id] : [] });
  } else {
    // 어린 나무를 돌볼 마나와 양식이 모자라면 자라지 못하고 조금씩 시든다
    T.hp -= 0.4;
  }
  if (!dark && s.flags.includes('tree_burning')) {
    s.flags = s.flags.filter(x => x !== 'tree_burning');
    for (const o of w.factions) o.flags = o.flags.filter(x => !x.startsWith('crusade:'));
    if (f) addNews(w, `${f.name}이(가) 세계수를 되찾았다. 불길이 잦아들고 새잎이 돋기 시작하였다.`, 4, 'hero', { pos: s, facs: [f.id] });
  }
  for (const mark of [50, 25]) {
    if (before > mark && T.hp <= mark) {
      addNews(w, `${s.name}의 세계수가 시들어 간다. 잎이 누렇게 떨어지고 있다. (생명력 ${mark}%)`, mark === 25 ? 4 : 3, 'doom', { pos: s, facs: f ? [f.id] : [] });
    }
  }
  if (T.hp <= 0) fellTree(w, dark ? '어둠의 불길에 타서' : T.felling ? '도끼에 베여' : '돌보는 이 없이 말라');
}

/** 세계수가 쓰러진다: 봉인은 깨지지만 그 땅의 주인은 막대한 보상을 얻는다 */
function fellTree(w: World, how: string): void {
  const T = w.worldTree!;
  T.alive = false;
  T.hp = 0;
  for (const o of w.factions) o.flags = o.flags.filter(x => !x.startsWith('crusade:'));
  T.felling = false;
  const s = w.settlements[T.sid];
  if (!s) return;
  s.flags = s.flags.filter(x => x !== 'worldtree' && x !== 'tree_burning');
  s.flags.push('worldtree_burned');
  const f = w.factions[s.faction];
  if (!s.alive || !f || !f.alive) {
    addNews(w, `세계수가 ${how} 쓰러졌다.`, 5, 'doom', { pos: s });
    return;
  }
  // 보상: 세계수의 심재와 수액이 60년 동안 이 세력을 살찌운다
  setTimedFlag(f, 'tree_heart', w.t + 12 * 60);
  s.dev = Math.min(100, s.dev + 15);
  const ld = leaderOf(w, f);
  if (ld) {
    ld.items.push('세계수의 심장');
    ld.stats.magic = clamp(ld.stats.magic + 25);
    ld.lifespan += 100;
    ld.wealth += 500;
    ld.fame += 60;
  }
  addNews(w, `세계수가 ${how} 쓰러졌다. ${f.name}은(는) 그 심재와 수액으로 막대한 부를 얻었고${ld ? `, ${ld.name}은(는) 세계수의 심장을 손에 넣었다` : ''}. 숲의 정령들은 통곡하였다.`, 5, 'doom', { pos: s, facs: [f.id], chars: ld ? [ld.id] : [] });
}

/** 탐욕스러운 군주가 세계수를 베기로 한다 */
export function pTreeHarvest(w: World, f: Faction): number {
  const T = w.worldTree;
  if (!T || !T.alive || T.felling || T.growth < 100) return 0;
  const s = w.settlements[T.sid];
  if (!s || s.faction !== f.id) return 0;
  const ld = leaderOf(w, f);
  if (!ld || ld.traits[2] < 62 || ld.traits[3] > 45) return 0;
  return f.race === 'elf' ? 0.0008 : 0.002;
}

export function startHarvest(w: World, f: Faction): void {
  const T = w.worldTree!;
  const ld = leaderOf(w, f)!;
  T.felling = true;
  addNews(w, `${f.name}의 ${ld.name}이(가) 세계수의 심재를 탐내 벌목을 명하였다. 도끼 소리가 숲을 울렸다.`, 4, 'doom', { pos: w.settlements[T.sid], facs: [f.id], chars: [ld.id] });
  charLog(w, ld, '세계수를 베라 명하였다.', 4);
}

// ───────────── 용의 성향과 원한

export function assignDragonKind(w: World, d: Character): void {
  const rng = w.rngSim;
  const r = rng.next();
  if (r < 0.15) {
    d.dragonKind = 'raider';
    d.traits[2] = clamp(d.traits[2] + 20);
    d.traits[3] = clamp(d.traits[3] - 20);
    return;
  }
  if (r < 0.4) {
    const near = w.factions.filter(f => f.alive && f.settlements.length && approxDist(w, d, w.settlements[f.capital] ?? d, true) < 55);
    if (near.length) { makePatron(w, d, rng.pick(near), true); return; }
  }
  d.dragonKind = 'recluse';
}

export function makePatron(w: World, d: Character, f: Faction, silent = false): void {
  d.dragonKind = 'patron';
  d.patronOf = f.id;
  d.tributeMiss = 0;
  if (!f.flags.includes(`patron:${d.id}`)) f.flags.push(`patron:${d.id}`);
  if (!silent) addNews(w, `${charLabel(w, d)}이(가) ${f.name}의 공물을 받아들이고 그들의 수호룡이 되었다.`, 3, 'dark', { facs: [f.id], chars: [d.id] });
}

function dropPatron(f: Faction | undefined, d: Character) {
  if (f) f.flags = f.flags.filter(x => x !== `patron:${d.id}`);
  d.patronOf = undefined;
}

/** 수호룡의 한 달: 공물을 받고, 전쟁 중이면 적을 친다. 습격 대상을 돌려준다 */
export function patronMonth(w: World, d: Character): Settlement | null {
  const rng = w.rngSim;
  const f = w.factions[d.patronOf ?? -1];
  if (!f || !f.alive) { dropPatron(f, d); d.dragonKind = 'recluse'; return null; }
  const cap = w.settlements[f.capital];
  const due = 2 + f.tier;
  if (cap && cap.stock[GOLD] >= due) {
    cap.stock[GOLD] -= due;
    d.wealth += due;
    d.tributeMiss = Math.max(0, (d.tributeMiss ?? 0) - 1);
  } else d.tributeMiss = (d.tributeMiss ?? 0) + 1;
  if ((d.tributeMiss ?? 0) === 12) addNews(w, `한 해째 공물이 끊기자 수호룡 ${d.name}이(가) ${f.name}의 도성 위를 낮게 맴돌았다. 경고였다.`, 3, 'dark', { facs: [f.id], chars: [d.id] });
  if ((d.tributeMiss ?? 0) >= 30) {
    // 탐욕스러운 군주가 일부러 끊었다면 배신이다. 가난해서 못 바친 것이라면 용은 실망하여 떠날 뿐이다
    const ld = leaderOf(w, f);
    if (ld && ld.traits[2] > 60 && (cap?.stock[GOLD] ?? 0) > due * 6) { betrayDragon(w, d, f, 'neglect'); return cap ?? null; }
    dropPatron(f, d);
    d.dragonKind = 'recluse';
    addNews(w, `공물이 끊긴 지 오래되자 수호룡 ${d.name}이(가) 실망하여 ${f.name}을(를) 떠나 둥지로 돌아갔다.`, 3, 'dark', { facs: [f.id], chars: [d.id] });
    return null;
  }
  const enemies = Object.keys(f.wars).map(id => w.factions[+id]).filter(e => e && e.alive);
  // 내 땅으로 진군해 오는 적군을 하늘에서 덮친다
  if (enemies.length && w.t - (w.stats[`guard${d.id}`] ?? -99) >= 12 && rng.chance(0.06)) {
    const mine = f.settlements.map(id => w.settlements[id]).filter(s => s && s.alive);
    const foe = w.armies.find(a => a.alive && f.wars[a.faction] !== undefined && (a.goal === 'conquer' || a.goal === 'raid' || a.goal === 'holywar')
      && mine.some(s => s.l === a.l && Math.hypot(s.x - a.x, s.y - a.y) < 22));
    if (foe) {
      const cut = Math.round(foe.soldiers * rng.float(0.3, 0.55));
      foe.soldiers -= cut;
      w.corpses += cut;
      d.fame += 4;
      const ef = w.factions[foe.faction];
      if (foe.soldiers < 10) foe.alive = false;
      w.stats[`guard${d.id}`] = w.t;
      charLog(w, d, `${f.name}의 땅으로 진군하던 ${ef?.name ?? '적'}의 군대를 덮쳤다.`, 2);
      addNews(w, `수호룡 ${d.name}이(가) ${f.name}의 땅으로 진군하던 ${ef?.name ?? '적'}의 군대를 하늘에서 덮쳤다. ${cut}명이 불길 속에 쓰러졌다.`, 3, 'war', { pos: foe, facs: [f.id, foe.faction], chars: [d.id] });
      return null;
    }
  }
  if (enemies.length && rng.chance(0.06)) {
    const targets = w.settlements.filter(s => s.alive && enemies.some(e => e.id === s.faction) && approxDist(w, d, s, true) < 50);
    if (targets.length) return rng.pick(targets);
  }
  return null;
}

/** 수호룡이 배신당한다: 공물을 끊거나, 보물을 노려 죽이려 하거나 */
export function betrayDragon(w: World, d: Character, f: Faction, how: 'neglect' | 'slay'): 'killed' | 'enraged' {
  const rng = w.rngSim;
  const ld = leaderOf(w, f);
  dropPatron(f, d);
  if (how === 'slay' && ld) {
    const p = clamp(f.military / (f.military + 400 + charPower(d) * 4), 0.12, 0.6);
    addNews(w, `${f.name}의 ${ld.name}이(가) 수호룡 ${d.name}의 보물을 탐내 잠든 용의 둥지로 사냥꾼들을 보냈다.`, 4, 'dark', { facs: [f.id], chars: [ld.id, d.id] });
    if (rng.chance(p)) {
      const hoard = d.wealth + 400;
      const cap = w.settlements[f.capital];
      if (cap) cap.stock[GOLD] += hoard * 0.5;
      ld.wealth += hoard * 0.5;
      if (!ld.epithet) ld.epithet = EPITHETS.dragonslayer;
      killChar(w, d, '은인의 배신', ld);
      return 'killed';
    }
    // 살아남은 용이 배신의 대가를 치르게 하러 날아온다
    const cap = w.settlements[f.capital];
    if (cap && d.act.kind === 'idle') setTravel(w, d, cap, 'hunt', cap.id);
  }
  d.dragonKind = 'raider';
  d.traits[3] = clamp(d.traits[3] - 30);
  d.sleep = 0;
  w.doom.dragonGrievance++;
  addNews(w, how === 'neglect'
    ? `${f.name}이(가) 공물을 끊자 수호룡 ${d.name}이(가) 배신감에 몸을 떨며 등을 돌렸다. (용의 원한 ${w.doom.dragonGrievance}/3)`
    : `${d.name}은(는) 살아남았다. 배신당한 용의 포효가 산맥을 흔들었다. (용의 원한 ${w.doom.dragonGrievance}/3)`, 4, 'dark', { facs: [f.id], chars: [d.id] });
  return 'enraged';
}

export function pSlayPatron(w: World, f: Faction): number {
  if (!f.flags.some(x => x.startsWith('patron:'))) return 0;
  const ld = leaderOf(w, f);
  if (!ld) return 0;
  if (ld.traits[2] < 70 && !(ld.traits[3] < 30 && ld.traits[1] > 65)) return 0;
  return 0.0006;
}

/** 원한이 셋 쌓이면 고대 용이 분노하여 깨어난다 */
export function checkDragonWrath(w: World): void {
  if (w.doom.dragonGrievance < 3) return;
  if (w.chars.some(c => c.died < 0 && c.ancient)) return;
  w.doom.dragonGrievance = 0;
  const deep = w.sites.find(s => s.kind === 'deep');
  const d = spawnDragon(w, true, deep);
  if (d) addNews(w, `배신당하고 죽어 간 용들의 원한이 쌓이고 쌓여, 땅 밑에 잠들어 있던 고대 용 ${d.name}이(가) 분노와 함께 깨어났다.`, 5, 'doom', { pos: d, chars: [d.id] });
}

/** 분노의 시간이 끝나면 고대 용은 다시 영원한 잠에 든다 */
export function ancientMonth(w: World, d: Character): boolean {
  if (!d.ancient || d.wrathUntil === undefined || w.t < d.wrathUntil) return false;
  charLog(w, d, '분노를 거두고 심연의 잠으로 돌아갔다.', 4);
  killChar(w, d, '영원한 잠');
  addNews(w, `고대 용 ${d.name}이(가) 마침내 분노를 거두고 심연의 잠으로 돌아갔다.`, 4, 'hero', { pos: d, chars: [d.id] });
  return true;
}

