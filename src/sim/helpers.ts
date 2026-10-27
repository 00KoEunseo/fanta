import { RACES } from '../data/races';
import type { Character, Faction, Pos, Settlement, World } from './state';
import { ageOf } from './state';
import { artPower } from './artifacts';

export const clamp = (v: number, a = 0, b = 100) => (v < a ? a : v > b ? b : v);

export function rel(c: Character, other: number): number {
  return c.relations[other] ?? 0;
}

export function addRel(w: World, a: Character, b: Character, d: number, mutual = true): void {
  a.relations[b.id] = clamp((a.relations[b.id] ?? 0) + d, -100, 100);
  if (mutual) b.relations[a.id] = clamp((b.relations[a.id] ?? 0) + d, -100, 100);
  trimRelations(w, a);
  if (mutual) trimRelations(w, b);
}

function trimRelations(w: World, c: Character) {
  const keys = Object.keys(c.relations);
  if (keys.length <= 24) return;
  // 죽은 사람, 그다음 약한 관계부터 지운다
  keys.sort((x, y) => {
    const dx = w.chars[+x]?.died >= 0 ? 0 : Math.abs(c.relations[+x]);
    const dy = w.chars[+y]?.died >= 0 ? 0 : Math.abs(c.relations[+y]);
    return dx - dy;
  });
  for (let i = 0; i < keys.length - 20; i++) delete c.relations[+keys[i]];
}

export function facRel(a: Faction, b: number): number {
  return a.relations[b] ?? 0;
}

export function addFacRel(w: World, a: Faction, b: Faction, d: number): void {
  a.relations[b.id] = clamp((a.relations[b.id] ?? 0) + d, -100, 100);
  b.relations[a.id] = clamp((b.relations[a.id] ?? 0) + d, -100, 100);
}

export function isAdult(w: World, c: Character): boolean {
  return ageOf(w, c) >= RACES[c.race].adult;
}

export function aliveChars(w: World): Character[] {
  return w.chars.filter(c => c.died < 0);
}

export function factionMembers(w: World, fid: number): Character[] {
  return w.chars.filter(c => c.died < 0 && c.faction === fid);
}

export function aliveFactions(w: World): Faction[] {
  return w.factions.filter(f => f.alive);
}

export function settlementsOf(w: World, f: Faction): Settlement[] {
  return f.settlements.map(id => w.settlements[id]).filter(s => s && s.alive && s.faction === f.id);
}

export function leaderOf(w: World, f: Faction): Character | null {
  const c = w.chars[f.leader];
  return c && c.died < 0 ? c : null;
}

export function atWar(a: Faction, b: number): boolean {
  return a.wars[b] !== undefined;
}

export function isHero(c: Character): boolean {
  return c.awakened.includes('hero');
}

export function isDemonLord(w: World, c: Character): boolean {
  return w.demonLord === c.id;
}

/** 표시용 직함 */
export function titleOf(w: World, c: Character): string {
  if (c.died >= 0) return '고(故)';
  if (w.demonLord === c.id) return '마왕';
  const f = w.factions[c.faction];
  if (f && f.leader === c.id) return RACES[f.race].titles[f.tier] ?? '군주';
  if (c.race === 'dragon') return c.ancient ? '고대 용' : '용';
  if (isHero(c)) return '용사';
  for (const sid of f ? f.settlements : []) {
    const s = w.settlements[sid];
    if (s && s.governor === c.id) return `${s.name} 영주`;
  }
  if (c.awakened.includes('sage')) return '현자';
  if (c.awakened.includes('merchant')) return '거상';
  if (c.rank >= 1) return `명망 높은 ${c.role}`;
  // 빛에서 난 천사는 어린 시절이 없다
  if (c.race !== 'angel' && ageOf(w, c) < RACES[c.race].adult) return '아이';
  return c.role;
}

