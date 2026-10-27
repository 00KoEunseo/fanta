// 인생 이벤트 데이터 10: 다스리는 이의 나날, 쓰러진 몸, 마지막 말.
// 왕좌에 오른 이는 더 이상 던전을 헤매지 않는다. 대신 영주의 반심, 빈 곳간, 후계를 둘러싼 눈치싸움을 마주한다.
// 크게 다친 몸은 한 번에 무너지지 않는다. 쓰러졌다가 일어나거나, 두 번째 상처에 무너진다.
import { knows } from './contact';
import type { Character, Settlement } from './state';
import { AMBITION, PRUDENCE } from '../data/traits';
import { FOOD, GOLD, ORE } from '../data/terrain';
import { addNews, charLog } from './news';
import { addFacRel, addRel, clamp, isAdult, settlementsOf } from './helpers';
import { secede } from './factions';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all, job } from './life';
import { o } from './lifeData1';

const ruler = (x: Ctx) => x.isLeader && !!x.f;
const kidsAlive = (x: Ctx) => x.c.children.map(id => x.w.chars[id]).filter((k): k is Character => !!k && k.died < 0);
const gold = (x: Ctx) => settlementsOf(x.w, x.f!).reduce((a, s) => a + s.stock[GOLD], 0);

/** 반심을 품은 영주 */
function restlessLord(x: Ctx): { s: Settlement; g: Character } | null {
  if (!x.f) return null;
  for (const s of settlementsOf(x.w, x.f)) {
    const g = x.w.chars[s.governor];
    if (!g || g.died >= 0 || g.isPlayer || s.id === x.f.capital) continue;
    if (g.traits[AMBITION] > 60 && (g.relations[x.c.id] ?? 0) < 10) return { s, g };
  }
  return null;
}

