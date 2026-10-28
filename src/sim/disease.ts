// 병에는 이름이 있다. 작은 병은 고을 몇 곳을 앓게 하고 사라지지만,
// 대역병은 수백 년에 한 번, 혹은 한 겨레가 좁은 땅에 너무 많이 모여 살 때 찾아와
// 반백 년 넘게 세상을 돌다가 면역이 퍼지고서야 사라진다. 대역병은 세상의 머릿수를 다스린다.
import { markPeril, playerHome } from './peril';
import { RACES } from '../data/races';
import { addNews } from './news';
import type { Settlement, World } from './state';
import { dist } from './state';

export interface Disease {
  id: number;
  name: string;
  origin: number;
  t: number;
  alive: boolean;
  /** 대역병으로 번졌는가 (봉인) */
  epidemic: boolean;
  /** 감염지에서 매달 죽는 인구 비율 */
  mortality: number;
  /** 이웃 고을로 번질 확률 */
  spread: number;
  peak: number;
  ended: number;
  /** 대역병인가 */
  great?: boolean;
  /** 면역이 퍼져 사라지는 시점 (대역병) */
  until?: number;
  /** 이 병으로 죽은 이 (어림) */
  toll?: number;
}

/** 대역병으로 선포되는 감염지 수 */
export const EPIDEMIC_AT = 5;
/** 작은 병을 앓고 난 고을의 면역 기간 */
const IMMUNE_MONTHS = 12 * 40;
/** 대역병 한가운데서 앓고 난 고을은 몇 해 뒤 다시 앓는다 */
const GREAT_REINFECT: [number, number] = [5, 10];
/** 한 겨레가 이만큼 좁은 땅에 몰려 살면 대역병이 싹튼다 */
const DENSE_POP = 9000;
const DENSE_R = 14;

const PREFIX = ['검은', '붉은', '잿빛', '창백한', '떨리는', '푸른', '썩은', '눈물의', '쇳빛', '잠드는', '피의'];
const SUFFIX = ['열병', '반점병', '기침병', '고름병', '잠병', '피눈물병', '뼈마름병', '열꽃병', '물집병'];
const GREAT_NAMES = ['검은 죽음', '잿빛 역병', '붉은 사신', '창백한 손', '대지의 기침', '천 개의 무덤', '침묵의 병', '마지막 겨울'];

function diseaseName(w: World, s: Settlement, great: boolean): string {
  const rng = w.rngSim;
  for (let i = 0; i < 10; i++) {
    const n = great ? rng.pick(GREAT_NAMES) : rng.chance(0.5) ? `${s.name} ${rng.pick(SUFFIX)}` : `${rng.pick(PREFIX)} ${rng.pick(SUFFIX)}`;
    if (!w.diseases.some(d => d.name === n)) return n;
  }
  return `${s.name}의 ${rng.pick(SUFFIX)} ${w.diseases.length + 1}호`;
}

export function immune(w: World, s: Settlement, d: Disease): boolean {
  return (s.immune?.[d.id] ?? -1) > w.t;
}

/** 병에 걸리는 겨레인가: 먹지 않는 언데드, 악마와 천사, 용은 병을 모른다 */
export function canSicken(s: Settlement): boolean {
  return RACES[s.race].needs[0] > 0 && s.race !== 'angel' && s.race !== 'demon' && s.race !== 'dragon';
}

function susceptible(w: World, s: Settlement, d: Disease): boolean {
  return s.alive && s.plague <= 0 && canSicken(s) && !immune(w, s, d);
}

/** 새 병이 생긴다 */
export function outbreak(w: World, s: Settlement, how = '', great = false): Disease {
  const rng = w.rngSim;
  const d: Disease = {
    id: w.diseases.length, name: diseaseName(w, s, great), origin: s.id, t: w.t, alive: true, epidemic: false,
    mortality: great ? rng.float(0.008, 0.015) : rng.float(0.003, 0.01),
    spread: great ? rng.float(0.035, 0.06) : rng.float(0.004, 0.012),
    peak: 0, ended: -1, great, toll: 0,
  };
  if (great) d.until = w.t + 12 * rng.int(50, 65);
  w.diseases.push(d);
  infect(w, s, d);
  if (great) {
    w.stats.greatPlagues = (w.stats.greatPlagues ?? 0) + 1;
    addNews(w, `${s.name}에서 지독한 병이 터져 나왔다. 사람들은 그것을 '${d.name}'이라 불렀다. 늙은 의원들은 이 병이 한 세대로 끝나지 않으리라 수군거렸다.${how ? ' ' + how : ''}`, 4, 'doom', { pos: s, facs: [s.faction] });
  } else {
    addNews(w, `${s.name}에서 이름 모를 병이 돌기 시작하였다. 사람들은 그것을 '${d.name}'이라 불렀다.${how ? ' ' + how : ''}`, 3, 'nature', { pos: s, facs: [s.faction] });
  }
  return d;
}

