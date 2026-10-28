// 인생 이벤트 데이터 12: 더 촘촘한 삶.
// - 어린 시절: 세상의 형편(전쟁, 역병, 용, 순례자, 이름난 이)이 아이의 눈에 닿는 순간들
// - 길 위: 기대할 만한 만남과 발견 (떠돌이 현자, 쓰러진 기사, 옛 전장, 숨은 성소, 열강의 그림자)
// - 반역이 실패한 뒤: 옥살이, 심문, 탈옥, 사면과 석방, 추방
// - 길을 떠난 사이 고향이 함락되었을 때, 함락의 밤에 붙잡혔을 때
import type { Character } from './state';
import { dist } from './state';
import { RACES } from '../data/races';
import { addNews, charLog } from './news';
import { addRel, approxDist, clamp, isHero, leaderOf, rel } from './helpers';
import { relocate, setTravel } from './characters';
import { attemptCoup, secede } from './factions';
import { killChar } from './characters';
import { becomeDemonLord } from './events';
import { allowsSlavery, enslaveChar } from './slavery';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all, atWarC2, dragonNear, kid, outdoors, setCoupFail } from './life';
import { o } from './lifeData1';

const C0 = 0, AMB = 1, GRE = 2, COM = 3, LOY = 4, FAI = 5, CUR = 6, SOC = 7, PRU = 8, PRI = 9;
const fl = (x: Ctx, k: string) => x.P.flags?.[k];
const has = (k: string) => (x: Ctx) => fl(x, k) !== undefined;
const not = (k: string) => (x: Ctx) => fl(x, k) === undefined;
const homeFaithName = (x: Ctx) => (x.home?.faith !== undefined ? x.w.religions?.[x.home.faith]?.name : undefined) as string | undefined;

// ───────────── 어린 시절

/** 이름난 이가 고향에 들렀다 */
function famousNear(x: Ctx): Character | undefined {
  return x.w.chars.find(p => p.died < 0 && p.id !== x.c.id && (isHero(p) || p.fame >= 120) && p.race !== 'dragon' && !p.archdemon && x.home && p.l === x.home.l && dist(p, x.home) <= 4);
}
const parentAtWar = (x: Ctx) => [x.c.father, x.c.mother].some(id => { const p = x.w.chars[id]; return !!p && p.died < 0 && (p.act.kind === 'army' || p.act.kind === 'camp'); });
const homePlague = (x: Ctx) => (x.home?.plague ?? 0) > 0;
const homeHungry = (x: Ctx) => (x.home?.hunger ?? 0) >= 2;
const lightLand = (x: Ctx) => RACES[x.c.race].align !== 'dark';

