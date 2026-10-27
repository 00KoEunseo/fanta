import type { Rng } from '../core/rng';
import type { RaceKey } from '../data/races';
import type { Role, Stats } from '../data/traits';

export interface LayerInfo { id: number; key: string; name: string; w: number; h: number }
export const LAYER_INFO: LayerInfo[] = [
  { id: 0, key: 'heaven', name: '천상', w: 60, h: 40 },
  { id: 1, key: 'sky', name: '하늘', w: 80, h: 50 },
  { id: 2, key: 'surface', name: '지상', w: 160, h: 100 },
  { id: 3, key: 'under', name: '지하', w: 120, h: 80 },
  { id: 4, key: 'demon', name: '마계', w: 80, h: 60 },
];

export interface Layer {
  id: number;
  w: number;
  h: number;
  terrain: Uint8Array;
  /** 소유 진영 id (-1 없음) */
  owner: Int16Array;
  /** 소유 정착지 id (-1 없음) */
  claim: Int32Array;
}

export interface Pos { l: number; x: number; y: number }

export type PortalKind = 'cave' | 'peak' | 'stair' | 'rift' | 'tower';
export interface Portal {
  id: number;
  a: Pos;
  b: Pos;
  kind: PortalKind;
  open: boolean;
  name: string;
}

export type SiteKind = 'ruin' | 'dungeon' | 'shrine' | 'worldtree' | 'deep';
export interface Site extends Pos {
  id: number;
  kind: SiteKind;
  name: string;
  level: number;
  /** 남은 보물 (0이면 고갈) */
  loot: number;
  /** 성검 등 유물 보유 */
  relic: string | null;
  /** 다시 세운 신전 (신전 터일 때) */
  temple?: import('./religion').Temple;
}

export interface Settlement extends Pos {
  id: number;
  name: string;
  faction: number;
  race: RaceKey;
  pop: number;
  stock: number[];
  prod: number[];
  cons: number[];
  dev: number;
  tier: number;
  stability: number;
  founded: number;
  governor: number;
  /** 역병 남은 개월 */
  plague: number;
  /** 노예 수와 주된 종족 */
  slaves?: number;
  slaveRace?: RaceKey;
  /** 앓고 있는 병 (-1 없음) */
  disease?: number;
  /** 고을 사람들이 믿는 신앙 */
  faith?: number;
  /** 병마다 면역이 끝나는 시점 */
  immune?: Record<number, number>;
  hunger: number;
  tiles: number[];
  alive: boolean;
  flags: string[];
  /** 마지막으로 공격당한 시점 */
  lastAttacked: number;
  /** 용에게 마지막으로 불탄 때 */
  lastBurned?: number;
}

export interface Treaty { with: number; give: number; get: number; since: number }

export interface Faction {
  id: number;
  name: string;
  baseName: string;
  race: RaceKey;
  color: string;
  tier: number;
  leader: number;
  capital: number;
  alive: boolean;
  founded: number;
  fell: number;
  relations: Record<number, number>;
  wars: Record<number, number>;
  /** 휴전 만료 시점 */
  truce: Record<number, number>;
  /** 국경 태세: guard 경계 강화 / open 화친 */
  posture: Record<number, 'guard' | 'open'>;
  treaties: Treaty[];
  flags: string[];
  legitimacy: number;
  warWeariness: number;
  /** 집계 캐시 */
  pop: number;
  settlements: number[];
  avgDev: number;
  military: number;
  /** 왕조 이름 */
  dynasty: string;
  /** 세력의 일대기: 아주 중요한 사건만 */
  history?: { t: number; text: string; imp: number }[];
  /** 지도자 교체 기록 */
  rulers: { id: number; from: number; to: number; how: string }[];
  /** 나라의 국교 */
  faith?: number;
  /** 알고 있는 세력과 알게 된 때 (없으면 예전 저장: 모두 안다) */
  known?: Record<number, number>;
  /** 존재를 아는 세계의 층 (없으면 예전 저장: 모두 안다) */
  realms?: number[];
  /** 누군가 만나 보았지만 아직 소식이 닿지 않은 세력 */
  heard?: Record<number, number>;
  /** 싸우는 상대별 전쟁 점수 (강화 협상에 쓴다) */
  warState?: Record<number, import('./warfare').WarState>;
  /** 다른 세력에게 품은 원한: 언제, 무엇 때문에 (전쟁의 명분이 된다) */
  grievances?: Record<number, { t: number; why: string }>;
}

export interface LogEntry { t: number; text: string; imp?: number }

export type ActivityKind = 'idle' | 'travel' | 'army' | 'colonize' | 'party' | 'voyage' | 'fleet' | 'clear' | 'caravan' | 'camp';
export interface Activity {
  kind: ActivityKind;
  purpose?: 'adventure' | 'trade' | 'visit' | 'hunt' | 'return' | 'pilgrim' | 'duel' | 'flee' | 'clear' | 'muster' | 'quest';
  /** 개척을 시작한 때 */
  since?: number;
  /** 먼 길 (지도에 끝까지 경로를 보인다) */
  long?: boolean;
  dest?: Pos;
  target?: number;
  path?: number[];
  months?: number;
}

