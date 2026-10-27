// 인생 이벤트 데이터 7: 이어지는 이야기.
// 오늘의 선택이 '인연의 씨앗'이 되어, 몇 해 뒤 그 선택을 기억하는 사건으로 돌아온다.
// 직업은 수습에서 거장까지 자라고, 가문은 혼인과 후계로 이어진다.
import { makeName } from '../data/names';
import { RACES } from '../data/races';
import type { Role } from '../data/traits';
import { addNews, charLog } from './news';
import type { Character, World } from './state';
import { ageOf } from './state';
import { addRel, clamp, isAdult } from './helpers';
import { createCharacter, duel, killChar } from './characters';
import { secede } from './factions';
import { ensureHouse, honorFaction } from './houses';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all, rankIs, seedData, seedDue, single, yearsInJob } from './life';
import { o } from './lifeData1';

const town = (x: Ctx) => !!x.home && x.home.tier >= 1;
const idle = (x: Ctx) => x.c.act.kind === 'idle';
const noSeeds = (...ids: string[]) => (x: Ctx) => !x.P.seeds?.some(s => ids.includes(s.id));
const done = (k: string) => (x: Ctx) => x.P.flags?.['story_' + k] !== undefined;
const notDone = (k: string) => (x: Ctx) => x.P.flags?.['story_' + k] === undefined;

/** 이 고을의 이웃 하나를 세상에 만든다 (훗날 다시 만날 사람) */
function local(x: Ctx, age: number, role: Role = '평민'): number {
  const home = x.home;
  if (!home) return -1;
  const R = RACES[home.race];
  const k = createCharacter(x.w, { race: home.race, faction: home.faction, home: home.id, pos: home, born: x.w.t - Math.round(Math.max(R.adult * 0.5, age) * 12) });
  k.role = role; k.title = isAdult(x.w, k) ? 'adult' : 'child';
  return k.id;
}

// ───────────── 인연의 씨앗과 그 열매