export const CHILD2: LifeEv[] = [
  { id: 'c2_war_parent', t: '전장으로 간 부모', once: true, c: all(kid(0.2, 1), parentAtWar), x: '부모가 창을 메고 전장으로 떠났다. 집 안이 텅 빈 것 같다.',
    o: [o('매일 길목에 나가 기다린다', { r: '해 질 녘마다 길 끝을 바라보았다.', tr: [[LOY, 6]] }), o('집안일을 도맡는다', { r: '어린 손으로 장작을 패고 물을 길었다.', mi: 2, tr: [[PRU, 5]] }), o('나도 칼을 배우겠다고 조른다', { r: '마을 경비병이 웃으며 목검을 건넸다.', mi: 3, tr: [[C0, 5]] })] },
  { id: 'c2_refugees', t: '피난민 아이', once: true, c: all(kid(0.3, 1), atWarC2), x: '전쟁을 피해 온 피난민들이 {h}에 들어왔다. 또래 아이 하나가 길가에서 떨고 있다.',
    o: [o('내 몫의 빵을 나눈다', { r: '그 아이는 오래도록 당신을 잊지 않았다.', tr: [[COM, 7]], ch: 2 }), o('어디서 왔는지 묻는다', { r: '불탄 마을과 군대 이야기를 들었다. 세상이 넓고 무섭다는 걸 알았다.', in: 2, tr: [[CUR, 4]] }), o('다른 아이들과 놀려 댄다', { r: '그 아이는 아무 말도 하지 않았다.', tr: [[COM, -6], [PRI, 3]] })] },
  { id: 'c2_dragon_sky', t: '하늘을 가린 그림자', once: true, c: all(kid(0.2, 1), dragonNear(45)), x: '거대한 그림자가 마을 위를 지나갔다. 용이었다. 어른들은 모두 집 안으로 숨었다.',
    o: [o('지붕 위로 올라가 본다', { r: '비늘 하나하나가 햇빛에 번쩍였다. 그 모습이 평생 잊히지 않았다.', tr: [[C0, 6], [CUR, 4]] }), o('엄마 품에 숨는다', { r: '그림자가 지나갈 때까지 숨을 죽였다.', tr: [[PRU, 4]] }), o('용을 그림으로 남긴다', { r: '그 그림을 본 학당 선생이 재주가 있다고 하였다.', in: 2 })] },
  { id: 'c2_plague_kid', t: '역병의 겨울', once: true, c: all(kid(0.2, 1), homePlague), x: '{h}에 역병이 돌았다. 옆집 문에 붉은 표식이 칠해졌다.',
    o: [o('의원 할머니를 돕는다', { r: '약초를 빻고 물을 끓였다. 무섭지 않은 척하였다.', in: 2, tr: [[COM, 6]] }, '', ['luck', 0.7], { r: '당신도 열병에 걸려 한 달을 앓았다.', hp: -10, tr: [[COM, 4]] }), o('{temple}에서 기도한다', { r: '촛불 앞에서 밤을 새웠다.', tr: [[FAI, 8]] }), o('집 밖에 나가지 않는다', { r: '창틈으로 바깥을 내다보며 겨울을 났다.', tr: [[PRU, 4]] })] },
  { id: 'c2_hunger_kid', t: '빈 곳간', once: true, c: all(kid(0.2, 1), homeHungry), x: '{h}의 곳간이 비었다. 저녁상에 묽은 죽 한 그릇뿐이다.',
    o: [o('동생에게 내 몫을 준다', { r: '배고팠지만 마음은 따뜻하였다.', hp: -3, tr: [[COM, 7], [LOY, 3]] }), o('들로 나가 먹을 것을 찾는다', { r: '뿌리와 열매를 한 바구니 캐 왔다.', in: 1, mi: 1 }, '', ['luck', 0.6], { r: '독버섯을 잘못 먹고 앓았다.', hp: -6 }), o('부잣집 담을 넘는다', { r: '훔친 빵을 식구들과 나누었다.', tr: [[GRE, 4], [COM, 2]] }, '', ['luck', 0.55], { r: '붙잡혀 매를 맞았다.', hp: -5, tr: [[PRI, -3]] })] },
  { id: 'c2_famous_visit', t: '이름난 손님', once: true, c: all(kid(0.3, 1), x => !!famousNear(x)), data: x => ({ pId: famousNear(x)!.id }),
    x: x => `${x.w.chars[famousNear(x)!.id].name}이(가) {h}에 들렀다. 온 마을 아이들이 그 뒤를 졸졸 따라다닌다.`,
    o: [o('용기를 내어 말을 건다', { r: '"크면 너도 길을 떠나거라." 그 한마디가 마음에 박혔다.', tr: [[C0, 5], [AMB, 5]], ch: 1 }), o('멀리서 바라만 본다', { r: '그 뒷모습을 오래 기억하였다.', tr: [[AMB, 3]] }), o('짐을 들어 주겠다고 나선다', { r: '동전 한 닢과 웃음을 얻었다.', wealth: 2, ch: 2 })] },
  { id: 'c2_veteran', t: '늙은 병사', once: true, c: kid(0.4, 1), x: '외팔이 늙은 병사가 주막 앞에서 옛 전쟁 이야기를 늘어놓는다.',
    o: [o('끝까지 듣는다', { r: '이긴 싸움보다 진 싸움 이야기가 더 길었다.', in: 2, co: 2 }), o('검 쓰는 법을 졸라 배운다', { r: '그는 한 팔로도 당신을 가볍게 넘어뜨렸다.', mi: 3 }), o('거짓말이라고 놀린다', { r: '노인은 쓸쓸하게 웃었다.', tr: [[PRI, 3], [COM, -3]] })] },
  { id: 'c2_secret_place', t: '비밀 장소', once: true, c: all(kid(0.3, 0.9), outdoors), x: '마을 뒤편에서 아무도 모르는 작은 공터를 찾았다.',
    o: [o('나만의 은신처로 꾸민다', { r: '그곳은 오래도록 마음의 쉼터였다.', mood: 8, tr: [[SOC, -3]] }), o('친구들을 데려온다', { r: '아이들만의 왕국이 생겼다. 당신이 왕이었다.', ch: 3, tr: [[AMB, 4]] }), o('더 깊은 곳을 뒤져 본다', { r: '이끼 낀 돌판에 낯선 문양이 새겨져 있었다.', ma: 2, tr: [[CUR, 6]] })] },
  { id: 'c2_tourney', t: '마상 시합', once: true, c: all(kid(0.4, 1), x => x.c.l === 2 && (x.home?.tier ?? 0) >= 2), x: '{h}에서 마상 시합이 열렸다. 기사들의 창이 부러지는 소리가 광장을 울린다.',
    o: [o('지는 기사를 응원한다', { r: '그 기사가 마지막에 손을 흔들어 주었다.', tr: [[COM, 4], [LOY, 3]] }), o('말을 돌보는 시동 자리를 청한다', { r: '마구간 냄새 속에서 말 다루는 법을 배웠다.', mi: 2, co: 1 }), o('내기에 용돈을 건다', { r: '용돈이 두 배가 되었다!', wealth: 4, tr: [[GRE, 3]] }, '', ['luck', 0.5], { r: '용돈을 몽땅 잃었다.', tr: [[GRE, 2]] })] },
  { id: 'c2_caravan', t: '먼 데서 온 상단', once: true, c: all(kid(0.3, 1), x => !!x.f && x.f.treaties.length > 0), x: '먼 나라의 상단이 {h}에 짐을 풀었다. 처음 보는 옷과 향신료와 말소리가 가득하다.',
    o: [o('상인에게 먼 나라 이야기를 조른다', { r: '바다 건너, 산 너머의 이야기에 밤 가는 줄 몰랐다.', tr: [[CUR, 7]], in: 1 }), o('심부름을 해 주고 동전을 번다', { r: '셈하는 법을 익혔다.', wealth: 3, in: 1, tr: [[GRE, 2]] }), o('상단을 따라가겠다고 짐을 싼다', { r: '마을 어귀에서 붙잡혀 돌아왔다. 그래도 가슴이 뛰었다.', tr: [[C0, 4], [CUR, 4]] })] },
  { id: 'c2_ruin_dare', t: '담력 시험', once: true, c: all(kid(0.5, 1.05), x => x.w.sites.some(s => s.l === x.c.l && approxDist(x.w, x.c, s) < 20)), x: '아이들이 마을 밖 폐허에서 하룻밤을 보내는 쪽이 대장이라고 내기를 걸었다.',
    o: [o('혼자 들어간다', { ach: 'ruinkid', r: '어둠 속에서 녹슨 단검 하나를 들고 나왔다. 아이들이 입을 다물지 못하였다.', item: '녹슨 단검', fame: 2, tr: [[C0, 7]] }, '', ['co', 0.5], { r: '무언가에 쫓겨 맨발로 도망쳐 나왔다.', hp: -3, tr: [[C0, 2]] }), o('친구와 함께 간다', { r: '둘이서 덜덜 떨며 밤을 새웠다. 평생의 우정이 되었다.', ch: 2, tr: [[SOC, 5]] }), o('바보 같은 짓이라며 빠진다', { r: '겁쟁이라는 놀림을 한동안 들었다.', tr: [[PRU, 6], [PRI, -3]] })] },
  { id: 'c2_faith_rite', t: '첫 의식', once: true, c: all(kid(0.4, 1), x => !!homeFaithName(x)), x: x => `${homeFaithName(x)}의 사제가 {h}의 아이들을 모아 첫 의식을 치르려 한다.`,
    o: [o('경건히 의식을 치른다', { r: '향 냄새와 노랫소리가 마음 깊이 스며들었다.', tr: [[FAI, 8]] }), o('사제에게 신이 정말 있느냐고 묻는다', { r: '사제는 한참 말이 없다가, 네가 찾게 될 것이라 답하였다.', tr: [[CUR, 6]], in: 1 }), o('의식을 빼먹고 강가로 간다', { r: '물수제비가 일곱 번이나 튀었다.', tr: [[FAI, -4], [SOC, 2]] })] },
  { id: 'c2_omen', t: '붉은 혜성', once: true, c: all(kid(0.2, 1), x => x.w.doom.seals.some(Boolean)), x: '밤하늘에 붉은 꼬리를 단 별이 걸렸다. 어른들은 불길한 징조라며 수군거린다.',
    o: [o('별에 소원을 빈다', { r: '무엇을 빌었는지는 아무에게도 말하지 않았다.', mood: 5, tr: [[FAI, 3]] }), o('별을 따라 지도를 그린다', { r: '별자리를 하나둘 외우기 시작하였다.', in: 3 }), o('무서워서 잠들지 못한다', { r: '그날 밤 꿈에 무너지는 하늘이 나왔다.', tr: [[PRU, 4]], ma: 1 })] },
  { id: 'c2_sibling_fight', t: '형제의 다툼', cd: 48, c: all(kid(0.3, 1), x => x.w.chars.some(s => s.died < 0 && s.id !== x.c.id && ((s.father >= 0 && s.father === x.c.father) || (s.mother >= 0 && s.mother === x.c.mother)))), x: '형제와 하나뿐인 나무칼을 두고 다투었다.',
    o: [o('양보한다', { r: '부모가 머리를 쓰다듬어 주었다.', tr: [[COM, 5], [AMB, -2]] }), o('힘으로 빼앗는다', { r: '나무칼은 내 것이 되었다. 형제는 한동안 말을 걸지 않았다.', mi: 1, tr: [[AMB, 4], [COM, -3]] }), o('번갈아 쓰자고 한다', { r: '둘은 기사와 용 놀이를 하며 해가 지는 줄 몰랐다.', ch: 2, tr: [[SOC, 3]] })] },
  { id: 'c2_river', t: '강물', once: true, c: all(kid(0.3, 1), outdoors), x: '강가에서 놀던 아이 하나가 급류에 휩쓸렸다!',
    o: [o('뛰어든다', { ach: 'riversave', r: '아이를 끌어안고 기슭으로 헤엄쳐 나왔다. 마을이 당신 이름을 불렀다.', fame: 4, honor: 8, tr: [[C0, 6]] }, '', ['mi', 0.45], { r: '함께 떠내려가다 바위에 걸려 겨우 살았다.', hp: -9, tr: [[C0, 3]] }), o('긴 나뭇가지를 내민다', { r: '아이가 가지를 붙잡았다. 침착한 손이었다.', in: 2, tr: [[PRU, 5]] }), o('어른을 부르러 달린다', { r: '어른들이 늦지 않게 닿았다.', tr: [[LOY, 2]] })] },
  { id: 'c2_cult', t: '두건 쓴 사람들', once: true, c: all(kid(0.5, 1.05), x => x.w.demonLord >= 0 || x.w.chars.some(d => d.died < 0 && d.archdemon && d.l === 2)), x: '밤마다 두건을 쓴 사람들이 마을 밖 동굴로 들어간다. 낮은 노랫소리가 새어 나온다.',
    o: [o('몰래 따라가 엿본다', { r: '피로 그린 원과 붉은 눈의 그림을 보았다. 달아나는 내내 심장이 터질 것 같았다.', ma: 2, tr: [[CUR, 5]] }, '', ['luck', 0.65], { r: '붙잡혔다가 겨우 빠져나왔다. 그들의 얼굴을 기억한다.', hp: -5, tr: [[C0, 4]] }), o('경비대에 알린다', { r: '다음 날 동굴은 텅 비어 있었다. 그러나 어른들은 당신 말을 믿었다.', honor: 5, tr: [[LOY, 4]] }), o('못 본 척한다', { r: '그 노랫소리가 오래도록 귓가에 맴돌았다.', tr: [[PRU, 3]] })] },
  { id: 'c2_angel_feather', t: '빛나는 깃털', once: true, c: all(kid(0.2, 1), lightLand, x => x.w.chars.some(a => a.died < 0 && a.race === 'angel' && a.l === x.c.l && dist(a, x.c) < 30)), x: '들판에서 희미하게 빛나는 하얀 깃털 하나를 주웠다. 손에 쥐자 따뜻하다.',
    o: [o('소중히 간직한다', { ach: 'feather', r: '힘든 날마다 깃털을 꺼내 보았다. 이상하게 마음이 놓였다.', item: '빛나는 깃털', tr: [[FAI, 6]] }), o('{temple}에 바친다', { r: '사제가 놀라 한참을 바라보았다.', honor: 4, tr: [[FAI, 8]] }), o('장터에 판다', { r: '꽤 큰돈을 받았다.', wealth: 15, tr: [[GRE, 4]] })] },
  { id: 'c2_first_love', t: '첫 마음', once: true, c: kid(0.75, 1.05), x: '{market}에서 마주친 또래 하나가 자꾸만 눈에 밟힌다.',
    o: [o('꽃을 꺾어 건넨다', { r: '얼굴이 새빨개진 채 웃었다. 그 웃음을 오래 기억하였다.', ch: 2, mood: 8 }, '', ['ch', 0.55], { r: '꽃은 바닥에 떨어졌다. 그날 밤 베개를 적셨다.', mood: -6 }), o('멀리서 지켜보기만 한다', { r: '그 계절이 다 가도록 말 한마디 못 하였다.', tr: [[PRU, 3]] }), o('시를 써서 몰래 둔다', { r: '누가 썼는지 소문이 돌았다. 들키지는 않았다.', in: 2, tr: [[SOC, 2]] })] },
  { id: 'c2_runaway', t: '가출', once: true, c: all(kid(0.75, 1.05), x => x.c.traits[CUR] > 55 || x.c.traits[C0] > 60), x: '답답한 고향이 견딜 수 없다. 밤에 몰래 보따리를 쌌다.',
    o: [o('떠난다', { r: '사흘을 걷다 돌아왔다. 그러나 세상의 넓이를 보았다.', co: 2, hp: -3, tr: [[C0, 5], [CUR, 4]] }, '', ['luck', 0.7], { r: '산적에게 가진 것을 몽땅 빼앗기고 울며 돌아왔다.', hp: -5, tr: [[PRU, 5]] }), o('부모에게 편지를 남기고 마음을 접는다', { r: '언젠가는, 하고 보따리를 다시 풀었다.', tr: [[LOY, 4]] })] },
  { id: 'c2_apprentice_test', t: '견습 시험', once: true, c: kid(0.8, 1.05), x: '{h}의 장인 조합이 견습생을 뽑는다. 문 앞에 또래들이 줄을 섰다.',
    o: [o('손재주 시험을 본다', { r: '조합장이 고개를 끄덕였다.', in: 3, wealth: 3 }, '', ['in', 0.5], { r: '손이 떨려 망쳤다. 다음을 기약하였다.', mood: -4 }), o('힘쓰는 일로 지원한다', { r: '짐꾼으로 뽑혔다. 어깨가 단단해졌다.', mi: 3 }), o('줄을 빠져나와 집으로 간다', { r: '아직은 정하고 싶지 않았다.', tr: [[CUR, 3]] })] },
  { id: 'c2_storyteller', t: '떠돌이 이야기꾼', once: true, c: kid(0.3, 1), x: '떠돌이 이야기꾼이 광장에서 지난 시대의 영웅담을 들려준다.',
    o: [o('마왕을 쓰러뜨린 용사 이야기', { r: '밤새 나무칼을 휘두르는 꿈을 꾸었다.', tr: [[C0, 5]], mi: 1 }), o('나라를 세운 왕 이야기', { r: '언젠가 깃발을 세우리라 다짐하였다.', tr: [[AMB, 6]] }), o('바다 끝을 본 뱃사람 이야기', { r: '수평선 너머가 궁금해 견딜 수 없었다.', tr: [[CUR, 6]] })] },
  { id: 'c2_bad_crowd', t: '골목의 형들', once: true, c: kid(0.6, 1.05), x: '골목의 형들이 장터 노점 하나를 털자며 망을 봐 달라고 한다.',
    o: [o('망을 본다', { r: '나눠 받은 동전이 무겁게 느껴졌다.', wealth: 5, tr: [[GRE, 5], [LOY, -3]] }, '', ['luck', 0.6], { r: '경비병에게 붙잡혀 부모가 불려 왔다.', honor: -5, tr: [[PRU, 3]] }), o('거절한다', { r: '형들이 비웃었지만 개의치 않았다.', tr: [[PRI, 4], [LOY, 2]] }), o('노점 주인에게 미리 귀띔한다', { r: '주인은 고맙다며 사과 하나를 쥐여 주었다. 형들은 당신을 노려보았다.', honor: 4, tr: [[COM, 3]] })] },
];

