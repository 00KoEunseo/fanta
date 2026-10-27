// 바벨탑: 하늘에 닿으려는 탐욕의 탑. 마왕의 손에 들어가면 마왕탑이 된다.
import { RACES } from '../data/races';
import * as T from '../data/terrain';
import { GOLD, STONE, WOOD } from '../data/terrain';
import { addNews, charLog } from './news';
import { rebuildPortalLinks } from './path';
import type { Character, Faction, Pos, World } from './state';
import { addFacRel, approxDist, charLabel, charPower, clamp, leaderOf, settlementsOf, isAdult } from './helpers';
import { declareWar, invalidateDist, launchAttack } from './factions';
import { raiseArmy } from './military';
import { dragonRaid, setTravel, killChar } from './characters';
import { seatHolder } from './angels';
import { makeArtifact } from './artifacts';

export interface Tower extends Pos {
  id: number;
  name: string;
  builder: number;
  /** 0~100 하늘까지, 100~200 천상까지 */
  progress: number;
  hp: number;
  demon: boolean;
  alive: boolean;
  t: number;
  warnedAt: number;
  portals: number[];
}

const NAMES = ['하늘 사다리', '구름을 꿰는 탑', '신들의 문턱', '오만의 탑', '별에 닿는 계단'];

export function towerOwner(w: World, tw: Tower): Faction | undefined {
  const L = w.layers[tw.l];
  return w.factions[L.owner[tw.y * L.w + tw.x]];
}

function nearestWalk(w: World, l: number, x: number, y: number, ok: (t: number) => boolean): Pos | null {
  const L = w.layers[l];
  for (let r = 0; r < Math.max(L.w, L.h); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      if (ok(L.terrain[ny * L.w + nx])) return { l, x: nx, y: ny };
    }
  }
  return null;
}

function addPortal(w: World, a: Pos, b: Pos, name: string): number {
  const id = w.portals.length;
  w.portals.push({ id, a, b, kind: 'tower', open: true, name });
  rebuildPortalLinks(w);
  invalidateDist(w);
  return id;
}

/** 탑을 짓기 시작할 수 있는 세력인가 */
export function pStartTower(w: World, f: Faction): number {
  if (w.towers.some(t => t.alive && (t.builder === f.id || towerOwner(w, t) === f))) return 0;
  // 마왕은 수도가 어디든, 지상에 거점 하나만 있으면 천상을 향한 탑을 올린다
  const dl = w.chars[w.demonLord];
  if (dl && dl.died < 0 && dl.faction === f.id) {
    const reign = (w.t - (w.stats.lastDemonLord ?? w.t)) / 12;
    const base = settlementsOf(w, f).some(s => s.l === 2 && s.pop >= 80);
    return base && reign >= 3 ? 0.006 : 0;
  }
  if (f.tier < 2 || f.avgDev < 40) return 0;
  const ld = leaderOf(w, f);
  if (!ld || Math.max(ld.traits[2], ld.traits[1]) < 65) return 0;
  const cap = w.settlements[f.capital];
  if (!cap || cap.l !== 2 || cap.stock[STONE] < 60) return 0;
  return f.race === 'human' ? 0.003 : RACES[f.race].align === 'dark' && w.demonLord >= 0 && w.chars[w.demonLord]?.faction === f.id ? 0.004 : 0.0004;
}