export const STORY: LifeEv[] = [
  // 1) 도둑 아이
  { id: 'st_thief', t: '빵 도둑', w: 3, c: all(adult, town, idle, notDone('thief'), noSeeds('thief_spared', 'thief_jailed', 'thief_hired')),
    data: x => ({ oId: local(x, 10) }),
    x: '{market}에서 빵을 훔치던 아이 {o}이(가) 당신의 손에 붙잡혔다. 겁에 질린 눈이 당신을 올려다본다.',
    o: [o('놓아준다', { r: '{o}은(는) 몇 번이고 뒤를 돌아보며 달아났다.', honor: 3, flag: 'story_thief', seed: ['thief_spared', '놓아준 도둑 아이 {o}'] }),
      o('경비에게 넘긴다', { r: '{o}은(는) 울며 끌려갔다.', honor: 2, flag: 'story_thief', seed: ['thief_jailed', '감옥에 보낸 도둑 아이 {o}'] }),
      o('내 밑에서 일하게 한다', { r: '{o}에게 빵값만큼 일을 시키기로 하였다.', wealth: -10, fx: 'friend', flag: 'story_thief', seed: ['thief_hired', '거둬들인 아이 {o}'] })] },
  { id: 'st_thief_spared', t: '돌아온 아이', w: 6, c: seedDue('thief_spared'), data: seedData('thief_spared'),
    x: '몇 해 전 {market}에서 놓아준 {o}이(가) 당신을 찾아왔다. 이제는 어엿한 어른이다.',
    o: [o('반갑게 맞는다', { r: '{o}은(는) 그새 상단을 꾸린 상인이 되어 있었다. "그날 당신이 아니었다면…" 은혜를 갚겠다며 금화를 내밀었다.', wealth: 60, honor: 5, fx: 'friend', reap: 'thief_spared' }, '', ['luck', 0.55],
      { r: '{o}은(는) 숲길을 주름잡는 도적단의 두목이 되어 있었다. "길에서 당신 이름을 대시오. 아무도 건드리지 않을 거요."', fx: 'friend', flag: 'banditFriend', reap: 'thief_spared' })] },
  { id: 'st_thief_jailed', t: '출소', w: 6, c: seedDue('thief_jailed'), data: seedData('thief_jailed'),
    x: '감옥에 갔던 {o}이(가) 풀려났다. 당신의 이름을 이를 갈며 되뇐다는 소문이다.',
    o: [o('먼저 찾아가 사과한다', { r: '{o}은(는) 한참을 노려보다 등을 돌렸다. 원한은 풀린 듯하였다.', honor: 4, reap: 'thief_jailed' }, '', ['ch', 0.5], { r: '{o}의 주먹이 날아왔다.', hp: -15, fx: 'rival', reap: 'thief_jailed' }),
      o('경계를 늦추지 않는다', { r: '{o}은(는) 끝내 나타나지 않았다. 그러나 이름 하나가 숙적의 목록에 올랐다.', fx: 'rival', reap: 'thief_jailed' })] },
  { id: 'st_thief_hired', t: '거둬들인 아이', w: 6, c: seedDue('thief_hired'), data: seedData('thief_hired'),
    x: '거둬들인 {o}이(가) 어느새 듬직하게 자랐다. 이제 당신의 일을 거의 도맡아 한다.',
    o: x => [o('양자로 삼는다', { r: `{o}이(가) 처음으로 당신을 ${x.c.sex === 'F' ? '어머니' : '아버지'}라 불렀다. 집안의 핏줄이 하나 늘었다.`, fx: 'adopt', honor: 8, mood: 10, reap: 'thief_hired' }),
      o('독립을 돕는다', { r: '밑천을 쥐여 보냈다. {o}은(는) 큰절을 올리고 떠났다.', wealth: -30, honor: 8, fx: 'friend', reap: 'thief_hired' }),
      o('곁에 두고 부린다', { r: '{o} 덕에 살림이 펴졌다.', wealth: 40, reap: 'thief_hired' })] },

  // 2) 빚
  { id: 'st_loan', t: '빚', w: 3, c: all(adult, idle, x => x.c.wealth >= 60, notDone('loan')),
    data: x => ({ oId: local(x, 30) }),
    x: '이웃 {o}이(가) 찾아와 금화 50닢만 빌려 달라고 사정한다. 아이가 열병을 앓는다고 한다.',
    o: [o('빌려준다', { r: '{o}은(는) 반드시 갚겠다며 몇 번이고 고개를 숙였다.', wealth: -50, flag: 'story_loan', seed: ['loan', '{o}에게 빌려준 금화 50닢'] }),
      o('그냥 준다', { r: '{o}의 눈에 눈물이 고였다.', wealth: -50, honor: 10, flag: 'story_loan', seed: ['loan_gift', '{o}의 아이를 살린 금화'] }),
      o('거절한다', { r: '{o}은(는) 말없이 돌아섰다.', honor: -4, flag: 'story_loan' })] },
  { id: 'st_loan_back', t: '갚으러 온 이웃', w: 6, c: seedDue('loan'), data: seedData('loan'),
    x: '빚을 진 {o}의 소식이 들려왔다.',
    o: [o('기다린다', { r: '{o}이(가) 이자까지 쳐서 금화 70닢을 들고 왔다. "덕분에 아이가 살았소."', wealth: 70, fx: 'friend', reap: 'loan' }, '', ['luck', 0.6],
      { r: '{o}은(는) 야반도주하였다. 텅 빈 집에 바람만 드나든다.', mood: -8, fx: 'rival', reap: 'loan' })] },
  { id: 'st_loan_gift', t: '은인', w: 6, c: seedDue('loan_gift'), data: seedData('loan_gift'),
    x: '그때 금화로 목숨을 건진 {o}의 아이가 건강하게 자라 당신을 찾아왔다.',
    o: [o('반갑게 맞는다', { r: '아이는 당신을 은인이라 부르며 마을 사람들 앞에서 그 일을 이야기하였다.', fame: 10, honor: 8, fx: 'friend', reap: 'loan_gift' })] },

  // 3) 쓰러진 나그네 → 궁정으로 가는 길
  { id: 'st_stranger', t: '쓰러진 나그네', w: 3, c: all(adult, idle, notDone('stranger')),
    data: x => ({ nm: makeName(x.w.rngSim, x.c.race, 'M') }),
    x: '길가에 나그네 {nm}이(가) 쓰러져 있다. 옷차림은 남루하지만 손가락의 반지가 범상치 않다.',
    o: [o('집으로 데려가 돌본다', { r: '{nm}은(는) 사흘 만에 깨어나 이름만 남기고 떠났다.', wealth: -10, honor: 6, flag: 'story_stranger', seed: ['stranger_helped', '돌봐 준 나그네 {nm}'] }),
      o('반지를 빼 간다', { r: '반지는 묵직하였다.', wealth: 40, honor: -15, flag: 'story_stranger', seed: ['stranger_robbed', '나그네 {nm}에게서 훔친 반지'] }),
      o('지나친다', { r: '못 본 척 걸음을 재촉하였다.', flag: 'story_stranger' })] },
  { id: 'st_stranger_helped', t: '반지의 주인', w: 6, c: all(seedDue('stranger_helped'), x => !x.isGov && !x.isLeader), data: seedData('stranger_helped'),
    x: '{ld}의 사자가 당신을 찾아왔다. 몇 해 전 당신이 돌봐 준 나그네 {nm}은(는) 군주의 측근이었다.',
    o: [o('궁정에 나아간다', { r: '{nm}이(가) 당신을 궁정에 천거하였다. 높은 분들의 눈에 들 기회가 생겼다.', fame: 15, flag: 'govCand', reap: 'stranger_helped' }),
      o('사례만 받는다', { r: '금화 한 자루를 받았다.', wealth: 80, reap: 'stranger_helped' })] },
  { id: 'st_stranger_robbed', t: '문장 찍힌 반지', w: 6, c: seedDue('stranger_robbed'), data: seedData('stranger_robbed'),
    x: '{f} 곳곳에 방이 붙었다. 귀인 {nm}의 반지를 훔쳐 간 자를 찾는다고 한다. 반지에는 {ld}의 문장이 찍혀 있었다.',
    o: [o('자수한다', { r: '반지를 돌려주고 매를 맞았다. 그래도 목은 붙어 있다.', honor: 5, hp: -15, wealth: -40, reap: 'stranger_robbed' }),
      o('반지를 녹여 없앤다', { r: '녹인 금은 흔적도 없이 사라졌다.', reap: 'stranger_robbed' }, '', ['luck', 0.6], { r: '대장장이가 당신을 밀고하였다. 감옥에서 한 철을 보냈다.', hp: -25, honor: -20, reap: 'stranger_robbed' })] },

  // 4) 같은 길의 경쟁자 → 숙적 또는 벗
  { id: 'st_rival', t: '같은 길의 맞수', w: 3, c: all(adult, idle, yearsInJob(1), notDone('rival'), x => x.c.role !== '백수' && x.c.role !== '노예'),
    data: x => ({ oId: local(x, Math.max(18, x.age), x.c.role) }),
    x: '같은 {job} 일을 하는 {o}이(가) {h} 사람들 앞에서 당신의 솜씨를 깎아내렸다.',
    o: [o('공개 시합을 청한다', { r: '사람들 앞에서 {o}을(를) 꺾었다!', fame: 8, flag: 'story_rival', seed: ['rival_beaten', '시합에서 꺾은 맞수 {o}'] }, '', ['mi', 0.5], { r: '{o}에게 지고 말았다. 비웃음이 쏟아졌다.', fame: -5, mood: -8, flag: 'story_rival', seed: ['rival_lost', '설욕해야 할 맞수 {o}'] }),
      o('뒤에서 헐뜯어 되갚는다', { r: '{o}의 평판에 흠집을 냈다.', honor: -5, fx: 'rival', flag: 'story_rival', seed: ['rival_feud', '앙숙이 된 {o}'] }),
      o('웃어넘긴다', { r: '{o}이(가) 머쓱해하였다.', honor: 3, flag: 'story_rival' })] },
  { id: 'st_rival_lost', t: '설욕전', w: 6, c: seedDue('rival_lost'), data: seedData('rival_lost'),
    x: '그날의 패배를 잊은 적이 없다. {o}이(가) 다시 시합을 받아들였다.',
    o: [o('이번에는 이긴다', { r: '{o}을(를) 꺾었다. 그날의 비웃음이 박수로 바뀌었다.', fame: 15, mood: 15, fx: 'friend', reap: 'rival_lost' }, '', ['mi', 0.6], { r: '또 졌다. {o}이(가) 손을 내밀었다. "당신만 한 맞수도 없소."', fx: 'friend', reap: 'rival_lost' })] },
  { id: 'st_rival_beaten', t: '패자의 방문', w: 6, c: seedDue('rival_beaten'), data: seedData('rival_beaten'),
    x: '시합에서 꺾었던 {o}이(가) 찾아왔다.',
    o: [o('맞이한다', { r: '{o}은(는) 무릎을 꿇고 가르침을 청하였다. 첫 제자가 생겼다.', fame: 8, fx: 'friend', reap: 'rival_beaten' }, '', ['luck', 0.6],
      { r: '{o}은(는) 그새 실력을 갈고닦아 다시 도전장을 내밀었다. 이번엔 당신이 졌다.', fame: -6, fx: 'rival', reap: 'rival_beaten' })] },
  { id: 'st_rival_feud', t: '앙숙', w: 6, c: seedDue('rival_feud'), data: seedData('rival_feud'),
    x: '{o}이(가) 당신에 대한 헛소문을 퍼뜨리고 다닌다. 사람들의 눈길이 달라졌다.',
    o: [o('결투를 신청한다', { r: '', fx: 'duel', reap: 'rival_feud' }, '목숨을 건다'), o('화해를 청한다', { r: '오랜 앙금을 술 한잔에 털었다.', fx: 'friend', honor: 6, reap: 'rival_feud' }, '', ['ch', 0.5], { r: '{o}은(는) 술잔을 엎었다.', mood: -6, reap: 'rival_feud' })] },

  // 5) 스승
  { id: 'st_mentor', t: '늙은 스승', w: 3, c: all(adult, idle, yearsInJob(1), notDone('mentor'), x => x.c.role !== '백수' && x.c.role !== '노예'),
    data: x => ({ oId: local(x, Math.round(RACES[x.c.race].lifespan[0] * 0.72), x.c.role) }),
    x: '늙은 {job} {o}이(가) 당신의 재능을 알아보았다. "내 모든 것을 가르쳐 주마."',
    o: [o('제자가 된다', { r: '{o}의 가르침은 엄하고도 깊었다.', in: 2, mi: 2, fx: 'friend', flag: 'story_mentor', seed: ['mentor', '스승 {o}의 가르침'] }),
      o('혼자 길을 가겠다고 한다', { r: '{o}은(는) 아쉬운 듯 웃었다.', flag: 'story_mentor' })] },
  { id: 'st_mentor_end', t: '스승의 마지막', w: 6, c: seedDue('mentor'), data: seedData('mentor'),
    x: '스승 {o}이(가) 병상에 누웠다. 마지막으로 당신을 불렀다.',
    o: [o('곁을 지킨다', { r: '스승은 평생 아끼던 연장을 당신 손에 쥐여 주고 눈을 감았다.', fx: 'mentor_pass', item: '스승의 유품', mi: 3, in: 3, honor: 6, flag: 'mentorLegacy', reap: 'mentor' }),
      o('일이 바빠 가지 못한다', { r: '부고를 받고서야 달려갔다. 무덤 앞에서 오래 서 있었다.', fx: 'mentor_pass', mood: -12, reap: 'mentor' })] },

  // 6) 맹세
  { id: 'st_oath', t: '맹세', w: 2, c: all(adult, notDone('oath'), x => x.c.traits[5] >= 55),
    x: '{temple}에서 {deity}께 평생의 맹세를 올릴 기회가 왔다. 한번 한 맹세는 거둘 수 없다.',
    o: [o('맹세한다', { r: '{deity} 앞에서 정직하게 살겠다고 맹세하였다.', honor: 5, flag: 'story_oath', seed: ['oath', '{deity} 앞에서 한 정직의 맹세'] }), o('아직은 때가 아니다', { r: '맹세는 무거운 것이다.', flag: 'story_oath' })] },
  { id: 'st_oath_test', t: '맹세의 시험', w: 6, c: seedDue('oath'), data: seedData('oath'),
    x: '낯선 귀족이 금화 한 자루를 내밀었다. 법정에서 거짓 증언 한마디만 해 달라고 한다. {deity} 앞에서의 맹세가 떠오른다.',
    o: [o('맹세를 지킨다', { r: '자루를 밀어냈다. 그날 이후 사람들은 당신을 맹세를 지킨 자라 불렀다.', honor: 20, fame: 8, ep: '맹세를 지킨', reap: 'oath' }),
      o('금화를 받는다', { r: '자루는 묵직했지만, 밤마다 꿈자리가 사나웠다.', wealth: 100, honor: -25, mood: -15, reap: 'oath' })] },

  // 7) 낡은 지도
  { id: 'st_map', t: '낡은 지도', w: 2, c: all(adult, notDone('map')),
    x: x => x.P.flags?.orphan !== undefined ? '고물상에서 헐값에 산 낡은 궤짝 바닥에서 지도가 나왔다. 알아볼 수 없는 표시들이 빼곡하다.' : '돌아가신 할아버지의 궤짝 바닥에서 낡은 지도가 나왔다. 알아볼 수 없는 표시들이 빼곡하다.',
    o: [o('해독에 매달린다', { r: '몇 날 밤을 지새웠다. 실마리가 잡히는 듯하다.', in: 1, flag: 'story_map', seed: ['map', '할아버지의 낡은 지도'] }, '', ['in', 0.5], { r: '아무리 봐도 모르겠다. 지도는 다시 궤짝으로 들어갔다.', flag: 'story_map' }),
      o('골동품상에 판다', { r: '몇 푼 받았다.', wealth: 15, flag: 'story_map' })] },
  { id: 'st_map_found', t: '지도가 가리키는 곳', w: 6, c: all(seedDue('map'), idle), data: seedData('map'),
    x: '마침내 지도의 표시가 어디를 가리키는지 알아냈다. 할아버지가 젊은 날 숨겨 둔 무언가가 있다.',
    o: [o('길을 떠난다', { r: '지도를 품에 넣고 길을 나섰다.', fx: 'adventure', reap: 'map' }), { ...o('지도를 아들딸에게 물려준다', { r: '언젠가 아이들이 찾아가리라.', reap: 'map' }), show: (x: Ctx) => x.c.children.some(id => x.w.chars[id]?.died < 0) }, o('지도를 다시 궤짝에 넣는다', { r: '아직은 때가 아니다.', reap: 'map' })] },

  // 8) 용에게 한 복수의 맹세 (재앙에서 시작된다)
  { id: 'st_dragon_vengeance', t: '복수의 때', w: 6, c: all(seedDue('dragon_vengeance'), idle, x => { const d = x.w.chars[+(x.P.seeds?.find(s => s.id === 'dragon_vengeance')?.data.dId ?? -1)]; return !!d && d.died < 0; }),
    data: seedData('dragon_vengeance'),
    x: '고향을 불태운 용 {d}의 둥지를 알아냈다. 맹세를 지킬 때가 왔다.',
    o: [o('홀로 둥지로 간다', { r: '', fx: 'duel_dragon', reap: 'dragon_vengeance' }, '살아 돌아오기 어렵다'),
      o('맹세를 가슴에 묻는다', { r: '복수보다 살아남은 이들을 지키기로 하였다.', honor: 3, reap: 'dragon_vengeance' })] },
  { id: 'st_resistance', t: '봉기의 밤', w: 6, c: seedDue('resistance'), data: seedData('resistance'),
    x: '저항군이 무기를 모았다. 오늘 밤 성문을 열고 옛 깃발을 올린다.',
    o: [o('선두에 선다', { r: '', fx: 'uprising', reap: 'resistance' }, '고을을 되찾거나, 목숨을 잃는다'), o('뒤로 빠진다', { r: '봉기는 당신 없이 시작되었다.', honor: -6, reap: 'resistance' })] },
];

