// 개척: 땅은 저절로 넓어지지 않는다. 영주가 고을 사람들로 개간대를 꾸려 보내면,
// 그들이 직접 국경 밖으로 걸어가 숲을 베고 돌을 골라 밭을 일구어야 고을의 땅이 된다.
import { RACES } from '../data/races';
import { TERRAIN } from '../data/terrain';
import * as T from '../data/terrain';
import { charLog } from './news';
import type { Army, Character, Pos, Settlement, World } from './state';
import { isAdult, leaderOf } from './helpers';
import { findPath } from './path';
import { MAX_RADIUS, REACH, claimable, expandStyle, tileAppeal } from './territory';

const WORK_MONTHS = 2;
/** 한 번 나가서 일구는 횟수 */
const SHIFTS = 5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 이 고을이 넓힐 다음 빈 땅 (성향에 맞게, 가까운 곳 우선) */
export function frontierTile(w: World, s: Settlement, near?: Pos): Pos | null {
  const f = w.factions[s.faction];
  if (!f || !s.tiles.length) return null;
  const L = w.layers[s.l];
  const style = expandStyle(w, f);
  const reach = MAX_RADIUS[s.tier] * REACH[style];
  let best: Pos | null = null, bs = -Infinity;
  for (let j = 0; j < 30; j++) {
    const from = w.rngSim.pick(s.tiles);
    const [dx, dy] = w.rngSim.pick(DIRS);
    const x = (from % L.w) + dx, y = ((from / L.w) | 0) + dy;
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
    const k = y * L.w + x;
    if (L.claim[k] >= 0 || !claimable(L.terrain[k]) || TERRAIN[L.terrain[k]].move <= 0) continue;
    if (Math.hypot(x - s.x, y - s.y) > reach) continue;
    const a = tileAppeal(w, s, style, k, x, y) - (near && near.l === s.l ? Math.hypot(x - near.x, y - near.y) * 0.3 : 0);
    if (a > bs) { bs = a; best = { l: s.l, x, y }; }
  }
  return best;
}

/** 개간대를 이끌 만한 이 (고을에 이름 있는 이가 있으면) */
function foreman(w: World, s: Settlement): Character | undefined {
  const PREFER: Record<string, number> = { 농부: 5, 광부: 3, 사냥꾼: 3, 평민: 2, 백수: 3, 장인: 2, 드루이드: 2, 노예: 1 };
  const pool = w.chars.filter(c => c.died < 0 && !c.isPlayer && c.home === s.id && c.act.kind === 'idle' && isAdult(w, c) && c.race !== 'dragon'
    && w.factions[c.faction]?.leader !== c.id && !w.settlements.some(o => o.alive && o.governor === c.id) && !c.officer && c.stats.health > 35);
  return w.rngSim.weighted(pool, c => PREFER[c.role] ?? 0.3);
}

/** 매달: 넓힐 여력이 있는 고을은 개간대를 보낸다 */
export function assignPioneers(w: World, raise: (w: World, f: import('./state').Faction, from: Settlement, size: number, cmd: Character | undefined, dest: Pos) => Army | null): void {
  const rng = w.rngSim;
  const out = new Map<number, number>();
  for (const a of w.armies) if (a.alive && a.goal === 'clear') out.set(a.home, (out.get(a.home) ?? 0) + 1);
  for (const s of w.settlements) {
    if (!s.alive || RACES[s.race].noPop || !s.tiles.length || s.pop < 60) continue;
    const f = w.factions[s.faction];
    if (!f || !f.alive) continue;
    const cap = Math.PI * MAX_RADIUS[s.tier] ** 2;
    if (s.tiles.length > cap * 1.2 || s.stock[0] < s.cons[0] * 2 + 3) continue;
    const dl = w.demonLord >= 0 && (w.chars[w.demonLord]?.faction === f.id || f.flags.includes('dlvassal'));
    const want = Math.min(3, 1 + Math.floor(s.pop / 500)) + (dl ? 1 : 0);
    if ((out.get(s.id) ?? 0) >= want || !rng.chance(0.35)) continue;
    const tile = frontierTile(w, s, s);
    if (!tile) continue;
    const cmd = foreman(w, s);
    const a = raise(w, f, s, Math.max(8, Math.min(25, s.pop * 0.04)), cmd, tile);
    if (!a) continue;
    a.loot[1] = SHIFTS;
    out.set(s.id, (out.get(s.id) ?? 0) + 1);
    const lord = w.chars[s.governor] ?? leaderOf(w, f);
    if (cmd) charLog(w, cmd, `${lord && lord.id !== cmd.id ? `${lord.name}의 명을 받아 ` : ''}${s.name} 사람들을 이끌고 바깥의 땅을 일구러 나섰다.`, 2);
  }
}