export function infect(w: World, s: Settlement, d: Disease): boolean {
  if (!susceptible(w, s, d)) return false;
  s.plague = w.rngSim.int(8, 24);
  s.disease = d.id;
  if (playerHome(w) === s) markPeril(w, 'plague', s);
  return true;
}

/** 고을의 병이 낫는다: 면역이 남는다 */
export function cure(w: World, s: Settlement): void {
  if (s.disease !== undefined && s.disease >= 0) {
    const d = w.diseases[s.disease];
    s.immune ??= {};
    s.immune[s.disease] = w.t + (d?.great && d.alive ? 12 * w.rngSim.int(...GREAT_REINFECT) : IMMUNE_MONTHS);
  }
  s.plague = 0;
  s.disease = -1;
}

export function diseaseOf(w: World, s: Settlement): Disease | undefined {
  return s.disease !== undefined && s.disease >= 0 ? w.diseases[s.disease] : undefined;
}

/** 사람이 몰려 사는 정도: 같은 겨레가 가까이 모여 사는 머릿수 */
function crowding(w: World, s: Settlement): number {
  let n = 0;
  for (const o of w.settlements) if (o.alive && o.l === s.l && o.race === s.race && dist(o, s) <= DENSE_R) n += o.pop;
  return n;
}

let crowdCache: { w: World; t: number; s: Settlement | null; n: number } | null = null;
/** 가장 빽빽하게 모여 사는 곳 */
export function densest(w: World): { s: Settlement | null; n: number } {
  if (crowdCache && crowdCache.w === w && w.t - crowdCache.t < 12 && w.t >= crowdCache.t) return crowdCache;
  let best: Settlement | null = null, bn = 0;
  for (const s of w.settlements) {
    if (!s.alive || !canSicken(s) || s.pop < 400) continue;
    const n = crowding(w, s);
    if (n > bn) { bn = n; best = s; }
  }
  crowdCache = { w, t: w.t, s: best, n: bn };
  return crowdCache;
}

