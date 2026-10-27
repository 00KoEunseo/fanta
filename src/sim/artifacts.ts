// 명품(걸작): 이름을 가진 물건과 작품. 주인이 바뀌며 이야기가 쌓인다.
import type { Rng } from '../core/rng';
import { fixJosa } from '../data/text';
import { addNews, charLog } from './news';
import type { Character, World } from './state';
import { approxDist, charLabel, leaderOf, findAncestor } from './helpers';

export type ArtKind = '검' | '도끼' | '방패' | '갑옷' | '왕관' | '활' | '지팡이' | '보석' | '책' | '노래' | '물약' | '태엽 장치' | '지도' | '찬가' | '주문' | '술';

export interface Artifact {
  id: number;
  name: string;
  kind: ArtKind;
  maker: number;
  makerName: string;
  /** 지금 가진 인물 (-1: 없음) */
  holder: number;
  /** 손에 쥘 수 없는 작품(노래, 주문 등)은 세상에 퍼진다 */
  tangible: boolean;
  /** 지닌 자의 힘을 얼마나 키우는가 */
  power: number;
  fame: number;
  t: number;
  /** 묻혀 있는 유적 (-1: 없음) */
  site: number;
  story: { t: number; text: string }[];
  /** 명맥(命脈): 이 명품이 버틸 수 있는 세월 (년) */
  life?: number;
  /** 지금까지 깎여 나간 세월 (년) */
  worn?: number;
  /** 명맥이 다해 사라진 시점 */
  lost?: number;
  /** 사라진 까닭 */
  fate?: string;
}

/** 종류마다 타고나는 명맥 (년) */
const LIFE: Record<ArtKind, [number, number]> = {
  물약: [15, 40], 술: [20, 60], 지도: [40, 100], 노래: [60, 180], 활: [50, 120], '태엽 장치': [60, 150], 책: [80, 200],
  주문: [80, 220], 찬가: [100, 280], 지팡이: [100, 250], 방패: [80, 200], 갑옷: [80, 200], 도끼: [120, 280], 검: [120, 300],
  왕관: [200, 450], 보석: [300, 700],
};
/** 명맥이 다할 때의 모습 */
const FADE: Record<ArtKind, string[]> = {
  물약: ['병 속에서 빛을 잃고 맹물이 되었다.', '마지막 한 방울마저 말라붙었다.'],
  술: ['마지막 한 통이 비워졌다. 그 맛을 기억하는 이도 하나둘 세상을 떠났다.', '빚는 법을 아는 이가 끊겨 다시는 그 맛을 볼 수 없게 되었다.'],
  지도: ['종이가 삭아 바스러졌다. 그려진 해안선은 이제 아무도 모른다.', '습기에 먹물이 번져 길이 지워졌다.'],
  노래: ['부르는 이가 없어 잊혔다. 가락의 한 소절만이 아이들의 놀이 노래에 남았다.', '마지막으로 그 노래를 알던 늙은 시인이 눈을 감았다.'],
  활: ['시위를 당기자 활대가 갈라졌다.', '세월에 뒤틀려 더는 화살을 날리지 못하게 되었다.'],
  '태엽 장치': ['태엽이 끊어진 뒤로 다시는 움직이지 않았다.', '톱니 하나가 닳아 멈춰 섰다. 고칠 줄 아는 장인은 이미 없었다.'],
  책: ['좀이 슬어 책장이 바스러졌다.', '불길 속에서 마지막 사본이 재가 되었다.'],
  주문: ['외우는 이가 끊겨 주문의 마지막 음절이 잊혔다.', '마나의 결이 바뀌어 더는 아무 힘도 일으키지 못하게 되었다.'],
  찬가: ['신전이 비고 찬가를 부르는 이가 사라졌다.', '새 시대의 노래에 밀려 잊혔다.'],
  지팡이: ['깃든 마력이 다해 평범한 나무 막대가 되었다.', '한가운데에서 쩍 갈라졌다.'],
  방패: ['수없이 받아 낸 상처 끝에 둘로 쪼개졌다.', '녹이 슬어 부서져 내렸다.'],
  갑옷: ['녹이 슬어 이음새가 모두 떨어져 나갔다.', '마지막 싸움에서 꿰뚫린 뒤 다시는 고쳐지지 않았다.'],
  도끼: ['날이 닳고 닳아 이름만 남았다.', '자루가 부러지고 날은 녹아 다른 쇠붙이가 되었다.'],
  검: ['세월에 삭아 칼날이 부러졌다.', '녹이 칼날을 먹어 들어가 마침내 바스러졌다.', '다시 녹여져 평범한 쟁기날이 되었다.'],
  왕관: ['녹여져 금화가 되었다. 그 왕조를 기억하는 이는 이제 없다.', '보석이 하나둘 뜯겨 나가고 껍데기만 남아 흩어졌다.'],
  보석: ['깨져 가루가 되었다.', '빛을 잃고 흔한 돌멩이가 되었다.'],
};

