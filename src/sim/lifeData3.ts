// 인생 이벤트 데이터 3: 권력자 · 마왕 · 용사 · 성역 수호자 · 용
import { charKnowsDL } from './crusade';
import type { LifeEv } from './life';
import { adult, all, any, byPlace, dl, dragon, factionOfRace, flag, guardian, hero, hi, lo, noflag, ruler, since, stat } from './life';
import { o } from './lifeData1';
import { RACES } from '../data/races';
import { approxDist, facRel } from './helpers';
import { ageOf } from './state';

const C0 = 0, AMB = 1, GRE = 2, COM = 3, LOY = 4, FAI = 5, CUR = 6, SOC = 7, PRU = 8, PRI = 9;

const gov = (x: Parameters<LifeEv['c']>[0]) => x.isGov && !x.isLeader;
const ancientAlive = (x: Parameters<LifeEv['c']>[0]) => x.w.chars.some(c => c.died < 0 && c.ancient);
const darkRuler = (x: Parameters<LifeEv['c']>[0]) => x.isLeader && !!x.f && RACES[x.f.race].align === 'dark';

export const POWER: LifeEv[] = [
  // ── 영주
  { id: 'p_gov_tax', t: '세금', cd: 48, c: gov, x: '영지의 곳간이 넉넉지 않다. 세금을 어떻게 할까?',
    o: [o('세금을 올린다', { r: '곳간이 찼다. 백성들의 원성도 찼다.', wealth: 60, honor: -10 }), o('세금을 줄인다', { r: '백성들이 당신을 칭송하였다.', honor: 15, wealth: -20 }), o('그대로 둔다', { r: '무난한 한 해였다.' })] },
  { id: 'p_gov_bridge', t: '다리 공사', cd: 96, c: gov, x: x => byPlace(x, { surface: '강을 건너는 다리를 놓자는 청원이 올라왔다.', under: '끊어진 갱도를 잇는 돌다리를 놓자는 청원이 올라왔다.', demon: '용암강을 건너는 흑요석 다리를 놓자는 청원이 올라왔다.', sky: '섬과 섬을 잇는 구름 다리를 놓자는 청원이 올라왔다.' }),
    o: [o('사재를 털어 짓는다', { r: '"영주님의 다리"라 불리게 되었다.', wealth: -60, fame: 15, honor: 10 }), o('나중에', { r: '청원은 서랍 속에 묻혔다.' })] },
  { id: 'p_gov_plague', t: '역병 봉쇄', cd: 96, c: all(gov, x => (x.home?.plague ?? 0) > 0), x: '영지에 역병이 돈다. 성문을 닫으면 안의 백성이 죽고, 열면 병이 퍼진다.',
    o: [o('성문을 닫는다', { r: '병은 퍼지지 않았다. 성 안은 지옥이었다.', honor: -10, tr: [[COM, -5]] }), o('치유사를 모은다', { r: '병세가 잦아들었다.', fx: 'cure_plague', wealth: -50 }, '', ['co', 0.4], { r: '치유사들도 쓰러졌다.', hp: -15 }), o('은폐한다', { r: '역병이 이웃으로 번져 갔다…', fx: 'plague_enemy', honor: -20 })] },
  { id: 'p_gov_rebel', t: '독립의 기회', once: true, c: all(gov, hi(AMB, 60), x => !!x.ld && (x.c.relations[x.ld.id] ?? 0) < 10), x: '영지의 기사들이 중앙에서 독립하자고 부추긴다.',
    o: [o('반기를 든다', { r: '반란의 깃발을 올렸다.', fx: 'coup' }), o('충성을 지킨다', { r: '기사들을 달래 돌려보냈다.', honor: 10, tr: [[LOY, 5]] })] },
  // ── 군주
  { id: 'p_ruler_heir', t: '후계자', cd: 120, c: all(ruler, x => x.c.children.some(id => x.w.chars[id]?.died < 0)), x: '신하들이 후계자를 정하라고 재촉한다.',
    o: [o('맏이를 세운다', { r: '전통을 따랐다.', honor: 5, tr: [[LOY, 3]] }), o('가장 뛰어난 자식을 고른다', { r: '맏이가 불만을 품었다.', co: 3 }), o('아직 이르다', { r: '궁정에 불안이 감돌았다.', honor: -5 })] },
  { id: 'p_ruler_feast', t: '대관 기념 축제', cd: 120, c: ruler, x: '즉위를 기념하는 축제를 열자는 건의가 올라왔다.',
    o: [o('성대하게 연다', { r: '백성들이 춤을 추었다.', wealth: -80, fame: 20 }), o('검소하게 넘긴다', { r: '곳간을 아꼈다.', honor: 5 })] },
  { id: 'p_ruler_conquest', t: '정복의 꿈', cd: 72, c: all(ruler, hi(AMB, 55)),
    data: x => {
      if (!x.f) return null;
      const e = x.w.factions.filter(f => f.alive && f !== x.f && !x.f!.wars[f.id] && f.settlements.length).sort((a, b) => facRel(x.f!, a.id) - facRel(x.f!, b.id))[0];
      return e ? { eId: e.id, e: e.name } : null;
    },
    x: '{e}의 땅이 탐난다. 장군들이 출정 명령을 기다린다.',
    o: [o('{e}에 선전포고', { r: '전쟁의 북이 울렸다.', fx: 'war', fame: 10 }), o('때를 기다린다', { r: '칼을 칼집에 넣었다.', tr: [[PRU, 3]] })] },
  { id: 'p_ruler_abyss', t: '금지된 심연', cd: 240, c: all(ruler, x => (x.f?.tier ?? 0) >= 1, any(hi(GRE, 60), hi(AMB, 70))),
    x: '왕국 깊은 곳에 선왕들이 봉인한 심연이 있다. 그 아래엔 옛 왕들의 보물과… 무언가 잠들어 있다고 전해진다.',
    o: [o('봉인을 풀고 발굴한다', { r: '광부들이 심연을 파 내려갔다.', fx: 'wake_ancient', wealth: 200 }, '고대 용을 깨울 수 있다', ['luck', 0.45], { ach: 'abyssgold', r: '산더미 같은 보물이 나왔다! 아래의 그것은 깨지 않았다.', wealth: 500, fame: 20 }),
      o('봉인을 강화한다', { r: '선왕들의 뜻을 따랐다.', honor: 10 })] },
  { id: 'p_ruler_forbidden', t: '금지된 마법', cd: 240, c: all(ruler, x => (x.f?.tier ?? 0) >= 1, hi(AMB, 60)),
    x: '궁정 마법사가 마계의 힘을 끌어오면 적을 모조리 쓸어버릴 수 있다고 속삭인다.',
    o: [o('의식을 허락한다', { r: '하늘이 찢어졌다.', fx: 'open_rift', co: 5 }, '차원의 균열이 열릴 수 있다', ['luck', 0.5], { r: '의식은 실패하였다. 마법사는 재가 되었다.', honor: -5 }),
      o('마법사를 추방한다', { r: '궁정이 조용해졌다.', honor: 10 })] },
  { id: 'p_ruler_tree', t: '세계수의 심재', once: true, c: all(ruler, x => !!x.w.worldTree?.alive && x.w.settlements[x.w.worldTree.sid]?.faction === x.c.faction, hi(GRE, 50)),
    x: '영토 안의 세계수. 그 심재 하나면 왕국이 백 년은 부유할 것이다. 하지만 봉인이 무너질 것이다.',
    o: [o('벌목을 명한다', { r: '도끼 소리가 숲을 울렸다.', fx: 'fell_tree', honor: -30 }, '세계수가 쓰러진다'), o('세계수를 지킨다', { r: '숲의 정령들이 고개를 숙였다.', honor: 20, ma: 5 })] },
  { id: 'p_ruler_dragon', t: '수호룡의 보물', once: true, c: all(ruler, x => !!x.f?.flags.some(f2 => f2.startsWith('patron:')), hi(GRE, 55)),
    x: '나라를 지키는 수호룡의 둥지에 보물이 산처럼 쌓여 있다고 한다. 지금 용은 잠들어 있다.',
    o: [o('잠든 용을 습격한다', { r: '배신의 칼날이 용을 향하였다.', fx: 'slay_patron' }, '용의 원한이 쌓인다'), o('공물을 늘린다', { r: '용이 흡족해하였다.', wealth: -50, honor: 10 })] },
  { id: 'p_ruler_reform', t: '개혁', cd: 120, c: ruler, x: '젊은 학자들이 낡은 법을 고치자고 상소를 올렸다.',
    o: [o('개혁을 단행한다', { r: '귀족들이 반발했지만 나라는 활기를 띠었다.', fame: 15, in: 3 }, '', ['co', 0.45], { r: '귀족들의 반란이 일어날 뻔하였다.', honor: -15 }), o('전통을 지킨다', { r: '귀족들이 안도하였다.', tr: [[LOY, 3]] })] },
  { id: 'p_dark_ritual', t: '강림의 제단', cd: 120, c: all(darkRuler, x => x.w.demonLord < 0, any(hi(AMB, 60), x => x.c.apt[2] >= 50)),
    x: '마도사들이 마왕 강림의 제단을 준비하였다. 의식을 치르면 마왕으로 거듭날 수 있다고 한다. 실패하면 목숨을 잃을 것이다.',
    o: [o('의식을 치른다', { r: '피의 의식이 시작되었다.', fx: 'become_dl' }, '마왕 강림', ['ma', 0.35], { r: '의식은 실패하였다. 마기가 몸을 할퀴었다.', hp: -40 }), o('아직은 때가 아니다', { r: '제단의 불을 껐다.' })] },
  // ── 마왕
  { id: 'p_dl_tree', t: '세계수 소각 원정', cd: 72, c: all(dl, x => !!x.w.worldTree?.alive),
    x: '세계수가 살아 있는 한 빛의 종족은 꺾이지 않는다. 장군들이 원정을 청한다.',
    o: [o('세계수를 불태우러 출정한다', { r: '마왕군이 진군을 시작하였다.', fx: 'burn_tree', fame: 20 }, '세계수가 위험해진다'), o('지금은 내실을 다진다', { r: '마왕성이 더욱 견고해졌다.', co: 3 })] },
  { id: 'p_dl_sanctum', t: '하늘을 향한 진군', cd: 120, c: all(dl, x => x.w.settlements.some(s => s.alive && s.flags.includes('sanctum'))),
    x: '천상의 성역. 그곳을 짓밟으면 하늘조차 마왕의 것이 된다.',
    o: [o('천상으로 진군한다', { r: '마왕의 군세가 하늘의 계단을 오른다.', fx: 'sanctum_march', fame: 30 }, '천상 성역 침공'), o('하늘은 아직 멀다', { r: '마왕은 하늘을 노려보기만 하였다.' })] },
  { id: 'p_dl_rift', t: '균열 확장 의식', cd: 72, c: dl, x: '마계와 이 세계를 잇는 문을 더 열면 마계의 군세가 쏟아져 들어올 것이다.',
    o: [o('문을 연다', { r: '대지가 갈라졌다.', fx: 'open_rift' }, '차원문 대개방', ['ma', 0.6], { r: '의식이 흐트러졌다.', hp: -10 }), o('지금 있는 문으로 충분하다', { r: '마계의 군주들이 투덜거렸다.' })] },
  { id: 'p_dl_plague', t: '역병의 저주', cd: 96, c: dl, x: '사령술사들이 적국에 역병의 저주를 내리자고 한다.',
    o: [o('저주를 내린다', { r: '적국의 우물이 검게 물들었다.', fx: 'plague_enemy', honor: -20 }, '대역병이 번질 수 있다'), o('정정당당히 싸운다', { r: '마왕의 기묘한 자존심이었다.', tr: [[PRI, 5]] })] },
  { id: 'p_dl_dragon', t: '고대 용의 각성', cd: 240, c: all(dl, x => !ancientAlive(x)), x: '땅속 깊이 잠든 고대 용을 깨워 세상을 불태우게 할 수 있다.',
    o: [o('고대 용을 깨운다', { r: '마왕의 주문이 대지 아래로 스며들었다.', fx: 'wake_ancient' }, '고대 용의 분노', ['ma', 0.4], { r: '용은 깨어나지 않았다.' }), o('통제할 수 없는 힘은 쓰지 않는다', { r: '현명한 판단이었다.' })] },
  { id: 'p_dl_lonely', t: '왕좌의 고독', once: true, c: dl, x: '마왕성의 왕좌는 차갑다. 아무도 진심으로 웃지 않는다.',
    o: [o('더 강해진다', { r: '고독을 힘으로 바꾸었다.', mi: 5, ma: 5 }), o('어린 시절을 떠올린다', { ach: 'dltears', r: '오래전, 따뜻한 손이 있었다.', tr: [[COM, 10]] })] },
  // ── 용사
  { id: 'p_hero_party', t: '동료 모집', once: true, c: hero, x: '마왕을 쓰러뜨리려면 동료가 필요하다.',
    o: [o('마법사를 찾는다', { r: '괴짜 마법사가 합류하였다.', ma: 5 }), o('성직자를 찾는다', { r: '상냥한 성직자가 합류하였다.', hp: 20 }), o('혼자 간다', { r: '외로운 길을 택하였다.', mi: 5, tr: [[SOC, -5]] })] },
  { id: 'p_hero_training', t: '전설의 스승', once: true, c: hero, x: '산속에 은거한 검성이 있다고 한다.',
    o: [o('찾아가 배운다', { r: '검의 극의를 엿보았다.', mi: 12 }, '', ['t0', 0.5], { r: '검성은 문을 열지 않았다.' }), o('실전이 스승이다', { r: '다시 길을 나섰다.', mi: 3 })] },
  { id: 'p_hero_doubt', t: '용사의 고뇌', cd: 120, c: all(hero, factionOfRace('majin', 'demon')), x: '마족 아이를 베려는 순간 손이 멈췄다. 정말 그들은 모두 악인가?',
    o: [o('아이를 살려 준다', { ach: 'mercy', r: '마족 아이가 울며 달아났다.', tr: [[COM, 8]], honor: 5 }), o('사명을 따른다', { r: '검은 무거웠다.', tr: [[COM, -5]], mi: 2 })] },
  { id: 'p_hero_dl', t: '결전의 날', cd: 36, c: all(hero, x => x.w.demonLord >= 0 && x.w.demonLord !== x.c.id && charKnowsDL(x.w, x.c), x => x.c.act.kind === 'idle'),
    x: '마왕의 군세가 세상을 짓밟고 있다. 성검이 울고 있다.',
    o: [o('마왕성으로 출정한다', { r: '결전을 향해 떠났다.', fx: 'duel_dl' }, '생사를 건 결투'), o('더 강해진 뒤에', { r: '혹독한 수련을 하였다.', mi: 4, ma: 4 })] },
  { id: 'p_hero_ancient', t: '고대 용 토벌', cd: 60, c: all(hero, ancientAlive), x: '고대 용이 하늘을 지배하고 있다. 누군가 맞서야 한다.',
    o: [o('맞서 싸운다', { r: '고대 용 앞에 섰다.', fx: 'slay_ancient' }, '패하면 목숨을 잃는다'), o('대화를 시도한다', { r: '용의 분노가 조금 누그러졌다.', fx: 'calm_ancient' }, '', ['ch', 0.15], { r: '용은 불길로 답하였다.', hp: -40 })] },
];