export const RULE: LifeEv[] = [
  { id: 'rule_lord', t: '반심을 품은 영주', cd: 48, w: 5, c: all(ruler, x => !!restlessLord(x)),
    data: x => { const r = restlessLord(x)!; return { gId: r.g.id, ls: r.s.id, lsName: r.s.name }; },
    x: '{lsName}의 영주 {g}이(가) 세금을 보내지 않는다. 그의 성에서 사병을 모은다는 소문이 들려온다.',
    o: [o('금과 작위로 달랜다', { r: '{g}은(는) 머리를 조아렸다. 적어도 지금은.', wealth: -60, fx: 'lord_appease' }),
      o('도성으로 불러 문책한다', { r: '{g}이(가) 무릎을 꿇고 용서를 빌었다.', fx: 'lord_cowed', honor: 4 }, '권위가 서면 굴복하고, 모자라면 반란이 난다', ['co', 0.55], { r: '', fx: 'lord_rebels' }),
      o('못 본 척한다', { r: '{g}의 성에서 들려오는 소문은 날로 커졌다.', fx: 'lord_ignore' })] },
  { id: 'rule_heirs', t: '후계를 둘러싼 눈치', cd: 60, w: 5, once: true, c: all(ruler, x => kidsAlive(x).filter(k => isAdult(x.w, k)).length >= 2 && x.P.flags?.heir === undefined),
    data: x => {
      const ks = kidsAlive(x).filter(k => isAdult(x.w, k)).sort((a, b) => a.born - b.born);
      const best = ks.slice().sort((a, b) => (b.stats.command + b.stats.intellect) - (a.stats.command + a.stats.intellect))[0];
      return { eldId: ks[0].id, bestId: best.id };
    },
    x: '신하들이 둘로 갈렸다. 맏이 {eld}을(를) 미는 자들과, 뛰어난 {best}을(를) 미는 자들. 모두가 당신의 입만 바라본다.',
    o: x => {
      const ks = kidsAlive(x).filter(k => isAdult(x.w, k)).sort((a, b) => a.born - b.born);
      const best = ks.slice().sort((a, b) => (b.stats.command + b.stats.intellect) - (a.stats.command + a.stats.intellect))[0];
      return [
        o('맏이에게 잇는다', { r: '법도를 따랐다. 궁정이 고개를 끄덕였다.', fx: `name_heir:${ks[0].id}`, honor: 3 }),
        ...(best.id !== ks[0].id ? [o(`뛰어난 ${best.name}에게 잇는다`, { r: '능력을 택하였다. 맏이의 눈빛이 차가워졌다.', fx: `name_heir:${best.id}` })] : []),
        o('아직 정하지 않는다', { r: '궁정의 수군거림은 그치지 않았다.', mood: -4 }),
      ];
    } },
  { id: 'rule_treasury', t: '빈 곳간', cd: 48, w: 4, c: all(ruler, x => gold(x) < 30 * settlementsOf(x.w, x.f!).length),
    x: '재무관이 장부를 덮으며 고개를 젓는다. "금고가 바닥입니다. 이대로면 병사들 봉급도 줄 수 없습니다."',
    o: [o('세금을 올린다', { r: '금고는 찼지만 백성들의 원성이 높아졌다.', fx: 'tax_up' }),
      o('왕실의 보물을 내다 판다', { r: '대대로 내려온 보물이 상인들 손에 넘어갔다.', fx: 'sell_jewels', honor: 3 }),
      o('귀족들에게 돈을 빌린다', { r: '귀족들은 웃으며 돈을 내놓았다. 그 웃음이 마음에 걸린다.', fx: 'borrow' })] },
  { id: 'rule_famine', t: '굶주린 나라', cd: 36, w: 5, c: all(ruler, x => !!x.f?.flags.includes('food_crisis')),
    x: '나라 곳곳에서 굶어 죽는 이가 나온다. 왕실 곡창에는 아직 곡식이 남아 있다.',
    o: [o('왕실 곡창을 연다', { r: '곡창 문이 열리자 백성들이 무릎을 꿇고 울었다.', fx: 'open_granary', honor: 10, fame: 6 }),
      o('이웃 나라에서 곡식을 사 온다', { r: '수레 행렬이 국경을 넘어 들어왔다.', wealth: -80, fx: 'buy_grain' }),
      o('견디라고 이른다', { r: '백성들의 눈빛에서 무언가가 꺼져 갔다.', fx: 'endure', honor: -8 })] },
  { id: 'rule_envoy', t: '이웃의 사신', cd: 36, w: 4, c: all(ruler, x => !!envoyFrom(x)),
    data: x => { const e = envoyFrom(x)!; return { ef: e.id, efName: e.name }; },
    x: '{efName}의 사신이 비단과 향료를 들고 찾아왔다. "두 나라가 손을 잡는다면 서로에게 좋지 않겠습니까?"',
    o: [o('손을 맞잡는다', { r: '두 나라 사이에 술잔이 오갔다.', fx: 'envoy_accept' }), o('선물만 받고 돌려보낸다', { r: '사신은 굳은 얼굴로 돌아갔다.', wealth: 20, fx: 'envoy_snub' }),
      o('사신을 모욕하여 쫓아낸다', { r: '사신의 수염을 잘라 돌려보냈다. 국경에 긴장이 감돈다.', fx: 'envoy_insult', honor: -5 })] },
  { id: 'rule_petition', t: '백성의 청원', cd: 30, w: 3, c: ruler,
    x: '{h}의 늙은 농부가 궁에 들어와 엎드렸다. 영주의 아들이 딸을 데려가고 돌려보내지 않는다는 것이다.',
    o: [o('영주의 아들을 벌한다', { r: '백성들 사이에 왕의 이름이 칭송되었다.', honor: 12, fx: 'petition_just' }), o('영주와 조용히 타협한다', { r: '농부는 금화 몇 닢을 쥐고 돌아갔다. 딸은 돌아오지 않았다.', honor: -6, wealth: -10 }),
      o('귀찮게 하지 말라며 내친다', { r: '그날 밤 궁 밖에서 곡소리가 들렸다.', honor: -12 })] },
];

/** 손을 내밀 만한 이웃 (전쟁 중이 아니고, 사이가 나쁘지 않은) */
function envoyFrom(x: Ctx) {
  const f = x.f;
  if (!f) return null;
  return x.w.factions.filter(o2 => o2.alive && o2 !== f && knows(x.w, f, o2) && f.wars[o2.id] === undefined && (f.relations[o2.id] ?? 0) > -10 && !f.treaties.some(t => t.with === o2.id))
    .sort((a, b) => (f.relations[b.id] ?? 0) - (f.relations[a.id] ?? 0))[0] ?? null;
}


// ───────────── 직업의 길에서 만나는 큰일 (직업마다 두 가지)

