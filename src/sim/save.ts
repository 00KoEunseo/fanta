import { Rng } from '../core/rng';
import { addPortals } from './worldgen';
import { newSeaState } from './sea';
import type { Layer, World } from './state';
import { recomputeTerritory } from './settlements';
import { claimInitial } from './territory';
import { rebuildPortalLinks } from './path';

/** 세상을 떠난 이는 더 변하지 않는다: 일상 기록을 비우고, 가까웠던 몇 사람과의 관계만 남기고, 수치를 반올림한다 */
function deadSlim(c: World['chars'][number]): World['chars'][number] {
  const rel = Object.entries(c.relations).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  const stats = { ...c.stats };
  for (const k of Object.keys(stats) as (keyof typeof stats)[]) stats[k] = Math.round(stats[k]);
  return { ...c, log: [], relations: Object.fromEntries(rel), stats, wealth: Math.round(c.wealth), fame: Math.round(c.fame) };
}

export function serialize(w: World): string {
  const plain = {
    ...w,
    rngSim: w.rngSim.s,
    layers: w.layers.map(L => ({ id: L.id, w: L.w, h: L.h, terrain: Array.from(L.terrain), claim: Array.from(L.claim) })),
    chars: w.chars.map(c => c.died < 0 ? { ...c, log: c.log.slice(-40) } : deadSlim(c)),
    news: w.news.map(n => n.pos ? { ...n, pos: { l: n.pos.l, x: n.pos.x, y: n.pos.y } } : n),
    armies: w.armies.filter(a => a.alive),
  };
  // 군대 id 재정렬
  plain.armies.forEach((a, i) => {
    const c = plain.chars[a.commander];
    if (c && (c.act.kind === 'army' || c.act.kind === 'colonize') && c.act.target === a.id) c.act = { ...c.act, target: i };
    a.id = i;
  });
  return JSON.stringify(plain);
}

export function deserialize(json: string): World {
  const o = JSON.parse(json);
  const layers: Layer[] = o.layers.map((L: { id: number; w: number; h: number; terrain: number[]; claim?: number[] }) => ({
    id: L.id, w: L.w, h: L.h,
    terrain: Uint8Array.from(L.terrain),
    owner: new Int16Array(L.w * L.h).fill(-1),
    claim: L.claim ? Int32Array.from(L.claim) : new Int32Array(L.w * L.h).fill(-1),
  }));
  const w: World = { ...o, layers, rngSim: Rng.fromState(o.rngSim) };
  for (const f of w.factions) f.posture ??= {};
  w.cinematics ??= [];
  w.artifacts ??= [];
  w.diseases ??= [];
  w.towers ??= [];
  w.parties ??= [];
  w.houses ??= [];
  w.sea ??= newSeaState();
  // 예전 세계는 지상 균열이 놓이지 못했다: 모자란 균열을 채운다
  if (w.portals.filter(p => p.kind === 'rift').length < 5 || w.portals.filter(p => p.kind === 'peak').length < 2) {
    addPortals(w.layers, w.portals, new Rng(w.seed + ':rift'), ['rift', 'peak']);
    w.portals.forEach((p, i) => { p.id = i; });
  }
  // 봉인 개편: 옛 순서 (마왕, 용사의 맥, 성역, 세계수, 차원문, 고대 용, 대역병) → (마왕, 심해의 분노, 성역, 세계수, 고대 용, 대역병, 차원문)
  w.doom.seen ??= w.doom.seals.slice();
  if (w.sealsV !== 2) {
    const o = w.doom.seals;
    w.doom.seals = [o[0], false, o[2], o[3], o[5], o[6], o[4]].map(Boolean);
    w.doom.seen = w.doom.seals.slice();
    w.sealsV = 2;
  }
  w.alliances ??= [];
  w.caravans ??= [];
  w.religions ??= [];
  w.camps ??= [];
  w.doom.dragonGrievance ??= 0;
  if (w.worldTree === undefined) {
    const t = w.settlements.find(s => s.flags.includes('worldtree'));
    w.worldTree = t ? { sid: t.id, hp: 100, growth: 100, alive: true } : null;
  }
  if (!o.layers[0].claim) for (const s of w.settlements) if (s.alive) claimInitial(w, s, 2 + s.tier);
  recomputeTerritory(w);
  rebuildPortalLinks(w);
  return w;
}

async function gzip(text: string): Promise<string> {
  const cs = new CompressionStream('gzip');
  const buf = await new Response(new Blob([text]).stream().pipeThrough(cs)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  return new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
}

const KEY = 'fanta-save-v1';

export async function saveLocal(w: World): Promise<void> {
  const data = await gzip(serialize(w));
  localStorage.setItem(KEY, data);
}

export async function loadLocal(): Promise<World | null> {
  let data: string | null = null;
  try { data = localStorage.getItem(KEY); } catch { return null; }
  if (!data) return null;
  return deserialize(await gunzip(data));
}

export function hasLocalSave(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function exportFile(w: World): void {
  const blob = new Blob([serialize(w)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fanta-${w.seed}-${w.t}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importFile(file: File): Promise<World> {
  return deserialize(await file.text());
}