// ───────────── 길 위의 일들 (기대할 만한 만남과 발견)

const traveling = (x: Ctx) => x.c.act.kind === 'travel' && x.P.flags?.siteGate === undefined;
const roadSeed = (x: Ctx) => x.w.t + x.c.id * 7;
function siteNear(x: Ctx) {
  return x.w.sites.find(s => s.l === x.c.l && (s.loot > 0 || s.relic) && s.kind !== 'deep' && approxDist(x.w, x.c, s) < 10);
}
function paragonNear(x: Ctx): Character | undefined {
  return x.w.chars.find(p => p.died < 0 && p.paragon && p.l === x.c.l && dist(p, x.c) <= 15);
}
function heroNear(x: Ctx): Character | undefined {
  return x.w.chars.find(p => p.died < 0 && p.id !== x.c.id && (isHero(p) || p.fame >= 100) && p.race !== 'dragon' && !p.archdemon && !p.paragon && p.l === x.c.l && dist(p, x.c) <= 8);
}

export const TRAVEL2: LifeEv[] = [
  { id: 'xt2_sage', t: '길가의 현자', cd: 60, c: all(adult, traveling), x: '길가 바위에 앉은 노인이 당신을 불러 세웠다. "자네, 무엇을 찾아 길을 가는가?"',
    o: [o('지혜를 구한다', { r: '노인은 세 가지 수수께끼를 내었다. 답을 찾는 동안 무언가가 열렸다.', in: 4, ma: 2 }, '', ['in', 0.45], { r: '노인은 웃으며 "아직 이르군" 하고 사라졌다.', in: 1 }), o('먹을 것을 나누어 드린다', { r: '노인은 보답으로 오래된 부적 하나를 건넸다.', item: '현자의 부적', honor: 3 }), o('바쁘다며 지나친다', { r: '뒤돌아보니 바위 위에는 아무도 없었다.' })] },
  { id: 'xt2_knight', t: '쓰러진 기사', cd: 48, c: all(adult, traveling), x: '길섶에 피투성이가 된 기사 하나가 쓰러져 있다. 문장이 새겨진 방패가 부서져 있다.',
    o: [o('상처를 싸매고 가까운 마을로 데려간다', { r: '기사는 깨어나 은혜를 잊지 않겠다고 맹세하였다.', honor: 8, fame: 3, wealth: -5 }), o('무슨 일이 있었는지 묻는다', { r: '"매복이었소… 저 고개 너머에 아직 그놈들이…" 기사는 숨을 거두었다. 그의 검이 남았다.', item: '기사의 검', mi: 1 }), o('갑옷을 벗겨 간다', { r: '꽤 값나가는 갑옷이었다. 마음 한구석이 무거웠다.', wealth: 30, honor: -10, tr: [[GRE, 4], [COM, -4]] })] },
  { id: 'xt2_battlefield', t: '옛 전장', cd: 60, c: all(adult, traveling, x => x.w.corpses > 200 || atWarC2(x)), x: '녹슨 칼과 부러진 창이 흩어진 들판을 지난다. 까마귀들이 아직도 맴돈다.',
    o: [o('쓸 만한 것을 찾아본다', { r: '이름 모를 장수의 투구를 찾았다.', item: '전장의 투구', wealth: 10 }, '', ['luck', 0.65], { r: '무언가에 발목을 붙잡혔다. 그것은 죽은 자의 손이었다. 미친 듯이 달아났다.', hp: -8, mood: -6 }), o('죽은 이들을 묻어 준다', { r: '하루가 꼬박 걸렸다. 밤바람이 고맙다고 속삭이는 듯하였다.', honor: 6, tr: [[COM, 4], [FAI, 3]] }), o('서둘러 지나간다', { r: '뒤를 돌아보지 않았다.' })] },
  { id: 'xt2_shrine', t: '숨은 성소', cd: 72, c: all(adult, traveling), x: '덩굴에 뒤덮인 작은 성소를 발견하였다. 제단 위의 돌그릇에 맑은 물이 고여 있다.',
    o: [o('물을 마신다', { ach: 'shrinewater', r: '온몸에 힘이 차올랐다. 오래된 상처가 아물었다.', hp: 25, ma: 2 }, '', ['luck', 0.6], { r: '배를 움켜쥐고 사흘을 앓았다. 이곳의 신은 손님을 반기지 않았다.', hp: -15 }), o('무릎 꿇고 기도한다', { r: '마음이 고요해졌다. 길이 조금 더 또렷하게 보였다.', mood: 10, tr: [[FAI, 6]] }), o('제단을 뒤진다', { r: '제단 밑에서 낡은 금화 주머니를 찾았다.', wealth: 35, tr: [[GRE, 4]] }, '', ['luck', 0.5], { r: '손을 넣자 독사가 물었다.', hp: -20 })] },
  { id: 'xt2_ruin_glimpse', t: '길 옆의 폐허', cd: 36, c: all(adult, traveling, x => !!siteNear(x)), data: x => ({ siteName: siteNear(x)!.name }),
    x: '길에서 멀지 않은 곳에 {siteName}의 무너진 입구가 보인다. 바람에 실려 쇠 냄새가 난다.',
    o: [o('잠깐 들어가 본다', { r: '입구 근처에서 반쯤 묻힌 보석함을 찾았다.', wealth: 40, fame: 2 }, '', ['co', 0.45], { r: '안쪽에서 무언가가 튀어나왔다. 상처를 입고 겨우 빠져나왔다.', hp: -22 }), o('지도에 표시만 해 둔다', { r: '언젠가 다시 오리라.', in: 1 }), o('그냥 지나간다', { r: '오늘의 길은 다른 데 있었다.' })] },
  { id: 'xt2_merchant', t: '수상한 행상', cd: 36, c: all(adult, traveling), x: '두건을 깊이 눌러쓴 행상이 보따리를 펼쳤다. "이건 아무에게나 보여 주는 물건이 아니오."',
    o: [o('가진 돈을 털어 산다', { r: '집에 와서 보니 진짜였다. 희미한 마력이 흘렀다.', wealth: -30, item: '정체 모를 반지', ma: 3 }, '', ['luck', 0.5], { r: '집에 와서 보니 색칠한 돌멩이였다.', wealth: -30, tr: [[PRU, 5]] }), o('값을 깎는다', { r: '행상은 혀를 차며 반값에 넘겼다.', wealth: -12, item: '낡은 나침반' }, '', ['ch', 0.5], { r: '행상은 보따리를 싸서 가 버렸다.' }), o('사기꾼이라며 쫓아낸다', { r: '행상은 저주 같은 말을 중얼거리며 사라졌다.' })] },
  { id: 'xt2_wolves', t: '밤의 짐승들', cd: 24, c: all(adult, traveling, outdoors), x: x => byLayerWild(x),
    o: [o('불을 키우고 버틴다', { r: '새벽까지 불을 지켰다. 짐승들은 물러갔다.', co: 1, hp: -3 }), o('먼저 덤벼든다', { r: '우두머리를 베자 나머지는 흩어졌다. 가죽을 벗겨 팔았다.', mi: 2, wealth: 12, fame: 2 }, '', ['mi', 0.5], { r: '물린 상처가 깊었다.', hp: -25 }), o('나무 위로 올라간다', { r: '긴 밤이었다.', hp: -4 })] },
  { id: 'xt2_river', t: '불어난 강', cd: 30, c: all(adult, traveling, outdoors), x: '비에 불어난 강이 길을 끊었다. 나룻배 사공이 평소의 세 배를 부른다.',
    o: [o('값을 치르고 건넌다', { r: '배는 무사히 건넜다.', wealth: -15 }), o('헤엄쳐 건넌다', { r: '이를 악물고 물살을 갈랐다.', mi: 1, co: 1 }, '', ['mi', 0.45], { r: '떠내려가다 겨우 기슭을 붙잡았다. 짐 일부를 잃었다.', hp: -15, wealth: -10 }), o('물이 빠지길 기다린다', { r: '사흘을 기다렸다. 그 사이 사공의 딸과 친해졌다.', ch: 1, mood: 3 })] },
  { id: 'xt2_checkpoint', t: '국경 검문', cd: 30, c: all(adult, traveling, x => { const L = x.w.layers[x.c.l]; const o2 = L.owner[x.c.y * L.w + x.c.x]; return o2 >= 0 && o2 !== x.c.faction; }),
    x: x => { const L = x.w.layers[x.c.l]; const f = x.w.factions[L.owner[x.c.y * L.w + x.c.x]]; return `${f?.name ?? '낯선 나라'}의 검문소다. 창을 든 병사가 통행세와 출신을 묻는다.`; },
    o: [o('순순히 통행세를 낸다', { r: '도장이 찍힌 통행증을 받았다.', wealth: -8 }), o('말로 구슬린다', { r: '병사가 웃으며 그냥 보내 주었다.', ch: 1 }, '', ['ch', 0.5], { r: '괘씸죄로 하룻밤 갇혔다가 풀려났다.', wealth: -15, mood: -5 }), o('샛길로 몰래 넘는다', { r: '아무도 보지 못하였다.', tr: [[PRU, -2]] }, '', ['luck', 0.6], { r: '발각되어 쫓기다 짐을 버리고 달아났다.', wealth: -20, hp: -5 })] },
  { id: 'xt2_fair', t: '지나는 고을의 장날', cd: 36, c: all(adult, traveling, x => x.w.settlements.some(s => s.alive && s.l === x.c.l && dist(s, x.c) <= 3)), x: '지나던 고을에 장이 섰다. 북소리, 고기 굽는 냄새, 씨름판의 함성이 발길을 붙잡는다.',
    o: [o('씨름판에 나선다', { r: '세 판을 내리 이겨 상금을 탔다!', wealth: 20, fame: 3, mi: 1 }, '', ['mi', 0.45], { r: '첫 판에 메다꽂혔다. 구경꾼들이 박장대소하였다.', hp: -5 }), o('하룻밤 즐긴다', { r: '술과 노래와 춤. 길의 피로가 씻겨 나갔다.', wealth: -10, mood: 10 }), o('물건을 사고팔아 본다', { r: '길에서 주운 것들을 꽤 좋은 값에 넘겼다.', wealth: 12, in: 1 })] },
  { id: 'xt2_lost_child', t: '길 잃은 아이', cd: 48, c: all(adult, traveling), x: '숲길에서 아이 하나가 울고 있다. 집이 어딘지 모른다고 한다.',
    o: [o('집을 찾아 준다', { r: '하루를 돌아가 아이를 부모 품에 안겨 주었다. 그 집 할머니가 귀한 약초를 내주었다.', honor: 6, hp: 6 }), o('가까운 마을 경비에게 맡긴다', { r: '경비병이 맡아 주었다.', honor: 2 }), o('모른 척 지나친다', { r: '울음소리가 등 뒤에서 오래 따라왔다.', mood: -6, tr: [[COM, -3]] })] },
  { id: 'xt2_dragon', t: '머리 위의 날개', cd: 60, c: all(adult, traveling, dragonNear(25)), x: '갑자기 하늘이 어두워졌다. 용 한 마리가 낮게 날아 지나간다. 둥지가 멀지 않은 듯하다.',
    o: [o('날아간 쪽을 기억해 둔다', { r: '용의 둥지가 어디쯤인지 짐작이 갔다. 언젠가 쓸모가 있으리라.', in: 2, tr: [[CUR, 4]] }), o('바위 그늘에 몸을 숨긴다', { r: '그림자가 지나갈 때까지 숨을 죽였다.' }), o('비늘이라도 떨어졌나 찾아본다', { ach: 'dragonscale', r: '풀숲에서 손바닥만 한 비늘을 주웠다!', item: '용의 비늘', wealth: 20 }, '', ['luck', 0.35], { r: '아무것도 찾지 못하고 하루를 허비하였다.' })] },
  { id: 'xt2_paragon', t: '홀로 선 자', cd: 120, c: all(adult, traveling, x => !!paragonNear(x)), data: x => ({ pId: paragonNear(x)!.id }),
    x: '길 저편에서 한 사람이 걸어온다. 주위의 공기가 무겁다. 세상이 열강이라 부르는 자, {p}였다.',
    o: [o('고개 숙여 길을 비킨다', { r: '{p}은(는) 당신을 한 번 쳐다보고는 지나갔다. 등에 식은땀이 흘렀다.' }), o('가르침을 청한다', { r: '{p}은(는) 한 수를 보여 주었다. 그 한 수가 당신의 검을 바꾸었다.', mi: 4, fame: 3 }, '', ['co', 0.4], { r: '{p}은(는) 대답 대신 손을 한 번 휘둘렀다. 당신은 길바닥에 나뒹굴었다.', hp: -18 }), o('이름을 묻는다', { r: '"이름 따위가 무슨 소용인가." 그 목소리가 오래 남았다.', tr: [[AMB, 4]] })] },
  { id: 'xt2_hero', t: '길에서 만난 이름난 이', cd: 60, c: all(adult, traveling, x => !!heroNear(x)), data: x => ({ pId: heroNear(x)!.id }),
    x: '모닥불 곁에 먼저 앉아 있던 이가 이름을 밝혔다. {p}. 노래와 소문으로만 듣던 이름이다.',
    o: [o('함께 밤을 지새우며 이야기를 듣는다', { r: '{p}의 이야기에는 노래에 없는 쓸쓸함이 있었다.', in: 2, ch: 1 }), o('동행을 청한다', { r: '{p}은(는) 며칠 길을 함께 걸었다. 많은 것을 배웠다.', mi: 2, co: 2 }, '', ['ch', 0.5], { r: '"내 길은 혼자 가는 길이오." 정중한 거절이었다.' }), o('겨루기를 청한다', { r: '져 주었다는 걸 알았지만, 그래도 가슴이 뛰었다.', mi: 2, fame: 4 }, '', ['mi', 0.25], { r: '단 한 합에 칼이 날아갔다.', hp: -6 })] },
  { id: 'xt2_omen', t: '길 위의 징조', cd: 48, c: all(adult, traveling, x => x.w.doom.seals.some(Boolean)), x: '길가의 우물을 들여다보니 물이 핏빛으로 일렁인다. 지나가던 순례자가 성호를 그었다.',
    o: [o('순례자에게 무슨 뜻인지 묻는다', { r: '"봉인이 깨지고 있소. 세상의 끝이 가까워요." 순례자의 눈이 떨렸다.', in: 1, tr: [[FAI, 3]] }), o('물을 떠서 마법사에게 가져간다', { r: '물병 속에서 무언가가 꿈틀거렸다. 마법사는 큰돈을 주고 그것을 샀다.', wealth: 25, ma: 1 }), o('못 본 척 지나간다', { r: '그날 밤 악몽을 꾸었다.', mood: -4 })] },
  { id: 'xt2_bandit_offer', t: '산적의 제안', cd: 72, c: all(adult, traveling, x => x.c.traits[COM] < 50 || x.c.traits[GRE] > 60), x: '모닥불에 다가온 산적 두목이 칼 대신 술병을 내밀었다. "자네 같은 사람이 필요하네. 한몫 단단히 챙길 일이 있지."',
    o: [o('한패가 된다', { r: '부잣집 마차 하나를 털었다. 손이 떨렸지만 주머니는 무거웠다.', wealth: 50, honor: -15, tr: [[GRE, 5], [COM, -5]] }, '', ['luck', 0.65], { r: '털이는 함정이었다. 경비대에 쫓겨 산속을 헤맸다.', hp: -20, honor: -10 }), o('술만 얻어 마시고 거절한다', { r: '두목은 껄껄 웃으며 다음을 기약하였다.' }), o('두목을 붙잡아 관아에 넘긴다', { r: '현상금이 걸린 자였다!', wealth: 40, fame: 5, honor: 5 }, '', ['mi', 0.4], { r: '패거리에게 둘러싸여 흠씬 두들겨 맞았다.', hp: -25 })] },
];