const working = (x: Ctx) => x.c.act.kind === 'idle' && x.years >= 2;
export const ARCS: LifeEv[] = [
  { id: 'ar_sailor_storm', t: '폭풍 속의 갑판', cd: 72, w: 4, c: all(adult, job('선원'), working),
    x: '폭풍이 배를 집어삼키려 한다. 선장이 돛대에 머리를 부딪쳐 쓰러졌다. 모두의 눈이 당신에게 쏠린다.',
    o: [o('키를 잡는다', { r: '밤새 키를 붙들고 배를 항구까지 끌고 왔다. 선원들이 당신을 선장이라 불렀다.', fame: 15, co: 3 }, '배와 목숨이 걸렸다', ['co', 0.5], { r: '배는 암초에 걸렸고, 몇몇은 돌아오지 못하였다.', hp: -20, honor: -5 }),
      o('구명정을 내린다', { r: '배는 잃었지만 사람은 살렸다.', honor: 6, wealth: -20 })] },
  { id: 'ar_sailor_strait', t: '지도에 없는 해협', cd: 96, w: 3, c: all(adult, job('선원'), working),
    x: '늙은 어부가 술에 취해 털어놓았다. 안개 너머에 지도에 없는 해협이 있다고. 그 길이면 뱃길이 절반으로 준다.',
    o: [o('찾아 나선다', { r: '안개 속에서 해협을 찾아냈다! 항구마다 당신의 이름이 오르내렸다.', fame: 20, wealth: 40 }, '', ['in', 0.45], { r: '안개 속을 헤매다 빈손으로 돌아왔다.', hp: -6 }),
      o('취객의 헛소리로 넘긴다', { r: '그 해협을 찾은 것은 몇 년 뒤의 다른 선원이었다.', mood: -3 })] },
  { id: 'ar_miner_collapse', t: '무너진 갱도', cd: 72, w: 4, c: all(adult, job('광부'), working),
    x: '굉음과 함께 갱도가 무너졌다. 돌무더기 너머에서 동료들이 벽을 두드리는 소리가 들린다. 버팀목이 다시 삐걱인다.',
    o: [o('맨손으로 파 들어간다', { r: '피투성이 손으로 동료 셋을 끌어냈다. 그날 이후 갱도의 모두가 당신에게 목숨을 빚졌다.', honor: 15, fame: 10 }, '', ['mi', 0.5], { r: '두 번째 붕괴가 덮쳤다.', hp: -35 }),
      o('지원을 부르러 달려간다', { r: '구조대가 왔을 때는 이미 늦은 이도 있었다.', honor: 2 })] },
  { id: 'ar_miner_vein', t: '새 광맥', cd: 96, w: 3, c: all(adult, job('광부'), working),
    x: '곡괭이 끝에서 낯선 빛이 번쩍였다. 아무도 모르는 굵은 광맥이다.',
    o: [o('고을에 알린다', { r: '{h}에 광석이 쏟아져 들어왔다. 사람들이 당신의 이름으로 갱도를 불렀다.', fame: 12, fx: 'vein_town' }),
      o('몰래 혼자 캐낸다', { r: '밤마다 몰래 캐낸 광석으로 주머니가 두둑해졌다.', wealth: 70, honor: -6 })] },
  { id: 'ar_healer_plague', t: '역병의 실마리', cd: 60, w: 6, c: all(adult, job('치유사'), working, x => (x.home?.plague ?? 0) > 0),
    x: '{h}에 번진 역병의 환자들을 보다가 공통점을 하나 찾아냈다. 모두 같은 우물의 물을 마셨다.',
    o: [o('우물을 막고 치료법을 시험한다', { r: '우물을 막자 새 환자가 줄었다. {h}이(가) 살아났다.', fame: 25, honor: 15, in: 2, fx: 'cure_plague' }, '', ['in', 0.5], { r: '시험한 약이 듣지 않았다. 병자 몇이 더 죽었다.', mood: -10 }),
      o('영주에게 보고만 한다', { r: '보고서는 서류 더미 속에 묻혔다.', in: 1 })] },
  { id: 'ar_healer_noble', t: '귀족의 병상', cd: 84, w: 3, c: all(adult, job('치유사'), working),
    x: '영주의 외동아들이 이름 모를 병으로 누웠다. 이름난 의원들이 모두 고개를 저었다. 실패하면 목이 위태롭다.',
    o: [o('맡는다', { r: '아이가 눈을 떴다. 영주가 금화 자루를 내밀었다.', wealth: 120, fame: 15 }, '', ['in', 0.45], { r: '아이는 끝내 숨을 거두었다. 영주의 눈길이 칼날 같았다.', honor: -10, mood: -15 }),
      o('사양한다', { r: '다른 의원이 불려 갔다.' })] },
  { id: 'ar_merchant_route', t: '새 상로', cd: 72, w: 4, c: all(adult, job('상인'), working, x => (x.f?.treaties.length ?? 0) > 0),
    x: '{f}이(가) 맺은 교역 협정으로 국경 너머 길이 열렸다. 첫 상단을 꾸리는 자가 그 길의 주인이 된다.',
    o: [o('전 재산을 걸고 상단을 꾸린다', { r: '수레가 돌아왔을 때 재산은 세 배가 되어 있었다.', wealth: 150, fame: 10 }, '', ['ch', 0.5], { r: '도적과 관세에 털려 반쯤 빈 수레만 돌아왔다.', wealth: -60 }),
      o('남이 닦은 길을 따라간다', { r: '작지만 확실한 이문을 남겼다.', wealth: 30 })] },
  { id: 'ar_merchant_debt', t: '빚진 귀족', cd: 84, w: 3, c: all(adult, job('상인'), working),
    x: '외상을 쌓아 온 귀족이 돈 대신 영지의 땅문서를 내밀었다. "이걸로 셈하세."',
    o: [o('땅문서를 받는다', { r: '상인이 지주가 되었다. 귀족들이 뒤에서 수군거렸다.', fame: 8, honor: -3, wealth: 20 }), o('끝까지 돈으로 받아 낸다', { r: '반년을 졸라 돈을 받아 냈다. 귀족은 원수가 되었다.', wealth: 60, honor: -2 }),
      o('빚을 탕감해 준다', { r: '귀족은 눈물을 글썽이며 평생 은혜를 잊지 않겠다고 하였다.', wealth: -40, honor: 10 })] },
  { id: 'ar_knight_tourney', t: '마상 시합', cd: 60, w: 4, c: all(adult, job('기사'), working),
    x: '{ld}이(가) 여는 마상 시합에 온 나라의 기사가 모였다. 우승자는 {ld}의 손에서 직접 상을 받는다.',
    o: [o('출전한다', { r: '마지막 창이 부러지는 순간 관중이 함성을 질렀다. 우승이다!', fame: 25, honor: 8 }, '', ['mi', 0.45], { r: '첫 합에 말에서 떨어졌다. 웃음소리가 오래 귓가에 남았다.', hp: -15, fame: -3 }),
      o('구경만 한다', { r: '다음 시합을 기약하였다.' })] },
  { id: 'ar_knight_order', t: '부당한 명령', cd: 96, w: 3, c: all(adult, job('기사'), working, x => !!x.f && Object.keys(x.f.wars).length > 0),
    x: '전쟁 중인 {f}의 장군이 명령을 내렸다. 적과 내통한 의심이 있는 마을을 불태우라는 것이다. 마을에는 아이들이 있다.',
    o: [o('명령을 따른다', { r: '불길 속에서 들려온 소리를 평생 잊지 못하였다.', fame: 5, honor: -20, mood: -15 }), o('거부한다', { r: '기사 서약을 지켰다. 장군은 당신을 최전선으로 보냈다.', honor: 15, hp: -10 }),
      o('마을에 몰래 알려 피신시킨다', { r: '빈 마을에 불을 질렀다. 아무도 진실을 몰랐다.', honor: 10 }, '', ['in', 0.5], { r: '들켰다. 군법 회의에 회부되었다.', honor: -5, wealth: -50 })] },
  { id: 'ar_scholar_tome', t: '금서', cd: 84, w: 3, c: all(adult, job('학자'), working),
    x: '서고 깊은 곳에서 사슬로 묶인 책 한 권을 찾아냈다. 표지에 손을 대자 글자들이 꿈틀거렸다.',
    o: [o('해독한다', { r: '잊힌 시대의 비밀이 눈앞에 펼쳐졌다.', in: 5, ma: 3, fame: 10 }, '', ['in', 0.5], { r: '읽을수록 머릿속에서 목소리가 커졌다. 며칠을 앓아누웠다.', hp: -20, mood: -10 }),
      o('사슬을 다시 감는다', { r: '어떤 지식은 묻혀 있어야 한다.', tr: [[PRUDENCE, 3]] })] },
  { id: 'ar_scholar_pupil', t: '찾아온 제자', cd: 96, w: 3, c: all(adult, job('학자'), working, x => x.age >= 30),
    x: '눈빛이 형형한 젊은이가 문 앞에 무릎을 꿇었다. 배우게 해 주기 전에는 일어나지 않겠다고 한다.',
    o: [o('제자로 받아들인다', { r: '가르치는 것이 곧 배우는 것이었다. 당신의 학문이 깊어졌다.', in: 3, fame: 6, seed: ['pupil', '찾아온 제자'] }), o('돌려보낸다', { r: '젊은이는 사흘을 버티다 떠났다.' })] },
];