export const GUARDIAN: LifeEv[] = [
  { id: 'g_awaken', t: '성역의 수호자', once: true, w: 60, c: guardian, x: '빛이 당신을 깨웠다. 당신은 성역을 지키고 세상의 재앙을 막도록 빚어진 존재다. 무엇을 먼저 할까?',
    o: [o('세상을 내려다본다', { r: '일곱 봉인의 떨림이 느껴졌다.', ma: 5 }), o('천군과 함께 훈련한다', { r: '천군의 신뢰를 얻었다.', co: 6 })] },
  // 고대 용: 준비 → 대면
  { id: 'g_dragon_prep', t: '용의 분노', cd: 24, c: all(guardian, ancientAlive, noflag('gDragon')), x: '고대 용이 세상을 불태우고 있다. 천군을 소집할까?',
    o: [o('천군을 소집한다', { r: '천군이 모이기 시작하였다. 몇 달이면 출정할 수 있다.', flag: 'gDragon', co: 3 }), o('아직은 지켜본다', { r: '용의 불길이 지평선을 붉게 물들였다.' })] },
  { id: 'g_dragon_face', t: '고대 용과의 대면', cd: 6, w: 40, c: all(guardian, ancientAlive, since('gDragon', 4)), x: '천군을 이끌고 고대 용 앞에 섰다. 산만 한 몸이 꿈틀거리고, 눈동자에 원한이 이글거린다.',
    o: [o('천군으로 포위해 제압한다', { r: '천군의 창이 용을 겹겹이 에워쌌다. 마침내 용이 무릎을 꿇었다.', fx: 'calm_ancient', unflag: 'gDragon', fame: 30 }, '', ['co', 0.4], { r: '천군이 불길에 휩쓸렸다. 물러나 다시 준비해야 한다.', hp: -35, unflag: 'gDragon' }),
      o('일대일로 맞선다', { r: '고대 용과 맞붙었다.', fx: 'slay_ancient', unflag: 'gDragon' }, '패하면 목숨을 잃는다'),
      o('원한을 달래는 노래를 부른다', { r: '용의 눈에서 분노가 사그라들었다.', fx: 'calm_ancient', unflag: 'gDragon' }, '', ['ch', 0.35], { r: '노래는 포효에 묻혔다.', hp: -20 }),
      o('봉인 마법을 펼친다', { r: '빛의 사슬이 용을 감쌌다. 용은 다시 잠들었다.', fx: 'calm_ancient', unflag: 'gDragon', ma: 3 }, '', ['ma', 0.35], { r: '사슬이 끊어졌다.', hp: -25 })] },
  // 마왕: 준비 → 진격
  { id: 'g_dl_prep', t: '마왕 토벌 준비', cd: 24, c: all(guardian, x => x.w.demonLord >= 0, noflag('gDl')), x: '마왕이 세상을 위협한다. 천군과 함께 마왕성을 칠 준비를 할까?',
    o: [o('성검을 벼리고 천군을 모은다', { r: '출정 준비가 시작되었다.', flag: 'gDl', mi: 4 }), o('용사가 나서길 기다린다', { r: '하늘에서 지켜보았다.' })] },
  { id: 'g_dl_march', t: '마왕성 진격', cd: 6, w: 40, c: all(guardian, x => x.w.demonLord >= 0, since('gDl', 6)), x: '준비가 끝났다. 천군의 나팔이 울린다.',
    o: [o('천군과 함께 진격한다', { r: '천군이 하늘에서 내려왔다.', fx: 'host_march', unflag: 'gDl' }, '마왕과의 결전'), o('홀로 잠입한다', { r: '그림자처럼 마왕성으로 향하였다.', fx: 'duel_dl', unflag: 'gDl' })] },
  { id: 'g_hero_appoint', t: '용사 지명', cd: 60, c: all(guardian, x => !x.w.chars.some(c => c.died < 0 && c.awakened.includes('hero'))),
    data: x => {
      const cs = x.w.chars.filter(c => c.died < 0 && c.race !== 'dragon' && c.race !== 'angel' && RACES[c.race].align !== 'dark' && ageOf(x.w, c) >= 15 && !c.awakened.includes('hero'));
      if (!cs.length) return null;
      cs.sort((a, b) => b.apt[1] + b.stats.might * 0.3 - a.apt[1] - a.stats.might * 0.3);
      if (cs.length < 3) return null;
      return { oId: cs[0].id, pId: cs[1].id, qId: cs[2].id };
    },
    x: '세상에 용사가 없다. 지상의 인물 하나에게 빛을 나누어 줄 수 있다.',
    o: [o('{o}을(를) 지명한다', { r: '{o}에게 빛이 깃들었다.', fx: 'appoint_hero' }), o('{p}을(를) 지명한다', { r: '{p}에게 빛이 깃들었다.', fx: 'appoint_hero2' }), o('{q}을(를) 지명한다', { r: '{q}에게 빛이 깃들었다.', fx: 'appoint_hero3' }), o('아직은 아니다', { r: '빛을 거두었다.' })] },
  { id: 'g_tree', t: '세계수 창조', cd: 60, c: all(guardian, x => !x.w.worldTree || !x.w.worldTree.alive),
    data: x => {
      const ss = x.w.settlements.filter(s => s.alive && s.l === 2 && RACES[x.w.factions[s.faction]?.race ?? 'orc'].align !== 'dark')
        .sort((a, b) => (b.race === 'elf' ? 1000 : 0) + b.dev - ((a.race === 'elf' ? 1000 : 0) + a.dev));
      if (!ss.length) return null;
      return { sId: ss[0].id };
    },
    x: '세계수가 없다. 자신의 생명을 나누어 {s}의 늙은 나무 한 그루를 세계수로 깨울 수 있다. 수명이 깎일 것이다.',
    o: [o('생명을 나눈다', { r: '고목에 빛이 스며들었다. 새 세계수가 자라기 시작하였다.', fx: 'make_tree', hp: -20 }, '수명 -60년'), o('아직은 아니다', { r: '숲은 기다려 줄 것이다.' })] },
  { id: 'g_plague', t: '역병 정화', cd: 36, c: all(guardian, x => x.w.settlements.some(s => s.alive && s.plague > 0)), x: '대지에 역병이 번진다. 정화의 순례를 떠날까?',
    o: [o('순례를 떠난다', { r: '정화의 빛이 마을들을 휩쓸었다.', fx: 'cure_plague', hp: -15 }, '', ['ma', 0.6], { r: '힘이 부족하였다.', hp: -25 }), o('기도만 올린다', { r: '기도는 하늘에 닿았을까.' })] },
  { id: 'g_rift', t: '균열 봉인', cd: 36, c: all(guardian, x => x.w.portals.some(p => p.kind === 'rift' && p.open)), x: '마계로 통하는 균열이 열려 있다. 봉인할까?',
    o: [o('봉인 의식을 펼친다', { r: '빛의 문장이 균열을 덮었다.', fx: 'seal_rift', hp: -10 }, '', ['ma', 0.5], { r: '마계의 바람이 당신을 밀어냈다.', hp: -20 }), o('지금은 둔다', { r: '균열은 계속 울고 있다.' })] },
];