const POETIC = ['새벽바람', '황혼의 맹세', '서리송곳니', '별빛', '핏빛 달', '은빛 비늘', '침묵', '마지막 노래', '첫눈', '폭풍의 눈', '잿불', '푸른 불꽃', '늑대의 울음',
  '왕의 그림자', '천 번의 밤', '꺾이지 않는 자', '용의 숨결', '깊은 뿌리', '바다의 기억', '해 질 녘', '이름 없는 별', '맹세의 무게', '세 번째 달', '고요한 강'];
const SINGLE: Partial<Record<ArtKind, string[]>> = {
  노래: ['떠나간 이를 위한 노래', '불타는 성의 발라드', '들판의 자장가', '용사의 행진곡', '바다 건너의 편지'],
  책: ['별의 연대기', '마나의 원리', '잊힌 왕들의 계보', '대지의 문법', '하늘의 지도책'],
  술: ['황금 벌꿀주', '천 년 묵은 포도주', '용의 눈물 화주'],
  주문: ['흩어지는 별의 주문', '얼어붙은 시간', '천둥의 문장'],
};

/** 엮어 짓는 이름: 꾸밈말 × 이름말 */
const MOD = ['잠들지 않는', '이름 잃은', '서리 내린', '불타는', '가라앉은', '돌아오지 않는', '꺾이지 않는', '흐린', '마지막', '첫', '은빛', '잿빛', '피 묻은',
  '노래하는', '떨어진', '눈먼', '맹세한', '잊힌', '젖은', '천 년의', '밤의', '새벽의', '겨울의', '바람 속의', '부서진', '고요한', '타오르는'];
const NOUN = ['별', '맹세', '달', '파도', '늑대', '까마귀', '왕관', '날개', '불씨', '눈물', '뿌리', '등불', '종소리', '그림자', '노래', '숨결', '심장', '이빨',
  '서약', '봉화', '물결', '나침반', '기억', '들불', '꽃', '사슬', '여명', '황혼', '창끝'];

let usedNames: string[] = [];
/** 이미 쓰인 이름을 피하도록 알려 준다 */
export function setUsedNames(w: World) { usedNames = w.artifacts.map(a => a.name); }

export function artNameOptions(rng: Rng, kind: ArtKind, maker: Character): string[] {
  const out = new Set<string>();
  const used = new Set(usedNames);
  for (let i = 0; i < 30 && out.size < 3; i++) {
    const pool = SINGLE[kind];
    const n = pool && rng.chance(0.5) ? rng.pick(pool) : rng.pick(POETIC);
    if (!used.has(n)) out.add(n);
  }
  // 좋은 이름이 다 쓰였으면 두 말을 엮어 새 이름을 짓는다 (숫자는 붙이지 않는다)
  for (let i = 0; i < 60 && out.size < 3; i++) {
    const n = `${rng.pick(MOD)} ${rng.pick(NOUN)}`;
    if (!used.has(n)) out.add(n);
  }
  for (let i = 0; out.size < 3 && i < 60; i++) out.add(`${maker.name}의 ${rng.pick(MOD)} ${rng.pick(NOUN)}`);
  return [...out];
}