function byLayerWild(x: Ctx): string {
  const l = x.c.l;
  const s = roadSeed(x) % 2;
  if (l === 3) return ['어둠 속에서 눈먼 굴짐승들의 숨소리가 다가온다.', '동굴 벽을 타고 거대한 거미 떼가 내려온다.'][s];
  if (l === 4) return ['잿빛 황야에서 불을 머금은 하이에나 떼가 원을 그리며 다가온다.', '유황 연기 너머로 붉은 눈들이 번뜩인다.'][s];
  if (l <= 1) return ['구름 사이로 굶주린 하피 떼가 날아든다.', '바람을 타고 날카로운 부리의 새 떼가 덮쳐 온다.'][s];
  return ['밤이 깊자 늑대 울음이 사방에서 들려온다. 모닥불 너머로 눈들이 번뜩인다.', '수풀이 흔들리더니 굶주린 멧돼지 떼가 튀어나왔다.'][s];
}

// ───────────── 반역의 대가: 옥살이와 추방

const inPrison = (x: Ctx) => x.c.act.kind === 'prison';
export const PRISON: LifeEv[] = [
  { id: 'pr_cell', t: '감옥의 나날', cd: 6, c: inPrison, x: x => ['차가운 돌바닥, 하루 한 번 들어오는 묽은 죽. 창살 너머로 손바닥만 한 하늘이 보인다.', '옥사 안은 축축하고 어둡다. 쥐들이 발치를 지나간다.', '간수의 발소리가 멀어진다. 또 하루가 지났다.'][(x.w.t + x.c.id) % 3],
    o: [o('몸을 단련하며 때를 기다린다', { r: '좁은 감방에서 매일 수백 번 몸을 일으켰다.', mi: 2, co: 1 }), o('간수와 말을 튼다', { r: '간수가 몰래 빵 한 조각을 더 넣어 주기 시작하였다.', ch: 2, flag: 'guardFriend' }), o('탈옥을 꾀한다', { r: '', fx: 'prison_escape' }, '들키면 형기가 늘어난다')] },
  { id: 'pr_cellmate', t: '옆 감방의 죄수', once: true, c: inPrison, x: '옆 감방의 늙은 죄수가 벽을 두드린다. "젊은이, 무료하지 않나? 내가 아는 것을 가르쳐 주지."',
    o: [o('글과 셈을 배운다', { r: '벽 너머로 들려오는 목소리가 스승이 되었다.', in: 4 }), o('자물쇠 따는 법을 배운다', { r: '손가락에 감각이 생겼다.', in: 1, flag: 'lockpick' }), o('그의 죄를 묻는다', { r: '그는 한때 왕의 재상이었다고 하였다. 믿기 어려운 이야기였다.', tr: [[CUR, 4]] })] },
  { id: 'pr_interrogation', t: '심문', once: true, c: inPrison, x: '심문관이 함께 음모를 꾸민 자들의 이름을 대라고 한다. 불에 달군 쇠꼬챙이가 탁자 위에 놓여 있다.',
    o: [o('끝까지 입을 다문다', { r: '몸은 망가졌지만 아무도 팔지 않았다. 옥중에도 그 소문이 돌았다.', hp: -25, honor: 10, tr: [[LOY, 6]] }), o('이름을 댄다', { r: '형기가 줄었다. 그러나 밤마다 그들의 얼굴이 떠오른다.', fx: 'prison_cut', honor: -15, tr: [[LOY, -6]] }), o('거짓 이름을 댄다', { r: '심문관은 속았다. 무고한 누군가가 끌려왔다는 소식을 들었다.', honor: -6 }, '', ['in', 0.5], { r: '거짓이 들통나 매질이 두 배가 되었다.', hp: -30 })] },
  { id: 'pr_visit', t: '면회', once: true, c: all(inPrison, x => x.w.chars[x.c.spouse]?.died < 0), x: '{sp}이(가) 면회를 왔다. 창살 너머로 손을 맞잡았다.',
    o: [o('기다려 달라고 한다', { r: '{sp}은(는) 눈물을 훔치며 고개를 끄덕였다.', mood: 10 }), o('나를 잊으라고 한다', { r: '{sp}은(는) 아무 말 없이 돌아섰다.', mood: -10 }), o('바깥 소식을 묻는다', { r: '왕궁의 사정과 옛 동료들의 소식을 들었다.', in: 1 })] },
  { id: 'pr_release', t: '석방', cd: 1, c: all(inPrison, x => (fl(x, 'prison') ?? Infinity) <= x.w.t), x: x => `옥문이 열렸다. ${Math.max(1, Math.round((x.w.t - (fl(x, 'prisonAt') ?? x.w.t)) / 12))}년 만에 보는 바깥 하늘이 눈부시다.`,
    o: [o('다시 충성을 맹세한다', { r: '무릎을 꿇고 군주의 자비에 감사하였다. 궁정의 눈길은 여전히 차가웠다.', fx: 'prison_out', tr: [[LOY, 5]] }), o('조용히 고향을 떠난다', { r: '', fx: 'prison_out_exile' }), o('복수를 가슴에 묻는다', { r: '옥문을 나서며 뒤돌아보았다. 언젠가.', fx: 'prison_out', tr: [[AMB, 6], [LOY, -8]] })] },
  { id: 'pr_pardon', t: '사면', cd: 1, c: all(inPrison, x => { const by = fl(x, 'prisonBy'); return by !== undefined && !!x.f && x.f.leader !== by; }), x: '새 군주가 즉위하며 옥에 갇힌 이들을 사면하였다. 당신의 이름도 그 명단에 있었다.',
    o: [o('새 군주에게 감사를 올린다', { r: '새 군주는 당신을 기억해 두겠다고 하였다.', fx: 'prison_out', honor: 5 }), o('조용히 집으로 돌아간다', { r: '', fx: 'prison_out' })] },
];

