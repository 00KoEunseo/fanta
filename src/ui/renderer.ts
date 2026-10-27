import { RACES } from '../data/races';
import { RES_COUNT, TERRAIN } from '../data/terrain';
import type { Character, World } from '../sim/state';
import { isHero } from '../sim/helpers';
import { SEAL_THEME } from './cinema';
import { posOf } from '../sim/path';

export type MapMode = 'terrain' | 'political' | 'resource' | 'development';

const TS = 16; // 캐시 타일 크기(px)
const TIER_GLYPH = ['·', '○', '◎', '▣', '♛'];
const SITE_GLYPH: Record<string, string> = { ruin: 'Ω', dungeon: '▼', shrine: '†', deep: '¤', worldtree: '♣' };
const PORTAL_GLYPH: Record<string, string> = { cave: '∩', peak: '⇡', stair: '✧', rift: '◉', tower: '⇑' };
const PORTAL_COLOR: Record<string, string> = { cave: '#c9a070', peak: '#e8f0ff', stair: '#ffe680', rift: '#ff4fd8', tower: '#ffb060' };

export interface Camera { l: number; x: number; y: number; s: number }

export class MapRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cam: Camera = { l: 2, x: 80, y: 50, s: 8 };
  mode: MapMode = 'political';
  showChars = true;
  showArmies = true;
  showNames = true;
  /** 최근 큰 사건의 자리 (지도 위 표시) */
  showPins = true;
  selectedCaravan = -1;
  selectedCamp = -1;
  pins: { l: number; x: number; y: number; imp: number; age: number }[] = [];
  selectedChar = -1;
  selectedSettlement = -1;
  selectedTile: { l: number; x: number; y: number } | null = null;
  tickTime = 0;
  animMs = 900;
  private terrainCache: (HTMLCanvasElement | null)[] = [];
  private overlay: HTMLCanvasElement[] = [];
  private borders: Path2D[] = [];
  private resourceCache: (HTMLCanvasElement | null)[] = [];
  private dpr = 1;
  private w: World | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setWorld(w: World) {
    this.w = w;
    this.terrainCache = [];
    this.resourceCache = [];
    this.refreshTerritory();
  }

  resize() {
    const r = this.canvas.parentElement!.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * this.dpr));
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
  }

  get viewW() { return this.canvas.width / this.dpr; }
  get viewH() { return this.canvas.height / this.dpr; }

  fitLayer(l: number) {
    const w = this.w!;
    const L = w.layers[l];
    this.cam.l = l;
    this.cam.x = L.w / 2;
    this.cam.y = L.h / 2;
    this.cam.s = Math.max(3, Math.min(this.viewW / L.w, this.viewH / L.h) * 0.98);
  }

  minScale(): number {
    const L = this.w!.layers[this.cam.l];
    return Math.max(2, Math.min(this.viewW / L.w, this.viewH / L.h) * 0.6);
  }

  /** 소유 오버레이 / 국경선 갱신 (매 턴) */
  refreshTerritory() {
    const w = this.w;
    if (!w) return;
    for (const L of w.layers) {
      let cv = this.overlay[L.id];
      if (!cv) { cv = document.createElement('canvas'); cv.width = L.w; cv.height = L.h; this.overlay[L.id] = cv; }
      const c = cv.getContext('2d')!;
      const img = c.createImageData(L.w, L.h);
      const colors = new Map<number, [number, number, number]>();
      for (let k = 0; k < L.owner.length; k++) {
        const o = L.owner[k];
        if (o < 0) continue;
        let col = colors.get(o);
        if (!col) { col = hslToRgb(w.factions[o]?.color ?? 'hsl(0,0%,50%)'); colors.set(o, col); }
        img.data[k * 4] = col[0]; img.data[k * 4 + 1] = col[1]; img.data[k * 4 + 2] = col[2]; img.data[k * 4 + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      const p = new Path2D();
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const o = L.owner[y * L.w + x];
        if (o < 0) continue;
        if (x + 1 >= L.w || L.owner[y * L.w + x + 1] !== o) { p.moveTo(x + 1, y); p.lineTo(x + 1, y + 1); }
        if (x === 0 || L.owner[y * L.w + x - 1] !== o) { p.moveTo(x, y); p.lineTo(x, y + 1); }
        if (y + 1 >= L.h || L.owner[(y + 1) * L.w + x] !== o) { p.moveTo(x, y + 1); p.lineTo(x + 1, y + 1); }
        if (y === 0 || L.owner[(y - 1) * L.w + x] !== o) { p.moveTo(x, y); p.lineTo(x + 1, y); }
      }
      this.borders[L.id] = p;
    }
  }

  private terrainCanvas(l: number): HTMLCanvasElement {
    let cv = this.terrainCache[l];
    if (cv) return cv;
    const L = this.w!.layers[l];
    cv = document.createElement('canvas');
    cv.width = L.w * TS; cv.height = L.h * TS;
    const c = cv.getContext('2d')!;
    c.font = `${TS - 3}px Consolas, "Segoe UI Symbol", "DejaVu Sans Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const T = TERRAIN[L.terrain[y * L.w + x]];
      c.fillStyle = T.bg;
      c.fillRect(x * TS, y * TS, TS, TS);
      if (T.glyph.trim()) {
        c.fillStyle = T.fg;
        c.globalAlpha = 0.85;
        c.fillText(T.glyph, x * TS + TS / 2, y * TS + TS / 2 + 1);
        c.globalAlpha = 1;
      }
    }
    this.terrainCache[l] = cv;
    return cv;
  }

  private resourceCanvas(l: number): HTMLCanvasElement {
    let cv = this.resourceCache[l];
    if (cv) return cv;
    const L = this.w!.layers[l];
    cv = document.createElement('canvas');
    cv.width = L.w; cv.height = L.h;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(L.w, L.h);
    for (let k = 0; k < L.terrain.length; k++) {
      const y = TERRAIN[L.terrain[k]].yields;
      let food = y[0], other = 0;
      for (let r = 1; r < RES_COUNT; r++) other += y[r];
      const v = Math.min(1, (food + other) / 5);
      img.data[k * 4] = Math.round(255 * Math.min(1, other / 4));
      img.data[k * 4 + 1] = Math.round(255 * Math.min(1, food / 3));
      img.data[k * 4 + 2] = Math.round(80 * y[4]);
      img.data[k * 4 + 3] = Math.round(60 + 160 * v);
    }
    c.putImageData(img, 0, 0);
    this.resourceCache[l] = cv;
    return cv;
  }

  toScreen(x: number, y: number): [number, number] {
    const { cam } = this;
    return [(x - cam.x) * cam.s + this.viewW / 2, (y - cam.y) * cam.s + this.viewH / 2];
  }

  toTile(sx: number, sy: number): [number, number] {
    const { cam } = this;
    return [Math.floor((sx - this.viewW / 2) / cam.s + cam.x), Math.floor((sy - this.viewH / 2) / cam.s + cam.y)];
  }

  draw(now: number) {
    const w = this.w;
    if (!w) return;
    const ctx = this.ctx;
    const { cam } = this;
    const L = w.layers[cam.l];
    const s = cam.s;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.imageSmoothingEnabled = false;

    // 지형
    const [ox, oy] = this.toScreen(0, 0);
    if (this.mode === 'resource') {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.terrainCanvas(cam.l), ox, oy, L.w * s, L.h * s);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.resourceCanvas(cam.l), ox, oy, L.w * s, L.h * s);
    } else {
      ctx.drawImage(this.terrainCanvas(cam.l), ox, oy, L.w * s, L.h * s);
    }
    // 영토
    if (this.mode === 'political' || this.mode === 'terrain') {
      ctx.globalAlpha = this.mode === 'political' ? 0.42 : 0.14;
      ctx.drawImage(this.overlay[cam.l], ox, oy, L.w * s, L.h * s);
      ctx.globalAlpha = 1;
    }
    if (this.mode !== 'resource' && this.borders[cam.l]) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(s, s);
      ctx.strokeStyle = 'rgba(255,240,200,0.55)';
      ctx.lineWidth = Math.max(0.06, 1.2 / s);
      ctx.stroke(this.borders[cam.l]);
      ctx.restore();
    }

    const t = Math.min(1, (now - this.tickTime) / this.animMs);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lerp = (a: number, b: number) => a + (b - a) * ease;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 지형지물: 유적 / 통로
    const fs = Math.max(8, Math.min(22, s * 0.95));
    ctx.font = `bold ${fs}px Consolas, "Segoe UI Symbol", monospace`;
    if (s >= 4) {
      for (const site of w.sites) {
        if (site.l !== cam.l) continue;
        const [sx, sy] = this.toScreen(site.x + 0.5, site.y + 0.5);
        if (!this.visible(sx, sy)) continue;
        // 다시 세운 신전은 금빛 십자, 무너진 신전 터는 잿빛
        ctx.fillStyle = site.temple ? '#ffd24a' : site.kind === 'shrine' ? '#8a8070' : site.loot > 0 || site.relic ? '#f0dca0' : '#7a705c';
        glyph(ctx, site.temple ? '✝' : SITE_GLYPH[site.kind] ?? '?', sx, sy);
      }
      for (const p of w.portals) {
        for (const e of [p.a, p.b]) {
          if (e.l !== cam.l) continue;
          const [sx, sy] = this.toScreen(e.x + 0.5, e.y + 0.5);
          if (!this.visible(sx, sy)) continue;
          ctx.globalAlpha = p.open ? 1 : 0.35;
          ctx.fillStyle = PORTAL_COLOR[p.kind];
          if (p.kind === 'rift' && p.open) {
            ctx.beginPath(); ctx.arc(sx, sy, s * (0.7 + 0.15 * Math.sin(now / 300)), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,60,200,0.25)'; ctx.fill();
            ctx.fillStyle = PORTAL_COLOR[p.kind];
          }
          glyph(ctx, PORTAL_GLYPH[p.kind], sx, sy);
          ctx.globalAlpha = 1;
        }
      }
    }

    // 정착지
    const labels: [string, number, number, string][] = [];
    // 바벨탑 / 마왕탑
    for (const tw of w.towers) {
      if (tw.l !== cam.l) continue;
      const [sx, sy] = this.toScreen(tw.x + 0.5, tw.y + 0.5);
      if (!this.visible(sx, sy, 60)) continue;
      const hgt = Math.max(16, s * (1.4 + Math.min(200, tw.progress) / 60));
      ctx.font = `bold ${hgt}px "Segoe UI Symbol", Consolas, monospace`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText('♜', sx, sy - hgt * 0.35);
      ctx.fillStyle = !tw.alive ? '#6a6058' : tw.demon ? '#ff3a3a' : '#ffcf7a';
      ctx.fillText('♜', sx, sy - hgt * 0.35);
      if (tw.alive) {
        const bw = Math.max(18, s * 1.6);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - bw / 2, sy + 4, bw, 4);
        ctx.fillStyle = '#ffcf7a'; ctx.fillRect(sx - bw / 2, sy + 4, bw * Math.min(1, tw.progress / 200), 4);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - bw / 2, sy + 9, bw, 3);
        ctx.fillStyle = '#ff6a5a'; ctx.fillRect(sx - bw / 2, sy + 9, bw * Math.max(0, tw.hp) / 100, 3);
      }
      labels.push([tw.alive ? tw.name : `무너진 ${tw.name}`, sx, sy - hgt * 1.0, tw.demon ? '#ff7a6a' : '#ffd79a']);
    }
    for (const st of w.settlements) {
      if (!st.alive || st.l !== cam.l) continue;
      const [sx, sy] = this.toScreen(st.x + 0.5, st.y + 0.5);
      if (!this.visible(sx, sy, 40)) continue;
      const f = w.factions[st.faction];
      const size = Math.max(5, s * (0.8 + st.tier * 0.18));
      const tree = st.flags.includes('worldtree'), burned = st.flags.includes('worldtree_burned'), sanctum = st.flags.includes('sanctum');
      if (tree || burned || sanctum) {
        const R = Math.max(14, s * 2.2);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        const col = tree ? '120,255,140' : sanctum ? '255,230,120' : '255,90,40';
        g.addColorStop(0, `rgba(${col},${0.45 + 0.1 * Math.sin(now / 500)})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        if (!sanctum) {
          const ts = Math.max(18, s * 2);
          ctx.font = `bold ${ts}px "Segoe UI Symbol", Consolas, monospace`;
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.strokeText('♣', sx, sy - ts * 0.55);
          const T = w.worldTree;
          const sapling = tree && T && T.sid === st.id && T.growth < 100;
          const hpTxt = tree && T && T.sid === st.id ? (sapling ? ` 새싹 ${Math.floor(T.growth)}%` : ` ♥${Math.ceil(T.hp)}`) : '';
          if (sapling) ctx.font = `bold ${Math.max(12, ts * (0.45 + T!.growth / 180))}px "Segoe UI Symbol", Consolas, monospace`;
          ctx.fillStyle = tree ? (T && T.hp < 30 ? '#c8b45a' : '#7dff8a') : '#5a4a40';
          ctx.fillText('♣', sx, sy - ts * 0.55);
          labels.push([(tree ? '세계수' : '쓰러진 세계수') + hpTxt, sx, sy - ts * 1.25, tree ? '#9dffa8' : '#ff9a6a']);
        }
      }
      if (this.mode === 'development') {
        ctx.beginPath();
        ctx.arc(sx, sy, s * (1.2 + st.dev / 25), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${Math.round(st.dev * 1.2)}, 80%, 50%, 0.35)`;
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(10,8,6,0.85)';
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      ctx.strokeStyle = f?.color ?? '#888';
      ctx.lineWidth = st.id === f?.capital ? 2 : 1;
      ctx.strokeRect(sx - size / 2, sy - size / 2, size, size);
      ctx.font = `bold ${Math.max(7, size * 0.85)}px Consolas, "Segoe UI Symbol", monospace`;
      ctx.fillStyle = f?.color ?? '#ccc';
      ctx.fillText(TIER_GLYPH[st.tier], sx, sy + 1);
      if (st.plague > 0) { ctx.fillStyle = '#b6ff3a'; ctx.fillText('☣', sx + size * 0.7, sy - size * 0.6); }
      if (st.id === this.selectedSettlement) ring(ctx, sx, sy, size * 0.9 + 3, '#fff', now);
      if (this.showNames && (s >= 13 || (s >= 7 && st.tier >= 2) || (s >= 4.5 && st.tier >= 3))) {
        labels.push([st.name, sx, sy + size / 2 + 7, f?.color ?? '#ccc']);
      }
    }

    // 진군 경로: 붉은 점선
    if (this.showArmies) {
      ctx.save();
      const dash = Math.max(2, s * 0.45);
      ctx.setLineDash([dash, dash]);
      ctx.lineDashOffset = -((now / 60) % (dash * 2));
      ctx.lineWidth = Math.max(1, Math.min(3, s * 0.14));
      const route = (from: { l: number; x: number; y: number }, path: number[] | undefined, col: string) => {
        if (!path || !path.length) return;
        ctx.strokeStyle = col;
        ctx.beginPath();
        let on = false;
        if (from.l === cam.l) { const [sx, sy] = this.toScreen(from.x + 0.5, from.y + 0.5); ctx.moveTo(sx, sy); on = true; }
        for (const n of path) {
          const p = posOf(w, n);
          if (p.l !== cam.l) { on = false; continue; }
          const [sx, sy] = this.toScreen(p.x + 0.5, p.y + 0.5);
          if (on) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); on = true; }
        }
        ctx.stroke();
      };
      for (const a of w.armies) if (a.alive && a.goal !== 'colonize' && a.goal !== 'return' && a.goal !== 'clear') route(a, a.path, a.goal === 'holywar' ? 'rgba(255,90,200,0.75)' : 'rgba(255,60,50,0.75)');
      for (const p of w.parties) {
        if (p.done) continue;
        const lead = w.chars[p.leader];
        if (lead && lead.died < 0) route(lead, p.path, 'rgba(255,200,70,0.85)');
      }
      for (const c of w.chars) if (c.died < 0 && c.act.kind === 'travel' && (c.act.purpose === 'duel' || c.act.purpose === 'hunt' || c.act.purpose === 'muster')) route(c, c.act.path, 'rgba(255,110,110,0.6)');
      // 먼 길을 떠난 인물은 하얀 점선 (교역, 모험, 순례, 귀향, 이주…)
      for (const c of w.chars) if (c.died < 0 && c.act.kind === 'travel' && c.act.purpose !== 'duel' && c.act.purpose !== 'hunt' && c.act.purpose !== 'muster' && c.act.long && (c.act.path?.length ?? 0) > 0) route(c, c.act.path, c.isPlayer ? 'rgba(140,200,255,0.85)' : 'rgba(255,255,255,0.45)');
      ctx.restore();
    }

    // 바다: 해저 유적, 배, 유랑 선단, 괴수, 심연의 군주
    if (cam.l === 2 && w.sea) {
      const S = w.sea;
      const V = S.leviathan;
      if (V && V.active) {
        const [ex, ey] = this.toScreen(V.eye.x + 0.5, V.eye.y + 0.5);
        const R = Math.max(30, s * 9);
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, R);
        g.addColorStop(0, `rgba(42,255,200,${0.35 + 0.15 * Math.sin(now / 700)})`);
        g.addColorStop(1, 'rgba(0,30,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, R, 0, Math.PI * 2); ctx.fill();
        ctx.font = `bold ${Math.max(20, s * 3)}px "Segoe UI Symbol", Consolas, monospace`;
        ctx.fillStyle = '#2affc8'; glyph(ctx, '◉', ex, ey);
        labels.push([V.name, ex, ey - Math.max(20, s * 3), '#7affdc']);
        for (const t of V.tentacles) {
          const [tx, ty] = this.toScreen(t.x + 0.5, t.y + 0.5);
          if (!this.visible(tx, ty, s * 12)) continue;
          if (t.alive) {
            ctx.beginPath(); ctx.arc(tx, ty, s * 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(42,255,200,0.06)'; ctx.fill();
            ctx.strokeStyle = 'rgba(42,255,200,0.25)'; ctx.lineWidth = 1; ctx.stroke();
          }
          const sz = Math.max(16, s * 2.4);
          ctx.font = `bold ${sz}px "Segoe UI Symbol", Consolas, monospace`;
          ctx.globalAlpha = t.alive ? 1 : 0.3;
          ctx.fillStyle = t.alive ? '#3affb0' : '#3a5a50';
          glyph(ctx, 'ξ', tx + Math.sin(now / 400 + t.x) * s * 0.3, ty);
          ctx.globalAlpha = 1;
          if (t.alive) {
            const bw = Math.max(20, s * 2.2), by = ty + sz * 0.6;
            ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(tx - bw / 2 - 1, by - 1, bw + 2, 5);
            const v = Math.max(0, t.hp) / 250;
            ctx.fillStyle = v > 0.5 ? '#3affb0' : v > 0.25 ? '#e0d040' : '#ff5a4a';
            ctx.fillRect(tx - bw / 2, by, bw * v, 3);
          }
        }
      }
      ctx.font = `bold ${fs}px "Segoe UI Symbol", Consolas, monospace`;
      if (s >= 4) for (const st of S.sites) {
        if (!st.found) continue;
        const [sx, sy] = this.toScreen(st.x + 0.5, st.y + 0.5);
        if (!this.visible(sx, sy)) continue;
        ctx.fillStyle = st.loot > 0 || st.relic ? '#7fe0ff' : '#4a6a7a';
        glyph(ctx, ({ wreck: '⚓', sunken: 'Ω', isle: '♁', abyss: '◎' } as Record<string, string>)[st.kind] ?? '?', sx, sy);
      }
      for (const b of S.beasts) {
        if (!b.alive) continue;
        const [sx, sy] = this.toScreen(lerp(b.px, b.x) + 0.5, lerp(b.py, b.y) + 0.5);
        if (!this.visible(sx, sy)) continue;
        const sz = Math.max(14, s * 1.8);
        ctx.font = `bold ${sz}px "Segoe UI Symbol", Consolas, monospace`;
        ctx.fillStyle = b.ashore ? '#ff5a4a' : '#ff9a6a';
        glyph(ctx, 'Ж', sx, sy);
        const bw = Math.max(16, s * 1.6);
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(sx - bw / 2, sy + sz * 0.6, bw, 3);
        ctx.fillStyle = '#ff6a5a'; ctx.fillRect(sx - bw / 2, sy + sz * 0.6, bw * Math.max(0, b.hp) / b.maxHp, 3);
        if (s >= 5) labels.push([b.name, sx, sy - sz * 0.9, '#ffb09a']);
      }
      ctx.font = `${Math.max(10, s * 1.1)}px "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`;
      for (const v of S.voyages) {
        if (v.done) continue;
        const [sx, sy] = this.toScreen(lerp(v.px, v.x) + 0.5, lerp(v.py, v.y) + 0.5);
        if (!this.visible(sx, sy)) continue;
        ctx.fillStyle = '#fff';
        ctx.fillText('⛵', sx, sy);
        if (v.crew.some(id => w.chars[id]?.isPlayer)) ring(ctx, sx, sy, s + 4, '#6ab0ff', now);
        if (s >= 10) labels.push([v.name, sx, sy - s, '#cfe8ff']);
      }
      for (const f of S.fleets) {
        if (!f.alive) continue;
        const [sx, sy] = this.toScreen(lerp(f.px, f.x) + 0.5, lerp(f.py, f.y) + 0.5);
        if (!this.visible(sx, sy)) continue;
        const n = Math.min(4, 1 + Math.floor(f.pop / 70));
        for (let i = 0; i < n; i++) ctx.fillText('⛵', sx + (i % 2) * s * 0.6 - s * 0.3, sy + Math.floor(i / 2) * s * 0.5);
        if (s >= 6) labels.push([`${f.name} (${Math.round(f.pop)})`, sx, sy - s * 1.1, f.pirate ? '#ff9a8a' : '#bcd8ff']);
      }
    }

    // 군대
    if (this.showArmies) {
      for (const a of w.armies) {
        if (!a.alive || a.l !== cam.l) continue;
        const sameLayer = a.pl === a.l;
        const x = sameLayer ? lerp(a.px, a.x) : a.x, y = sameLayer ? lerp(a.py, a.y) : a.y;
        const [sx, sy] = this.toScreen(x + 0.5, y + 0.5);
        if (!this.visible(sx, sy)) continue;
        const f = w.factions[a.faction];
        const r = Math.max(4, s * 0.55 + Math.min(6, Math.sqrt(a.soldiers) / 4));
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15,10,10,0.85)'; ctx.fill();
        ctx.strokeStyle = a.goal === 'colonize' ? '#9ad06a' : a.goal === 'clear' ? '#d8b060' : '#ff5a4a';
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.font = `bold ${Math.max(8, r * 1.3)}px "Segoe UI Symbol", Consolas, monospace`;
        ctx.fillStyle = f?.color ?? '#fff';
        ctx.fillText(a.goal === 'colonize' ? '⚑' : a.goal === 'clear' ? '⚒' : '⚔', sx, sy + 1);
        if (s >= 12) {
          ctx.font = `${Math.max(9, s * 0.5)}px Consolas, monospace`;
          ctx.fillStyle = '#ffd';
          ctx.fillText(String(Math.round(a.soldiers)), sx, sy - r - 6);
        }
      }
    }

    // 인물
    if (this.showChars) {
      const drawn = new Map<number, number>();
      for (const c of w.chars) {
        if (c.died >= 0 || c.l !== cam.l) continue;
        if (c.act.kind === 'army' || c.act.kind === 'colonize' || c.act.kind === 'voyage' || c.act.kind === 'fleet') continue;
        // 상단을 이끄는 이는 수레로 그린다 (군대 표시를 끄면 사람으로 보인다)
        if ((c.act.kind === 'caravan' || c.act.kind === 'camp') && this.showArmies) continue;
        const special = c.race === 'dragon' || isHero(c) || w.demonLord === c.id || c.isPlayer || c.id === this.selectedChar || w.factions[c.faction]?.leader === c.id;
        // 개간하러 나간 이들은 멀리서도 보인다 (땅이 넓어지는 모습)
        const working = false;
        if (!special && !working && s < 6) continue;
        if (!special && !working && c.rank === 0 && s < 20) continue;
        if (working && s < 3.5) continue;
        const sameLayer = c.pl === c.l;
        const x = sameLayer ? lerp(c.px, c.x) : c.x, y = sameLayer ? lerp(c.py, c.y) : c.y;
        const key = Math.round(x) * 1000 + Math.round(y);
        const n = drawn.get(key) ?? 0;
        drawn.set(key, n + 1);
        if (n > 3 && !special) continue;
        const off = n * 0.22;
        const [sx, sy] = this.toScreen(x + 0.5 + off, y + 0.5 - off);
        if (!this.visible(sx, sy)) continue;
        this.drawChar(c, sx, sy, s, now);
        if (working) {
          ctx.font = `bold ${Math.max(9, s * 0.8)}px "Segoe UI Symbol", Consolas, monospace`;
          ctx.fillStyle = c.act.kind === 'clear' ? '#e8c060' : '#b8a070';
          glyph(ctx, '⚒', sx + Math.max(5, s * 0.55), sy - Math.max(5, s * 0.55));
        }
      }
    }
    // 주둔지: 세력 색 천막, 그리고 노리는 적 고을까지 이어진 전선
    if (this.showArmies) for (const k of w.camps ?? []) {
      if (!k.alive || k.l !== cam.l) continue;
      const [sx, sy] = this.toScreen(k.x + 0.5, k.y + 0.5);
      const front = w.settlements[k.front];
      if (front && front.alive && front.l === k.l) {
        const [tx, ty] = this.toScreen(front.x + 0.5, front.y + 0.5);
        ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(255,80,60,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.restore();
      }
      const u = Math.max(4, s * 0.45);
      const col = w.factions[k.faction]?.color ?? '#c04040';
      ctx.fillStyle = col; ctx.strokeStyle = this.selectedCamp === k.id ? '#ffffff' : 'rgba(0,0,0,0.85)'; ctx.lineWidth = this.selectedCamp === k.id ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy - u); ctx.lineTo(sx + u, sy + u * 0.7); ctx.lineTo(sx - u, sy + u * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1a0c08'; ctx.fillRect(sx - u * 0.18, sy - u * 0.05, u * 0.36, u * 0.75);
      if (s >= 6) { ctx.font = `${Math.max(9, s * 0.6)}px sans-serif`; ctx.fillStyle = '#ffd8c8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.round(k.soldiers)), sx, sy + u * 1.5); }
    }
    // 상단: 짐을 실은 행렬
    if (this.showArmies) for (const k of w.caravans ?? []) {
      if (!k.alive || k.l !== cam.l) continue;
      const t = Math.min(1, (now - this.tickTime) / this.animMs);
      const [sx, sy] = this.toScreen((k.pl === k.l ? k.px + (k.x - k.px) * t : k.x) + 0.5, (k.pl === k.l ? k.py + (k.y - k.py) * t : k.y) + 0.5);
      // 짐수레: 세력 색 테두리를 두른 짐칸 위에 금빛 짐, 아래에 바퀴 둘
      const u = Math.max(3, s * 0.32);
      const col = w.factions[k.fac]?.color ?? '#c8a070';
      const sel = this.selectedCaravan === k.id;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.strokeStyle = sel ? '#ffffff' : 'rgba(0,0,0,0.85)';
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(sx - u, sy - u * 0.4, u * 2, u * 0.9);
      ctx.strokeRect(sx - u, sy - u * 0.4, u * 2, u * 0.9);
      ctx.fillStyle = '#e8c060';
      ctx.fillRect(sx - u * 0.7, sy - u * 1.0, u * 1.4, u * 0.6);
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.strokeRect(sx - u * 0.7, sy - u * 1.0, u * 1.4, u * 0.6);
      ctx.fillStyle = '#2a1a0a';
      for (const dx of [-0.6, 0.6]) { ctx.beginPath(); ctx.arc(sx + dx * u, sy + u * 0.6, u * 0.32, 0, Math.PI * 2); ctx.fill(); }
    }
    // 최근 큰 사건의 자리: 오래될수록 흐려지는 마름모, 가장 큰 일은 붉게 고동친다
    if (this.showPins) {
      for (const p of this.pins) {
        if (p.l !== cam.l) continue;
        const [sx, sy] = this.toScreen(p.x + 0.5, p.y + 0.5);
        const fade = Math.max(0.25, 1 - p.age / 24);
        const r = Math.max(4, s * 0.45) * (p.imp >= 5 ? 1 + 0.15 * Math.sin(now / 250) : 1);
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.imp >= 5 ? '#ff4a3a' : '#ffd060';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r * 2.2); ctx.lineTo(sx + r * 0.7, sy - r * 1.4); ctx.lineTo(sx, sy - r * 0.6); ctx.lineTo(sx - r * 0.7, sy - r * 1.4); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 이름표
    ctx.font = `${Math.max(10, Math.min(14, s * 0.75))}px "Malgun Gothic", sans-serif`;
    for (const [name, x, y, col] of labels) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(name, x, y);
      ctx.fillStyle = col;
      ctx.fillText(name, x, y);
    }
    // 재앙의 기운: 무너진 봉인마다 지도 가장자리가 물든다
    const broken = w.doom.seals.map((b, i) => (b ? i : -1)).filter(i => i >= 0);
    if (broken.length) {
      const W = this.viewW, H = this.viewH;
      const pulse = 0.5 + 0.5 * Math.sin(now / 900);
      broken.forEach((i, n) => {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        const a = (0.12 + 0.06 * broken.length + 0.05 * pulse) / broken.length * (n === broken.length - 1 ? 1.4 : 1);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, hexA(SEAL_THEME[i].c1, Math.min(0.6, a)));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
    }
    // 선택 칸
    if (this.selectedTile && this.selectedTile.l === cam.l) {
      const [sx, sy] = this.toScreen(this.selectedTile.x, this.selectedTile.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, sy, s, s);
    }
  }

  private drawChar(c: Character, sx: number, sy: number, s: number, now: number) {
    const w = this.w!;
    const ctx = this.ctx;
    const f = w.factions[c.faction];
    const dragon = c.race === 'dragon';
    const big = dragon ? (c.ancient ? 1.6 : 1.25) : 0.75;
    const size = Math.max(dragon ? 10 : 6, s * big);
    const col = dragon ? RACES.dragon.color : f?.color ?? RACES[c.race].color;
    ctx.font = `bold ${size}px Consolas, "Segoe UI Symbol", monospace`;
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    const g = w.demonLord === c.id ? 'Ψ' : RACES[c.race].glyph;
    ctx.strokeText(g, sx, sy);
    ctx.fillStyle = w.demonLord === c.id ? '#ff2a2a' : col;
    ctx.fillText(g, sx, sy);
    if (f && f.leader === c.id && w.demonLord !== c.id) {
      const cs = Math.max(9, size * 0.75);
      ctx.font = `bold ${cs}px "Segoe UI Symbol", Consolas, monospace`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText('♛', sx, sy - size * 0.85);
      ctx.fillStyle = '#ffd24a';
      ctx.fillText('♛', sx, sy - size * 0.85);
    }
    if (isHero(c)) ring(ctx, sx, sy, size * 0.7, '#ffe680', now, true);
    if (c.isPlayer) ring(ctx, sx, sy, size * 0.85, '#7fd4ff', now, true);
    if (c.id === this.selectedChar) ring(ctx, sx, sy, size * 0.95 + 2, '#ffffff', now);
    if (dragon && (c.sleep ?? 0) > 0 && s >= 6) {
      ctx.font = `${Math.max(8, s * 0.5)}px sans-serif`;
      ctx.fillStyle = '#cde';
      ctx.fillText('z', sx + size * 0.6, sy - size * 0.6);
    }
  }

  private visible(x: number, y: number, m = 20) {
    return x > -m && y > -m && x < this.viewW + m && y < this.viewH + m;
  }
}

function glyph(ctx: CanvasRenderingContext2D, g: string, x: number, y: number) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(g, x, y + 1);
  ctx.fillText(g, x, y + 1);
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, now: number, soft = false) {
  ctx.beginPath();
  ctx.arc(x, y, r + (soft ? 0 : Math.sin(now / 200) * 1.5), 0, Math.PI * 2);
  ctx.strokeStyle = col;
  ctx.lineWidth = soft ? 1.2 : 2;
  ctx.globalAlpha = soft ? 0.7 : 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
}

const hslCache = new Map<string, [number, number, number]>();
export function hslToRgb(hsl: string): [number, number, number] {
  const hit = hslCache.get(hsl);
  if (hit) return hit;
  const m = hsl.match(/hsl\((\d+(?:\.\d+)?),\s*(\d+)%,\s*(\d+)%\)/);
  let out: [number, number, number] = [128, 128, 128];
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    out = [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  hslCache.set(hsl, out);
  return out;
}