// ───────────── 쓰러진 몸

const wounded = (x: Ctx) => x.P.flags?.wounded !== undefined && x.w.t - x.P.flags.wounded <= 6 && x.c.stats.health < 45;
export const CARE: LifeEv[] = [
  { id: 'wd_mend', t: '덧난 상처', cd: 4, c: all(adult, wounded),
    x: '상처가 덧나 열이 끓는다. 자리에서 일어나는 것조차 힘들다. 이번에 또 다치면 버티지 못할 것이다.',
    o: [o('의원을 부른다', { r: '쓴 약과 긴 잠. 조금씩 몸이 돌아왔다.', wealth: -30, hp: 30, unflag: 'wounded' }),
      o('{temple}에 가서 {deity}께 빈다', { r: '기도 끝에 열이 내렸다.', hp: 25, unflag: 'wounded' }, '', ['luck', 0.5], { r: '아무 응답도 없었다. 열은 계속되었다.', hp: -5 }),
      o('이를 악물고 일어난다', { r: '절뚝이며 다시 일을 나갔다. 상처는 흉터가 되었다.', hp: 10, co: 1, unflag: 'wounded' })] },
  // 마지막 말: 늘그막에 한 번
  { id: 'lw_will', t: '마지막 말', once: true, c: all(adult, x => (x.age > x.c.lifespan * 0.88 || (x.c.stats.health < 15 && x.age > 40)) && x.c.race !== 'dragon'),
    x: x => `${x.c.lifespan * 0.88 < x.age ? '기력이 다해 가는 것이 느껴진다.' : '몸이 더는 버티지 못할 것 같다.'} 자리에 누운 {n}이(가) 가까운 이들을 불러 모았다.`,
    o: x => {
      const ks = kidsAlive(x).sort((a, b) => a.born - b.born).slice(0, 3);
      return [
        ...ks.map(k => o(`${k.name}에게 뒤를 맡긴다`, { r: `${k.name}의 손을 꼭 쥐었다.`, fx: `name_heir:${k.id}` })),
        o('재산을 {temple}에 바친다', { r: '남은 재산을 모두 {temple}에 바쳤다. 사제들이 이름을 기도문에 새겼다.', fx: 'will_temple', honor: 10 }),
        o('고향 {h}에 나누어 준다', { r: '{h} 사람들이 오래도록 그 이름을 기억하였다.', fx: 'will_town', fame: 8 }),
      ];
    } },
];

