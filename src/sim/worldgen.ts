import { Noise2D } from '../core/noise';
import type { Rng } from '../core/rng';
import * as T from '../data/terrain';
import { TERRAIN } from '../data/terrain';
import { makePlaceName } from '../data/names';
import { L_DEMON, L_HEAVEN, L_SKY, L_SURFACE, L_UNDER } from '../data/races';
import { LAYER_INFO, type Layer, type Portal, type PortalKind, type Pos, type Site, type SiteKind } from './state';

function newLayer(id: number): Layer {
  const { w, h } = LAYER_INFO[id];
  return {
    id, w, h,
    terrain: new Uint8Array(w * h),
    owner: new Int16Array(w * h).fill(-1),
    claim: new Int32Array(w * h).fill(-1),
  };
}

const walk = (tid: number) => TERRAIN[tid].move > 0;

export function generateLayers(rng: Rng): Layer[] {
  const layers = [0, 1, 2, 3, 4].map(newLayer);
  genSurface(layers[L_SURFACE], rng);
  genUnder(layers[L_UNDER], rng);
  genSky(layers[L_SKY], rng);
  genHeaven(layers[L_HEAVEN], rng);
  genDemon(layers[L_DEMON], rng);
  ensureConnected(layers[L_SURFACE], rng, t => (t === T.OCEAN ? T.SHALLOW : t === T.PEAK ? T.MOUNTAIN : t));
  ensureConnected(layers[L_UNDER], rng, t => (t === T.UNDERLAKE ? t : T.CAVE));
  ensureConnected(layers[L_SKY], rng, () => T.CLOUD);
  ensureConnected(layers[L_HEAVEN], rng, () => T.CLOUDHALL);
  ensureConnected(layers[L_DEMON], rng, t => (t === T.DLAVA ? T.OBSIDIAN : T.ASH));
  return layers;
}

function genSurface(L: Layer, rng: Rng) {
  const ne = new Noise2D(rng), nm = new Noise2D(rng), nt = new Noise2D(rng);
  // 대륙 중심 몇 개
  const blobs: [number, number, number][] = [];
  const nb = rng.int(2, 4);
  for (let i = 0; i < nb; i++) blobs.push([rng.float(0.25, 0.75), rng.float(0.25, 0.75), rng.float(0.25, 0.4)]);
  // 먼저 높이·습도·기온을 구하고, 바다·산의 경계는 비율로 정한다 (어느 시드든 육지와 산이 생기도록)
  const N = L.w * L.h;
  const E = new Float32Array(N), M = new Float32Array(N), TP = new Float32Array(N);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const nx = x / L.w, ny = y / L.h;
    let e = ne.fbm(nx * 4, ny * 2.6, 5) * 0.55;
    let bl = 0;
    for (const [bx, by, r] of blobs) {
      const d = Math.hypot((nx - bx) * 1.4, ny - by) / r;
      bl = Math.max(bl, 1 - d);
    }
    e += bl * 0.55 - 0.12;
    const edge = Math.max(Math.abs(nx * 2 - 1), Math.abs(ny * 2 - 1));
    e -= Math.pow(edge, 4) * 0.5;
    const k = y * L.w + x;
    E[k] = e;
    M[k] = nm.fbm(nx * 5 + 30, ny * 3.5 + 30, 4);
    TP[k] = nt.fbm(nx * 3, ny * 3, 3);
  }
  const sorted = Array.from(E).sort((a, b) => a - b);
  const q = (f: number) => sorted[Math.min(N - 1, Math.floor(f * N))];
  const OCEAN_Q = q(0.52), SHALLOW_Q = q(0.58), HILL_Q = q(0.90), MOUNT_Q = q(0.955), PEAK_Q = q(0.985);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const k = y * L.w + x, ny = y / L.h;
    const e = E[k], m = M[k];
    // 높을수록 춥다 (산 기슭부터 서늘해진다)
    const rel = (e - SHALLOW_Q) / Math.max(0.01, PEAK_Q - SHALLOW_Q);
    const temp = ny * 0.9 + 0.1 - Math.max(0, rel - 0.4) * 0.5 + TP[k] * 0.2;
    let t: number;
    if (e < OCEAN_Q) t = T.OCEAN;
    else if (e < SHALLOW_Q) t = T.SHALLOW;
    else if (e > PEAK_Q) t = T.PEAK;
    else if (e > MOUNT_Q) t = T.MOUNTAIN;
    else if (e > HILL_Q) t = T.HILL;
    else if (temp < 0.2) t = T.TUNDRA;
    else if (temp > 0.78 && m < 0.05) t = T.DESERT;
    else if (m > 0.28 && rel < 0.15) t = T.SWAMP;
    else if (m > 0.2) t = T.DEEPFOREST;
    else if (m > 0.04) t = T.FOREST;
    else if (m > -0.12) t = T.GRASS;
    else t = T.PLAIN;
    L.terrain[k] = t;
  }
}

