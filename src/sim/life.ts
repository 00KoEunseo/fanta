// 플레이어 인생 이벤트 엔진: 짧은 데이터 정의로 많은 선택지를 만든다
import { RACES, type RaceKey } from '../data/races';
import { TERRAIN } from '../data/terrain';
import { RACE_JOBS, type Role } from '../data/traits';
import { AMBITION, COURAGE, CURIOSITY, PRUDENCE, TRAIT_NAMES } from '../data/traits';
import { fixJosa } from '../data/text';
import { addNews, charLog } from './news';
import type { Character, Faction, PlayerChoice, PlayerPrompt, PlayerState, Settlement, World } from './state';
import { ageOf, dist } from './state';
import { addRel, approxDist, charLabel, clamp, isAdult, isHero, leaderOf, settlementsOf } from './helpers';
import { awaken, createCharacter, dragonRaid, duel, killChar, reachableSite, relocate, setPos, setTravel, startExpedition, tryMarry } from './characters';
import { attemptCoup, declareWar, launchAttack, launchRaid } from './factions';
import { becomeDemonLord, spawnDragon } from './events';
import { betrayDragon, makePatron } from './calamity';
import { raiseArmy } from './military';
import { rebuildPortalLinks } from './path';
import { invalidateDist } from './factions';
import { artLabel, giveArtifact, makeArtifact, type ArtKind } from './artifacts';
import { cure, outbreak } from './disease';
import { enslaveChar, freeChar, spawnFree } from './slavery';
import { collapse, startTower, towerOwner } from './towers';
import { formParty, strongEnoughAlone } from './crusade';
import { ensureHouse } from './houses';
import { startVoyage, stirAbyss } from './sea';

export interface Ctx {
  w: World;
  c: Character;
  P: PlayerState;
  age: number;
  /** 성인 나이 대비 비율 (0~1 아이, 1 이상 성인) */
  stage: number;
  f: Faction | undefined;
  home: Settlement | undefined;
  ld: Character | null;
  isLeader: boolean;
  isGov: boolean;
  /** 부모의 직업 */
  pj: Role | null;
  years: number;
}

export type Cond = (x: Ctx) => boolean;
/** 효과 처리기: 처리하지 않으면 null */
export type FxHook = (x: Ctx, fx: string, data: Record<string, number | string>) => string | undefined | null;
export const FX_HOOKS: FxHook[] = [];
export type Check = 'mi' | 'in' | 'ma' | 'co' | 'ch' | 'luck' | `t${number}`;

export interface Eff {
  r: string;
  wealth?: number; honor?: number; fame?: number; hp?: number; mood?: number;
  mi?: number; in?: number; ma?: number; co?: number; ch?: number;
  tr?: [number, number][];
  job?: Role;
  item?: string;
  ep?: string;
  fx?: string;
  news?: number;
  flag?: string;
  unflag?: string;
  /** 이 결과를 얻으면 달성되는 업적 */
  ach?: string;
  /** 인연의 씨앗을 심는다 [id, 일대기 요약에 보일 한 줄] */
  seed?: [string, string];
  /** 이 씨앗을 거둔다 */
  reap?: string;
}
export interface Opt { l: string; d?: string; s?: [Check, number]; ok: Eff; no?: Eff; show?: Cond; /** 이 수치 이상이어야 고를 수 있다 */ need?: [Check, number] }
export interface LifeEv {
  id: string;
  t: string;
  c: Cond;
  x: string | ((x: Ctx) => string);
  o: Opt[] | ((x: Ctx) => Opt[]);
  w?: number;
  once?: boolean;
  cd?: number;
  /** 대상 고르기 등: prompt.data 에 들어간다 */
  data?: (x: Ctx) => Record<string, number | string> | null;
}

// ───────────── 조건 도우미

export const hi = (i: number, v = 65): Cond => x => x.c.traits[i] >= v;
export const lo = (i: number, v = 35): Cond => x => x.c.traits[i] <= v;
export const job = (...r: Role[]): Cond => x => r.includes(x.c.role);
export const race = (...r: RaceKey[]): Cond => x => r.includes(x.c.race);
export const all = (...fs: Cond[]): Cond => x => fs.every(f => f(x));
export const any = (...fs: Cond[]): Cond => x => fs.some(f => f(x));
export const kid = (a: number, b: number): Cond => x => x.stage >= a && x.stage < b;
export const adult: Cond = x => x.stage >= 1;
export const elder: Cond = x => x.age > x.c.lifespan * 0.6;
export const stat = (k: keyof Character['stats'], v: number): Cond => x => x.c.stats[k] >= v;
export const pjob = (...r: Role[]): Cond => x => !!x.pj && r.includes(x.pj) && [x.c.father, x.c.mother].some(id => id >= 0 && x.w.chars[id]?.died < 0);
export const flag = (k: string): Cond => x => (x.P.flags?.[k] ?? -1) >= 0;
export const noflag = (k: string): Cond => x => (x.P.flags?.[k] ?? -1) < 0;
export const since = (k: string, months: number): Cond => x => { const v = x.P.flags?.[k]; return v !== undefined && v >= 0 && x.w.t - v >= months; };
export const yearsInJob = (n: number): Cond => x => x.years >= n;
export const married: Cond = x => x.c.spouse >= 0;
/** 이 씨앗이 무르익었는가 */
export const seedDue = (id: string): Cond => x => !!x.P.seeds?.some(s => s.id === id && s.due <= x.w.t);
export const hasSeed = (id: string): Cond => x => !!x.P.seeds?.some(s => s.id === id);
export const seedData = (id: string) => (x: Ctx) => { const s = x.P.seeds?.find(q => q.id === id); return s ? { ...s.data } : null; };
export const rankIs = (n: number): Cond => x => (x.P.jobRank ?? 0) === n;
export const single: Cond = x => x.c.spouse < 0;
export const ruler: Cond = x => x.isLeader;
export const dl: Cond = x => x.w.demonLord === x.c.id;
export const hero: Cond = x => isHero(x.c);
export const guardian: Cond = x => x.c.awakened.includes('guardian');
export const dragon: Cond = x => x.c.race === 'dragon';
export const notDragon: Cond = x => x.c.race !== 'dragon';
export const atWarC: Cond = x => !!x.f && Object.keys(x.f.wars).length > 0;
export const noble: Cond = x => x.P.flags?.noble !== undefined;
export const orphan: Cond = x => x.P.flags?.orphan !== undefined;
export const rich = (v: number): Cond => x => x.c.wealth >= v;
export const homeTerrain = (...tids: number[]): Cond => x => {
  const h = x.home;
  if (!h) return false;
  const L = x.w.layers[h.l];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = h.x + dx, ny = h.y + dy;
    if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
    if (tids.includes(L.terrain[ny * L.w + nx])) return true;
  }
  return false;
};

