// 인생 이벤트 데이터 5: 사는 곳과 나라 형편 · 노예
import type { LifeEv, Ctx } from './life';
import { adult, all, atWarC2, hi, job, lo, notDragon, rich, stat } from './life';
import { o } from './lifeData1';
import { GOLD } from '../data/terrain';
import { allowsSlavery, slaverNear } from './slavery';
import { capacity } from './settlements';
import { towerOwner } from './towers';
import { approxDist } from './helpers';

const C0 = 0, AMB = 1, GRE = 2, COM = 3, LOY = 4, CUR = 6, PRU = 8, PRI = 9;

const treasury = (x: Ctx) => (x.f ? x.w.settlements[x.f.capital]?.stock[GOLD] ?? 0 : 0);
const isSlave = (x: Ctx) => x.c.role === '노예';
const free = (x: Ctx) => x.c.role !== '노예';
const homeSlaves = (x: Ctx) => x.home?.slaves ?? 0;
const capitalOf = (x: Ctx) => (x.f ? x.w.settlements[x.f.capital] : undefined);

// ───────────── 사는 곳과 나라의 형편이 인생을 가른다
export const ECON: LifeEv[] = [
  { id: 'e_tax_hike', t: '텅 빈 국고', cd: 60, c: all(adult, free, notDragon, x => !!x.f && treasury(x) < 30 && !x.isLeader),
    x: '{f}의 국고가 바닥났다. 관리들이 집집마다 돌며 세금을 두 배로 걷는다.',
    o: [o('순순히 낸다', { r: '허리띠를 졸라맸다.', wealth: -25, honor: 3 }),
      o('재산을 숨긴다', { r: '관리들은 빈손으로 돌아갔다.' }, '지력 판정', ['in', 0.5], { r: '숨긴 재산이 들통나 두 배로 빼앗겼다.', wealth: -50, honor: -5 }),
      o('이웃들과 함께 항의한다', { r: '세금이 조금 줄었다. 사람들이 당신을 따랐다.', fame: 8, ch: 2 }, '매력 판정', ['ch', 0.4], { r: '주동자로 몰려 매를 맞았다.', hp: -15, honor: -5 })] },
  { id: 'e_boom', t: '번영하는 도시', cd: 96, c: all(adult, free, notDragon, x => !!x.home && x.home.tier >= 2 && x.home.dev >= 55 && x.home.stability >= 55),
    x: '{h}이(가) 번창한다. 새 상점가가 들어서고 일거리가 넘친다.',
    o: [o('가게 하나를 연다', { r: '장사가 잘되었다.', wealth: 60 }, '지력 판정', ['in', 0.5], { r: '경쟁이 너무 치열하였다.', wealth: -20 }),
      o('일을 늘린다', { r: '벌이가 쏠쏠하였다.', wealth: 25, hp: -3 }), o('번영을 즐긴다', { r: '극장과 축제를 즐겼다.', mood: 10, wealth: -10 })] },
  { id: 'e_poor_village', t: '가난한 고향', cd: 120, c: all(adult, free, notDragon, x => !!x.home && x.home.dev < 15 && x.home.tier <= 1 && !!capitalOf(x) && capitalOf(x)!.id !== x.home.id),
    data: x => { const cap = capitalOf(x)!; return { sId: cap.id, s: cap.name }; },
    x: '{h}은(는) 가난하다. 젊은이들이 하나둘 {s}(으)로 떠난다.',
    o: [o('{s}(으)로 떠난다', { r: '큰 고을에서 새 삶을 시작하였다.', fx: 'move', mood: 5 }), o('남아서 고향을 일군다', { r: '이웃들이 당신을 의지하였다.', honor: 10, mi: 1 })] },
  { id: 'e_requisition', t: '징발', cd: 48, c: all(adult, free, notDragon, atWarC2, x => !x.isLeader),
    x: '전쟁 중이다. {f}의 병사들이 곡식과 가축을 징발하러 왔다.',
    o: [o('내준다', { r: '병사들이 고맙다며 증서를 남겼다.', wealth: -20, honor: 5, tr: [[LOY, 3]] }),
      o('창고를 숨긴다', { r: '병사들은 그냥 지나갔다.' }, '지력 판정', ['in', 0.5], { r: '숨긴 것이 들켜 모두 빼앗겼다.', wealth: -40 }),
      o('막아선다', { r: '병사들이 물러갔다. 대신 이름이 찍혔다.', fame: 5, honor: -5 }, '무력 판정', ['mi', 0.4], { r: '두들겨 맞고 모두 빼앗겼다.', hp: -20, wealth: -30 })] },
  { id: 'e_riot', t: '성난 거리', cd: 60, c: all(adult, free, notDragon, x => !!x.home && x.home.stability < 30),
    x: '{h}의 거리가 들끓는다. 굶주리고 지친 사람들이 횃불을 들었다.',
    o: [o('폭동에 가담한다', { r: '관청 창고가 털렸다. 당신 몫도 있었다.', wealth: 30, honor: -15 }, '', ['mi', 0.5], { r: '진압군에게 붙잡혔다.', hp: -25, honor: -10 }),
      o('이웃을 지킨다', { r: '이웃의 집을 지켜 냈다.', honor: 15 }, '무력 판정', ['mi', 0.5], { r: '불길에 다쳤다.', hp: -15 }),
      o('조용히 몸을 피한다', { r: '폭동이 지나갈 때까지 숨어 있었다.', tr: [[PRU, 3]] })] },
  { id: 'e_refugees', t: '피난민', cd: 72, c: all(adult, free, notDragon, x => x.w.settlements.some(s => s.alive && s.id !== x.c.home && s.lastAttacked >= x.w.t - 4 && approxDist(x.w, x.c, s) < 25)),
    x: '이웃 고을이 불탔다. 피난민들이 {h}의 문을 두드린다.',
    o: [o('집을 내준다', { r: '한 가족이 당신 집에 머물렀다. 그들은 평생 은혜를 잊지 않았다.', wealth: -15, honor: 15, tr: [[COM, 4]] }),
      o('먹을 것만 나눈다', { r: '작은 친절이었다.', wealth: -5, honor: 5 }), o('문을 걸어 잠근다', { r: '두드리는 소리가 밤새 이어졌다.', tr: [[COM, -4]] })] },
  { id: 'e_famine_price', t: '곡식값 폭등', cd: 60, c: all(adult, free, notDragon, x => !!x.home && x.home.hunger > 0),
    x: '{h}에 기근이 들어 곡식값이 열 배로 뛰었다.',
    o: [o('비축한 곡식을 비싸게 판다', { r: '큰돈을 벌었다. 사람들의 눈길이 따가웠다.', wealth: 50, honor: -15 }),
      o('이웃과 나눈다', { r: '굶어 죽는 이웃이 줄었다.', honor: 15, wealth: -15 }), o('사냥과 채집에 나선다', { r: '가족이 굶지 않을 만큼은 구해 왔다.', mi: 1 }, '무력 판정', ['mi', 0.5], { r: '빈손으로 돌아왔다.', hp: -5 })] },
  { id: 'e_golden', t: '태평성대', cd: 120, c: all(adult, notDragon, x => !!x.f && x.f.flags.includes('golden_age')),
    x: '{f}에 태평성대가 찾아왔다. 거리에는 노랫소리가 끊이지 않는다.',
    o: [o('이 시대를 기록한다', { r: '이 시절의 이야기를 글로 남겼다.', in: 2, fame: 5 }), o('가족과 시간을 보낸다', { r: '행복한 나날이었다.', mood: 15 })] },
  { id: 'e_capital', t: '왕도의 나날', cd: 120, c: all(adult, free, notDragon, x => !!x.home && !!x.f && x.f.capital === x.home.id && x.home.tier >= 3),
    x: '왕도 {h}에는 세상의 모든 것이 모인다. 오늘은 궁정 연회가 열리는 날이다.',
    o: [o('연회장에 끼어든다', { r: '귀족들과 안면을 텄다.', fame: 8, ch: 2 }, '매력 판정', ['ch', 0.4], { r: '경비병에게 쫓겨났다.', honor: -3 }), o('시장을 구경한다', { r: '먼 나라의 물건을 구경하였다.', tr: [[6, 4]] })] },
  { id: 'e_frontier', t: '개척지의 삶', cd: 96, c: all(adult, free, notDragon, x => !!x.home && x.home.tier === 0),
    x: '{h}은(는) 막 세워진 개척지다. 모든 것이 부족하지만 할 일은 넘친다.',
    o: [o('울타리를 세운다', { r: '마을이 조금 안전해졌다.', honor: 8, mi: 2 }), o('땅을 개간한다', { r: '새 밭이 생겼다.', wealth: 15 }), o('주변을 정찰한다', { r: '좋은 사냥터를 찾았다.', fame: 3 }, '', ['mi', 0.6], { r: '짐승에게 쫓겼다.', hp: -10 })] },
  { id: 'e_crowded', t: '북적이는 고을', cd: 120, c: all(adult, free, notDragon, x => !!x.home && x.home.pop > capacity(x.w, x.home) * 0.9),
    x: '{h}이(가) 사람으로 넘친다. 방 한 칸 얻기가 하늘의 별 따기다.',
    o: [o('비좁아도 버틴다', { r: '좁은 집에서 복작복작 살았다.', mood: -5 }), o('개척민 행렬에 합류한다', { r: '새 땅을 찾아 떠나는 이들과 함께하였다.', tr: [[C0, 3]], fx: 'adventure' })] },
  { id: 'e_trade_route', t: '새 교역로', cd: 120, c: all(adult, job('상인', '선원', '장인'), x => !!x.f && x.f.treaties.length >= 1),
    x: '{f}이(가) 이웃 나라와 교역 협정을 맺었다. 새 길이 열렸다.',
    o: [o('첫 상단에 끼어든다', { r: '남들보다 먼저 길을 뚫어 큰 이익을 남겼다.', wealth: 70 }, '매력 판정', ['ch', 0.45], { r: '경쟁 상단에 밀려났다.', wealth: -10 }), o('지켜본다', { r: '길이 안정되기를 기다렸다.' })] },
];