/** 추방, 함락의 소식, 함락의 밤에 붙잡힘 */
export const AFTERMATH: LifeEv[] = [
  { id: 'ex_exile', t: '쫓기는 몸', cd: 1, c: all(adult, x => fl(x, 'exiled') !== undefined && x.w.t - fl(x, 'exiled')! <= 3),
    x: x => [
      '"다시는 이 땅을 밟지 마라." 병사들이 당신을 국경 밖으로 끌어내 내동댕이쳤다.',
      '옥을 빠져나온 지 사흘. 등 뒤로 추격대의 횃불이 아른거린다. 어디로 가야 하는가.',
      '아무도 배웅하지 않았다. 국경의 돌기둥 앞에서 마지막으로 고향 쪽을 돌아보았다.',
    ][fl(x, 'exileHow') ?? 0],
    o: [o('이웃 나라에 몸을 의탁한다', { r: '', fx: 'exile_go', unflag: 'exiled' }), o('이름 없는 모험가로 떠돈다', { r: '등에 진 것은 칼 한 자루뿐이었다.', job: '모험가', unflag: 'exiled', fx: 'exile_wander' }), o('돌아갈 날을 맹세한다', { r: '국경의 돌에 칼끝으로 이름을 새겼다.', fx: 'exile_go', unflag: 'exiled', tr: [[AMB, 6], [PRI, 4]] })] },
  { id: 'xh_fallen_away', t: '돌아갈 곳', cd: 1, c: all(adult, x => fl(x, 'peril_fallenAway') !== undefined && x.w.t - fl(x, 'peril_fallenAway')! <= 4),
    x: x => { const s = x.w.settlements[fl(x, 'perilSet') ?? -1]; const f = s ? x.w.factions[s.faction] : undefined; return `길 위에서 소식을 들었다. 고향 ${s?.name ?? ''}이(가) ${f?.name ?? '적'}의 손에 떨어졌다고 한다. 가족은, 집은 어찌 되었을까.`; },
    o: [o('그래도 고향으로 돌아간다', { r: '낯선 깃발 아래로 돌아가 무릎을 꿇었다. 집은 남아 있었다.', fx: 'fallen_back', unflag: 'peril_fallenAway' }, '', ['luck', 0.75], { r: '성문에서 붙잡혔다. 첩자로 몰렸다.', fx: 'captured', unflag: 'peril_fallenAway' }),
      o('옛 나라의 남은 땅으로 간다', { r: '', fx: 'flee_home', unflag: 'peril_fallenAway' }),
      o('고향을 되찾을 사람들을 모은다', { r: '피난민들 속에서 뜻을 같이할 이들을 찾기 시작하였다.', honor: 8, unflag: 'peril_fallenAway', seed: ['resistance', '{h}을(를) 되찾으려는 저항군'] })] },
];

// ───────────── 직업마다 제 솜씨를 갈고닦는 길