// ───────────── 마왕군이 온다

const freshDl = (x: Ctx) => { const t = x.P.flags?.peril_dlarmy; return t !== undefined && x.w.t - t <= 3 && x.c.act.kind === 'idle'; };
export const DL_PERIL: LifeEv[] = [
  { id: 'xh_dlarmy', t: '검은 깃발', cd: 24, c: all(adult, freshDl),
    data: x => ({ dlId: x.w.demonLord }),
    x: x => `마왕 {dl}의 군세가 ${x.w.settlements[x.P.flags?.perilSet ?? -1]?.name ?? '{h}'}을(를) 향해 오고 있다. 지평선이 검은 깃발로 뒤덮였다.`,
    o: [o('가족을 데리고 피난한다', { r: '뒤를 돌아보지 않고 걸었다.', fx: 'flee_home', unflag: 'peril_dlarmy' }),
      o('성벽에 오른다', { r: '성벽 위에서 밤새 화살을 날렸다. 마왕군의 선봉이 물러갔다.', fame: 15, honor: 12, mi: 2, unflag: 'peril_dlarmy' }, '살아남으면 이름이 남는다', ['mi', 0.45], { r: '성벽이 무너질 때 함께 떨어졌다.', hp: -45, unflag: 'peril_dlarmy' }),
      o('성문을 열자고 외친다', { r: '몇몇이 당신을 따랐다. 사람들은 당신을 배신자라 불렀다.', honor: -30, unflag: 'peril_dlarmy', seed: ['collab', '마왕군에 성문을 열자고 외친 일'] })] },
];