// ───────────── 장소와 종족

/** 사는 곳의 층 (집이 없으면 지금 있는 층) */
export const layerOf = (x: Ctx) => (x.home ? x.home.l : x.c.l);
export const surface: Cond = x => layerOf(x) === 2;
export const under: Cond = x => layerOf(x) === 3;
export const heavenL: Cond = x => layerOf(x) === 0;
export const skyL: Cond = x => layerOf(x) === 1;
export const demonL: Cond = x => layerOf(x) === 4;
/** 하늘과 날씨가 있는 곳 */
export const outdoors: Cond = x => layerOf(x) === 2 || layerOf(x) === 1;
export const notHeaven: Cond = x => layerOf(x) !== 0;
export const lightRace: Cond = x => RACES[x.c.race].align !== 'dark';
export const atWarC2: Cond = x => !!x.f && Object.keys(x.f.wars).length > 0;
export const parentAlive: Cond = x => [x.c.father, x.c.mother].some(id => id >= 0 && x.w.chars[id]?.died < 0);
export const homeTier = (n: number): Cond => x => (x.home?.tier ?? 0) >= n;
export const dragonNear = (r = 50): Cond => x => x.w.chars.some(d => d.died < 0 && d.race === 'dragon' && !d.ancient && d.id !== x.c.id && approxDist(x.w, x.c, d, true) < r);
export const dragonsExist: Cond = x => x.w.chars.some(d => d.died < 0 && d.race === 'dragon' && d.id !== x.c.id);
export const plagueNear: Cond = x => x.w.settlements.some(s => s.alive && s.plague > 0 && approxDist(x.w, x.c, s) < 60);
export const governorHere: Cond = x => { const g = x.w.chars[x.home?.governor ?? -1]; return !!g && g.died < 0 && g.id !== x.c.id; };
export const canJob = (r: Role): Cond => x => (RACE_JOBS[x.c.race] ?? []).includes(r);
export const factionOfRace = (...r: RaceKey[]): Cond => x => x.w.factions.some(f => f.alive && r.includes(f.race));

/** 층마다 다른 문장 */
export function byPlace(x: Ctx, t: { surface: string; under?: string; demon?: string; heaven?: string; sky?: string }): string {
  const l = layerOf(x);
  if (l === 3 && t.under) return t.under;
  if (l === 4 && t.demon) return t.demon;
  if (l === 0 && t.heaven) return t.heaven;
  if (l === 1 && (t.sky || t.heaven)) return (t.sky ?? t.heaven)!;
  return t.surface;
}

const TEMPLE: Partial<Record<RaceKey, [string, string]>> = {
  darkelf: ['거미 여왕의 신전', '거미 여왕'], majin: ['어둠의 제단', '마계의 군주들'], demon: ['피의 제단', '마계의 군주들'],
  undead: ['망자의 제단', '죽음'], orc: ['주술 천막', '조상신'], goblin: ['주술 천막', '조상신'], kobold: ['용의 사당', '용신'],
  beast: ['정령의 바위', '대지의 정령'], elf: ['숲의 신전', '숲의 여신'], angel: ['빛의 성소', '빛'],
};

// ───────────── 실행

export function makeCtx(w: World, c: Character): Ctx {
  const P = w.player!;
  const f = w.factions[c.faction];
  const home = w.settlements[c.home];
  const age = ageOf(w, c);
  const R = RACES[c.race];
  const parent = w.chars[c.father] ?? w.chars[c.mother];
  return {
    w, c, P, age, stage: R.adult > 0 ? age / R.adult : 1,
    f, home, ld: f ? leaderOf(w, f) : null,
    isLeader: !!f && f.leader === c.id,
    isGov: w.settlements.some(s => s.alive && s.governor === c.id),
    pj: parent ? parent.role : null,
    years: P.jobSince !== undefined ? (w.t - P.jobSince) / 12 : 0,
  };
}