const atHome = (x: Ctx) => x.c.act.kind === 'idle' && !!x.home;
const T = (id: string, t: string, roles: string[], text: string, opts: ReturnType<typeof o>[]): LifeEv =>
  ({ id, t, w: 2, cd: 30, c: all(adult, atHome, x => roles.includes(x.c.role)), x: text, o: opts });
export const CRAFT: LifeEv[] = [
  T('cf_warrior', '검을 벼리는 나날', ['전사', '기사'], '훈련장에 새벽 안개가 깔렸다. 오늘은 무엇을 갈고닦을까.', [
    o('목검으로 천 번을 벤다', { r: '손바닥이 터졌지만 칼끝이 한결 곧아졌다.', mi: 3, hp: -3 }),
    o('노련한 교관에게 대련을 청한다', { r: '수없이 쓰러지며 빈틈을 읽는 법을 배웠다.', mi: 4, co: 1 }, '', ['mi', 0.5], { r: '갈비뼈에 금이 갔다.', hp: -15, mi: 1 }),
    o('병법서를 읽으며 진법을 익힌다', { r: '싸움은 칼만으로 하는 것이 아님을 알았다.', co: 3, in: 1 })]),
  T('cf_mage', '마탑의 밤', ['마법사', '사령술사', '주술사', '드루이드'], '마나의 흐름이 유난히 짙은 밤이다. 무엇을 시험해 볼까.', [
    o('기본 주문을 수백 번 되풀이한다', { r: '주문이 숨 쉬듯 입에서 흘러나오게 되었다.', ma: 3 }),
    o('금서의 한 장을 펼친다', { ach: 'forbidden', r: '머릿속에 문이 하나 열렸다. 그 너머는 깊고 어두웠다.', ma: 6, in: 1 }, '', ['ma', 0.45], { r: '주문이 되튀어 온몸이 타들어 갔다.', hp: -22, ma: 2 }),
    o('별자리를 읽으며 명상한다', { r: '마나가 고요해지고 몸이 가벼워졌다.', ma: 2, hp: 6 })]),
  T('cf_scholar', '서고의 등불', ['학자', '연금술사'], '서고의 등불 아래 읽지 못한 책이 산더미다.', [
    o('옛 왕국의 연대기를 필사한다', { r: '잊힌 이름들이 손끝에서 되살아났다.', in: 3 }),
    o('학자들의 논쟁에 끼어든다', { r: '날 선 논박 끝에 이름이 알려졌다.', in: 2, ch: 2, fame: 2 }, '', ['in', 0.5], { r: '말문이 막혀 웃음거리가 되었다.', fame: -2 }),
    o('직접 실험해 본다', { r: '책에 없는 것을 하나 찾아냈다.', in: 4 }, '', ['luck', 0.6], { r: '실험실이 연기로 가득 찼다.', hp: -8, wealth: -10 })]),
  T('cf_merchant', '장부와 저울', ['상인'], '장부를 펼치니 이번 철의 셈이 기다린다.', [
    o('흥정의 기술을 갈고닦는다', { r: '말 한마디로 값이 움직이는 법을 익혔다.', ch: 3, wealth: 5 }),
    o('새 물건에 크게 걸어 본다', { r: '들여온 물건이 날개 돋친 듯 팔렸다.', wealth: 45, ch: 1 }, '', ['luck', 0.5], { r: '아무도 사지 않았다. 창고에 먼지만 쌓였다.', wealth: -30 }),
    o('다른 상인들과 조합을 만든다', { r: '서로의 길을 터 주는 사이가 되었다.', ch: 2, wealth: 10 })]),
  T('cf_priest', '제단 앞에서', ['성직자', '치유사'], '신전의 새벽 기도 시간이다.', [
    o('밤새 금식하며 기도한다', { r: '몸은 비었으나 마음은 맑아졌다.', tr: [[FAI, 5]], ma: 2, hp: -4 }),
    o('가난한 이들의 거리로 나간다', { r: '병자를 씻기고 굶주린 이를 먹였다. 사람들이 이름을 기억하였다.', honor: 6, ch: 2 }),
    o('설교를 준비한다', { r: '설교에 사람들이 눈물을 흘렸다.', ch: 3, fame: 2 })]),
  T('cf_hunter', '사냥터', ['사냥꾼', '조련사'], '{wild}에 짐승의 발자국이 새로 났다.', [
    o('흔적을 끝까지 쫓는다', { r: '사흘 만에 큰 짐승을 잡았다.', mi: 2, wealth: 15 }),
    o('활쏘기를 다시 익힌다', { r: '백 보 밖의 나뭇잎을 꿰뚫게 되었다.', mi: 3 }),
    o('짐승의 우두머리를 길들여 본다', { r: '거친 녀석이 마침내 고개를 숙였다.', ch: 2, co: 2 }, '', ['co', 0.45], { r: '물려서 한 달을 앓았다.', hp: -18 })]),
  T('cf_smith', '모루 앞에서', ['대장장이', '장인', '함정꾼'], '모루 위에 쇳덩이가 놓였다. 무엇을 만들까.', [
    o('평생의 역작에 도전한다', { ach: 'masterwork', r: '불꽃 속에서 이름을 새길 만한 물건이 나왔다.', item: '손수 벼린 명품', fame: 5, in: 2 }, '', ['in', 0.4], { r: '마지막 담금질에서 금이 갔다. 다시 해야 한다.', mood: -6 }),
    o('늘 하던 일을 꼼꼼히 한다', { r: '손님들이 단골이 되었다.', wealth: 15, in: 1 }),
    o('견습생에게 기술을 가르친다', { r: '가르치며 오히려 배웠다.', in: 2, ch: 1 })]),
  T('cf_thief', '그림자 속에서', ['도적', '암살자'], '지붕 위로 달이 떴다. 오늘 밤은 무엇을 연습할까.', [
    o('자물쇠를 따는 손을 단련한다', { r: '어떤 자물쇠도 숨 세 번이면 열린다.', in: 2, mi: 1 }),
    o('부잣집 금고를 노려 본다', { r: '아무도 모르게 금고가 비었다.', wealth: 50, honor: -5 }, '', ['luck', 0.5], { r: '경비병에게 쫓겨 지붕에서 떨어졌다.', hp: -20, honor: -5 }),
    o('소리 없이 걷는 법을 익힌다', { r: '그림자처럼 움직이게 되었다.', mi: 2, co: 1 })]),
  T('cf_bard', '주점의 무대', ['음유시인'], '주점이 손님으로 가득하다. 어떤 노래를 부를까.', [
    o('새 영웅담을 짓는다', { r: '그 노래가 이웃 고을까지 퍼졌다.', ch: 3, fame: 3 }),
    o('옛 노래를 다듬는다', { r: '노인들이 눈물을 훔쳤다.', ch: 2, wealth: 8 }),
    o('군주를 풍자한다', { r: '사람들이 배를 잡고 웃었다.', ch: 2, fame: 4 }, '', ['luck', 0.6], { r: '병사들이 주점에 들이닥쳤다. 하룻밤 갇혔다.', honor: -4, mood: -5 })]),
  T('cf_farmer', '들판의 사계', ['농부', '평민'], '씨 뿌릴 때가 되었다. 올해는 어떻게 할까.', [
    o('새 농법을 시험한다', { r: '수확이 눈에 띄게 늘었다.', wealth: 20, in: 1 }, '', ['in', 0.5], { r: '싹이 나지 않았다. 한 해 농사를 망쳤다.', wealth: -10 }),
    o('늘 하던 대로 정성을 들인다', { r: '들판이 금빛으로 물들었다.', wealth: 12 }),
    o('이웃과 두레를 꾸린다', { r: '함께 일하니 일이 반으로 줄었다.', ch: 2, wealth: 8 })]),
  T('cf_miner', '갱도 깊은 곳', ['광부'], '갱도 끝에서 새 광맥의 냄새가 난다.', [
    o('더 깊이 파 내려간다', { r: '번쩍이는 광맥이 드러났다!', wealth: 35, mi: 1 }, '', ['luck', 0.55], { r: '천장이 무너져 갇혔다가 사흘 만에 구조되었다.', hp: -25 }),
    o('버팀목을 단단히 세운다', { r: '동료들이 당신의 갱도를 가장 안전하다고 하였다.', co: 2, honor: 2 }),
    o('광석을 가려내는 눈을 익힌다', { r: '돌 하나만 보고도 값을 맞히게 되었다.', in: 2, wealth: 8 })]),
  T('cf_sailor', '항구의 바람', ['선원'], '바다가 잔잔하다. 출항 전의 하루를 어떻게 보낼까.', [
    o('별을 보며 항해술을 익힌다', { r: '밤바다에서도 길을 잃지 않게 되었다.', in: 2, co: 1 }),
    o('돛줄을 다루는 솜씨를 단련한다', { r: '팔뚝이 굵어졌다.', mi: 2 }),
    o('늙은 선장의 이야기를 듣는다', { r: '먼 바다의 섬과 괴수 이야기를 들었다.', in: 1, tr: [[CUR, 4]] })]),
];

// ───────────── 운명의 문: 큰 뜻을 품고 걸어온 이에게 열리는 길

