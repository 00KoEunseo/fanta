import { TERRAIN } from '../data/terrain';
import { RACES, type RaceKey } from '../data/races';
import type { Pos, World } from './state';

// 레이어를 가로지르는 A* 길찾기. 노드 = 레이어 오프셋 + y*w + x

export interface Mover { race: RaceKey; flying: boolean }

export function moveCost(tid: number, m: Mover): number {
  const T = TERRAIN[tid];
  if (m.flying) return T.fly ? 1 : 0;
  const o = RACES[m.race].moveOverride[tid];
  return o !== undefined ? o : T.move;
}

interface Graph {
  offsets: number[];
  total: number;
  links: Map<number, number[]>;
  /** 날개 있는 자만 지나는 길 (구름 계단, 천상의 계단) */
  flyLinks: Map<number, number[]>;
  g: Float32Array;
  f: Float32Array;
  from: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  cur: number;
}

const graphs = new WeakMap<World, Graph>();

function graph(w: World): Graph {
  let G = graphs.get(w);
  if (!G) {
    const offsets: number[] = [];
    let total = 0;
    for (const L of w.layers) { offsets.push(total); total += L.w * L.h; }
    G = {
      offsets, total, links: new Map(), flyLinks: new Map(),
      g: new Float32Array(total), f: new Float32Array(total), from: new Int32Array(total),
      stamp: new Uint32Array(total), closed: new Uint32Array(total), cur: 0,
    };
    graphs.set(w, G);
    rebuildPortalLinks(w);
  }
  return G;
}

export function rebuildPortalLinks(w: World): void {
  const G = graphs.get(w);
  if (!G) return;
  G.links.clear();
  G.flyLinks.clear();
  for (const p of w.portals) {
    const flyOnly = !p.open && (p.kind === 'peak' || p.kind === 'stair');
    if (!p.open && !flyOnly) continue;
    const M = flyOnly ? G.flyLinks : G.links;
    const a = G.offsets[p.a.l] + p.a.y * w.layers[p.a.l].w + p.a.x;
    const b = G.offsets[p.b.l] + p.b.y * w.layers[p.b.l].w + p.b.x;
    if (!M.has(a)) M.set(a, []);
    if (!M.has(b)) M.set(b, []);
    M.get(a)!.push(b);
    M.get(b)!.push(a);
  }
}

export function nodeOf(w: World, p: Pos): number {
  const G = graph(w);
  return G.offsets[p.l] + p.y * w.layers[p.l].w + p.x;
}

export function posOf(w: World, n: number): Pos {
  const G = graph(w);
  let l = 0;
  while (l + 1 < G.offsets.length && n >= G.offsets[l + 1]) l++;
  const r = n - G.offsets[l];
  const W = w.layers[l].w;
  return { l, x: r % W, y: Math.floor(r / W) };
}

// 간단한 이진 힙
class Heap {
  items: number[] = [];
  constructor(private f: Float32Array) {}
  push(n: number) {
    const a = this.items; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop(): number {
    const a = this.items; const top = a[0]; const last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.items.length; }
}

const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];

/** 출발지 제외, 도착지 포함 노드 목록. 실패 시 null */
export function findPath(w: World, from: Pos, to: Pos, m: Mover, maxExpand = 25000): number[] | null {
  const G = graph(w);
  const start = nodeOf(w, from), goal = nodeOf(w, to);
  if (start === goal) return [];
  G.cur++;
  if (G.cur >= 0xfffffff0) { G.stamp.fill(0); G.closed.fill(0); G.cur = 1; }
  const cur = G.cur;
  const heap = new Heap(G.f);
  const h = (n: number, p: Pos) => (p.l === to.l ? Math.max(Math.abs(p.x - to.x), Math.abs(p.y - to.y)) : 0);
  G.g[start] = 0; G.f[start] = h(start, from); G.from[start] = -1; G.stamp[start] = cur;
  heap.push(start);
  let expanded = 0;
  while (heap.size) {
    const n = heap.pop();
    if (G.closed[n] === cur) continue;
    G.closed[n] = cur;
    if (n === goal) {
      const out: number[] = [];
      let k = n;
      while (k !== start) { out.push(k); k = G.from[k]; }
      return out.reverse();
    }
    if (++expanded > maxExpand) return null;
    const p = posOf(w, n);
    const L = w.layers[p.l];
    const off = G.offsets[p.l];
    for (const [dx, dy, dm] of DIRS) {
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      const nn = off + ny * L.w + nx;
      if (G.closed[nn] === cur) continue;
      let c = moveCost(L.terrain[ny * L.w + nx], m);
      if (c <= 0) { if (nn !== goal) continue; c = 1; }
      relax(n, nn, G.g[n] + c * dm, { l: p.l, x: nx, y: ny });
    }
    for (const links of m.flying ? [G.links.get(n), G.flyLinks.get(n)] : [G.links.get(n)]) {
      if (links) for (const nn of links) {
        if (G.closed[nn] === cur) continue;
        relax(n, nn, G.g[n] + 3, posOf(w, nn));
      }
    }
  }
  return null;

  function relax(parent: number, nn: number, g: number, p: Pos) {
    if (G.stamp[nn] === cur && G.g[nn] <= g) return;
    G.stamp[nn] = cur; G.g[nn] = g; G.f[nn] = g + h(nn, p); G.from[nn] = parent;
    heap.push(nn);
  }
}

/** 이동력(budget)만큼 경로를 따라 전진한다. 지형마다 드는 이동력이 다르다. 도착한 위치를 돌려준다 */
export function advance(w: World, path: number[], budget: number, m: Mover): Pos | null {
  let last: Pos | null = null;
  while (path.length) {
    const p = posOf(w, path[0]);
    const L = w.layers[p.l];
    let c = moveCost(L.terrain[p.y * L.w + p.x], m);
    if (c <= 0) c = 1;
    if (last && last.l !== p.l) c = 2;
    if (c > budget && last) break;
    budget -= c;
    path.shift();
    last = p;
    if (budget <= 0) break;
  }
  return last;
}

export const MOVE_WALK = 4;
export const MOVE_FLY = 6;