FX_HOOKS.push((x, fx, data) => {
  const { w, c } = x;
  const f = x.f;
  if (fx.startsWith('name_heir:')) {
    const k = w.chars[+fx.split(':')[1]];
    if (!k || k.died >= 0) return '';
    x.P.flags ??= {};
    x.P.flags.heir = k.id;
    for (const o2 of kidsAlive(x)) if (o2 !== k) addRel(w, o2, c, -15, false);
    addRel(w, k, c, 20, false);
    charLog(w, k, `${c.name}의 뒤를 이을 사람으로 지명되었다.`, 3);
    if (x.isLeader && f) addNews(w, `${f.name}의 ${c.name}이(가) ${k.name}을(를) 후계자로 지명하였다.`, 3, 'politics', { facs: [f.id], chars: [c.id, k.id] });
    return '';
  }
  switch (fx) {
    case 'lord_appease': { const g = w.chars[+data.gId]; const s = w.settlements[+data.ls]; if (g) addRel(w, g, c, 30); if (s) s.stability = clamp(s.stability + 10); return ''; }
    case 'lord_cowed': { const g = w.chars[+data.gId]; if (g) { addRel(w, g, c, 10); g.plot = 0; } if (f) f.legitimacy = clamp(f.legitimacy + 8); return ''; }
    case 'lord_rebels': {
      const g = w.chars[+data.gId], s = w.settlements[+data.ls];
      if (!g || g.died >= 0 || !s || !s.alive || s.faction !== c.faction) return '부름에 응하지 않았지만, 더 큰 일은 없었다.';
      const nf = secede(w, g, s);
      return `${g.name}이(가) 부름을 거부하고 깃발을 올렸다. ${s.name}은(는) 이제 ${nf.name}이다.`;
    }
    case 'lord_ignore': { const g = w.chars[+data.gId]; if (g) g.plot += 25; if (f) f.legitimacy = clamp(f.legitimacy - 5); return ''; }
    case 'tax_up': { if (!f) return ''; for (const s of settlementsOf(w, f)) { s.stock[GOLD] += s.pop * 0.04; s.stability = clamp(s.stability - 12); } return ''; }
    case 'sell_jewels': { if (!f) return ''; const cap = w.settlements[f.capital]; const take = c.wealth * 0.5; c.wealth -= take; if (cap) cap.stock[GOLD] += take + 40; return ''; }
    case 'borrow': { if (!f) return ''; const cap = w.settlements[f.capital]; if (cap) cap.stock[GOLD] += 120; f.legitimacy = clamp(f.legitimacy - 6); return ''; }
    case 'open_granary': {
      if (!f) return '';
      const ss = settlementsOf(w, f); const cap = w.settlements[f.capital];
      const pool = (cap?.stock[FOOD] ?? 0) * 0.6; if (cap) cap.stock[FOOD] -= pool;
      for (const s of ss) { s.stock[FOOD] += pool / ss.length; s.stability = clamp(s.stability + 8); }
      f.legitimacy = clamp(f.legitimacy + 10); return '';
    }
    case 'buy_grain': { if (!f) return ''; for (const s of settlementsOf(w, f)) s.stock[FOOD] += s.pop * 0.3; return ''; }
    case 'endure': { if (!f) return ''; f.legitimacy = clamp(f.legitimacy - 10); for (const s of settlementsOf(w, f)) s.stability = clamp(s.stability - 8); return ''; }
    case 'envoy_accept': { const e = w.factions[+data.ef]; if (f && e && e.alive) addFacRel(w, f, e, 25); return ''; }
    case 'envoy_snub': { const e = w.factions[+data.ef]; if (f && e && e.alive) addFacRel(w, f, e, -8); return ''; }
    case 'envoy_insult': { const e = w.factions[+data.ef]; if (f && e && e.alive) addFacRel(w, f, e, -30); return ''; }
    case 'petition_just': { if (f) f.legitimacy = clamp(f.legitimacy + 6); const s = x.home; if (s) s.stability = clamp(s.stability + 6); return ''; }
    case 'vein_town': { const s = x.home; if (s) s.stock[ORE] += 200; return ''; }
    case 'cure_plague': { const s = x.home; if (s) s.plague = Math.max(0, s.plague * 0.3 - 1); return ''; }
    case 'will_temple': { c.wealth = 0; return ''; }
    case 'will_town': { const s = x.home; if (s) s.stock[FOOD] += c.wealth * 0.5; c.wealth = 0; return ''; }
  }
  return null;
});