export function startTower(w: World, f: Faction): Tower | null {
  const cap = w.settlements[f.capital];
  if (!cap) return null;
  const ld0 = leaderOf(w, f);
  // 영토 안에 무너진 탑이 있으면 새로 짓지 않고 그 탑을 다시 쌓는다 (높이는 처음부터)
  const ruin = w.towers.find(t => !t.alive && towerOwner(w, t) === f);
  if (ruin) {
    ruin.alive = true; ruin.progress = 0; ruin.hp = 100; ruin.demon = false; ruin.builder = f.id; ruin.t = w.t; ruin.warnedAt = -1;
    ruin.name = ruin.name.replace(/^마왕탑 \(옛 (.*)\)$/, '$1');
    addNews(w, `${f.name}의 ${ld0?.name ?? '군주'}이(가) 무너진 ${ruin.name}의 잔해를 치우고 다시 쌓기 시작하였다. 옛 기초 위에 새 돌이 올라간다.`, 4, 'politics', { pos: ruin, facs: [f.id], chars: ld0 ? [ld0.id] : [] });
    return ruin;
  }
  const L = w.layers[cap.l];
  let best: Pos | null = null, bs = -1;
  for (const k of settlementsOf(w, f).flatMap(s => s.l === 2 ? s.tiles : [])) {
    const x = k % L.w, y = (k / L.w) | 0;
    const tid = L.terrain[k];
    const sc = tid === T.MOUNTAIN ? 3 : tid === T.HILL ? 2 : tid === T.PLAIN || tid === T.GRASS ? 1 : 0;
    if (sc <= 0 || w.settlements.some(s => s.alive && s.l === 2 && s.x === x && s.y === y)) continue;
    if (w.towers.some(t => t.l === 2 && Math.hypot(t.x - x, t.y - y) < 4)) continue;
    const score = sc * 10 - Math.hypot(x - cap.x, y - cap.y);
    if (score > bs) { bs = score; best = { l: 2, x, y }; }
  }
  if (!best) return null;
  const ld = leaderOf(w, f);
  const tw: Tower = { id: w.towers.length, name: `${f.baseName}의 ${w.rngSim.pick(NAMES)}`, builder: f.id, progress: 0, hp: 100, demon: false, alive: true, t: w.t, warnedAt: -1, portals: [], ...best };
  w.towers.push(tw);
  addNews(w, `${f.name}의 ${ld?.name ?? '군주'}이(가) 하늘에 닿는 탑, ${tw.name}을(를) 쌓기 시작하였다. 사람들은 그것을 바벨탑이라 불렀다.`, 4, 'politics', { pos: tw, facs: [f.id], chars: ld ? [ld.id] : [] });
  return tw;
}

/** 탑의 한 달 */
export function towerMonth(w: World): void {
  const rng = w.rngSim;
  for (const tw of w.towers) {
    if (!tw.alive) continue;
    const owner = towerOwner(w, tw);
    const dl = w.chars[w.demonLord];
    // 마왕의 손에 들어가면 마왕탑
    const isDemon = !!owner && !!dl && dl.died < 0 && dl.faction === owner.id;
    if (isDemon && !tw.demon) {
      tw.demon = true;
      tw.name = `마왕탑 (옛 ${tw.name})`;
      addNews(w, `마왕 ${dl!.name}이(가) 바벨탑을 손에 넣었다. 탑 꼭대기에 핏빛 깃발이 올랐다. 이제 그것은 마왕탑이다.`, 5, 'doom', { pos: tw, chars: [dl!.id] });
    }
    // 건설
    if (owner && owner.alive && tw.progress < 200) {
      // 마왕탑은 마왕의 땅 어디서든 돌과 노예를 긁어모은다
      const cap = tw.demon
        ? settlementsOf(w, owner).sort((a, b) => b.stock[STONE] - a.stock[STONE])[0]
        : w.settlements[owner.capital];
      const ld = leaderOf(w, owner);
      const wants = tw.demon || (ld && Math.max(ld.traits[2], ld.traits[1]) >= 50);
      if (cap && wants && cap.stock[STONE] >= 3 && cap.stock[WOOD] >= 2 && cap.stock[GOLD] >= 1) {
        cap.stock[STONE] -= 3; cap.stock[WOOD] -= 2; cap.stock[GOLD] -= 1;
        tw.hp = Math.min(100, tw.hp + 0.4);
        const before = tw.progress;
        tw.progress = Math.min(200, tw.progress + (tw.demon ? 0.9 : 0.6));
        if (before < 100 && tw.progress >= 100) reachSky(w, tw, owner);
        if (before < 200 && tw.progress >= 200) reachHeaven(w, tw, owner);
      }
    }
    // 천사의 경고
    const wind = seatHolder(w, 7);
    if (tw.warnedAt < 0 && tw.progress >= 50 && wind) {
      tw.warnedAt = w.t;
      addNews(w, `바람의 천사 ${wind.name}이(가) ${tw.name} 꼭대기에 내려앉아 경고하였다. "하늘은 너희의 것이 아니다. 탑을 허물어라."`, 4, 'hero', { pos: tw, chars: [wind.id] });
    }
    // 경고를 받아들이는 군주
    if (tw.warnedAt >= 0 && owner && !tw.demon) {
      const ld = leaderOf(w, owner);
      if (ld && !ld.isPlayer && (ld.traits[8] > 65 || ld.traits[5] > 70) && rng.chance(0.01)) {
        collapse(w, tw, `${owner.name}의 ${ld.name}이(가) 천사의 경고를 받아들여 스스로 탑을 허물었다.`, 3);
        continue;
      }
    }
    // 오래 무시하면 천사와 용이 친다
    if (tw.warnedAt >= 0 && w.t - tw.warnedAt > 180) {
      const angels = w.factions.find(f => f.alive && f.race === 'angel');
      if (angels && seatHolder(w, 1) && rng.chance(tw.demon ? 0.05 : 0.02)) {
        const dmg = rng.int(6, 16);
        tw.hp -= dmg;
        if (owner && owner !== angels && owner.wars[angels.id] === undefined) declareWar(w, angels, owner, true);
        addNews(w, `천군이 ${tw.name}을(를) 내리쳤다. 탑의 일부가 무너져 내렸다. (탑의 체력 ${Math.max(0, Math.round(tw.hp))})`, 3, 'war', { pos: tw });
      }
      const dragon = w.chars.find(d => d.died < 0 && d.race === 'dragon' && (d.sleep ?? 0) === 0 && d.patronOf !== owner?.id && approxDist(w, d, tw, true) < 40);
      if (dragon && rng.chance(0.015)) {
        tw.hp -= rng.int(8, 20);
        const near = w.settlements.filter(s => s.alive && s.l === tw.l && Math.hypot(s.x - tw.x, s.y - tw.y) < 6)[0];
        // 탑 곁의 고을은 용이 직접 날아가 덮친다
        if (near && dragon.act.kind === 'idle') setTravel(w, dragon, near, 'hunt', near.id);
        addNews(w, `${charLabel(w, dragon)}이(가) 하늘을 더럽히는 ${tw.name}에 불을 뿜었다. (탑의 체력 ${Math.max(0, Math.round(tw.hp))})`, 3, 'dark', { pos: tw, chars: [dragon.id] });
      }
      if (tw.hp <= 0) { collapse(w, tw, `${tw.name}이(가) 마침내 무너져 내렸다. 하늘로 가는 길이 끊어졌다.`, 4); continue; }
    }
    // 탑을 가진 자의 야망
    if (owner && owner.alive && tw.progress >= 100) expedition(w, tw, owner);
  }
}