function genUnder(L: Layer, rng: Rng) {
  const nc = new Noise2D(rng), n2 = new Noise2D(rng), n3 = new Noise2D(rng), n4 = new Noise2D(rng);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const nx = x / 14, ny = y / 14;
    const c = nc.fbm(nx, ny, 4);
    const edge = Math.max(Math.abs((x / L.w) * 2 - 1), Math.abs((y / L.h) * 2 - 1));
    let t: number = T.ROCK;
    if (c - Math.pow(edge, 6) * 0.6 > -0.08) {
      t = T.CAVE;
      const a = n2.fbm(nx * 1.3 + 7, ny * 1.3, 3), b = n3.fbm(nx * 1.1, ny * 1.1 + 9, 3), m = n4.fbm(nx * 0.7, ny * 0.7, 3);
      if (a > 0.3) t = T.OREVEIN;
      else if (b > 0.34) t = T.CRYSTAL;
      else if (m > 0.42) t = T.UNDERLAKE;
      else if (m > 0.12) t = T.FUNGUS;
      else if (y > L.h * 0.82 && a < -0.3) t = T.LAVA;
      else if (b < -0.45) t = T.CHASM;
    }
    L.terrain[y * L.w + x] = t;
  }
}

function genSky(L: Layer, rng: Rng) {
  const n = new Noise2D(rng), s = new Noise2D(rng);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const v = n.fbm(x / 11, y / 11, 4), st = s.fbm(x / 9, y / 9, 3);
    let t: number = T.AIR;
    if (v > 0.22) t = T.ISLE;
    else if (v > 0.02) t = T.CLOUD;
    else if (st > 0.38) t = T.STORM;
    L.terrain[y * L.w + x] = t;
  }
}

function genHeaven(L: Layer, rng: Rng) {
  const n = new Noise2D(rng), g = new Noise2D(rng);
  const cx = L.w / 2 + rng.int(-6, 6), cy = L.h / 2 + rng.int(-4, 4);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const d = Math.hypot((x - cx) / (L.w * 0.45), (y - cy) / (L.h * 0.45));
    const v = n.fbm(x / 9, y / 9, 4) * 0.5 + (1 - d) * 0.8;
    let t: number = T.AETHER;
    if (v > 0.18) {
      t = T.CLOUDHALL;
      if (g.fbm(x / 7, y / 7, 3) > 0.15) t = T.GARDEN;
      if (Math.hypot(x - cx, y - cy) < 2.3) t = T.SANCTUM;
    }
    L.terrain[y * L.w + x] = t;
  }
}

function genDemon(L: Layer, rng: Rng) {
  const e = new Noise2D(rng), r = new Noise2D(rng), m = new Noise2D(rng);
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const ev = e.fbm(x / 13, y / 13, 4), rv = r.fbm(x / 16, y / 16, 3), mv = m.fbm(x / 10, y / 10, 3);
    const edge = Math.max(Math.abs((x / L.w) * 2 - 1), Math.abs((y / L.h) * 2 - 1));
    let t: number = T.ASH;
    if (edge > 0.93) t = T.ABYSS;
    else if (Math.abs(rv) < 0.035) t = T.DLAVA;
    else if (ev > 0.36) t = T.OBSIDIAN;
    else if (mv > 0.25) t = T.BLOODMIRE;
    else if (mv < -0.22) t = T.BRIMSTONE;
    L.terrain[y * L.w + x] = t;
  }
}