// ───────────── 직업의 길: 수습 → 숙련 → 명인 → 거장

const GROUP: Record<string, string[]> = {
  전사: ['신병', '고참', '백전노장', '전설의 검'], 기사: ['종자', '기사', '기사단장', '전설의 기사'], 모험가: ['풋내기 모험가', '노련한 모험가', '이름난 모험가', '전설의 모험가'],
  사냥꾼: ['몰이꾼', '사냥꾼', '명사수', '숲의 전설'], 암살자: ['칼잡이', '그림자', '이름 없는 죽음', '전설의 암살자'],
  대장장이: ['풀무꾼', '대장장이', '명장', '불의 거장'], 장인: ['수습공', '장인', '명인', '거장'], 연금술사: ['조수', '연금술사', '현자의 제자', '대연금술사'],
  학자: ['서생', '학자', '석학', '대학자'], 마법사: ['견습 마법사', '마법사', '대마법사', '마도의 거장'], 치유사: ['약초꾼', '치유사', '명의', '생명의 손'],
  성직자: ['수련 사제', '사제', '대사제', '성자'], 상인: ['행상', '상인', '대상인', '거상'], 선원: ['갑판원', '항해사', '선장', '바다의 전설'],
  농부: ['소작농', '농부', '큰 농부', '대지주'], 광부: ['곡괭이꾼', '광부', '갱도장', '광산왕'], 음유시인: ['떠돌이 가객', '음유시인', '이름난 시인', '노래의 전설'],
  도적: ['좀도둑', '도적', '도적 두목', '전설의 대도'],
};
export function rankTitle(role: string, rank: number): string {
  const g = GROUP[role];
  return g ? g[clamp(rank, 0, 3)] : ['수습', '숙련된', '이름난', '전설의'][clamp(rank, 0, 3)] + (rank > 0 ? ` ${role}` : '');
}
const CHECK: Record<string, 'mi' | 'in' | 'ma' | 'ch' | 'co'> = { 전사: 'mi', 기사: 'co', 모험가: 'mi', 사냥꾼: 'mi', 암살자: 'mi', 대장장이: 'mi', 장인: 'in', 연금술사: 'in', 학자: 'in', 마법사: 'ma', 치유사: 'in', 성직자: 'ch', 상인: 'ch', 선원: 'co', 농부: 'co', 광부: 'mi', 음유시인: 'ch', 도적: 'in' };
const jobOk = (x: Ctx) => !!GROUP[x.c.role] && idle(x);
const nextTitle = (x: Ctx) => rankTitle(x.c.role, (x.P.jobRank ?? 0) + 1);
const memory = (x: Ctx) => {
  const bits: string[] = [];
  if (x.P.flags?.mentorLegacy !== undefined) bits.push('스승의 마지막 가르침이 귓가에 맴돈다.');
  const rival = x.P.seeds?.find(s => s.id.startsWith('rival'));
  if (rival) bits.push(`${rival.note}도 이 소식을 듣고 있을 것이다.`);
  return bits.join(' ');
};