const CLEAR_TEXT = (tid: number): string[] =>
  tid === T.FOREST || tid === T.DEEPFOREST ? ['숲을 베어 밭을 일구었다.', '나무뿌리를 캐내느라 손바닥이 갈라졌다.']
    : tid === T.HILL || tid === T.MOUNTAIN ? ['바위를 깨어 길을 냈다.', '비탈에 돌담을 쌓아 계단밭을 만들었다.']
      : tid === T.SWAMP ? ['늪에 도랑을 파 물을 뺐다.']
        : tid === T.DESERT ? ['모래 속에 우물을 파 땅을 살렸다.']
          : tid === T.CAVE || tid === T.FUNGUS || tid === T.CRYSTAL || tid === T.OREVEIN ? ['굴을 넓히고 기둥을 세웠다.', '새 버섯밭에 포자를 뿌렸다.']
            : ['황무지를 갈아엎어 밭을 일구었다.', '돌을 골라내고 이랑을 냈다.', '울타리를 세워 새 땅을 표시하였다.'];

/** 개간대의 한 달: 현장에 닿았으면 일하고, 다 일구면 다음 땅으로, 할 일을 마치면 돌아간다 */
export function clearMonth(w: World, a: Army, goHome: (a: Army) => void): void {
  const s = w.settlements[a.home];
  if (!s || !s.alive || s.faction !== a.faction) { goHome(a); return; }
  if (a.path.length) return;
  a.loot[0] += 1; // 이번 자리에서 일한 달
  if (a.loot[0] < WORK_MONTHS) return;
  a.loot[0] = 0;
  const L = w.layers[s.l];
  let gained = 0;
  for (const [dx, dy] of [[0, 0], ...DIRS]) {
    const x = a.x + dx, y = a.y + dy;
    if (a.l !== s.l || x < 0 || y < 0 || x >= L.w || y >= L.h) continue;
    const k = y * L.w + x;
    if (L.claim[k] >= 0 || !claimable(L.terrain[k])) continue;
    if ((dx !== 0 || dy !== 0) && !w.rngSim.chance(0.6)) continue;
    L.claim[k] = s.id; L.owner[k] = s.faction; s.tiles.push(k);
    gained++;
  }
  const cmd = w.chars[a.commander];
  if (gained) {
    s.stock[1] = Math.max(0, s.stock[1] - gained);
    if (cmd && cmd.died < 0 && w.rngSim.chance(0.5)) charLog(w, cmd, w.rngSim.pick(CLEAR_TEXT(L.terrain[a.y * L.w + a.x])), 1);
  }
  a.loot[1] -= 1;
  const next = a.loot[1] > 0 ? frontierTile(w, s, a) : null;
  const path = next && Math.hypot(next.x - a.x, next.y - a.y) < 8 ? findPath(w, a, next, { race: a.race, flying: RACES[a.race].flying }, 4000) : null;
  if (path && path.length) { a.path = path; return; }
  if (cmd && cmd.died < 0) charLog(w, cmd, `${s.name} 바깥의 개간을 마치고 사람들을 이끌고 돌아갔다.`, 1);
  goHome(a);
}

/** 개간대가 일하는 자리 */
export function clearingSpots(w: World): Map<number, Pos[]> {
  const m = new Map<number, Pos[]>();
  for (const a of w.armies) if (a.alive && a.goal === 'clear' && !a.path.length) { const l = m.get(a.home) ?? []; l.push(a); m.set(a.home, l); }
  return m;
}