/** 매달: 전파, 회복, 대역병 선포와 종식 */
export function diseaseMonth(w: World): void {
  const rng = w.rngSim;
  const sick = w.settlements.filter(s => s.alive && s.plague > 0 && s.disease !== undefined && s.disease >= 0);
  for (const s of sick) {
    const d = w.diseases[s.disease!];
    if (!d) continue;
    d.toll = (d.toll ?? 0) + s.pop * d.mortality;
    // 대역병은 더 멀리 번진다
    const reach = d.great && d.epidemic ? 34 : 22;
    for (const o of w.settlements) {
      if (o === s || o.l !== s.l) continue;
      const r = dist(o, s);
      if (r > reach || !susceptible(w, o, d)) continue;
      // 사람이 많은 곳일수록 잘 번진다
      const dense = 0.4 + Math.min(1.6, o.pop / 1500);
      if (rng.chance(d.spread * (1 - r / (reach + 3)) * dense)) {
        infect(w, o, d);
        if (rng.chance(d.great ? 0.15 : 0.4)) addNews(w, `'${d.name}'이(가) ${s.name}에서 ${o.name}까지 번졌다.`, 2, 'nature', { pos: o, facs: [o.faction] });
      }
    }
  }
  // 앓고 난 고을
  for (const s of w.settlements) if (s.plague <= 0 && s.disease !== undefined && s.disease >= 0) cure(w, s);

  const counts = new Map<number, number>();
  for (const s of w.settlements) if (s.alive && s.plague > 0 && s.disease !== undefined && s.disease >= 0) counts.set(s.disease, (counts.get(s.disease) ?? 0) + 1);
  for (const d of w.diseases) {
    if (!d.alive) continue;
    const n = counts.get(d.id) ?? 0;
    d.peak = Math.max(d.peak, n);
    if (d.great) {
      if (!d.epidemic && n >= EPIDEMIC_AT) {
        d.epidemic = true;
        // 대역병이 되는 순간: 피난민과 상인을 따라 한꺼번에 사방으로 터져 나간다
        const sickNow = w.settlements.filter(s => s.alive && s.disease === d.id && s.plague > 0);
        let burst = 0;
        for (const o of w.settlements) {
          if (!susceptible(w, o, d) || !sickNow.some(s => s.l === o.l && dist(s, o) <= 40)) continue;
          if (rng.chance(0.45) && infect(w, o, d)) burst++;
        }
        addNews(w, `'${d.name}'이(가) ${n}곳의 고을을 덮쳐 대역병이 되었다. 피난민의 행렬을 따라 병이 사방으로 터져 나가, 한 달 사이 ${burst}곳이 더 쓰러졌다. 길마다 수레에 실린 주검이 줄을 이었다.`, 4, 'doom');
      }
      // 대역병은 길을 따라 먼 곳까지 건너뛴다: 교역로의 상대 도성, 층을 잇는 통로 너머
      if (d.epidemic && n > 0 && rng.chance(0.25)) {
        const sickNow = w.settlements.filter(s => s.alive && s.disease === d.id && s.plague > 0);
        const from = rng.pick(sickNow);
        const f = w.factions[from.faction];
        const far: Settlement[] = [];
        for (const t of f?.treaties ?? []) { const cap = w.settlements[w.factions[t.with]?.capital ?? -1]; if (cap) far.push(cap); }
        for (const p of w.portals) if (p.open && p.a.l !== p.b.l) for (const [a, b] of [[p.a, p.b], [p.b, p.a]]) {
          if (a.l === from.l && dist(a, from) <= 15) far.push(...w.settlements.filter(o => o.alive && o.l === b.l && dist(o, b) <= 15));
        }
        const to = rng.pick(far.filter(o => susceptible(w, o, d)).concat([]));
        if (to && infect(w, to, d) && rng.chance(0.5)) addNews(w, `'${d.name}'이(가) ${to.l !== from.l ? '층을 잇는 통로를 건너' : '교역로를 따라'} 멀리 ${to.name}까지 번졌다.`, 3, 'doom', { pos: to, facs: [to.faction] });
      }
      // 반백 년이 지나 면역이 퍼지면 사라진다
      if (w.t >= (d.until ?? 0)) {
        endGreat(w, d);
        continue;
      }
      // 잠잠해 보여도 병은 어딘가에 숨어 있다가 다시 번진다
      if (n < 3 && rng.chance(0.06)) {
        const sick = w.settlements.filter(s => s.alive && s.disease === d.id);
        const src = sick.length ? sick : [w.settlements[d.origin]].filter(Boolean);
        const pool = w.settlements.filter(s => susceptible(w, s, d) && s.pop > 300 && src.some(o => o.l === s.l && dist(o, s) < 40));
        const s = rng.weighted(pool, s => s.pop);
        if (s) {
          infect(w, s, d);
          if (rng.chance(0.3)) addNews(w, `잠잠해진 줄 알았던 '${d.name}'이(가) ${s.name}에서 다시 고개를 들었다.`, 3, 'nature', { pos: s, facs: [s.faction] });
        }
      }
      continue;
    }
    if (n === 0) {
      d.alive = false;
      d.ended = w.t;
      addNews(w, `'${d.name}'이(가) 잦아들었다.`, 2, 'nature');
    }
  }
  greatPlagueCheck(w);
}

function endGreat(w: World, d: Disease) {
  d.alive = false;
  d.ended = w.t;
  for (const s of w.settlements) {
    if (s.disease === d.id) { s.plague = 0; s.disease = -1; }
    s.immune ??= {};
    s.immune[d.id] = w.t + 12 * 2000;
  }
  w.stats.lastGreatEnd = w.t;
  w.stats.greatPlagueEnded = (w.stats.greatPlagueEnded ?? 0) + 1;
  const years = Math.round((w.t - d.t) / 12);
  addNews(w, `${years}년 동안 세상을 돌던 대역병 '${d.name}'이(가) 마침내 사라졌다. 살아남은 이들의 핏속에 면역이 자리 잡았다. 이 병으로 세상을 떠난 이는 어림잡아 ${Math.round((d.toll ?? 0) / 100) * 100}명에 이르렀다.`, 4, 'nature');
}

/** 대역병의 싹: 300년에 한 번쯤, 혹은 한 겨레가 좁은 땅에 너무 많아지면 */
function greatPlagueCheck(w: World): void {
  const rng = w.rngSim;
  if (w.diseases.some(d => d.alive && d.great)) return;
  if (w.t - (w.stats.lastGreatEnd ?? -99999) < 12 * 60) return;
  let p = 1 / (12 * 300);
  const D = densest(w);
  const crowded = D.s && D.n > DENSE_POP;
  if (crowded) p += 0.004 * Math.min(3, D.n / DENSE_POP);
  if (!rng.chance(p)) return;
  const s = crowded ? D.s! : rng.weighted(w.settlements.filter(s => s.alive && canSicken(s) && s.pop > 500), s => s.pop);
  if (!s) return;
  outbreak(w, s, crowded ? `${RACES[s.race].name}이(가) 너무 빽빽하게 모여 살던 땅이었다.` : '', true);
}

export function epidemicActive(w: World): boolean {
  return w.diseases.some(d => d.alive && d.great && d.epidemic);
}