export const CAREER: LifeEv[] = [
  { id: 'cr_rank1', t: '첫 인정', cd: 24, w: 5, c: all(adult, jobOk, rankIs(0), yearsInJob(2)),
    x: x => `{job} 일을 한 지 몇 해, 실력을 인정받을 기회가 왔다. 붙으면 이제 '${nextTitle(x)}'(이)라 불릴 것이다. ${memory(x)}`,
    o: x => [o('시험에 도전한다', { r: `이제 사람들은 당신을 '${nextTitle(x)}'(이)라 부른다.`, fx: 'rank_up', fame: 6 }, '', [CHECK[x.c.role] ?? 'in', 0.55], { r: '아직 모자랐다. 다음을 기약하였다.', mood: -6 }),
      o('아직은 배울 때다', { r: '한 해 더 기본을 다졌다.', in: 1 })] },
  { id: 'cr_rank2', t: '큰일', cd: 24, w: 5, c: all(adult, jobOk, rankIs(1), yearsInJob(5)),
    x: x => `'${rankTitle(x.c.role, 1)}' {n}의 이름이 {h} 밖까지 퍼지기 시작하였다. 큰일 하나가 당신을 기다린다. ${memory(x)}`,
    o: x => [o('맡는다', { r: `일을 훌륭히 해냈다. 이제 '${nextTitle(x)}' {n}이다.`, fx: 'rank_up', fame: 15, wealth: 40 }, '', [CHECK[x.c.role] ?? 'in', 0.6], { r: '일을 그르쳤다. 평판에 금이 갔다.', fame: -8 }),
      o('분수에 맞게 산다', { r: '욕심내지 않았다.', mood: 4 })] },
  { id: 'cr_rank3', t: '평생의 역작', cd: 36, w: 6, c: all(adult, jobOk, rankIs(2), yearsInJob(9)),
    x: x => `평생 갈고닦은 솜씨를 세상에 남길 때가 왔다. '${nextTitle(x)}'(이)라는 이름은 아무에게나 허락되지 않는다. ${memory(x)}`,
    o: x => [o('모든 것을 건다', { r: `세상이 당신을 '${nextTitle(x)}'(이)라 부르기 시작하였다. 그 이름은 오래도록 남을 것이다.`, fx: 'rank_up', fame: 40, honor: 10, ep: nextTitle(x) }, '', [CHECK[x.c.role] ?? 'in', 0.65], { r: '역작은 끝내 완성되지 못하였다.', mood: -10 }),
      o('제자를 길러 뒤를 맡긴다', { r: '당신의 솜씨는 제자들의 손끝에 남았다.', honor: 10, fame: 10 })] },
];