function reachSky(w: World, tw: Tower, f: Faction) {
  const sky = w.layers[1], surf = w.layers[2];
  const top = nearestWalk(w, 1, Math.round((tw.x / surf.w) * sky.w), Math.round((tw.y / surf.h) * sky.h), t => T.TERRAIN[t].move > 0);
  if (!top) return;
  const old = w.portals[tw.portals[0]];
  if (old) { old.open = true; rebuildPortalLinks(w); invalidateDist(w); }
  else tw.portals.push(addPortal(w, { l: tw.l, x: tw.x, y: tw.y }, top, `${tw.name}의 하늘 문`));
  addNews(w, `${tw.name}이(가) 마침내 구름을 뚫고 하늘에 닿았다. ${f.name}의 백성들이 하늘섬을 처음으로 밟았다.`, 5, 'politics', { pos: tw, facs: [f.id] });
}

function reachHeaven(w: World, tw: Tower, f: Faction) {
  const sky = w.layers[1], hv = w.layers[0];
  const top = w.portals[tw.portals[0]]?.b;
  if (!top) return;
  const gate = nearestWalk(w, 0, Math.round((top.x / sky.w) * hv.w), Math.round((top.y / sky.h) * hv.h), t => T.TERRAIN[t].move > 0);
  if (!gate) return;
  const old = w.portals[tw.portals[1]];
  if (old) { old.open = true; rebuildPortalLinks(w); invalidateDist(w); }
  else tw.portals.push(addPortal(w, top, gate, `${tw.name}의 천상 문`));
  const angels = w.factions.find(a => a.alive && a.race === 'angel');
  if (angels) addFacRel(w, f, angels, -50);
  addNews(w, `${tw.name}의 꼭대기가 천상의 바닥에 닿았다. 천사들의 성역에 필멸자의 발소리가 울렸다.`, 5, 'doom', { pos: tw, facs: [f.id] });
}

export function collapse(w: World, tw: Tower, text: string, imp: number) {
  tw.alive = false;
  tw.hp = 0;
  for (const id of tw.portals) { const p = w.portals[id]; if (p) p.open = false; }
  rebuildPortalLinks(w);
  invalidateDist(w);
  addNews(w, text, imp, 'politics', { pos: tw });
}

