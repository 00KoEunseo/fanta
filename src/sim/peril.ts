// 세상의 재앙은 '나'도 비껴가지 않는다.
// 지진, 용의 불길, 함락, 심연의 촉수, 바다 괴수: 그 고을에 사는 이라면 누구든 휘말린다.
// 살아남은 '나'에게는 그 일이 인생을 덮치는 선택지가 뒤따른다.
import { RACES } from '../data/races';
import { charLog } from './news';
import type { Character, Settlement, World } from './state';
import { dist } from './state';
import { clamp } from './helpers';
import { killChar, relocate } from './characters';
import type { Ctx } from './life';

export type PerilKind = 'dragon' | 'quake' | 'fallen' | 'abyss' | 'beast' | 'plague' | 'dlnews' | 'fall' | 'dlarmy' | 'fallenAway';

/** 그 고을에 지금 머무는 이들 */
function residents(w: World, s: Settlement): Character[] {
  return w.chars.filter(c => c.died < 0 && c.home === s.id && c.race !== 'dragon' && (c.act.kind === 'idle' || (c.l === s.l && dist(c, s) <= 3)));
}

/** '나'에게 재앙의 표식을 남긴다 (곧 선택지가 뜬다) */
export function markPeril(w: World, kind: PerilKind, s?: Settlement, who?: number): void {
  const P = w.player;
  if (!P || P.dead) return;
  P.flags ??= {};
  P.flags['peril_' + kind] = w.t;
  if (s) P.flags.perilSet = s.id;
  if (who !== undefined) P.flags.perilWho = who;
}

/** 재앙이 고을을 덮쳤다: 사는 이들이 휘말린다. 힘세고 건강할수록 살아남는다 */
export function disasterStrikes(w: World, s: Settlement, kind: PerilKind, cause: string, pDeath: number, killer?: Character): void {
  const rng = w.rngSim;
  for (const c of residents(w, s)) {
    if (w.demonLord === c.id || c.ancient) continue;
    const p = pDeath * clamp(1.3 - (c.stats.might + c.stats.health) / 250, 0.4, 1.3);
    if (rng.chance(p)) { killChar(w, c, cause, killer); continue; }
    if (c.isPlayer) markPeril(w, kind, s, killer?.id);
  }
}

/** '나'의 고을에 일이 생겼는가 */
export function playerHome(w: World): Settlement | undefined {
  const P = w.player;
  if (!P || P.dead) return;
  const c = w.chars[P.charId];
  return c && c.died < 0 ? w.settlements[c.home] : undefined;
}

// ───────────── 효과

export function perilFx(x: Ctx, fx: string): string | undefined | null {
  const { w, c } = x;
  switch (fx) {
    case 'flee_home': case 'move_inland': {
      const cur = x.home;
      const cands = w.settlements.filter(s => s.alive && s.id !== cur?.id && s.l === (cur?.l ?? c.l) && !s.flags.includes('sanctum')
        && (fx !== 'move_inland' || !w.layers[s.l] || seaFar(w, s))
        && (s.faction === c.faction || s.race === c.race) && s.lastAttacked < w.t - 6 && s.plague <= 0);
      const to = cands.sort((a, b) => (cur ? dist(a, cur) : 0) - (cur ? dist(b, cur) : 0))[0];
      if (!to) return '갈 곳이 없었다. 결국 고향에 남았다.';
      c.home = to.id; c.faction = to.faction; relocate(w, c, to);
      charLog(w, c, `${cur?.name ?? '고향'}을(를) 떠나 ${to.name}에 새 둥지를 틀었다.`, 3);
      return `${to.name}(으)로 길을 떠났다.`;
    }
    case 'bow': {
      const s0 = w.settlements[x.P.flags?.perilSet ?? -1];
      const s = s0 && s0.alive ? s0 : x.home;
      if (s && s.alive) { c.faction = s.faction; c.home = s.id; return `이제 ${w.factions[s.faction]?.name ?? '새 나라'}의 백성이다.`; }
      return;
    }
  }
  return null;
}

function seaFar(w: World, s: Settlement): boolean {
  if (s.l !== 2) return true;
  const L = w.layers[2];
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const xx = s.x + dx, yy = s.y + dy;
    if (xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) continue;
    const t = L.terrain[yy * L.w + xx];
    if (t === 0) return false;
  }
  return true;
}