/** 걸어서 다닐 수 있는 영역을 하나로 이어 붙인다 */
function ensureConnected(L: Layer, rng: Rng, carve: (t: number) => number) {
  const N = L.w * L.h;
  const comp = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const reps: number[] = [];
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !walk(L.terrain[i])) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % L.w, y = (k / L.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
        const nk = ny * L.w + nx;
        if (comp[nk] < 0 && walk(L.terrain[nk])) { comp[nk] = id; stack.push(nk); }
      }
    }
    sizes.push(size);
    reps.push(i);
  }
  if (sizes.length <= 1) return;
  let main = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[main]) main = i;
  const mainTiles: number[] = [];
  for (let i = 0; i < N; i++) if (comp[i] === main) mainTiles.push(i);
  for (let c = 0; c < sizes.length; c++) {
    if (c === main) continue;
    if (sizes[c] < 3) {
      // 아주 작은 조각은 메꾼다
      for (let i = 0; i < N; i++) if (comp[i] === c) L.terrain[i] = L.terrain[i] === T.ISLE ? T.CLOUD : L.terrain[i];
    }
    const r = reps[c];
    const rx = r % L.w, ry = (r / L.w) | 0;
    let best = -1, bd = Infinity;
    for (let s = 0; s < mainTiles.length; s += 3) {
      const k = mainTiles[s];
      const d = Math.abs((k % L.w) - rx) + Math.abs(((k / L.w) | 0) - ry);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) continue;
    let x = rx, y = ry;
    const tx = best % L.w, ty = (best / L.w) | 0;
    const xFirst = rng.chance(0.5);
    while (x !== tx || y !== ty) {
      if ((xFirst && x !== tx) || y === ty) x += Math.sign(tx - x);
      else y += Math.sign(ty - y);
      const k = y * L.w + x;
      if (!walk(L.terrain[k])) L.terrain[k] = carve(L.terrain[k]);
      if (!walk(L.terrain[k])) L.terrain[k] = carve(T.CAVE);
    }
  }
}

function nearestWalkable(L: Layer, x: number, y: number, ok: (t: number) => boolean = walk): Pos | null {
  for (let r = 0; r < Math.max(L.w, L.h); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      if (ok(L.terrain[ny * L.w + nx])) return { l: L.id, x: nx, y: ny };
    }
  }
  return null;
}

function randomTile(L: Layer, rng: Rng, ok: (t: number) => boolean, tries = 4000): Pos | null {
  for (let i = 0; i < tries; i++) {
    const x = rng.int(1, L.w - 2), y = rng.int(1, L.h - 2);
    if (ok(L.terrain[y * L.w + x])) return { l: L.id, x, y };
  }
  return null;
}

function farFrom(p: Pos, list: Pos[], d: number): boolean {
  return list.every(q => q.l !== p.l || Math.hypot(q.x - p.x, q.y - p.y) >= d);
}

export function generatePortals(layers: Layer[], rng: Rng): Portal[] {
  const portals: Portal[] = [];
  addPortals(layers, portals, rng, 'all');
  // 처음엔 균열 하나만 열려 있다
  const rifts = portals.filter(p => p.kind === 'rift');
  if (rifts.length) rng.pick(rifts).open = true;
  return portals;
}