export function charLabel(w: World, c: Character): string {
  const t = titleOf(w, c);
  // 칭호와 별호가 겹치면 (고대 용 + 고대의) 별호를 뺀다
  const ep = c.epithet && !t.split(' ').some(word => c.epithet.startsWith(word.replace(/의$/, ''))) ? c.epithet : '';
  const n = ep ? `${ep} ${c.name}` : c.name;
  return `${t} ${n}`;
}

/** 서로 다른 레이어도 열린 통로를 경유한 근사 거리 */
/** 대략의 거리. fly면 날개 있는 자만 지나는 닫힌 하늘 계단도 지난다 (용과의 거리) */
export function approxDist(w: World, a: Pos, b: Pos, fly = false): number {
  if (a.l === b.l) return Math.hypot(a.x - b.x, a.y - b.y);
  let best = Infinity;
  for (const p of w.portals) {
    if (!p.open && !(fly && (p.kind === 'peak' || p.kind === 'stair'))) continue;
    for (const [e1, e2] of [[p.a, p.b], [p.b, p.a]] as [Pos, Pos][]) {
      if (e1.l !== a.l) continue;
      const d1 = Math.hypot(a.x - e1.x, a.y - e1.y) + 4;
      if (e2.l === b.l) {
        best = Math.min(best, d1 + Math.hypot(e2.x - b.x, e2.y - b.y));
        continue;
      }
      // 한 번 더 경유
      for (const q of w.portals) {
        if ((!q.open && !(fly && (q.kind === 'peak' || q.kind === 'stair'))) || q === p) continue;
        for (const [f1, f2] of [[q.a, q.b], [q.b, q.a]] as [Pos, Pos][]) {
          if (f1.l !== e2.l || f2.l !== b.l) continue;
          best = Math.min(best, d1 + Math.hypot(e2.x - f1.x, e2.y - f1.y) + 4 + Math.hypot(f2.x - b.x, f2.y - b.y));
        }
      }
    }
  }
  return best;
}

/** 진영 간 가장 가까운 정착지 거리 */
export function factionDistance(w: World, a: Faction, b: Faction): number {
  let best = Infinity;
  for (const sa of a.settlements) {
    const A = w.settlements[sa];
    if (!A?.alive) continue;
    for (const sb of b.settlements) {
      const B = w.settlements[sb];
      if (!B?.alive) continue;
      const d = approxDist(w, A, B);
      if (d < best) best = d;
    }
  }
  return best;
}

export function nearestSettlementOf(w: World, f: Faction, p: Pos): Settlement | null {
  let best: Settlement | null = null, bd = Infinity;
  for (const s of settlementsOf(w, f)) {
    const d = approxDist(w, p, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function charPower(c: Character, w?: World): number {
  let p = c.stats.might * 1.0 + c.stats.magic * 0.8 + c.stats.health * 0.25 + c.stats.command * 0.2;
  if (c.items.includes('성검')) p += 35;
  if (c.items.includes('마검')) p += 25;
  if (c.items.includes('별철 검')) p += 15;
  if (c.race === 'dragon') p += c.ancient ? 160 : 90;
  if (c.awakened.includes('hero')) p += 25;
  if (c.awakened.includes('demonlord')) p += 30;
  if (w) p += artPower(w, c);
  return p;
}

/** 조상 가운데 조건에 맞는 이를 찾는다 (몇 대 위인지 함께). 핏줄은 아버지·어머니를 따라 올라간다 */
export function findAncestor(w: World, c: Character, test: (a: Character) => boolean, maxGen = 5): { who: Character; gen: number } | null {
  let layer = [c];
  for (let gen = 1; gen <= maxGen; gen++) {
    const next: Character[] = [];
    for (const x of layer) for (const id of [x.father, x.mother]) { const p = w.chars[id]; if (p) next.push(p); }
    for (const p of next) if (test(p)) return { who: p, gen };
    if (!next.length) return null;
    layer = next;
  }
  return null;
}