export interface Character extends Pos {
  id: number;
  name: string;
  epithet: string;
  race: RaceKey;
  sex: 'M' | 'F';
  born: number;
  died: number;
  cause: string;
  faction: number;
  home: number;
  /** 이전 위치 (애니메이션 보간) */
  pl: number; px: number; py: number;
  traits: number[];
  apt: number[];
  awakened: string[];
  stats: Stats;
  wealth: number;
  honor: number;
  fame: number;
  mood: number;
  rank: number;
  role: Role;
  title: string;
  relations: Record<number, number>;
  father: number;
  mother: number;
  spouse: number;
  children: number[];
  log: LogEntry[];
  bio: LogEntry[];
  act: Activity;
  isPlayer: boolean;
  plot: number;
  items: string[];
  kills: number;
  /** 용 전용: 둥지 / 수면 */
  lair?: Pos;
  sleep?: number;
  /** 믿는 신앙 */
  faith?: number;
  /** 천사가 맡은 임무 (역병·기근·마왕의 군세) */
  angelTask?: import('./angels').AngelTask;
  /** 악마: 마계의 예순여섯 (세력 없음) */
  archdemon?: import('./demons').Archdemon;
  /** 열강: 나라를 떠나 홀로 선 강자 */
  paragon?: import('./paragon').Paragon;
  /** 고향에 전할 소식: 길에서 처음 만난 세력들 */
  carry?: number[];
  /** 고향에 전할 소식: 다녀온 낯선 층 */
  carryRealm?: number[];
  /** 보물 위의 긴 잠인가 (깰 때 포효한다) */
  deepSleep?: boolean;
  ancient?: boolean;
  /** 속한 가문 */
  house?: number;
  /** 마왕군 간부 칭호 */
  officer?: string;
  /** 열두 천사의 자리 (0~11) */
  seat?: number;
  /** 용의 성향: 습격형 / 수호룡 / 은둔 */
  dragonKind?: 'raider' | 'patron' | 'recluse';
  /** 수호룡이 돕는 세력 */
  patronOf?: number;
  /** 공물을 받지 못한 달 수 */
  tributeMiss?: number;
  /** 고대 용의 분노가 끝나는 시점 */
  wrathUntil?: number;
  /** 고대 용이 깨어난 시점 */
  wrathStart?: number;
  lifespan: number;
}

export type ArmyGoal = 'raid' | 'conquer' | 'colonize' | 'holywar' | 'return' | 'clear';
export interface Army extends Pos {
  id: number;
  faction: number;
  race: RaceKey;
  commander: number;
  soldiers: number;
  goal: ArmyGoal;
  target: number;
  home: number;
  path: number[];
  loot: number[];
  alive: boolean;
  pl: number; px: number; py: number;
  /** 정착 예정지 (이주민) */
  dest?: Pos;
  age: number;
  /** 소속 주둔지 */
  camp?: number;
  /** 주둔지로 가는 중 (닿으면 합류한다) */
  toCamp?: boolean;
}

export type NewsCat = 'war' | 'politics' | 'hero' | 'dark' | 'nature' | 'growth' | 'life' | 'trade' | 'doom' | 'player';
export interface NewsItem {
  id: number;
  t: number;
  text: string;
  imp: number;
  cat: NewsCat;
  pos?: Pos;
  chars?: number[];
  facs?: number[];
}

export interface Era {
  name: string;
  start: number;
  end: number;
  counters: Record<string, number>;
  highlights: number[];
  /** 시대가 끝날 때 엮은 연대기의 한 장 (소식이 지워져도 남는다) */
  chapter?: string[];
}

export interface Prophecy { text: string; p: number; imp: number; cat: NewsCat }

export interface PlayerChoice {
  id: string;
  label: string;
  desc: string;
  /** 성공 확률(표시용), 없으면 확정 */
  chance?: number;
  /** 결과 수치 미리 보기 (성공 / 실패) */
  preview?: string;
  failPreview?: string;
}
export interface PlayerPrompt {
  eventId: string;
  title: string;
  text: string;
  choices: PlayerChoice[];
  data: Record<string, number | string>;
}

export interface PlayerState {
  charId: number;
  prompt: PlayerPrompt | null;
  lastEvents: Record<string, number>;
  path: string;
  /** 이전 lifeEvent 결과 메시지 */
  results: LogEntry[];
  dead: boolean;
  /** 구직 실패 횟수 */
  jobFails?: number;
  /** 이벤트별로 겪은 횟수 (자주 겪은 일은 덜 찾아온다) */
  seen?: Record<string, number>;
  /** 지난달의 처지 (큰 변화를 알아채기 위해) */
  watch?: Record<string, number>;
  /** 인연의 씨앗: 지난 선택이 훗날 돌아온다 */
  seeds?: { id: string; t: number; due: number; data: Record<string, number | string>; note: string }[];
  /** 지금 직업의 경력 단계 (0 수습 ~ 3 거장) */
  jobRank?: number;
  /** 일자리 고르기를 미룬 횟수 (3이면 백수) */
  jobPonder?: number;
  /** 현재 직업을 시작한 시점 */
  jobSince?: number;
  /** 거쳐 간 직업들 */
  jobsHad?: string[];
  /** 연쇄 이벤트 등에 쓰는 표식 */
  flags?: Record<string, number>;
  /** 몇 대째 이어 사는지 */
  generation?: number;
  /** 운명이 비튼 특수 탄생 */
  special?: 'dragon' | 'guardian';
}