function fill(x: Ctx, s: string, data: Record<string, number | string> = {}): string {
  const sp = x.w.chars[x.c.spouse];
  const l = layerOf(x);
  const [temple, deity] = TEMPLE[x.c.race] ?? ['신전', '신'];
  const vars: Record<string, string> = {
    temple, deity,
    market: l === 3 ? '지하 시장' : l === 4 ? '유황 시장' : l === 0 ? '구름 광장' : l === 1 ? '바람 시장' : '장터',
    wild: l === 3 ? '깊은 굴' : l === 4 ? '잿빛 황야' : l === 0 || l === 1 ? '구름 너머' : '숲',
    n: x.c.name, h: x.home?.name ?? '떠돌이 길', f: x.f?.name ?? '어느 세력', ld: x.ld?.name ?? '군주',
    sp: sp?.name ?? '연인', pj: x.pj ?? '농사꾼', race: RACES[x.c.race].name, job: x.c.role,
  };
  for (const [k, v] of Object.entries(data)) if (typeof v === 'string') vars[k] = v;
  for (const [k, v] of Object.entries(data)) if (typeof v === 'number' && k.endsWith('Id')) vars[k.slice(0, -2)] = x.w.chars[v]?.name ?? x.w.settlements[v]?.name ?? '';
  return fixJosa(s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`));
}

function statVal(x: Ctx, k: Check): number {
  const st = x.c.stats;
  if (k === 'mi') return st.might; if (k === 'in') return st.intellect; if (k === 'ma') return st.magic;
  if (k === 'co') return st.command; if (k === 'ch') return st.charisma; if (k[0] === 't') return x.c.traits[+k.slice(1)];
  return 50;
}
function meets(x: Ctx, need?: [Check, number]): boolean {
  return !need || statVal(x, need[0]) >= need[1];
}

export function checkChance(x: Ctx, s?: [Check, number]): number | undefined {
  if (!s) return undefined;
  const [k, base] = s;
  const st = x.c.stats;
  // '운'도 기분·매력·지력에 따라 달라진다
  let v = 50 + (x.c.mood - 50) * 0.3 + (st.charisma - 50) * 0.15 + (st.intellect - 50) * 0.15;
  if (k === 'mi') v = st.might; else if (k === 'in') v = st.intellect; else if (k === 'ma') v = st.magic;
  else if (k === 'co') v = st.command; else if (k === 'ch') v = st.charisma; else if (k[0] === 't') v = x.c.traits[+k.slice(1)];
  return clamp(base + (v - 50) / 100, 0.05, 0.95);
}

const optCache = new Map<string, Opt[]>();

const sign = (n: number) => (n > 0 ? `+${Math.round(n)}` : `−${Math.abs(Math.round(n))}`);
/** 결과 수치를 실제로 적용될 값으로 미리 계산한다. 깜짝 결과(업적이 걸린 것)는 가린다 */
export function effPreview(x: Ctx, e: Eff): string {
  if (e.ach) return '결과를 알 수 없다';
  const st = x.c.stats;
  const out: string[] = [];
  if (e.wealth) out.push(`재산 ${sign(e.wealth > 0 && e.wealth < 900 ? e.wealth * clamp(1 + (st.intellect + st.charisma - 100) / 250, 0.6, 1.6) : e.wealth)}`);
  if (e.fame) out.push(`명성 ${sign(e.fame > 0 ? e.fame * clamp(1 + (st.charisma - 50) / 150, 0.6, 1.5) : e.fame)}`);
  if (e.honor) out.push(`명예 ${sign(e.honor)}`);
  if (e.hp) out.push(`체력 ${sign(e.hp < 0 ? e.hp * clamp(1 - (st.might - 50) / 200, 0.5, 1.4) : e.hp)}`);
  if (e.mood) out.push(`기분 ${sign(e.mood)}`);
  const S: [keyof Eff, string][] = [['mi', '무력'], ['in', '지력'], ['ma', '마력'], ['co', '통솔'], ['ch', '매력']];
  for (const [k, n] of S) if (e[k]) out.push(`${n} ${sign(e[k] as number)}`);
  if (e.tr) for (const [i, d] of e.tr) out.push(`${TRAIT_NAMES[i]} ${d > 0 ? '↑' : '↓'}`);
  if (e.job) out.push(`직업: ${e.job}`);
  return out.join(' · ');
}

export function buildPrompt(x: Ctx, ev: LifeEv): PlayerPrompt | null {
  const data = ev.data ? ev.data(x) : {};
  if (data === null) return null;
  // 등장인물이 이미 세상에 없으면 이 이야기는 일어나지 않는다
  for (const [k, v] of Object.entries(data)) if (k.endsWith('Id') && typeof v === 'number' && v >= 0 && x.w.chars[v] && x.w.chars[v].died >= 0 && k !== 'siteId') return null;
  const jobOk = (o: Opt) => !o.ok.job || o.ok.job === '백수' || o.ok.job === '평민' || (RACE_JOBS[x.c.race] ?? []).includes(o.ok.job);
  // 탐험을 떠나는 선택지는 실제로 갈 수 있는 유적이 있을 때만 보인다
  let reach: boolean | undefined;
  const canGo = (o: Opt) => o.ok.fx !== 'adventure' || (reach ??= x.c.act.kind === 'idle' && !!reachableSite(x.w, x.c));
  const opts = (typeof ev.o === 'function' ? ev.o(x) : ev.o).filter(o => (!o.show || o.show(x)) && meets(x, o.need) && jobOk(o) && canGo(o));
  if (!opts.length) return null;
  optCache.set(ev.id, opts);
  const choices: PlayerChoice[] = opts.map((o, i) => ({
    id: 'o' + i, label: fill(x, o.l, data), desc: fill(x, o.d ?? '', data), chance: checkChance(x, o.s),
    preview: effPreview(x, o.ok), failPreview: o.no && checkChance(x, o.s) !== undefined ? effPreview(x, o.no) : undefined,
  }));
  return { eventId: ev.id, title: ev.t, text: fill(x, typeof ev.x === 'function' ? ev.x(x) : ev.x, data), choices, data };
}

export function resolveLife(x: Ctx, ev: LifeEv, choiceId: string, data: PlayerPrompt['data']): string {
  const opts = optCache.get(ev.id) ?? (typeof ev.o === 'function' ? ev.o(x) : ev.o).filter(o => (!o.show || o.show(x)) && meets(x, o.need));
  const o = opts[+choiceId.slice(1)];
  if (!o) return '';
  const p = checkChance(x, o.s);
  const eff = p === undefined || x.w.rngSim.chance(p) ? o.ok : (o.no ?? o.ok);
  return applyEff(x, eff, data);
}

export function applyEff(x: Ctx, e: Eff, data: PlayerPrompt['data']): string {
  const { c, w } = x;
  const st = c.stats;
  if (e.wealth) c.wealth = Math.max(0, c.wealth + (e.wealth > 0 && e.wealth < 900 ? e.wealth * clamp(1 + (st.intellect + st.charisma - 100) / 250, 0.6, 1.6) : e.wealth));
  if (e.honor) c.honor += e.honor;
  if (e.fame) c.fame = Math.max(0, c.fame + (e.fame > 0 ? e.fame * clamp(1 + (st.charisma - 50) / 150, 0.6, 1.5) : e.fame));
  if (e.hp) c.stats.health = clamp(c.stats.health + (e.hp < 0 ? e.hp * clamp(1 - (st.might - 50) / 200, 0.5, 1.4) : e.hp));
  if (e.mood) c.mood = clamp(c.mood + e.mood);
  if (e.mi) c.stats.might = clamp(c.stats.might + e.mi);
  if (e.in) c.stats.intellect = clamp(c.stats.intellect + e.in);
  if (e.ma) c.stats.magic = clamp(c.stats.magic + e.ma);
  if (e.co) c.stats.command = clamp(c.stats.command + e.co);
  if (e.ch) c.stats.charisma = clamp(c.stats.charisma + e.ch);
  if (e.tr) for (const [i, d] of e.tr) c.traits[i] = clamp(c.traits[i] + d);
  if (e.job) setJob(x, e.job);
  if (e.item && !c.items.includes(e.item)) c.items.push(e.item);
  if (e.ep) c.epithet = e.ep;
  x.P.flags ??= {};
  if (e.flag) x.P.flags[e.flag] = w.t;
  if (e.unflag) delete x.P.flags[e.unflag];
  if (e.ach) x.P.flags['ach_' + e.ach] = w.t;
  if (e.reap) x.P.seeds = (x.P.seeds ?? []).filter(s => s.id !== e.reap);
  if (e.seed) {
    x.P.seeds ??= [];
    x.P.seeds = x.P.seeds.filter(s => s.id !== e.seed![0]);
    x.P.seeds.push({ id: e.seed[0], t: w.t, due: w.t + w.rngSim.int(18, 54), data: { ...data }, note: fill(x, e.seed[1], data) });
  }
  let extra = '';
  if (e.fx) extra = fill(x, runFx(x, e.fx, data) ?? '', data);
  let text = [fill(x, e.r, data), extra].filter(Boolean).join(' ');
  text = fixJosa(text);
  if (e.news) addNews(w, `${c.name}: ${text}`, e.news, 'player', { pos: c, chars: [c.id] });
  if (c.stats.health <= 0 && c.died < 0) killChar(w, c, '무리한 끝에 입은 상처');
  return text;
}

export function setJob(x: Ctx, r: Role): void {
  const { c, P, w } = x;
  c.role = r;
  c.title = 'adult';
  P.jobSince = w.t;
  P.jobsHad ??= [];
  if (r !== '백수' && !P.jobsHad.includes(r)) P.jobsHad.push(r);
  if (r !== '백수') P.jobFails = 0;
  P.jobPonder = 0;
  P.jobRank = 0;
}

function bumpFlag(x: Ctx, k: string, d = 1) {
  x.P.flags ??= {};
  x.P.flags[k] = (x.P.flags[k] ?? 0) + d;
}

// ───────────── 특수 효과

function runFx(x: Ctx, fx: string, data: PlayerPrompt['data']): string | void {
  // 다른 모듈이 등록한 효과 (원정, 재앙, 이어지는 이야기)
  for (const h of FX_HOOKS) { const r = h(x, fx, data); if (r !== null) return r; }
  const { w, c } = x;
  const rng = w.rngSim;
  const near = (pred: (s: Settlement) => boolean) => w.settlements.filter(s => s.alive && pred(s)).sort((a, b) => approxDist(w, c, a, true) - approxDist(w, c, b, true));
  switch (fx) {
    case 'adventure': return startExpedition(w, c);
    case 'jobless': setJob(x, '백수'); return;
    case 'jobfail': return afterJobFail(x);
    case 'job_ponder': {
      x.P.jobPonder = (x.P.jobPonder ?? 0) + 1;
      if (x.P.jobPonder >= 3) { setJob(x, '백수'); x.P.flags ??= {}; x.P.flags.ponderJobless = Math.max(1, w.t); return; }
      // 곧 다른 자리들이 눈에 띈다
      delete x.P.lastEvents.job_search;
      return;
    }
    case 'tower_start': if (x.f) { const tw = startTower(w, x.f); return tw ? `${tw.name}의 첫 돌이 놓였다.` : '탑을 세울 땅을 찾지 못하였다.'; } return;
    case 'tower_dismantle': {
      const tw = w.towers.find(t => t.alive && towerOwner(w, t) === x.f);
      if (tw) collapse(w, tw, `${x.f!.name}의 ${c.name}이(가) 천사의 경고를 받아들여 ${tw.name}을(를) 허물었다.`, 3);
      return;
    }
    case 'tower_parley': { const tw = w.towers.find(t => t.alive && towerOwner(w, t) === x.f); if (tw) tw.warnedAt = w.t; return; }
    case 'free_me': freeChar(w, c, '마침내'); x.P.flags!.freed = w.t; return;
    case 'escape_me': {
      freeChar(w, c, '탈출하여');
      x.P.flags!.freed = w.t;
      c.faction = -1; c.home = -1;
      return '쫓기는 몸이지만 자유다. 어디든 받아 주는 곳을 찾아야 한다.';
    }
    case 'enslave_road': {
      const s = w.settlements[+data.sId];
      if (s && s.alive) enslaveChar(w, c, s);
      return;
    }
    case 'buy_slaves': if (x.home) { x.home.slaves = (x.home.slaves ?? 0) + 5; x.home.slaveRace ??= x.home.race; } bumpFlag(x, 'slaveOwner'); return;
    case 'free_bought': if (x.home) x.home.pop += 5; return;
    case 'abolish': if (x.f && !x.f.flags.includes('abolished')) { x.f.flags.push('abolished'); addNews(w, `${x.f.name}의 ${c.name}이(가) 노예제를 폐지하였다.`, 3, 'politics', { facs: [x.f.id], chars: [c.id] }); } return;
    case 'raid_slaves': if (x.f) launchRaid(w, x.f); return;
    case 'lead_revolt': {
      const s = x.home;
      if (!s) return;
      const n = s.slaves ?? 0;
      s.slaves = 0;
      c.role = '전사';
      x.P.flags!.freed = w.t;
      const nf = spawnFree(w, s, c.race, Math.max(30, Math.round(n * 0.7)), c);
      if (nf) addNews(w, `노예 ${c.name}이(가) ${s.name}에서 봉기를 일으켜 ${Math.round(n * 0.7)}명을 이끌고 ${nf.name}을(를) 세웠다!`, 4, 'politics', { pos: s, chars: [c.id], facs: [nf.id] });
      return nf ? `${nf.name}의 첫 군주가 되었다.` : '자유를 찾아 흩어졌다.';
    }
    case 'crush_revolt': {
      if (x.home) { const k = Math.round((x.home.slaves ?? 0) * 0.4); x.home.slaves = (x.home.slaves ?? 0) - k; w.corpses += k; addNews(w, `${x.home.name}의 노예 봉기가 피로 진압되었다. ${k}명이 처형되었다.`, 3, 'politics', { pos: x.home }); }
      return;
    }
    case 'make_art0': case 'make_art1': case 'make_art2': {
      const name = String(data['a' + fx.slice(-1)]);
      const kind = String(data.kind) as ArtKind;
      const tangible = data.tangible !== 0 && data.tangible !== '0';
      const base = statVal(x, (String(data.stat) || 'in') as Check);
      const art = makeArtifact(w, c, kind, name, tangible ? Math.round(clamp((base - 35) / 2, 5, 35)) : 0, tangible);
      x.P.flags ??= {};
      x.P.flags.ach_masterwork = w.t;
      return tangible ? `이제 사람들은 그것을 ${artLabel(art)}(이)라 부른다.` : `「${art.name}」은(는) 오래도록 기억될 것이다.`;
    }
    case 'art_to_leader': {
      const a = w.artifacts[+data.artId];
      if (a && x.ld) giveArtifact(w, a, x.ld, `${c.name}이(가) 군주에게 바쳐`, 3);
      return;
    }
    case 'art_seized': {
      const a = w.artifacts[+data.artId];
      if (a && x.ld) giveArtifact(w, a, x.ld, '군주가 강제로 빼앗아', 3);
      return;
    }
    case 'art_to_dragon': {
      const a = w.artifacts[+data.artId];
      const d = w.chars[+data.dId];
      if (a && d) giveArtifact(w, a, d, `${c.name}이(가) 용에게 비보로 바쳐`, 3);
      return;
    }
    case 'art_sold': {
      const a = w.artifacts[+data.artId];
      if (a) giveArtifact(w, a, null, `${c.name}이(가) 먼 나라의 수집가에게 팔아 행방이 묘연해졌다.`);
      return;
    }
    case 'art_bestow': {
      const a = w.artifacts[+data.artId];
      const o = w.chars[+data.oId];
      if (a && o) giveArtifact(w, a, o, `${c.name}이(가) 공을 치하하며 수여하여`, 3);
      return;
    }
    case 'become_gov': {
      const s = w.settlements[+data.sId];
      if (!s || !s.alive || s.faction !== c.faction) return '그 땅은 이미 다른 이의 손에 넘어가 있었다.';
      const old = w.chars[s.governor];
      if (old && old.died < 0 && old.id !== c.id) charLog(w, old, `${s.name}의 영주 자리를 ${c.name}에게 내주었다.`, 2);
      s.governor = c.id; c.home = s.id; relocate(w, c, s);
      const hh = ensureHouse(w, c, s);
      addNews(w, `${c.name}이(가) 오랜 공을 인정받아 ${s.name}의 영주가 되었다.${hh && hh.founder === c.id ? ` ${hh.name}이(가) 세워졌다.` : ''}`, 2, 'player', { pos: s, chars: [c.id] });
      return;
    }
    case 'appoint_hero2': return runFx(x, 'appoint_hero', { oId: data.pId });
    case 'appoint_hero3': return runFx(x, 'appoint_hero', { oId: data.qId });
    case 'fell_tree': {
      const T = w.worldTree;
      if (T && T.alive) { T.felling = true; addNews(w, `${charLabel(w, c)}이(가) 세계수 벌목을 명하였다.`, 4, 'doom', { chars: [c.id] }); }
      return;
    }
    case 'slay_patron': {
      const fl = x.f?.flags.find(f2 => f2.startsWith('patron:'));
      const d = fl ? w.chars[+fl.split(':')[1]] : undefined;
      if (!d || d.died >= 0 || !x.f) return '용은 이미 떠나고 없었다.';
      const r = betrayDragon(w, d, x.f, 'slay');
      if (r === 'killed') bumpFlag(x, 'dragonKills');
      return r === 'killed' ? `${d.name}이(가) 쓰러졌다. 보물이 쏟아졌다.` : `${d.name}은(는) 살아남아 분노하였다.`;
    }
    case 'seek': setJob(x, '백수'); delete x.P.lastEvents.job_search; return;
    case 'become_adventurer': {
      setJob(x, '모험가');
      return runFx(x, 'adventure', data) as string | undefined;
    }
    case 'marry': {
      const o = w.chars[+data.oId];
      if (o && o.died < 0 && o.spouse < 0 && c.spouse < 0) tryMarry(w, c, o);
      return;
    }
    case 'friend': { const o = w.chars[+data.oId]; if (o) addRel(w, c, o, 30); return; }
    case 'rival': { const o = w.chars[+data.oId]; if (o) addRel(w, c, o, -55); return; }
    case 'duel': {
      const o = w.chars[+data.oId];
      if (!o || o.died >= 0) return;
      const win = duel(w, c, o, '결투');
      return win === c ? `${o.name}을(를) 쓰러뜨렸다.` : '';
    }
    case 'child': {
      const sp = w.chars[c.spouse];
      if (!sp || sp.died >= 0 || c.race === 'dragon') return;
      const mom = c.sex === 'F' ? c : sp, dad = c.sex === 'F' ? sp : c;
      const kid = createCharacter(w, { race: c.race, faction: c.faction, home: c.home, pos: c, born: w.t, father: dad.id, mother: mom.id });
      kid.title = 'child';
      return `${kid.name}이(가) 태어났다.`;
    }
    case 'hero': awaken(w, c, 'hero', '그날,'); return;
    case 'sage': awaken(w, c, 'sage', '오랜 고민 끝에'); return;
    case 'seed': awaken(w, c, 'seed', '어둠의 유혹에 응하여'); return;
    case 'coup': attemptCoup(w, c); return c.died >= 0 ? '' : x.f && x.f.leader === c.id ? '왕좌가 그의 것이 되었다!' : '반역은 실패하였다.';
    case 'move': {
      const s = w.settlements[+data.sId];
      if (s && s.alive) { c.home = s.id; c.faction = s.faction; relocate(w, c, s); }
      return;
    }
    case 'war': {
      const e = w.factions[+data.eId];
      if (x.f && e && e.alive) { declareWar(w, x.f, e); launchAttack(w, x.f, e, 'conquer'); }
      return;
    }
    case 'wake_ancient': {
      if (w.chars.some(d => d.died < 0 && d.ancient)) return '하지만 이미 세상에는 깨어난 고대 용이 있었다.';
      const d = spawnDragon(w, true, c);
      if (!d) return;
      bumpFlag(x, 'wokeAncient');
      if (c.role === '광부') bumpFlag(x, 'minerDragon');
      addNews(w, `${charLabel(w, c)}의 손에 땅속 깊은 곳의 고대 용 ${d.name}이(가) 깨어났다!`, 5, 'doom', { pos: d, chars: [c.id, d.id] });
      return `고대 용 ${d.name}이(가) 눈을 떴다!`;
    }
    case 'open_rift': {
      const closed = w.portals.filter(p => p.kind === 'rift' && !p.open);
      if (!closed.length) return '열 수 있는 균열이 남아 있지 않았다.';
      const p = rng.pick(closed);
      p.open = true; rebuildPortalLinks(w); invalidateDist(w);
      addNews(w, `${charLabel(w, c)}의 의식으로 '${p.name}'이(가) 열렸다.`, 4, 'dark', { pos: p.a, chars: [c.id] });
      return `'${p.name}'이(가) 열렸다.`;
    }
    case 'seal_rift': {
      const open = w.portals.filter(p => p.kind === 'rift' && p.open);
      if (!open.length) return '닫을 균열이 없었다.';
      if (w.demonLord >= 0) return '마왕의 힘이 균열을 붙들고 있다. 봉인의 문장이 산산이 부서졌다.';
      const p = rng.pick(open);
      p.open = false; rebuildPortalLinks(w); invalidateDist(w);
      bumpFlag(x, 'saved');
      addNews(w, `${charLabel(w, c)}이(가) '${p.name}'을(를) 봉인하였다.`, 4, 'hero', { pos: p.a, chars: [c.id] });
      return `'${p.name}'이(가) 닫혔다.`;
    }
    case 'plague_home': if (x.home && x.home.plague <= 0) outbreak(w, x.home, `연금술사 ${c.name}의 실험실에서 새어 나왔다는 소문이 돌았다.`); return;
    case 'plague_enemy': {
      const enemies = x.f ? Object.keys(x.f.wars).map(Number) : [];
      const t = near(s => enemies.includes(s.faction))[0] ?? near(s => s.faction !== c.faction)[0];
      if (!t) return;
      if (t.plague > 0) return `${t.name}은(는) 이미 병을 앓고 있었다.`;
      const d = outbreak(w, t, '누군가 우물에 무언가를 풀었다는 소문이 돌았다.');
      return `${t.name}에 '${d.name}'이(가) 퍼졌다.`;
    }
    case 'cure_plague': {
      const sick = near(s => s.plague > 0).slice(0, 5);
      for (const s of sick) cure(w, s);
      if (sick.length) { bumpFlag(x, 'saved'); addNews(w, `${charLabel(w, c)}이(가) ${sick.map(s => s.name).join(', ')}의 역병을 씻어냈다.`, 4, 'hero', { chars: [c.id] }); }
      return sick.length ? `${sick.length}곳의 역병이 사라졌다.` : '역병은 이미 잦아들어 있었다.';
    }
    case 'grievance': w.doom.dragonGrievance++; return `(용의 원한 ${w.doom.dragonGrievance}/3)`;
    case 'kill_dragon': {
      const d = w.chars.filter(o => o.died < 0 && o.race === 'dragon' && !o.ancient && o.id !== c.id).sort((a, b) => approxDist(w, c, a, true) - approxDist(w, c, b, true))[0];
      if (!d) return '용은 이미 자취를 감추었다.';
      const win = duel(w, c, d, '용과의 사투');
      if (win === c) { bumpFlag(x, 'dragonKills'); if (!c.epithet) c.epithet = '용살자'; return `${d.name}을(를) 쓰러뜨렸다!`; }
      return '';
    }
    case 'calm_ancient': {
      const d = w.chars.find(o => o.died < 0 && o.ancient);
      if (!d) return;
      d.wrathUntil = w.t;
      bumpFlag(x, 'calmAncient'); bumpFlag(x, 'saved');
      addNews(w, `${charLabel(w, c)}이(가) 고대 용 ${d.name}의 분노를 가라앉혔다.`, 5, 'hero', { chars: [c.id, d.id] });
      return `${d.name}이(가) 고개를 숙였다.`;
    }
    case 'slay_ancient': {
      const d = w.chars.find(o => o.died < 0 && o.ancient);
      if (!d) return;
      const win = duel(w, c, d, '고대 용과의 결전');
      if (win === c) { bumpFlag(x, 'saved'); bumpFlag(x, 'dragonKills'); return `고대 용 ${d.name}이(가) 쓰러졌다!`; }
      return '';
    }
    case 'appoint_hero': {
      const o = w.chars[+data.oId];
      if (o && o.died < 0) { awaken(w, o, 'hero', `${c.name}의 축복을 받은 그날,`); bumpFlag(x, 'saved'); }
      return;
    }
    case 'make_tree': {
      const s = w.settlements[+data.sId];
      if (!s || !s.alive) return;
      for (const o of w.settlements) o.flags = o.flags.filter(f => f !== 'worldtree_burned' && f !== 'worldtree');
      s.flags.push('worldtree');
      w.worldTree = { sid: s.id, hp: 80, growth: 45, alive: true };
      c.lifespan = Math.max(ageOf(w, c) + 1, c.lifespan - 60);
      bumpFlag(x, 'treeMade'); bumpFlag(x, 'saved');
      addNews(w, `${charLabel(w, c)}이(가) 자신의 생명을 나누어 ${s.name}의 고목을 세계수로 깨웠다.`, 5, 'hero', { pos: s, chars: [c.id] });
      return;
    }
    case 'duel_dl': {
      const d = w.chars[w.demonLord];
      if (!d) return;
      if (strongEnoughAlone(w, c, d)) return setTravel(w, c, d, 'duel', d.id) ? '홀로 마왕성을 향해 길을 나섰다.' : '마왕에게 가는 길을 찾지 못하였다.';
      const p = formParty(w, c, d);
      return p ? `${p.members.length - 1}명의 동료와 함께 토벌대를 꾸려 마왕성으로 향하였다.` : '함께할 동료를 찾지 못하였다. 홀로 가기엔 마왕이 너무 강하다.';
    }
    case 'host_march': {
      const d = w.chars[w.demonLord];
      const ang = w.factions.find(f => f.alive && f.race === 'angel');
      if (d && ang) { const e = w.factions[d.faction]; if (e) { declareWar(w, ang, e, true); launchAttack(w, ang, e, 'holywar'); } }
      return runFx(x, 'duel_dl', data) as string | undefined;
    }
    case 'burn_tree': {
      const T = w.worldTree;
      if (!T || !T.alive || !x.f) return '세계수는 이미 이 세상에 없었다.';
      const s = w.settlements[T.sid];
      const src = settlementsOf(w, x.f).sort((a, b) => b.pop - a.pop)[0];
      if (s && src && s.faction !== x.f.id) {
        const owner = w.factions[s.faction];
        if (owner) declareWar(w, x.f, owner, true);
        raiseArmy(w, x.f, src, 'conquer', s, Math.max(40, src.pop * 0.35), c);
        addNews(w, `${charLabel(w, c)}이(가) 세계수를 불태우기 위한 원정군을 일으켰다.`, 4, 'doom', { pos: s, chars: [c.id] });
        return '원정군이 출발하였다.';
      }
      return '군대를 모을 수 없었다.';
    }
    case 'sanctum_march': {
      const s = w.settlements.find(o => o.alive && o.flags.includes('sanctum'));
      const src = x.f && settlementsOf(w, x.f).sort((a, b) => b.pop - a.pop)[0];
      if (!s || !src || !x.f) return '천상으로 가는 길이 보이지 않았다.';
      const owner = w.factions[s.faction];
      if (owner && owner !== x.f) declareWar(w, x.f, owner, true);
      const a = raiseArmy(w, x.f, src, 'conquer', s, Math.max(60, src.pop * 0.4), c);
      addNews(w, `${charLabel(w, c)}이(가) 천상의 성역을 향해 군세를 일으켰다. 하늘이 떨었다.`, 5, 'doom', { pos: s, chars: [c.id] });
      return a ? '군세가 하늘의 계단을 향해 진군한다.' : '군세가 길을 찾지 못하였다.';
    }
    case 'become_dl': if (x.f) becomeDemonLord(w, x.f); return;
    case 'patron': {
      const f = w.factions[+data.fId];
      if (f) makePatron(w, c, f);
      return;
    }
    case 'dragon_raid': {
      const s = w.settlements[+data.sId];
      if (s && s.alive) dragonRaid(w, c, s);
      return;
    }
    case 'egg': {
      const d = spawnDragon(w, false, c.lair ?? c);
      if (d) { d.father = c.id; c.children.push(d.id); return `새끼 용 ${d.name}이(가) 알을 깨고 나왔다.`; }
      return;
    }
    case 'sleep': c.sleep = 60; return;
    case 'die': killChar(w, c, String(data.cause ?? '불운한 사고')); return;
    case 'abyss_ghost': case 'abyss_harpoon': case 'abyss_listen': case 'abyss_offer': {
      const p = fx === 'abyss_listen' ? 0.02 : fx === 'abyss_offer' ? 0.015 : 0.006;
      const why = {
        abyss_ghost: `${c.name}이(가) 유령선에서 챙겨 온 항해 일지의 마지막 장에는 바다 밑에 잠든 것의 이름이 적혀 있었다. 무심코 그 이름을 소리 내어 읽었다.`,
        abyss_harpoon: `${c.name}의 작살에 꿰인 그림자는 괴수가 아니었다. 그것은 훨씬 더 큰 무언가의 촉수 끝이었다.`,
        abyss_listen: `${c.name}의 배가 닻을 내린 곳은 잠든 심장의 바로 위였다. 그 심장이 박자를 바꾸었다.`,
        abyss_offer: `${c.name}이(가) 바다에 던진 제물은 너무 오랜만의 것이었다. 바다 밑의 것이 그것을 받아들였다.`,
      }[fx]!;
      return stirAbyss(w, p, why, c) ? '바다가 끓어오르기 시작하였다. 당신이 무언가를 깨웠다.' : undefined;
    }
    case 'voyage_captain': {
      if (!x.home) return;
      const v = startVoyage(w, c, x.home);
      return v ? `${v.name}의 선장이 되었다. 돌아오기까지 ${Math.round(v.months / 12)}년쯤 걸릴 것이다.` : '바다로 나갈 물길을 찾지 못하였다.';
    }
    case 'voyage_crew': {
      if (!x.home) return;
      const capt = w.chars.find(o => o.died < 0 && !o.isPlayer && o.home === x.home!.id && o.act.kind === 'idle' && isAdult(w, o) && ['선원', '모험가', '상인'].includes(o.role) && o.race !== 'dragon');
      const v = capt ? startVoyage(w, capt, x.home, undefined, [c]) : startVoyage(w, c, x.home);
      return v ? `${capt ? `선장 ${capt.name}의 ` : ''}${v.name}에 올랐다. 돌아오기까지 ${Math.round(v.months / 12)}년쯤 걸릴 것이다.` : '배가 끝내 뜨지 못하였다.';
    }
  }
}

// ───────────── 구직 (시스템 이벤트)

interface Approach { id: string; l: string; job: Role | 'special' | 'parent'; s: [Check, number]; fit: (x: Ctx) => number; env?: (x: Ctx) => boolean }
const APPROACHES: Approach[] = [
  { id: 'smith', l: '대장간 일을 알아본다', job: '대장장이', s: ['mi', 0.45], fit: x => 1 + x.c.stats.might / 50 + (x.c.race === 'dwarf' ? 2 : 0) },
  { id: 'mine', l: '광산에서 일꾼을 구한다는 소문을 따라간다', job: '광부', s: ['mi', 0.6], fit: x => 1 + (x.c.race === 'dwarf' || x.c.race === 'kobold' || x.c.race === 'goblin' ? 3 : 0) },
  { id: 'farm', l: '밭일을 거든다', job: '농부', s: ['luck', 0.75], fit: x => 1.5 + (x.c.l === 2 ? 1 : 0) },
  { id: 'school', l: '학당의 문을 두드린다', job: '학자', s: ['in', 0.35], fit: x => 0.5 + x.c.traits[CURIOSITY] / 40 },
  { id: 'tower', l: '마탑의 입문 시험을 본다', job: '마법사', s: ['ma', 0.3], fit: x => 0.5 + x.c.stats.magic / 30 + (x.c.race === 'elf' || x.c.race === 'darkelf' ? 1.5 : 0) },
  { id: 'temple', l: '신전에 들어간다', job: '성직자', s: ['t5', 0.45], fit: x => 0.5 + x.c.traits[5] / 35 },
  { id: 'guard', l: '경비대에 지원한다', job: '전사', s: ['mi', 0.5], fit: x => 1 + x.c.traits[COURAGE] / 40 + (x.c.race === 'orc' ? 2 : 0) },
  { id: 'knight', l: '기사단 견습을 지원한다', job: '기사', s: ['ch', 0.25], fit: x => (x.P.flags?.noble !== undefined ? 3 : 0.4) + x.c.traits[9] / 60 },
  { id: 'caravan', l: '상단의 심부름꾼으로 들어간다', job: '상인', s: ['ch', 0.45], fit: x => 0.8 + x.c.traits[2] / 40 },
  { id: 'hunt', l: '사냥꾼을 따라 숲에 들어간다', job: '사냥꾼', s: ['mi', 0.55], fit: x => 1 + (x.c.race === 'beast' || x.c.race === 'elf' ? 1.5 : 0) },
  { id: 'herb', l: '약초꾼 노인을 찾아간다', job: '치유사', s: ['in', 0.45], fit: x => 0.6 + x.c.traits[3] / 40 },
  { id: 'alch', l: '연금술사의 조수 자리에 지원한다', job: '연금술사', s: ['in', 0.3], fit: x => 0.4 + x.c.traits[CURIOSITY] / 50 },
  { id: 'port', l: '항구에서 배를 탄다', job: '선원', s: ['mi', 0.5], fit: x => 0.8 + x.c.traits[COURAGE] / 80, env: x => x.c.l === 2 && homeTerrain(0, 1)(x) },
  { id: 'song', l: '주점에서 노래를 불러 본다', job: '음유시인', s: ['ch', 0.4], fit: x => 0.5 + x.c.traits[7] / 40 },
  { id: 'alley', l: '뒷골목 일을 알아본다', job: '도적', s: ['luck', 0.6], fit: x => 0.2 + Math.max(0, x.c.traits[2] - x.c.traits[3]) / 30 },
  { id: 'craft', l: '공방에 견습으로 들어간다', job: '장인', s: ['t8', 0.5], fit: x => 0.8 + x.c.traits[PRUDENCE] / 60 },
  { id: 'druid', l: '숲의 원로에게 가르침을 청한다', job: '드루이드', s: ['ma', 0.4], fit: x => 0.8 + x.c.traits[5] / 60, env: x => homeTerrain(4, 5)(x) },
  { id: 'shaman', l: '부족 주술사의 제자가 된다', job: '주술사', s: ['ma', 0.45], fit: x => 0.8 + x.c.traits[5] / 50 },
  { id: 'assassin', l: '그림자 길드의 시험을 치른다', job: '암살자', s: ['mi', 0.3], fit: x => 0.3 + Math.max(0, 60 - x.c.traits[3]) / 30 },
  { id: 'necro', l: '묘지기 노인에게 금지된 술법을 배운다', job: '사령술사', s: ['ma', 0.35], fit: x => 0.3 + Math.max(0, 60 - x.c.traits[3]) / 40 + x.c.stats.magic / 60 },
  { id: 'trapper', l: '함정 장인의 일을 돕는다', job: '함정꾼', s: ['in', 0.5], fit: x => 1 + x.c.traits[PRUDENCE] / 60 },
  { id: 'beast', l: '마수 우리에서 일을 구한다', job: '조련사', s: ['ch', 0.45], fit: x => 0.8 + x.c.traits[COURAGE] / 60 },
  { id: 'talent', l: '자신의 특기를 살려 본다', job: 'special', s: ['luck', 0.55], fit: () => 1.4 },
  { id: 'parent', l: '부모의 일을 이어받는다', job: 'parent', s: ['luck', 0.7], fit: x => (x.pj && x.pj !== '백수' && x.pj !== '평민' ? 2.2 : 0) },
];

function talentJob(c: Character): Role {
  const s = c.stats;
  const allowed = RACE_JOBS[c.race] ?? [];
  const prefs: [number, Role[]][] = [
    [s.magic, ['마법사', '주술사', '드루이드', '사령술사']],
    [s.intellect, ['학자', '연금술사', '함정꾼']],
    [s.charisma, ['음유시인', '상인', '조련사']],
    [s.might, ['전사', '대장장이', '사냥꾼', '광부']],
  ];
  prefs.sort((a, b) => b[0] - a[0]);
  for (const [, roles] of prefs) { const r = roles.find(j => allowed.includes(j)); if (r) return r; }
  return allowed[0] ?? '전사';
}

function jobAllowed(x: Ctx, a: Approach): boolean {
  const allowed = RACE_JOBS[x.c.race] ?? [];
  if (a.env && !a.env(x)) return false;
  if (a.job === 'special') return true;
  if (a.job === 'parent') return !!x.pj && allowed.includes(x.pj);
  return allowed.includes(a.job);
}

export function lazy(c: Character): boolean {
  return c.traits[AMBITION] < 25 && c.traits[CURIOSITY] < 40 && c.traits[COURAGE] < 45;
}

export const JOB_SEARCH: LifeEv = {
  id: 'job_search', t: '일자리 찾기',
  c: x => adult(x) && (x.c.role === '평민' || x.c.role === '백수') && x.c.race !== 'dragon' && !x.isLeader && !(x.c.role === '백수' && lazy(x.c)),
  x: x => (x.P.jobFails ?? 0) === 0 && x.c.role === '평민'
    ? '{n}은(는) 어엿한 어른이 되었다. 이제 스스로 밥벌이를 해야 한다. 어디부터 알아볼까?'
    : (x.P.jobPonder ?? 0) > 0
      ? `마음에 드는 일자리가 없어 며칠을 더 알아보았다. 새로운 자리가 몇 군데 눈에 띈다. (고민 ${x.P.jobPonder}/3 — 세 번 고민하면 백수가 된다)`
      : `일자리를 찾아 다시 길을 나섰다. (실패 ${x.P.jobFails ?? 0}/3 — 세 번 실패하면 모험가가 된다)`,
  o: x => {
    const rng = x.w.rngSim;
    const pool = APPROACHES.filter(a => jobAllowed(x, a) && a.fit(x) > 0);
    const picked: Approach[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const a = rng.weighted(pool, p => p.fit(x))!;
      picked.push(a);
      pool.splice(pool.indexOf(a), 1);
    }
    return picked.map((a): Opt => {
      const jobName = a.job === 'special' ? talentJob(x.c) : a.job === 'parent' ? (x.pj as Role) : a.job;
      return {
        l: a.l, d: `성공하면 ${jobName}`, s: a.s,
        ok: { r: `${jobName}(으)로 일하게 되었다!`, job: jobName, mood: 10 },
        no: { r: '이번에는 받아주지 않았다. 당분간 백수 신세다.', fx: 'jobfail', mood: -10 },
      };
    }).concat(((x.P.jobPonder ?? 0) >= 2
      ? [{ l: '좀 더 고민한다', d: '세 번째 고민 — 결국 백수가 된다', ok: { r: '고르고 고르다 어느 자리도 잡지 못하였다. {n}은(는) 백수가 되었다.', fx: 'job_ponder', mood: -5 } }]
      : [{ l: '좀 더 고민한다', d: `원하는 일이 아니다. 다른 자리를 더 알아본다 (고민 ${(x.P.jobPonder ?? 0) + 1}/3)`, ok: { r: '조금 더 둘러보기로 하였다.', fx: 'job_ponder' } }]) as Opt[]);
  },
};

export function afterJobFail(x: Ctx): string {
  x.P.jobFails = (x.P.jobFails ?? 0) + 1;
  setJob(x, '백수');
  if (x.P.jobFails >= 3) {
    x.P.jobFails = 0;
    x.P.flags ??= {};
    x.P.flags.advForced = x.w.t;
    if (!(RACE_JOBS[x.c.race] ?? []).includes('모험가')) return '세 번이나 퇴짜를 맞았다. 당분간은 이렇게 지내기로 하였다.';
    setJob(x, '모험가');
    const r = runFx(x, 'adventure', {});
    return `세 번이나 퇴짜를 맞자 {n}은(는) 짐을 꾸려 모험가가 되었다.${r ? ' ' + r : ''}`;
  }
  return '';
}

export const ADVENTURER_TIRED: LifeEv = {
  id: 'adv_tired', t: '정착의 유혹', cd: 36,
  c: x => job('모험가')(x) && x.years >= 3,
  x: '몇 해째 길 위를 떠돌았다. 발은 부르트고, 따뜻한 밥 한 끼가 그립다.',
  o: [
    { l: '정착해 일자리를 찾는다', d: '다시 구직', ok: { r: '모험가 생활을 접고 정착할 곳을 찾기로 하였다.', fx: 'seek' } },
    { l: '아직 길이 나를 부른다', d: '모험 계속', ok: { r: '다시 지도를 펼쳤다.', fx: 'adventure', mood: 5 } },
  ],
};

export function isDragonChar(c: Character) { return c.race === 'dragon'; }
export { TERRAIN, dist, isAdult };