// ───────────── 가문의 이야기

const myHouse = (x: Ctx) => (x.c.house !== undefined ? x.w.houses[x.c.house] : undefined);
const isHead = (x: Ctx) => { const h = myHouse(x); return !!h && h.alive && h.head === x.c.id; };
const inHouse = (x: Ctx) => { const h = myHouse(x); return !!h && h.alive; };

export const HOUSE: LifeEv[] = [
  { id: 'hs_found', t: '가문을 일으키다', once: true, w: 5, c: all(adult, x => !inHouse(x) && x.c.fame >= 60 && x.c.honor >= 40 && honorFaction(x.w, x.f)),
    x: '{n}의 이름은 이제 {f}에서 모르는 이가 없다. 이 이름을 대대로 이어 갈 가문을 세울 수 있다.',
    o: [o('가문을 세운다', { r: '', fx: 'found_house', honor: 10 }), o('이름은 나 하나로 족하다', { r: '가문 없이 살기로 하였다.' })] },
  { id: 'hs_match', t: '혼담', cd: 48, w: 4, c: all(adult, single, inHouse),
    data: x => {
      const h = myHouse(x)!;
      const cand = x.w.chars.filter(k => k.died < 0 && k.spouse < 0 && k.sex !== x.c.sex && k.race === x.c.race && isAdult(x.w, k) && k.house !== undefined && k.house !== h.id
        && x.w.houses[k.house]?.alive && x.w.houses[k.house].faction === h.faction && Math.abs(ageOf(x.w, k) - x.age) < 15 && !k.isPlayer);
      const k = cand[0];
      return k ? { oId: k.id, hn: x.w.houses[k.house!].name } : null;
    },
    x: '{hn}에서 혼담이 들어왔다. 상대는 {o}. 두 가문이 손을 잡자는 뜻이다.',
    o: [o('혼인한다', { r: '두 가문의 깃발이 나란히 걸렸다.', fx: 'marry', honor: 5 }), o('사랑 없는 혼인은 싫다', { r: '{hn}의 얼굴에 먹칠을 하였다.', honor: -5, mood: 5 })] },
  { id: 'hs_heir', t: '후계', cd: 120, w: 5, c: all(adult, isHead, x => x.c.children.filter(id => x.w.chars[id]?.died < 0 && isAdult(x.w, x.w.chars[id])).length >= 2),
    data: x => {
      const kids = x.c.children.map(id => x.w.chars[id]).filter(k => k && k.died < 0 && isAdult(x.w, k)).sort((a, b) => a.born - b.born);
      const best = kids.slice().sort((a, b) => (b.stats.might + b.stats.intellect + b.stats.charisma) - (a.stats.might + a.stats.intellect + a.stats.charisma))[0];
      return { aId: kids[0].id, bId: best.id };
    },
    x: x => `${myHouse(x)!.name}의 가주로서 후계를 정할 때가 왔다. 맏이 {a}인가, 가장 뛰어난 {b}인가.`,
    o: [o('맏이 {a}에게 잇는다', { r: '법도대로 하였다. 가문이 안정되었다.', fx: 'heir_a', honor: 5 }), o('뛰어난 {b}에게 잇는다', { r: '능력을 택하였다. 맏이의 눈빛이 차가워졌다.', fx: 'heir_b' })] },
  { id: 'hs_glory', t: '가문의 이름', cd: 60, w: 3, c: all(adult, isHead),
    x: x => `${myHouse(x)!.name}의 명망을 드높일 방법을 고민한다.`,
    o: [o('성대한 연회를 연다', { r: '{f}의 귀족들이 모두 모였다.', wealth: -60, fx: 'house_glory' }), o('신전에 큰 기부를 한다', { r: '가문의 이름이 신전 기둥에 새겨졌다.', wealth: -50, honor: 8, fx: 'house_glory' }),
      o('가문의 역사를 책으로 엮는다', { r: '선조들의 이야기가 한 권의 책이 되었다.', in: 2, fx: 'house_glory' })] },
];