const lightBorn = (x: Ctx) => RACES[x.c.race].align !== 'dark';
const noHero = (x: Ctx) => !x.w.chars.some(o => o.died < 0 && o.awakened.includes('hero') && o.id !== x.c.id);
const deedsOfHero = (x: Ctx) => x.c.fame >= 50 && x.c.honor >= 30 && x.c.traits[C0] >= 60 && !x.c.awakened.includes('hero') && !x.c.awakened.includes('seed');
const darkReady = (x: Ctx) => x.c.awakened.includes('seed') && x.w.demonLord < 0 && x.w.t - (x.w.stats.lastDemonLord ?? -9999) >= 12 * 30
  && !!x.f && RACES[x.f.race].align === 'dark' && x.c.fame >= 40 && x.f.leader !== x.c.id;
export const DESTINY: LifeEv[] = [
  { id: 'dz_hero_trial', t: '선택받은 자의 시험', cd: 120, w: 4, c: all(adult, atHome, lightBorn, deedsOfHero, x => noHero(x) || x.w.demonLord >= 0),
    x: x => x.w.demonLord >= 0 ? '마왕의 그림자가 세상을 덮은 해, 꿈속에 빛나는 날개를 가진 이가 나타나 산꼭대기의 바위에 박힌 검을 가리켰다.' : '고을의 노인들이 말하기를, 산꼭대기 바위에 박힌 검은 오직 선택받은 자만이 뽑을 수 있다고 한다. 이름이 알려진 당신에게 사람들의 눈길이 쏠렸다.',
    o: [o('산에 올라 검을 뽑아 본다', { ach: 'chosen', r: '검이 바위에서 미끄러지듯 빠져나왔다. 하늘이 갈라지며 빛이 쏟아졌다.', fx: 'hero', fame: 20 }, '무력이 클수록 뽑힐 가능성이 크다', ['mi', 0.25], { r: '검은 꿈쩍도 하지 않았다. 아직은 아니라는 듯이.', fame: 2 }),
      o('나는 그런 그릇이 아니다', { r: '산을 등지고 내려왔다.' })] },
  { id: 'dz_dark_whisper', t: '피의 속삭임', once: true, w: 3, c: all(adult, atHome, x => RACES[x.c.race].align === 'dark' && x.c.traits[AMB] >= 65 && !x.c.awakened.includes('seed') && !x.c.awakened.includes('hero')),
    x: '마계의 피가 밤마다 끓는다. 꿈속에서 붉은 눈의 사절이 손을 내민다. "네 안에 왕좌가 있다. 받아들이기만 하면 된다."',
    o: [o('손을 맞잡는다', { r: '피로 서명하였다. 몸속에 검은 힘이 흘러들었다.', fx: 'seed', ma: 4, mi: 3, honor: -10 }, '마왕의 씨앗'), o('뿌리친다', { r: '식은땀을 흘리며 깨어났다.', tr: [[FAI, 3]] })] },
  { id: 'dz_dark_throne', t: '심연의 왕좌', cd: 120, w: 4, c: all(adult, atHome, darkReady),
    x: x => `몸속의 마기가 들끓는다. 마도사들이 밤마다 찾아와 속삭인다. "${x.ld?.name ?? '군주'}은(는) 그릇이 못 됩니다. 왕좌를 빼앗고 피의 의식을 치르소서. 당신이 마왕입니다."`,
    o: [o('군주를 무너뜨리고 강림한다', { r: '', fx: 'dark_ascend' }, '반역이 성공하고 의식을 견뎌야 한다'), o('아직은 힘을 기른다', { r: '마기를 누르고 때를 기다렸다.', ma: 2 })] },
];

// ───────────── 길을 떠날까 (스스로 떠나려 할 때 먼저 묻는다)

const tripFresh = (x: Ctx) => { const t = fl(x, 'tripT'); return t !== undefined && x.w.t - t <= 1 && (x.c.act.kind === 'idle' || x.c.act.kind === 'travel'); };
const tripSite = (x: Ctx) => x.w.sites[fl(x, 'tripTarget') ?? -1];
const tripSet = (x: Ctx) => x.w.settlements[fl(x, 'tripTarget') ?? -1];
const ADV_WHY = ['주막에서 술잔을 기울이던 늙은 사냥꾼이', '장터에서 낡은 지도를 팔던 행상이', '먼 길에서 돌아온 옛 친구가', '밤마다 같은 꿈을 꾸게 만든 바람 소리가'];
const TRADE_WHY = ['창고에 물건이 쌓였다', '그쪽 장터에서 값이 두 배로 뛰었다는 소식이 왔다', '오랜 거래처가 서신을 보내왔다', '올해 수확이 넉넉하다'];
export const TRIP: LifeEv[] = [
  { id: 'trip_adventure', t: '모험의 유혹', cd: 1, c: all(adult, tripFresh, x => fl(x, 'tripKind') === 1 && !!tripSite(x)),
    x: x => { const s = tripSite(x)!; return `${ADV_WHY[(x.w.t + x.c.id) % ADV_WHY.length]} ${s.name} 이야기를 꺼냈다. 아직 아무도 손대지 않은 보물이 잠들어 있다고 한다. (위험도 ${'★'.repeat(s.level)}) 지금의 일을 두고 떠날 것인가?`; },
    o: [o('짐을 꾸려 떠난다', { r: '', fx: 'trip_go' }, '도착하면 어떻게 들어갈지 고른다'), o('지금은 때가 아니다', { r: '지도를 접어 서랍 깊이 넣었다.', fx: 'trip_no' }), o('소문을 더 모아 본다', { r: '이야기꾼들에게 술을 사며 그곳의 사정을 알아보았다.', in: 1, wealth: -3, fx: 'trip_no' })] },
  { id: 'trip_trade', t: '교역길', cd: 1, c: all(adult, tripFresh, x => fl(x, 'tripKind') === 2 && !!tripSet(x)),
    x: x => `${TRADE_WHY[(x.w.t + x.c.id) % TRADE_WHY.length]}. ${tripSet(x)!.name}까지 짐을 싣고 다녀오면 한몫 챙길 수 있겠다.`,
    o: [o('직접 수레를 끌고 간다', { r: '', fx: 'trip_go' }, '길 위에서 무슨 일을 만날지 모른다'), o('일꾼을 대신 보낸다', { r: '일꾼이 돌아와 셈을 맞추었다. 이문은 적었지만 편하였다.', wealth: 6, fx: 'trip_no' }), o('이번에는 그만둔다', { r: '가게를 지켰다.', fx: 'trip_no' })] },
  { id: 'trip_pilgrim', t: '순례의 부름', cd: 1, c: all(adult, tripFresh, x => fl(x, 'tripKind') === 3 && !!tripSet(x)),
    x: x => `기도 중에 ${tripSet(x)!.name}의 성소가 마음에 떠올랐다. 평생에 한 번은 가 보아야 할 곳이다.`,
    o: [o('순례길에 오른다', { r: '', fx: 'trip_go' }), o('집에서 기도로 대신한다', { r: '촛불 앞에서 오래 기도하였다.', tr: [[FAI, 2]], fx: 'trip_no' })] },
];

// 함락의 밤에 붙잡히는 길은 perilFx의 '피난' 실패에서 이어진다 (fx: captured)