export function artLabel(a: Artifact): string {
  return `${a.makerName}의 ${a.kind} 「${a.name}」`;
}

function story(w: World, a: Artifact, text: string) {
  a.story.push({ t: w.t, text: fixJosa(text) });
  if (a.story.length > 30) a.story.shift();
}

export function makeArtifact(w: World, maker: Character, kind: ArtKind, name: string, power: number, tangible = true): Artifact {
  const a: Artifact = {
    id: w.artifacts.length, name, kind, maker: maker.id, makerName: maker.name,
    holder: tangible ? maker.id : -1, tangible, power, fame: 20 + power, t: w.t, site: -1, story: [],
    life: w.rngSim.int(...LIFE[kind]), worn: 0,
  };
  w.artifacts.push(a);
  story(w, a, `${maker.name}이(가) 만들었다.`);
  maker.fame += 10 + power / 2;
  charLog(w, maker, `${artLabel(a)}을(를) 완성하였다.`, 4);
  addNews(w, tangible
    ? `${charLabel(w, maker)}이(가) ${artLabel(a)}을(를) 완성하였다. 사람들이 그것을 보러 몰려들었다.`
    : `${charLabel(w, maker)}의 ${kind} 「${name}」이(가) 온 세상에 퍼져 나갔다.`, 3, 'growth', { pos: maker, chars: [maker.id] });
  return a;
}

export function heldBy(w: World, c: Character): Artifact[] {
  return w.artifacts.filter(a => a.tangible && a.holder === c.id);
}

export function artPower(w: World, c: Character): number {
  let p = 0;
  for (const a of w.artifacts) if (a.tangible && a.holder === c.id && a.lost === undefined) p += a.power;
  return p;
}

export function giveArtifact(w: World, a: Artifact, to: Character | null, how: string, newsImp = 0): void {
  const from = w.chars[a.holder];
  a.holder = to ? to.id : -1;
  a.site = -1;
  a.fame += 3;
  const text = to ? `${how} ${to.name}의 손에 들어갔다.` : how;
  story(w, a, text);
  if (to) charLog(w, to, `${artLabel(a)}을(를) 손에 넣었다.`, 3);
  if (from && from !== to && from.died < 0) charLog(w, from, `${artLabel(a)}을(를) 잃었다.`, 2);
  if (newsImp || a.fame >= 40) addNews(w, `${artLabel(a)}이(가) ${text}`, Math.max(newsImp, 2), 'life', { chars: to ? [to.id] : [] });
  // 전설의 계보: 남의 손을 떠돌던 작품이 만든 이의 핏줄에게 돌아왔다
  if (to && from && from.id !== a.maker) {
    const root = findAncestor(w, to, x => x.id === a.maker);
    const fromKin = findAncestor(w, from, x => x.id === a.maker);
    if (root && !fromKin && root.gen >= 2) {
      const gen = ['', '', '손자', '증손', '고손', '5대손'][root.gen] ?? `${root.gen}대손`;
      const msg = `${a.makerName}이(가) 만든 「${a.name}」이(가) 오랜 떠돎 끝에 그의 ${gen} ${to.name}의 손에 돌아왔다.`;
      story(w, a, msg);
      addNews(w, msg, 3, 'hero', { chars: [to.id] });
      a.fame += 10;
    }
  }
}

