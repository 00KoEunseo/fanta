// 재앙에 휘말린 '나'의 선택들 (peril.ts가 표식을 남기면 뜬다)
import { RACES } from '../data/races';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all } from './life';
import { o } from './lifeData1';
import { perilFx, type PerilKind } from './peril';

// ───────────── 휘말린 뒤의 선택

const fresh = (k: PerilKind) => (x: Ctx) => { const t = x.P.flags?.['peril_' + k]; return t !== undefined && x.w.t - t <= 3 && x.c.act.kind !== 'voyage'; };
const perilSet = (x: Ctx) => x.w.settlements[x.P.flags?.perilSet ?? -1]?.name ?? x.home?.name ?? '고을';
const darkRace = (x: Ctx) => RACES[x.c.race].align === 'dark';

export const PERIL: LifeEv[] = [
  { id: 'xh_dragon', t: '불타는 고을', cd: 6, c: all(adult, fresh('dragon')),
    data: x => ({ dId: x.P.flags?.perilWho ?? -1 }),
    x: x => `${perilSet(x)}이(가) 용 {d}의 불길에 휩싸였다. 지붕이 무너지고 비명이 하늘을 메운다.`,
    o: [o('이웃을 구하러 불길 속으로 뛰어든다', { r: '아이 둘을 안고 불길을 빠져나왔다.', honor: 15, fame: 10, hp: -15, unflag: 'peril_dragon' }, '', ['co', 0.5], { r: '무너진 들보에 깔렸다가 겨우 기어 나왔다.', hp: -40, unflag: 'peril_dragon' }),
      o('가족을 데리고 피난한다', { r: '잿더미가 된 고향을 뒤로하고 떠났다.', fx: 'flee_home', mood: -10, unflag: 'peril_dragon' }),
      o('복수를 맹세한다', { r: '잿더미 위에서 칼을 뽑아 맹세하였다.', mi: 2, unflag: 'peril_dragon', seed: ['dragon_vengeance', '용 {d}에게 맹세한 복수'] })] },
  { id: 'xh_quake', t: '무너진 집', cd: 6, c: all(adult, fresh('quake')),
    x: x => `땅이 울부짖으며 갈라졌다. ${perilSet(x)}의 집들이 무너져 내렸다. 잔해 아래에서 신음이 들린다.`,
    o: [o('잔해를 파헤쳐 사람들을 구한다', { r: '손톱이 다 빠지도록 흙을 팠다. 세 사람을 살려 냈다.', honor: 12, fame: 6, hp: -10, unflag: 'peril_quake' }),
      o('내 집과 재산부터 챙긴다', { r: '살림은 건졌지만 이웃들의 눈길이 싸늘하다.', honor: -6, unflag: 'peril_quake' }),
      o('이 땅을 떠난다', { r: '갈라진 땅을 다시는 믿을 수 없었다.', fx: 'flee_home', unflag: 'peril_quake' })] },
  { id: 'xh_fallen', t: '함락', cd: 6, c: all(adult, fresh('fallen')),
    x: x => `${perilSet(x)}이(가) ${x.w.factions[x.w.settlements[x.P.flags?.perilSet ?? -1]?.faction ?? -1]?.name ?? '적'}의 손에 떨어졌다. 낯선 깃발이 성문 위에서 펄럭인다.`,
    o: [o('새 주인에게 머리를 숙인다', { r: '살아남는 것이 먼저였다.', fx: 'bow', honor: -5, unflag: 'peril_fallen' }),
      o('옛 나라의 땅으로 피난한다', { r: '짐 보따리 하나만 들고 성문을 빠져나왔다.', fx: 'flee_home', unflag: 'peril_fallen' }),
      o('남아서 저항군에 가담한다', { r: '지하실에 모인 이들과 피로 맹세하였다.', honor: 10, unflag: 'peril_fallen', seed: ['resistance', '{h}을(를) 되찾으려는 저항군'] }, '', ['luck', 0.75], { r: '첫 모임에서 밀고를 당해 붙잡혔다. 매질 끝에 풀려났다.', hp: -30, unflag: 'peril_fallen' })] },
  { id: 'xh_abyss', t: '바다에서 솟은 것', cd: 12, c: all(adult, x => fresh('abyss')(x) || fresh('beast')(x)),
    x: x => `${perilSet(x)}의 해안으로 ${x.P.flags?.peril_abyss !== undefined ? '집채만 한 촉수가' : '거대한 바다 괴수가'} 솟아올랐다. 부두가 통째로 바다에 삼켜졌다.`,
    o: [o('내륙으로 피난한다', { r: '바다 냄새가 나지 않는 곳까지 걸었다.', fx: 'move_inland', unflag: 'peril_abyss' }),
      o('남아서 해안을 지킨다', { r: '작살을 들고 해안에 섰다. 사람들이 당신을 따라 싸웠다.', fame: 15, honor: 10, mi: 2, unflag: 'peril_abyss' }, '', ['mi', 0.45], { r: '파도에 휩쓸렸다가 기적처럼 뭍으로 떠밀려 왔다.', hp: -45, unflag: 'peril_abyss' }),
      o('연맹의 의용군에 지원한다', { r: '', fx: 'volunteer', honor: 5, unflag: 'peril_abyss' })] },
  { id: 'xh_plague', t: '역병이 번진 고을', cd: 24, c: all(adult, fresh('plague'), x => x.w.t - (x.P.lastEvents.plague ?? -999) > 24),
    x: x => `${perilSet(x)}에 역병이 번졌다. 문마다 붉은 표식이 칠해지고, 수레가 밤마다 주검을 실어 나른다.`,
    o: [o('병자를 돌본다', { r: '수많은 밤을 병자들 곁에서 보냈다.', honor: 15, fame: 6, unflag: 'peril_plague' }, '', ['co', 0.55], { r: '당신도 열병에 쓰러졌다.', hp: -35, unflag: 'peril_plague' }),
      o('문을 걸어 잠근다', { r: '창틈으로 들어오는 바람조차 두려웠다.', mood: -8, unflag: 'peril_plague' }),
      o('병을 피해 고을을 떠난다', { r: '역병의 그림자를 뒤로하고 길을 나섰다.', fx: 'flee_home', honor: -3, unflag: 'peril_plague' })] },
  { id: 'xh_dlnews', t: '마왕의 소식', cd: 60, c: all(adult, fresh('dlnews')),
    data: x => ({ dlId: x.w.demonLord }),
    x: '마왕 {dl}이(가) 강림하였다는 소식이 {f}에 닿았다. 장터마다 사람들이 술렁인다.',
    o: [o('검을 갈고 몸을 단련한다', { r: '언젠가 올 그날을 위해 매일 칼을 휘둘렀다.', mi: 3, unflag: 'peril_dlnews' }),
      o('피난 짐을 꾸려 둔다', { r: '언제든 떠날 수 있게 문가에 짐을 두었다.', wealth: -10, unflag: 'peril_dlnews' }),
      { ...o('마왕의 시대를 기다린다', { r: '어둠의 시대가 오면 당신 같은 이에게도 기회가 있으리라.', tr: [[1, 5]], unflag: 'peril_dlnews' }), show: darkRace }] },
  { id: 'xh_fall', t: '나라를 잃다', cd: 60, c: all(adult, fresh('fall')),
    data: x => ({ fn: x.w.factions[x.P.flags?.perilWho ?? -1]?.name ?? '조국' }),
    x: '{fn}이(가) 멸망하였다. 어제까지의 나라가 오늘은 이름뿐이다.',
    o: [o('새 나라를 찾아 떠난다', { r: '국경을 넘어 새 삶을 찾아 떠났다.', fx: 'flee_home', unflag: 'peril_fall' }),
      o('남아서 새 주인 아래 산다', { r: '나라는 사라져도 고향은 남았다.', fx: 'bow', honor: 2, unflag: 'peril_fall' })] },
];


FX_HOOKS.push((x, fx) => perilFx(x, fx));