FX_HOOKS.push((x, fx) => {
  const { w, c, P } = x;
  const rng = w.rngSim;
  P.flags ??= {};
  switch (fx) {
    case 'prison_escape': {
      const p = clamp(0.15 + c.stats.intellect / 400 + c.stats.might / 500 + (P.flags.guardFriend !== undefined ? 0.15 : 0) + (P.flags.lockpick !== undefined ? 0.2 : 0), 0.1, 0.7);
      if (rng.chance(p)) {
        releasePrison(x);
        exileFrom(x, '탈옥');
        addNews(w, `${x.f?.name ?? ''}의 옥에 갇혀 있던 ${c.name}이(가) 탈옥하였다. 현상금이 걸렸다.`, 2, 'player', { chars: [c.id] });
        return '밤을 틈타 창살을 넘었다. 쫓기는 몸이 되었지만, 자유였다.';
      }
      P.flags.prison = (P.flags.prison ?? w.t) + 12;
      c.stats.health = clamp(c.stats.health - 15);
      return '담을 넘다 붙잡혔다. 매질과 함께 형기가 한 해 늘었다.';
    }
    case 'trip_go': {
      const kind = P.flags.tripKind, id = P.flags.tripTarget ?? -1;
      delete P.flags.tripT;
      // 길은 물을 때 이미 잡아 두었다
      if (c.act.kind === 'travel') {
        const to = kind === 1 ? w.sites[id] : w.settlements[id];
        charLog(w, c, kind === 1 ? `${to?.name ?? ''}을(를) 향해 모험을 떠났다.` : kind === 2 ? `교역품을 싣고 ${to?.name ?? ''}(으)로 길을 나섰다.` : `${to?.name ?? ''}(으)로 순례를 떠났다.`, 2);
        return `${to?.name ?? '먼 곳'}(으)로 길을 나섰다.`;
      }
      if (kind === 1) { const site = w.sites[id]; if (site && setTravel(w, c, site, 'adventure', site.id)) { charLog(w, c, `${site.name}을(를) 향해 모험을 떠났다.`, 2); return `${site.name}을(를) 향해 길을 나섰다.`; } }
      else { const to = w.settlements[id]; if (to && to.alive && setTravel(w, c, to, kind === 2 ? 'trade' : 'pilgrim', kind === 3 ? to.id : undefined)) { charLog(w, c, kind === 2 ? `교역품을 싣고 ${to.name}(으)로 길을 나섰다.` : `${to.name}(으)로 순례를 떠났다.`, 2); return `${to.name}(으)로 길을 나섰다.`; } }
      return '사정이 바뀌어 이번에는 길을 나서지 않았다.';
    }
    case 'dark_ascend': {
      const r = attemptCoup(w, c);
      if (r === 'caught') { const t2 = playerCoupFailed(x); if (t2 === 'execute') { killChar(w, c, '반역죄로 처형', x.ld ?? undefined); return '반역은 실패하였다. 처형대가 기다리고 있었다.'; } return t2; }
      const f = w.factions[c.faction];
      if (!f || f.leader !== c.id) return '반역은 흐지부지되었다.';
      if (!rng.chance(clamp(0.35 + c.stats.magic / 200, 0.35, 0.85))) { c.stats.health = clamp(c.stats.health - 40); return '왕좌는 손에 넣었으나 피의 의식은 실패하였다. 마기가 몸을 할퀴었다.'; }
      becomeDemonLord(w, f);
      return '왕좌를 빼앗고 피의 의식을 치렀다. 하늘이 검게 물들었다.';
    }
    case 'trip_no': P.flags.tripNo = w.t; delete P.flags.tripT; if (c.act.kind === 'travel') { c.act = { kind: 'idle' }; if (x.home && x.home.alive) relocate(w, c, x.home); } return;
    case 'prison_cut': P.flags.prison = Math.max(w.t + 1, (P.flags.prison ?? w.t) - 12); return;
    case 'prison_out': {
      releasePrison(x);
      return '옥문을 나섰다.';
    }
    case 'prison_out_exile': {
      releasePrison(x);
      exileFrom(x, '스스로 떠남');
      return '아무에게도 알리지 않고 국경을 넘었다.';
    }
    case 'exile_go': case 'exile_wander': {
      const cur = c;
      const cands = w.settlements.filter(s => s.alive && s.faction !== (P.flags!.exiledFrom ?? -2) && s.l === cur.l && !s.flags.includes('sanctum')
        && RACES[s.race].align === RACES[c.race].align && approxDist(w, c, s) < 70 && !RACES[s.race].noPop)
        .sort((a, b) => approxDist(w, c, a) - (a.race === c.race ? 15 : 0) - (approxDist(w, c, b) - (b.race === c.race ? 15 : 0)));
      const to = cands[0];
      if (!to) return '받아 줄 곳이 없었다. 길 위가 집이 되었다.';
      if (fx === 'exile_wander') { c.home = to.id; c.faction = -1; relocate(w, c, to); return `${to.name}의 여관에 짐을 풀었다. 이제 어느 나라의 백성도 아니다.`; }
      c.home = to.id; c.faction = to.faction; relocate(w, c, to);
      charLog(w, c, `망명하여 ${w.factions[to.faction]?.name ?? to.name}에 몸을 의탁하였다.`, 3);
      return `${to.name}에 닿았다. ${w.factions[to.faction]?.name ?? ''}의 사람들은 망명자를 경계하면서도 받아 주었다.`;
    }
    case 'fallen_back': {
      const s = w.settlements[P.flags.perilSet ?? -1];
      if (s && s.alive) { c.home = s.id; c.faction = s.faction; relocate(w, c, s); return `이제 ${w.factions[s.faction]?.name ?? '새 나라'}의 백성이다.`; }
      return;
    }
    case 'captured': {
      // 붙잡혔다: 노예를 부리는 나라라면 사슬을, 아니라면 포로의 옥을
      const s = w.settlements[P.flags.perilSet ?? -1] ?? x.home;
      const captor = s ? w.factions[s.faction] : undefined;
      if (s && s.alive && captor && allowsSlavery(w, captor) && captor.race !== c.race) {
        enslaveChar(w, c, s);
        charLog(w, c, `${s.name}을(를) 차지한 ${captor.name}에게 붙잡혀 노예가 되었다.`, 4);
        return '쇠사슬이 발목에 채워졌다. 노예의 낙인이 찍혔다.';
      }
      if (s && s.alive && captor) {
        c.home = s.id; c.faction = captor.id; relocate(w, c, s);
        imprison(x, captor.leader, rng.int(6, 18), '전쟁 포로');
        return `${captor.name}의 옥에 포로로 갇혔다.`;
      }
      return;
    }
  }
  return null;
});

/** 옥에 가둔다 */
export function imprison(x: Ctx, by: number, months: number, why: string): void {
  const { w, c, P } = x;
  P.flags ??= {};
  for (const s of w.settlements) if (s.governor === c.id) s.governor = -1;
  c.officer = undefined;
  c.act = { kind: 'prison' };
  P.flags.prison = w.t + months;
  P.flags.prisonAt = w.t;
  P.flags.prisonBy = by;
  charLog(w, c, `${why}(으)로 옥에 갇혔다.`, 4);
}

function releasePrison(x: Ctx): void {
  const { c, P } = x;
  c.act = { kind: 'idle' };
  delete P.flags!.prison; delete P.flags!.prisonBy; delete P.flags!.prisonAt;
  delete P.flags!.guardFriend;
  charLog(x.w, c, '옥에서 풀려났다.', 3);
}

/** 나라 밖으로 쫓겨난다 */
export function exileFrom(x: Ctx, why: string): void {
  const { w, c, P } = x;
  P.flags ??= {};
  P.flags.exileHow = why === '탈옥' ? 1 : why === '스스로 떠남' ? 2 : 0;
  P.flags.exiledFrom = c.faction;
  for (const s of w.settlements) if (s.governor === c.id) s.governor = -1;
  c.faction = -1;
  P.flags.exiled = w.t;
  charLog(w, c, P.flags.exileHow === 1 ? '옥을 빠져나와 쫓기는 몸이 되었다.' : P.flags.exileHow === 2 ? '아무에게도 알리지 않고 나라를 떠났다.' : `${why} 나라 밖으로 쫓겨났다.`, 4);
}

/** 반역이 실패했다: 군주의 성정과 형편에 따라 처형, 옥살이, 추방 가운데 하나가 기다린다 */
export function playerCoupFailed(x: Ctx): string {
  const { w, c } = x;
  const rng = w.rngSim;
  const f = x.f;
  const ld = f ? leaderOf(w, f) : null;
  if (!f || !ld) return '반역은 흐지부지되었다.';
  addRel(w, ld, c, -60);
  // 다스리던 고을이 있다면: 성문을 걸어 잠그고 독립을 선언할 수도 있다
  const gov = w.settlements.find(s => s.alive && s.governor === c.id && s.faction === f.id && s.id !== f.capital);
  if (gov && f.settlements.length >= 2 && rng.chance(0.3)) {
    const nf = secede(w, c, gov);
    return `음모가 드러나자 ${gov.name}(으)로 달려가 성문을 걸어 잠갔다. ${nf.name}의 깃발이 올랐다. 이제 돌이킬 수 없다.`;
  }
  const cruel = ld.traits[COM] < 30;
  const r = rng.next();
  if (r < (cruel ? 0.22 : 0.08)) {
    // 처형대에 선다: 마지막 순간의 운
    if (rng.chance(0.35)) {
      exileFrom(x, '처형 직전에 사면되어');
      addNews(w, `${f.name}의 ${ld.name}이(가) 반역자 ${c.name}의 처형을 마지막 순간에 거두고 국외로 추방하였다.`, 3, 'politics', { facs: [f.id], chars: [c.id, ld.id] });
      return '처형대 위에서 목에 밧줄이 걸린 순간, 전령이 달려왔다. 사면이었다. 대신 다시는 이 나라 땅을 밟지 못한다.';
    }
    return 'execute';
  }
  if (r < 0.7) {
    const months = rng.int(24, 72) + (rel(ld, c.id) < -60 ? 24 : 0);
    imprison(x, ld.id, months, '반역죄');
    addNews(w, `${f.name}에서 반역을 꾀한 ${c.name}이(가) 붙잡혀 옥에 갇혔다.`, 2, 'politics', { facs: [f.id], chars: [c.id, ld.id] });
    return `붙잡혔다. ${ld.name}은(는) 목숨은 살려 두되 옥에 가두라 명하였다.`;
  }
  exileFrom(x, '반역죄로');
  addNews(w, `${f.name}의 ${ld.name}이(가) 반역을 꾀한 ${c.name}을(를) 국외로 추방하였다.`, 2, 'politics', { facs: [f.id], chars: [c.id, ld.id] });
  return `${ld.name}은(는) 피를 보는 대신 추방을 명하였다. 가진 것은 모두 빼앗겼다.`;
}

/** 길을 떠난 사이 고향이 함락되었다 (함락 처리에서 부른다) */
export function markFallenAway(x: { w: Ctx['w']; P: Ctx['P'] }, sid: number): void {
  x.P.flags ??= {};
  x.P.flags.peril_fallenAway = x.w.t;
  x.P.flags.perilSet = sid;
}

setCoupFail(playerCoupFailed);

void PRI; void SOC;