export interface WorldTree {
  sid: number;
  /** 체력 0~100: 유지비를 못 내면 줄고 0이 되면 쓰러진다 */
  hp: number;
  /** 성장 0~100: 100이 되어야 봉인이 회복된다 */
  growth: number;
  alive: boolean;
  /** 탐욕스러운 군주가 베는 중 */
  felling?: boolean;
}

export interface Cinematic {
  kind: 'break' | 'restore' | 'end' | 'love';
  seal: number;
  title: string;
  text: string;
}

export interface DoomState {
  seals: boolean[];
  ended: boolean;
  endText: string;
  heroDeaths: number;
  /** 배신당하거나 살해당한 용의 수 (3이 되면 고대 용이 분노한다) */
  dragonGrievance: number;
  /** 마왕이 하늘 계단을 억지로 열었는가 */
  heavenForced?: boolean;
  /** 한 번이라도 무너진 적이 있어 이름이 알려진 봉인 */
  seen?: boolean[];
  /** 회복 연출을 이미 본 봉인 */
  restored?: boolean[];
  /** 차원의 합: 이 시점까지 마계와 이 세계가 겹친다 */
  riftSurge?: number;
}

export interface World {
  seed: string;
  version: number;
  t: number;
  startYear: number;
  rngSim: Rng;
  layers: Layer[];
  portals: Portal[];
  sites: Site[];
  settlements: Settlement[];
  factions: Faction[];
  chars: Character[];
  armies: Army[];
  news: NewsItem[];
  eras: Era[];
  doom: DoomState;
  demonLord: number;
  prophecy: Prophecy[];
  player: PlayerState | null;
  territoryDirty: boolean;
  stats: Record<string, number>;
  nextNewsId: number;
  /** 각 칸의 최근 전투 사망자 (언데드 소생용) */
  corpses: number;
  /** 세계수 상태 */
  worldTree: WorldTree | null;
  /** 화면 연출 대기열 (봉인 붕괴 등) */
  cinematics: Cinematic[];
  /** 봉인 순서 판 (2: 심해의 분노) */
  sealsV?: number;
  /** 바다: 해저 유적, 항해, 유랑 선단, 괴수, 심연의 군주 */
  sea: import('./sea').SeaState;
  /** 명예를 중시하는 세력의 가문들 */
  houses: import('./houses').House[];
  /** 토벌대와 연맹 */
  parties: import('./crusade').Party[];
  alliances: import('./crusade').Alliance[];
  /** 하늘에 닿으려는 탑들 */
  towers: import('./towers').Tower[];
  /** 이름 있는 병들 */
  diseases: import('./disease').Disease[];
  /** 전선의 주둔지들 */
  camps?: import('./camps').Camp[];
  /** 세상의 신앙들 */
  religions?: import('./religion').Religion[];
  /** 길 위의 상단 */
  caravans?: import('./caravan').Caravan[];
  /** 큰 이야기들의 기록부 (이야기 탭) */
  storyBook?: import('./stories').StoryBook;
  /** 이름 있는 명품과 작품들 */
  artifacts: import('./artifacts').Artifact[];
  /** 이번 턴에 달성한 업적 (UI가 가져가 저장한다) */
  achvQueue?: string[];
}

export function tileIndex(w: World, l: number, x: number, y: number): number {
  return y * w.layers[l].w + x;
}

export function inBounds(w: World, l: number, x: number, y: number): boolean {
  const L = w.layers[l];
  return x >= 0 && y >= 0 && x < L.w && y < L.h;
}

export function yearOf(w: World, t = w.t): number {
  return w.startYear + Math.floor(t / 12);
}
export function monthOf(t: number): number {
  return (t % 12) + 1;
}
export function seasonOf(t: number): number {
  const m = monthOf(t);
  if (m >= 3 && m <= 5) return 0;
  if (m >= 6 && m <= 8) return 1;
  if (m >= 9 && m <= 11) return 2;
  return 3;
}
export const SEASON_NAMES = ['봄', '여름', '가을', '겨울'];

export function dateStr(w: World, t = w.t): string {
  return `${yearOf(w, t)}년 ${monthOf(t)}월`;
}

export function ageOf(w: World, c: Character): number {
  return Math.floor(((c.died >= 0 ? c.died : w.t) - c.born) / 12);
}

export function fullName(c: Character): string {
  return c.epithet ? `${c.epithet} ${c.name}` : c.name;
}

export function dist(a: Pos, b: Pos): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