// ───────────── 효과

export function storyFx(x: Ctx, fx: string, data: Record<string, number | string>): string | undefined | null {
  const { w, c } = x;
  switch (fx) {
    case 'rank_up': {
      x.P.jobRank = Math.min(3, (x.P.jobRank ?? 0) + 1);
      const t = rankTitle(c.role, x.P.jobRank);
      charLog(w, c, `'${t}'의 자리에 올랐다.`, 3);
      if (x.P.jobRank >= 3) addNews(w, `${c.name}이(가) '${t}'(이)라 불리게 되었다.`, 3, 'player', { chars: [c.id] });
      return;
    }
    case 'adopt': {
      const k = w.chars[+data.oId];
      if (!k || k.died >= 0) return;
      if (!c.children.includes(k.id)) c.children.push(k.id);
      if (c.sex === 'F') k.mother = c.id; else k.father = c.id;
      if (c.house !== undefined) k.house = c.house;
      addRel(w, c, k, 50);
      return;
    }
    case 'mentor_pass': {
      const m = w.chars[+data.oId];
      if (m && m.died < 0) {
        m.died = w.t; m.cause = '노환';
        charLog(w, m, `제자 ${c.name}의 곁에서 눈을 감았다.`, 2);
      }
      return;
    }
    case 'found_house': {
      const h = ensureHouse(w, c, x.home && x.home.faction === c.faction ? x.home : undefined);
      return h ? `${h.name}이(가) 세워졌다. 당신이 그 시조이다.` : '가문을 세울 수 있는 나라가 아니었다.';
    }
    case 'heir_a': case 'heir_b': {
      const k = w.chars[+(fx === 'heir_a' ? data.aId : data.bId)];
      if (!k) return;
      x.P.flags ??= {};
      x.P.flags.heir = k.id;
      const other = w.chars[+(fx === 'heir_a' ? data.bId : data.aId)];
      if (other && other !== k) addRel(w, other, c, -15);
      return `${k.name}이(가) 다음 가주로 정해졌다.`;
    }
    case 'house_glory': {
      const h = myHouse(x);
      if (h) { h.prestige += 15; return `${h.name}의 명망이 높아졌다.`; }
      return;
    }
    case 'duel_dragon': {
      const d = w.chars[+data.dId];
      if (!d || d.died >= 0) return '용은 이미 세상에 없었다.';
      const win = duel(w, c, d, '복수의 결투');
      return win === c ? `마침내 용 ${d.name}을(를) 쓰러뜨렸다. 고향의 원수를 갚았다.` : '';
    }
    case 'uprising': {
      const s = x.home;
      if (!s || !s.alive) return '되찾을 고을이 남아 있지 않았다.';
      const p = clamp((c.stats.might + c.stats.command) / 220, 0.12, 0.6);
      if (w.rngSim.chance(p)) {
        const nf = secede(w, c, s);
        return `봉기가 성공하였다! ${s.name}에 옛 깃발이 올랐다. 이제 당신이 ${nf.name}의 주인이다.`;
      }
      if (w.rngSim.chance(0.4)) { killChar(w, c, `${s.name} 봉기에서 전사`); return ''; }
      c.stats.health = clamp(c.stats.health - 40);
      return '봉기는 피로 진압되었다. 간신히 몸을 피하였다.';
    }
  }
  return null;
}