/** 통로를 놓는다. 같은 종류끼리는 멀리, 다른 통로와는 조금만 떨어진다 */
export function addPortals(layers: Layer[], portals: Portal[], rng: Rng, only: 'all' | PortalKind[]): void {
  const used: Pos[] = portals.flatMap(p => [p.a, p.b]);
  const add = (la: number, lb: number, kind: PortalKind, count: number, okA: (t: number) => boolean, open: boolean, spacing: number) => {
    if (only !== 'all' && !only.includes(kind)) return;
    const A = layers[la], B = layers[lb];
    const same = () => portals.filter(p => p.kind === kind).flatMap(p => [p.a, p.b]);
    let made = portals.filter(p => p.kind === kind && p.a.l === la && p.b.l === lb).length;
    for (let tries = 0; tries < 600 && made < count; tries++) {
      const a = randomTile(A, rng, okA, 200);
      if (!a || !farFrom(a, same(), spacing) || !farFrom(a, used, 6)) continue;
      const b = nearestWalkable(B, Math.round((a.x / A.w) * B.w), Math.round((a.y / A.h) * B.h));
      if (!b || !farFrom(b, same(), spacing * 0.6) || !farFrom(b, used, 4)) continue;
      used.push(a, b);
      const names: Record<PortalKind, string> = { cave: '동굴 입구', peak: '구름 계단', stair: '천상의 계단', rift: '차원의 균열', tower: '탑의 문' };
      portals.push({ id: portals.length, a, b, kind, open, name: `${makePlaceName(rng, 'human')} ${names[kind]}` });
      made++;
    }
  };
  add(L_SURFACE, L_UNDER, 'cave', 11, t => t === T.HILL || t === T.MOUNTAIN || t === T.FOREST, true, 12);
  add(L_SURFACE, L_SKY, 'peak', 3, t => t === T.MOUNTAIN, false, 20);
  // 산이 없는 땅이면 높은 언덕에서 구름으로 오른다
  add(L_SURFACE, L_SKY, 'peak', 2, t => t === T.HILL, false, 20);
  add(L_SKY, L_HEAVEN, 'stair', 2, t => t === T.ISLE, false, 15);
  add(L_SURFACE, L_DEMON, 'rift', 3, t => t === T.DESERT || t === T.SWAMP || t === T.TUNDRA || t === T.HILL, false, 25);
  add(L_UNDER, L_DEMON, 'rift', 2, t => t === T.CAVE || t === T.LAVA, false, 20);
}

export function generateSites(layers: Layer[], rng: Rng): Site[] {
  const sites: Site[] = [];
  const used: Pos[] = [];
  const add = (l: number, kind: SiteKind, count: number, ok: (t: number) => boolean, names: string[]) => {
    for (let i = 0, tries = 0; i < count && tries < 500; tries++) {
      const p = randomTile(layers[l], rng, ok, 200);
      if (!p || !farFrom(p, used, 8)) continue;
      used.push(p);
      const level = kind === 'deep' ? 5 : rng.int(1, 5);
      sites.push({
        id: sites.length, ...p, kind, level,
        name: `${makePlaceName(rng, rng.pick(['human', 'elf', 'dwarf', 'darkelf'] as const))} ${rng.pick(names)}`,
        loot: kind === 'deep' ? 0 : level * rng.int(40, 90), relic: null,
      });
      i++;
    }
  };
  add(L_SURFACE, 'ruin', 10, t => walk(t) && t !== T.SHALLOW, ['폐허', '고대 유적', '무너진 탑', '잊힌 성']);
  add(L_SURFACE, 'dungeon', 4, t => t === T.HILL || t === T.MOUNTAIN || t === T.SWAMP, ['던전', '미궁', '지하 무덤']);
  add(L_UNDER, 'dungeon', 6, t => walk(t), ['미궁', '고대 광산', '거미굴', '봉인된 방']);
  add(L_UNDER, 'ruin', 4, t => walk(t), ['고대 도시', '잊힌 왕국의 잔해']);
  add(L_SURFACE, 'shrine', 3, t => walk(t) && t !== T.SHALLOW, ['성소', '빛의 제단', '고대 신전']);
  add(L_SKY, 'shrine', 2, t => t === T.ISLE, ['천공 신전', '바람의 제단']);
  add(L_UNDER, 'deep', 2, t => t === T.CAVE || t === T.LAVA || t === T.OREVEIN, ['심층', '깊은 곳']);
  const shrines = sites.filter(s => s.kind === 'shrine');
  rng.shuffle(shrines);
  if (shrines[0]) shrines[0].relic = '성검';
  if (shrines[1] && rng.chance(0.5)) shrines[1].relic = '성검';
  const ruins = sites.filter(s => s.kind === 'ruin' || s.kind === 'dungeon');
  if (ruins.length) rng.pick(ruins).relic = '마검';
  if (ruins.length) rng.pick(ruins).relic = '현자의 돌';
  return sites;
}