// ───────────── 노예
export const SLAVE: LifeEv[] = [
  { id: 'sv_daily', t: '사슬의 나날', cd: 24, w: 2, c: isSlave, x: '오늘도 채찍 소리와 함께 하루가 시작된다.',
    o: [o('묵묵히 견딘다', { r: '언젠가를 위해 힘을 아꼈다.', mi: 1, tr: [[PRU, 3]] }), o('곁의 노예를 돕는다', { r: '그가 당신의 손을 꼭 잡았다.', tr: [[COM, 4]], ch: 1 }),
      o('몰래 먹을 것을 훔친다', { r: '배를 채웠다.', hp: 5 }, '지력 판정', ['in', 0.5], { r: '들켜서 매를 맞았다.', hp: -15 })] },
  { id: 'sv_escape', t: '탈출', cd: 36, w: 2, c: isSlave, x: '감시가 느슨한 밤이다. 담장 너머로 별이 보인다.',
    o: [o('담장을 넘는다', { r: '어둠 속을 달려 자유를 찾았다!', fx: 'escape_me' }, '무력 판정', ['mi', 0.35], { r: '사냥개에게 붙잡혔다.', hp: -30 }),
      o('땅굴을 판다', { r: '몇 달 동안 판 땅굴로 빠져나갔다!', fx: 'escape_me' }, '지력 판정', ['in', 0.3], { r: '땅굴이 들켰다.', hp: -20 }), o('아직은 때가 아니다', { r: '별을 바라보며 때를 기다렸다.' })] },
  { id: 'sv_master', t: '주인의 제안', cd: 60, c: isSlave, x: '주인이 당신을 불렀다. "오 년만 충성을 다하면 풀어 주겠다."',
    o: [o('약속을 믿는다', { r: '오 년 뒤, 주인은 약속을 지켰다.', fx: 'free_me', tr: [[LOY, 5]] }, '', ['luck', 0.5], { r: '주인은 약속을 잊었다.', mood: -20 }), o('침을 뱉는다', { r: '대가는 혹독하였다.', hp: -20, tr: [[PRI, 5]] })] },
  { id: 'sv_buy', t: '자유의 값', cd: 24, c: all(isSlave, x => x.c.wealth >= 80), x: '모은 돈이면 자유를 살 수 있을지도 모른다.',
    o: [o('자유를 산다', { r: '주인이 증서를 내주었다. 자유다.', wealth: -80, fx: 'free_me' }), o('더 모은다', { r: '한 닢 한 닢 더 모으기로 하였다.' })] },
  { id: 'sv_gladiator', t: '투기장', cd: 36, c: all(isSlave, stat('might', 45)), x: '주인이 당신을 투기장에 내보내려 한다. 열 번 이기면 자유를 주겠다고 한다.',
    o: [o('싸운다', { r: '열 번을 이겼다. 관중이 당신의 이름을 외쳤다. 자유다!', fame: 30, mi: 4, fx: 'free_me' }, '무력 판정', ['mi', 0.3], { r: '크게 다쳐 들것에 실려 나왔다.', hp: -40, fame: 5 }), o('거부한다', { r: '매질을 당하였다.', hp: -15 })] },
  { id: 'sv_revolt', t: '노예들의 봉기', cd: 60, c: all(isSlave, stat('command', 45), x => homeSlaves(x) >= 30),
    x: '{h}의 노예 수백 명이 당신을 바라본다. 당신이 일어서면 그들도 일어설 것이다.',
    o: [o('봉기를 이끈다', { r: '사슬이 끊어졌다! 해방된 이들이 당신을 왕으로 추대하였다.', fx: 'lead_revolt', fame: 50 }, '통솔 판정 (매우 어려움)', ['co', 0.12], { r: '봉기는 피로 진압되었다.', hp: -50, fx: 'crush_revolt' }),
      o('아직은 이르다', { r: '불씨를 가슴에 품었다.', tr: [[AMB, 4]] })] },
  { id: 'sv_road', t: '노예 사냥꾼', cd: 72, c: all(adult, free, notDragon, job('상인', '모험가', '선원', '음유시인', '사냥꾼'), x => !!slaverNear(x.w, x.c)),
    data: x => { const s = slaverNear(x.w, x.c)!; return { sId: s.id, s: s.name, f: x.w.factions[s.faction]?.name ?? '' }; },
    x: '길에서 {f}의 노예 사냥꾼들에게 둘러싸였다. 사슬이 철컹거린다.',
    o: [o('싸운다', { r: '사냥꾼들을 쫓아냈다.', fame: 8, mi: 2 }, '무력 판정', ['mi', 0.45], { r: '제압당해 {s}(으)로 끌려갔다.', fx: 'enslave_road', hp: -15 }),
      o('돈으로 해결한다', { r: '돈을 받은 사냥꾼들이 길을 비켜 주었다.', wealth: -40 }, '', ['luck', 0.7], { r: '돈만 빼앗기고 끌려갔다.', wealth: -40, fx: 'enslave_road' }),
      o('달아난다', { r: '숲으로 뛰어들어 따돌렸다.' }, '무력 판정', ['mi', 0.5], { r: '붙잡혀 {s}(으)로 끌려갔다.', fx: 'enslave_road' })] },
  { id: 'sv_market', t: '노예 시장', cd: 96, c: all(adult, free, notDragon, rich(150), x => allowsSlavery(x.w, x.f)),
    x: '{market}에 노예 시장이 섰다. 쇠사슬에 묶인 이들이 줄지어 서 있다. 부자들은 노예를 부려 재산을 불린다.',
    o: [o('노예를 산다', { r: '노예들이 당신 땅에서 일하기 시작하였다.', wealth: -80, fx: 'buy_slaves', honor: -10, tr: [[COM, -5]] }),
      o('사서 풀어 준다', { r: '풀려난 이들이 울며 당신의 손에 입을 맞췄다.', wealth: -80, fx: 'free_bought', honor: 20, tr: [[COM, 5]] }), o('외면한다', { r: '사슬 소리가 오래 귓가에 남았다.' })] },
  { id: 'sv_trader', t: '노예상의 제안', cd: 120, c: all(adult, job('상인'), x => allowsSlavery(x.w, x.f), lo(COM, 50)), x: '노예상이 동업을 제안한다. 사람을 사고파는 일은 돈이 된다.',
    o: [o('동업한다', { r: '돈이 쏟아져 들어왔다. 밤마다 사슬 소리가 꿈에 나왔다.', wealth: 150, honor: -25, tr: [[COM, -8]] }), o('거절한다', { r: '노예상은 비웃으며 떠났다.', honor: 5 })] },
  { id: 'sv_hide', t: '도망 노예', cd: 96, c: all(adult, free, notDragon, hi(COM, 50)), x: '한밤중, 사슬 자국이 선명한 도망 노예가 창고에 숨어들었다. 추격대의 횃불이 가까워진다.',
    o: [o('숨겨 준다', { r: '추격대는 그냥 지나갔다. 그는 평생 은혜를 잊지 않았다.', honor: 15, tr: [[COM, 4]] }, '지력 판정', ['in', 0.5], { r: '숨겨 준 것이 들켜 벌금을 물었다.', wealth: -40, honor: 5 }),
      o('추격대에 넘긴다', { r: '포상금을 받았다.', wealth: 20, tr: [[COM, -6]] })] },
  { id: 'sv_abolish', t: '사슬의 나라', cd: 120, c: all(x => x.isLeader, x => !!x.f && x.w.settlements.some(s => s.alive && s.faction === x.f!.id && (s.slaves ?? 0) > 10)),
    x: '{f}의 노예가 늘어 간다. 귀족들은 노예로 부를 쌓지만, 사슬의 원망도 함께 쌓인다.',
    o: [o('노예제를 폐지한다', { r: '사슬이 풀렸다. 귀족들이 이를 갈았다.', fx: 'abolish', honor: 30, fame: 15 }), o('노예 사냥을 늘린다', { r: '변경에 노예 사냥꾼이 들끓었다.', fx: 'raid_slaves', honor: -15, wealth: 40 }), o('지금대로 둔다', { r: '사슬 소리는 계속되었다.' })] },
  { id: 'sv_freed', t: '사슬 자국', once: true, c: all(adult, free, x => !!x.P.flags?.freed), x: '자유의 몸이 된 지 오래지만, 손목의 사슬 자국은 지워지지 않는다.',
    o: [o('다른 노예들을 돕는다', { r: '도망 노예들을 숨겨 주는 비밀 조직을 만들었다.', honor: 20, fame: 10, tr: [[COM, 6]] }), o('과거를 묻는다', { r: '새 이름으로 새 삶을 살았다.', mood: 10 }), o('주인에게 복수한다', { r: '옛 주인의 창고에 불을 질렀다.', tr: [[COM, -5]], fame: 5 }, '', ['mi', 0.5], { r: '붙잡힐 뻔하였다.', hp: -15 })] },
];