export const DRAGON: LifeEv[] = [
  { id: 'd_hatch', t: '둥지를 떠나다', once: true, w: 60, c: dragon, x: '알에서 깨어난 지 백 년. 마침내 날개가 하늘을 품을 만큼 자랐다. 첫 비행은 어디로?',
    o: [o('지상의 도시를 구경한다', { r: '작은 존재들이 바글바글하였다. 흥미롭다.', tr: [[CUR, 8]] }), o('하늘섬 끝까지 난다', { r: '구름 위의 세상은 넓었다.', mi: 5 }), o('보물을 찾는다', { r: '첫 보물 더미를 모았다.', wealth: 100, tr: [[GRE, 6]] })] },
  { id: 'd_human_form', t: '인간의 모습', once: true, c: dragon, x: '인간의 모습으로 둔갑해 지상의 마을에 내려가 볼까?',
    o: [o('시장을 거닌다', { r: '사과라는 것을 처음 먹어 보았다. 맛있다.', mood: 15, ch: 3 }), o('주점에서 노래를 듣는다', { r: '용에 대한 노래가 있었다. 대부분 틀렸다.', fame: 5, tr: [[SOC, 6]] }), o('대장간에서 보물을 산다', { r: '반짝이는 칼을 샀다. 상인이 기절할 만큼 금화를 냈다.', wealth: -40, item: '인간의 칼' })] },
  { id: 'd_offer', t: '공물의 제안', cd: 60, c: all(dragon, x => x.c.dragonKind !== 'patron'),
    data: x => {
      const fs = x.w.factions.filter(f => f.alive && f.settlements.length && approxDist(x.w, x.c, x.w.settlements[f.capital] ?? x.c) < 60);
      if (!fs.length) return null;
      const f = x.w.rngSim.pick(fs);
      return { fId: f.id, fn: f.name };
    },
    x: '{fn}의 사절이 금은보화를 바치며 수호룡이 되어 달라고 청한다.',
    o: [o('수호룡이 된다', { r: '{fn}의 수호룡이 되었다. 매달 공물이 들어온다.', fx: 'patron' }), o('보물만 받고 쫓아낸다', { r: '사절은 울며 돌아갔다.', wealth: 60, honor: -10 }), o('정중히 거절한다', { r: '용은 누구의 것도 아니다.', tr: [[PRI, 5]] })] },
  { id: 'd_raid', t: '배고픈 날개', cd: 48, c: all(dragon, x => x.c.dragonKind !== 'patron'),
    data: x => {
      const ss = x.w.settlements.filter(s => s.alive && s.pop > 60 && approxDist(x.w, x.c, s) < 45);
      if (!ss.length) return null;
      const s = x.w.rngSim.weighted(ss, t => t.stock[5] + 10)!;
      return { sId: s.id };
    },
    x: '{s}에서 금 냄새가 난다. 배가 고프다.',
    o: [o('{s}을(를) 습격한다', { r: '불길이 하늘을 덮었다.', fx: 'dragon_raid', fame: 10 }), o('사슴 몇 마리로 참는다', { r: '조용한 식사였다.', hp: 5 })] },
  { id: 'd_challenger', t: '도전자', cd: 60, c: dragon,
    data: x => {
      const cs = x.w.chars.filter(c => c.died < 0 && c.race !== 'dragon' && c.stats.might > 50 && approxDist(x.w, x.c, c, true) < 50);
      if (!cs.length) return null;
      return { oId: x.w.rngSim.pick(cs).id };
    },
    x: '{o}이(가) 검을 들고 둥지 앞에 섰다. "용이여, 나와 싸워라!"',
    o: [o('상대해 준다', { r: '짧은 싸움이었다.', fx: 'duel' }), o('질문 세 개를 낸다', { r: '{o}은(는) 수수께끼를 풀지 못하고 돌아갔다.', in: 3, fame: 5 }), o('하품을 하고 다시 잔다', { r: '{o}은(는) 머쓱하게 돌아갔다.' })] },
  { id: 'd_rival', t: '영역 다툼', cd: 120, c: all(dragon, x => x.w.chars.some(c => c.died < 0 && c.race === 'dragon' && c.id !== x.c.id && approxDist(x.w, x.c, c, true) < 40)), x: '다른 용이 당신의 하늘을 침범하였다.',
    o: [o('공중전을 벌인다', { r: '침입자를 몰아냈다.', fame: 15, mi: 3 }, '', ['mi', 0.5], { r: '비늘이 찢겼다.', hp: -30 }), o('하늘을 나눈다', { r: '두 용은 서로의 하늘을 인정하였다.', tr: [[PRU, 5]] })] },
  { id: 'd_kobold', t: '코볼트의 숭배', once: true, c: all(dragon, factionOfRace('kobold')), x: '코볼트 무리가 둥지 앞에 엎드려 당신을 신으로 모시겠다고 한다.',
    o: [o('받아들인다', { r: '작은 신도들이 생겼다. 시끄럽지만 귀엽다.', fame: 10, wealth: 30 }), o('쫓아낸다', { r: '코볼트들이 울며 흩어졌다.' })] },
  { id: 'd_egg', t: '알', once: true, c: all(dragon, x => ageOf(x.w, x.c) >= 150), x: '둥지에 알 하나가 놓였다. 당신의 핏줄이다.',
    o: [o('품어 부화시킨다', { r: '새 생명이 깨어났다.', fx: 'egg', mood: 20 }), o('하늘에 맡긴다', { r: '알은 바람과 함께 사라졌다.' })] },
  { id: 'd_sleep', t: '긴 잠', cd: 120, c: dragon, x: '나른하다. 한 오십 년쯤 자면 좋겠다.',
    o: [o('잔다', { r: '보물 위에서 깊은 잠에 들었다.', fx: 'sleep', hp: 30 }), o('아직 세상이 궁금하다', { r: '눈을 비비고 일어났다.' })] },
  { id: 'd_hoard', t: '보물 세기', cd: 60, c: dragon, x: '보물 더미 위에 누워 금화를 세어 본다. 하나, 둘… 어라, 하나가 모자란다?',
    o: [o('범인을 찾아 나선다', { r: '코볼트 한 마리가 금화를 물고 있었다. 용서해 주었다.', tr: [[COM, 4]] }), o('처음부터 다시 센다', { r: '세다가 잠들었다.', hp: 5 }), o('주변 마을을 의심한다', { r: '분노가 끓어올랐다.', tr: [[COM, -5]], mi: 2 })] },
  { id: 'd_patron_war', t: '수호의 의무', cd: 48, c: all(dragon, x => x.c.dragonKind === 'patron' && !!x.w.factions[x.c.patronOf ?? -1] && Object.keys(x.w.factions[x.c.patronOf!].wars).length > 0),
    data: x => {
      const f = x.w.factions[x.c.patronOf!];
      const ss = x.w.settlements.filter(s => s.alive && f.wars[s.faction] !== undefined && approxDist(x.w, x.c, s) < 60);
      return ss.length ? { sId: x.w.rngSim.pick(ss).id } : null;
    },
    x: '당신이 지키는 세력이 전쟁 중이다. 적의 도시 {s}이(가) 보인다.',
    o: [o('{s}을(를) 불태운다', { r: '적의 성벽이 녹아내렸다.', fx: 'dragon_raid', fame: 15 }), o('전쟁은 인간들의 일이다', { r: '둥지에서 지켜보았다.', honor: -5 })] },
  { id: 'd_tribute_late', t: '밀린 공물', cd: 24, c: all(dragon, x => x.c.dragonKind === 'patron' && (x.c.tributeMiss ?? 0) >= 6), x: '공물이 몇 달째 밀렸다. 사절은 고개를 조아리며 사정을 봐 달라고 한다.',
    o: [o('너그럽게 기다려 준다', { r: '사절이 눈물을 흘리며 감사하였다.', honor: 10, tr: [[COM, 5]] }), o('경고의 불길을 뿜는다', { r: '그날 밤 공물이 산처럼 쌓였다.', wealth: 40, tr: [[COM, -4]] })] },
  { id: 'd_ancient_call', t: '고대의 부름', once: true, c: all(dragon, x => x.w.chars.some(c => c.died < 0 && c.ancient)), x: '깨어난 고대 용이 모든 용을 부른다. "인간들에게 복수하자."',
    o: [o('부름에 응한다', { r: '고대 용 곁에서 하늘을 불태웠다.', fame: 20, tr: [[COM, -10]] }), o('거절한다', { r: '고대 용이 당신을 오래 노려보았다.', honor: 15, tr: [[COM, 5]] })] },
  { id: 'd_storm', t: '폭풍의 마나', cd: 96, c: dragon, x: '하늘 저편 폭풍 지대에 마나가 소용돌이친다.',
    o: [o('폭풍 속으로 뛰어든다', { r: '번개를 삼켰다. 몸 안에 힘이 넘친다.', ma: 8 }, '', ['mi', 0.6], { r: '번개에 날개가 그을렸다.', hp: -25 }), o('멀리서 바라본다', { r: '아름다운 광경이었다.', mood: 5 })] },
  { id: 'd_scale', t: '비늘 한 장', once: true, c: dragon, x: '은혜를 입은 젊은 기사가 찾아와 비늘 한 장만 달라고 한다. 사랑하는 이를 지킬 방패를 만들겠다고.',
    o: [o('비늘을 뽑아 준다', { r: '기사는 그 방패로 많은 이를 지켰다.', honor: 15, hp: -5 }), o('무엄하다!', { r: '기사는 혼비백산 달아났다.', tr: [[PRI, 4]] })] },
  { id: 'd_friend', t: '인간 친구', once: true, c: dragon, x: '길 잃은 인간 아이가 둥지에 들어와 겁도 없이 당신의 코를 쓰다듬는다.',
    o: [o('아이를 집에 데려다준다', { ach: 'dragonfriend', r: '아이는 평생 용 이야기를 하며 살았다.', honor: 20, tr: [[COM, 10]] }), o('겁을 준다', { r: '아이가 울며 도망쳤다. 조금 미안하다.' })] },
];

export { C0, AMB, GRE, COM, LOY, FAI, CUR, SOC, PRU, PRI, adult, all, flag, lo, stat };