/** 주인이 죽으면: 죽인 자가 빼앗거나, 자식이 물려받거나, 군주가 거두거나, 유적에 묻힌다 */
export function onHolderDeath(w: World, c: Character, killer?: Character): void {
  const held = heldBy(w, c);
  if (!held.length) return;
  const rng = w.rngSim;
  for (const a of held) {
    if (killer && killer.died < 0) { giveArtifact(w, a, killer, `${c.name}을(를) 쓰러뜨린 전리품으로`); continue; }
    const kid = c.children.map(id => w.chars[id]).filter(k => k && k.died < 0).sort((x, y) => x.born - y.born)[0];
    if (kid) { giveArtifact(w, a, kid, `${c.name}의 유품으로`); continue; }
    const f = w.factions[c.faction];
    const ld = f ? leaderOf(w, f) : null;
    if (ld && ld.id !== c.id && rng.chance(0.6)) { giveArtifact(w, a, ld, `주인을 잃자 ${f!.name}의 궁정이 거두어`); continue; }
    const sites = w.sites.filter(s => s.kind !== 'deep' && !s.relic && approxDist(w, c, s) < 60);
    if (sites.length) {
      const s = rng.pick(sites);
      s.relic = `art:${a.id}`;
      a.holder = -1; a.site = s.id;
      story(w, a, `주인을 잃고 ${s.name}에 묻혔다.`);
    } else { a.holder = -1; story(w, a, '행방이 묘연해졌다.'); }
  }
}

/** 모험가가 유적에서 묻힌 명품을 찾는다 */
export function findBuried(w: World, c: Character, relic: string): boolean {
  if (!relic.startsWith('art:')) return false;
  const a = w.artifacts[+relic.slice(4)];
  if (!a) return false;
  giveArtifact(w, a, c, '오랜 세월 잠들어 있다가 발견되어', 3);
  return true;
}

/** 남은 명맥의 비율 (0~1) */
export function vigor(a: Artifact): number {
  if (a.lost !== undefined) return 0;
  return Math.max(0, 1 - (a.worn ?? 0) / (a.life ?? 150));
}
/** 명맥을 한마디로 */
export function vigorWord(a: Artifact): string {
  if (a.lost !== undefined) return '스러짐';
  const v = vigor(a);
  return v > 0.75 ? '찬연함' : v > 0.45 ? '세월이 내려앉음' : v > 0.2 ? '빛바램' : '스러져 감';
}
export function isLost(a: Artifact): boolean { return a.lost !== undefined; }

/** 해마다 명맥이 깎인다. 이름이 높을수록 사람들이 아끼고 고쳐 쓰니 천천히 깎인다 */
function wearYear(w: World, a: Artifact): void {
  a.life ??= w.rngSim.int(...LIFE[a.kind]);
  a.worn ??= Math.max(0, (w.t - a.t) / 12);
  const h = w.chars[a.holder];
  let rate = 1 / (1 + Math.max(0, a.fame) / 200);
  if (a.site >= 0) rate *= 0.5;                       // 유적 깊이 잠든 것은 더디게 삭는다
  if (h && h.race === 'dragon') rate *= 0.3;          // 용의 보물 더미 속에서는 거의 늙지 않는다
  if (h && h.died < 0 && ['전사', '기사', '모험가'].includes(h.role) && ['검', '도끼', '방패', '갑옷', '활'].includes(a.kind)) rate *= 1.4; // 싸움에 쓰이는 것은 빨리 닳는다
  a.worn += rate;
  if (a.worn < a.life) return;
  const fate = w.rngSim.pick(FADE[a.kind]);
  const holder = w.chars[a.holder];
  a.lost = w.t;
  a.fate = fate;
  story(w, a, fate);
  if (a.site >= 0) { const s = w.sites[a.site]; if (s && s.relic === `art:${a.id}`) s.relic = null; }
  if (holder && holder.died < 0) charLog(w, holder, `${artLabel(a)}이(가) ${fate}`, 3);
  a.holder = -1; a.site = -1;
  const years = Math.round((w.t - a.t) / 12);
  if (a.fame >= 35) addNews(w, `${years}년의 세월을 버텨 온 ${artLabel(a)}이(가) ${fate}`, a.fame >= 80 ? 3 : 2, 'life', { chars: holder && holder.died < 0 ? [holder.id] : [] });
}