// ───────────── 바벨탑
const myTower = (x: Ctx) => x.w.towers.find(t => t.alive && !!x.f && towerOwner(x.w, t) === x.f);
export const TOWER: LifeEv[] = [
  { id: 'bt_start', t: '하늘에 닿는 탑', cd: 240, c: all(x => x.isLeader, x => !!x.f && x.f.tier >= 2 && x.f.avgDev >= 35, x => !myTower(x), x => x.w.settlements[x.f!.capital]?.l === 2),
    x: '건축가들이 설계도를 펼쳤다. "폐하, 이 탑이라면 구름을 뚫고 하늘에 닿을 것입니다. 하늘섬의 보물도, 용도, 어쩌면 천상까지도…"',
    o: [o('탑을 쌓는다', { r: '나라의 돌과 금이 탑으로 빨려 들어가기 시작하였다.', fx: 'tower_start', fame: 20 }, '천사와 용이 가만두지 않을 수 있다'), o('하늘은 넘볼 곳이 아니다', { r: '설계도는 불태워졌다.', honor: 10, tr: [[PRU, 4]] })] },
  { id: 'bt_warning', t: '바람의 천사', cd: 60, c: all(x => x.isLeader, x => { const t = myTower(x); return !!t && t.warnedAt >= 0; }),
    x: '바람의 천사가 왕궁 발코니에 내려앉았다. "마지막 경고다. 탑을 허물지 않으면 천군이 내려올 것이다."',
    o: [o('탑을 허문다', { r: '수십 년의 공사가 먼지가 되었다. 하늘은 고요해졌다.', fx: 'tower_dismantle', honor: 15 }),
      o('협상한다', { r: '천사는 한동안 지켜보겠다며 날아갔다.', fx: 'tower_parley' }, '매력 판정', ['ch', 0.35], { r: '천사는 대답 없이 날아갔다.' }),
      o('하늘도 내 것이다', { r: '천사의 눈이 차갑게 식었다.', tr: [[PRI, 6]], fame: 10 })] },
  { id: 'bt_worker', t: '탑의 인부', cd: 72, c: all(adult, x => x.c.role !== '노예', x => { const t = myTower(x); return !!t && t.progress < 200 && !x.isLeader; }),
    x: '나라가 탑 공사에 인부를 모은다. 품삯은 두둑하지만 높은 곳에서 떨어져 죽는 이가 많다.',
    o: [o('일하러 간다', { r: '몇 해 동안 돌을 날랐다. 탑은 조금 더 높아졌다.', wealth: 50, mi: 3 }, '무력 판정', ['mi', 0.6], { r: '비계에서 떨어져 크게 다쳤다.', hp: -40, wealth: 20 }), o('하늘 일은 하늘에 맡긴다', { r: '멀리서 올라가는 탑을 바라보았다.' })] },
  { id: 'bt_climb', t: '하늘섬', once: true, c: all(adult, x => { const t = myTower(x); return !!t && t.progress >= 100; }),
    x: '탑의 꼭대기에서 구름 위의 섬들이 보인다. 아무도 밟아 본 적 없는 땅이다.',
    o: [o('하늘섬에 내려 본다', { r: '하늘섬의 꽃향기를 맡은 첫 사람들 중 하나가 되었다.', fame: 15, tr: [[CUR, 6]] }, '', ['mi', 0.6], { r: '바람에 휩쓸릴 뻔하였다.', hp: -15 }), o('구경만 한다', { r: '평생 잊지 못할 풍경이었다.', mood: 10 })] },
];