/** 나의 일대기 맨 위: 지금까지의 이야기 */
export function storySummary(w: World, c: Character): string[] {
  const P = w.player!;
  const out: string[] = [];
  const origin = P.flags?.noble !== undefined ? '귀족 집안' : P.flags?.orphan !== undefined ? '고아' : '평민 집안';
  out.push(`${RACES[c.race].name} · ${ageOf(w, c)}세 · ${origin} 출신`);
  const path = (P.jobsHad ?? []).filter(r => r !== c.role);
  const yrs = P.jobSince !== undefined ? Math.floor((w.t - P.jobSince) / 12) : 0;
  out.push(`지금: ${GROUP[c.role] ? rankTitle(c.role, P.jobRank ?? 0) : c.role}${yrs ? ` (${c.role} ${yrs}년째)` : ''}${path.length ? ` · 거쳐 온 길: ${path.join(' → ')}` : ''}`);
  const h = c.house !== undefined ? w.houses[c.house] : undefined;
  if (h) out.push(`가문: ${h.name}${h.head === c.id ? '의 가주' : '의 식구'}${h.royal ? ' (왕가)' : ''} · 명망 ${h.prestige}`);
  const sp = w.chars[c.spouse];
  const kids = c.children.filter(id => w.chars[id]?.died < 0).length;
  if (sp || kids) out.push(`가족: ${sp ? `배우자 ${sp.name}` : '홀몸'}${kids ? ` · 자녀 ${kids}명` : ''}`);
  const friends = Object.entries(c.relations).filter(([, v]) => v >= 60).map(([id]) => w.chars[+id]).filter(k => k && k.died < 0 && k.id !== c.spouse && !c.children.includes(k.id)).slice(0, 3);
  const foes = Object.entries(c.relations).filter(([, v]) => v <= -50).map(([id]) => w.chars[+id]).filter(k => k && k.died < 0).slice(0, 3);
  if (friends.length) out.push(`벗: ${friends.map(k => k.name).join(', ')}`);
  if (foes.length) out.push(`숙적: ${foes.map(k => k.name).join(', ')}`);
  if (P.seeds?.length) out.push(`아직 끝나지 않은 인연: ${P.seeds.map(s => s.note).join(' · ')}`);
  return out;
}

FX_HOOKS.push(storyFx);