/** 매달: 군주의 징발과 수여, 수호룡에게 바치는 공물, 이름난 장인들의 작품 */
export function artifactMonth(w: World): void {
  const rng = w.rngSim;
  for (const a of w.artifacts) if (a.lost === undefined && w.t % 12 === a.id % 12) wearYear(w, a);
  for (const a of w.artifacts) {
    if (!a.tangible || a.holder < 0 || a.lost !== undefined) continue;
    const h = w.chars[a.holder];
    if (!h || h.died >= 0) continue;
    const f = w.factions[h.faction];
    const ld = f ? leaderOf(w, f) : null;
    // 탐욕스러운 군주의 징발
    const together = !!ld && h.act.kind === 'idle' && ld.act.kind === 'idle' && approxDist(w, h, ld) < 30;
    if (ld && together && ld.id !== h.id && !h.isPlayer && a.fame >= 30 && (ld.traits[2] > 65 || ld.traits[9] > 70) && rng.chance(0.006)) {
      giveArtifact(w, a, ld, `${f!.name}의 군주가 징발하여`, 3);
      continue;
    }
    // 너그러운 군주의 수여
    if (ld && ld.id === h.id && !h.isPlayer && ld.traits[3] > 60 && rng.chance(0.004)) {
      const hero = w.chars.filter(c => c.died < 0 && c.faction === f!.id && c.id !== ld.id && c.fame > 30 && c.act.kind === 'idle' && approxDist(w, c, ld) < 30).sort((x, y) => y.fame - x.fame)[0];
      if (hero) giveArtifact(w, a, hero, `${ld.name}이(가) 공을 치하하며 직접 수여하여`, 3);
      continue;
    }
    // 수호룡에게 비보로 바침
    if (ld && ld.id === h.id && !h.isPlayer && f && rng.chance(0.002)) {
      const pf = f.flags.find(x => x.startsWith('patron:'));
      const d = pf ? w.chars[+pf.split(':')[1]] : undefined;
      if (d && d.died < 0) { giveArtifact(w, a, d, `${f.name}이(가) 수호룡에게 비보로 바쳐`, 3); d.tributeMiss = 0; }
    }
  }
  // 이름난 장인들이 이따금 걸작을 남긴다
  if (w.artifacts.length < 600 && w.artifacts.filter(a => a.lost === undefined).length < 90 && rng.chance(0.03)) {
    const made = new Map<number, number>();
    for (const a of w.artifacts) made.set(a.maker, (made.get(a.maker) ?? 0) + 1);
    const makers = w.chars.filter(c => c.died < 0 && !c.isPlayer && MASTER_KINDS[c.role] && (made.get(c.id) ?? 0) < 1
      && (c.stats.might + c.stats.intellect + c.stats.magic + c.stats.charisma) / 4 > 55);
    if (makers.length) {
      const m = rng.pick(makers);
      const [kind, tangible] = rng.pick(MASTER_KINDS[m.role]!);
      setUsedNames(w);
      makeArtifact(w, m, kind, rng.pick(artNameOptions(rng, kind, m)), tangible ? rng.int(8, 25) : 0, tangible);
    }
  }
}

export const MASTER_KINDS: Record<string, [ArtKind, boolean][]> = {
  대장장이: [['검', true], ['도끼', true], ['방패', true], ['갑옷', true]],
  장인: [['왕관', true], ['태엽 장치', true], ['보석', true]],
  음유시인: [['노래', false]],
  학자: [['책', true]],
  마법사: [['지팡이', true], ['주문', false]],
  연금술사: [['물약', true]],
  사냥꾼: [['활', true]],
  선원: [['지도', true]],
  성직자: [['찬가', false]],
  농부: [['술', false]],
  드루이드: [['지팡이', true]],
  주술사: [['지팡이', true]],
};