/** 탑을 가진 세력의 원정: 천상의 보물, 하늘의 용, 하늘섬 개척, 천상 침공 */
function expedition(w: World, tw: Tower, f: Faction) {
  const rng = w.rngSim;
  if (!rng.chance(tw.demon ? 0.03 : 0.02)) return;
  const ld = leaderOf(w, f);
  const cap = w.settlements[f.capital];
  if (!ld || !cap) return;
  const angels = w.factions.find(a => a.alive && a.race === 'angel');
  const skyDragons = w.chars.filter(d => d.died < 0 && d.race === 'dragon' && !d.ancient && d.l === 1);
  const r = rng.next();
  // 마왕탑: 정복이 목적
  if (tw.demon) {
    if (tw.progress >= 200 && angels && r < 0.5) {
      declareWar(w, f, angels, true);
      if (launchAttack(w, f, angels, 'conquer')) addNews(w, `마왕의 군세가 ${tw.name}을(를) 타고 천상으로 진군하였다!`, 5, 'doom', { pos: tw, facs: [f.id, angels.id] });
      return;
    }
    skyColony(w, tw, f, '마왕의 군세가 하늘섬에 마성을 세웠다.');
    return;
  }
  if (tw.progress >= 200 && angels && r < 0.3) {
    // 천상의 비보를 훔친다
    const angel = seatHolder(w, rng.int(0, 11)) ?? w.chars.find(a => a.died < 0 && a.race === 'angel');
    if (!angel) return;
    const art = makeArtifact(w, angel, rng.pick(['보석', '왕관', '지팡이'] as const), rng.pick(['천상의 하프', '빛의 깃털', '새벽의 성배', '별의 눈물']), 30, true);
    art.holder = ld.id;
    art.story.push({ t: w.t, text: `${f.name}의 원정대가 ${tw.name}을(를) 타고 올라가 천상에서 훔쳐 왔다.` });
    addFacRel(w, f, angels, -40);
    addNews(w, `${f.name}의 원정대가 ${tw.name}을(를) 타고 천상에 올라 「${art.name}」을(를) 훔쳐 왔다. 천사들의 분노가 하늘을 울렸다.`, 4, 'dark', { pos: tw, facs: [f.id, angels.id], chars: [ld.id] });
    if (ld.traits[1] > 75 && rng.chance(0.3)) { declareWar(w, f, angels); launchAttack(w, f, angels, 'conquer'); }
    return;
  }
  if (skyDragons.length && r < 0.6 && f.avgDev > 50) {
    // 하늘의 용 사냥
    const d = rng.pick(skyDragons);
    const champ = w.chars.filter(c => c.died < 0 && c.faction === f.id && c.race !== 'dragon' && !c.isPlayer && isAdult(w, c) && c.act.kind === 'idle' && c.role !== '노예' && approxDist(w, c, tw) < 20)
      .sort((a, b) => charPower(b, w) - charPower(a, w))[0];
    if (!champ) return;
    const p = clamp(f.military / (f.military + 400 + charPower(d, w) * 3), 0.1, 0.6);
    addNews(w, `${f.name}의 원정대가 ${champ.name}의 지휘로 하늘의 용 ${d.name}을(를) 사냥하러 나섰다.`, 3, 'war', { chars: [champ.id, d.id], facs: [f.id] });
    if (rng.chance(p)) {
      killChar(w, d, `${tw.name}의 원정대`, champ);
      champ.epithet = champ.epithet || '용살자';
      addNews(w, `${f.name}의 원정대가 용 ${d.name}을(를) 쓰러뜨렸다. ${f.name}은(는) 하늘의 주인을 자처하였다.`, 4, 'war', { facs: [f.id], chars: [champ.id] });
    } else {
      killChar(w, champ, `용 ${d.name}의 불길`, d);
      dragonRaid(w, d, cap);
    }
    return;
  }
  skyColony(w, tw, f, `${f.name}의 개척민들이 ${tw.name}을(를) 올라 하늘섬에 마을을 세우러 떠났다.`);
}

function skyColony(w: World, tw: Tower, f: Faction, text: string) {
  const top = w.portals[tw.portals[0]]?.b;
  const from = w.settlements[f.capital];
  if (!top || !from || from.pop < 150) return;
  const sky = w.layers[1];
  let site: Pos | null = null;
  for (let r = 2; r < 18 && !site; r++) {
    for (let i = 0; i < 20; i++) {
      const x = top.x + w.rngSim.int(-r, r), y = top.y + w.rngSim.int(-r, r);
      if (x < 1 || y < 1 || x >= sky.w - 1 || y >= sky.h - 1) continue;
      const k = y * sky.w + x;
      if (sky.claim[k] >= 0 || sky.terrain[k] !== T.ISLE) continue;
      if (w.settlements.some(s => s.alive && s.l === 1 && Math.hypot(s.x - x, s.y - y) < 5)) continue;
      site = { l: 1, x, y };
      break;
    }
  }
  if (!site) return;
  if (raiseArmy(w, f, from, 'colonize', null, Math.max(50, from.pop * 0.15), undefined, site)) addNews(w, text, 3, 'growth', { pos: tw, facs: [f.id] });
}

export { charLog };
