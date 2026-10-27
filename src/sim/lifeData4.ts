// 인생 이벤트 데이터 4: 역작 · 명성 · 명품의 운명 · 영주가 되는 길 · 새 직업 · 수호자
import { RACES } from '../data/races';
import type { LifeEv, Check, Opt, Ctx, Eff } from './life';
import { adult, all, byPlace, flag, guardian, hi, job, lo, noflag, ruler, since, stat, yearsInJob } from './life';
import { o } from './lifeData1';
import type { Role } from '../data/traits';
import { artLabel, artNameOptions, setUsedNames, type ArtKind } from './artifacts';
import { approxDist, leaderOf } from './helpers';
import { ageOf } from './state';

const C0 = 0, AMB = 1, GRE = 2, COM = 3, LOY = 4, FAI = 5, CUR = 6, SOC = 7, PRU = 8, PRI = 9;

// ───────────── 평생의 역작: 이름을 지어 세상에 남긴다
interface Work { job: Role; kind: ArtKind; stat: Check; tangible: boolean; title: string; text: string; fail: string }
const WORKS: Work[] = [
  { job: '대장장이', kind: '검', stat: 'mi', tangible: true, title: '평생의 역작', text: '수십 년 망치를 휘둘러 온 손이 오늘따라 가볍다. 지금이라면 전설이 될 검을 벼릴 수 있을 것 같다. 이 검의 이름은…', fail: '쇠가 마지막 담금질에서 갈라졌다. 다시 처음부터다.' },
  { job: '장인', kind: '왕관', stat: 'in', tangible: true, title: '왕을 위한 왕관', text: '왕궁에서 새 왕관을 의뢰해 왔다. 평생의 기술을 쏟아부을 때다. 이 왕관의 이름은…', fail: '보석 하나가 맞지 않았다. 왕궁은 다른 장인을 찾았다.' },
  { job: '음유시인', kind: '노래', stat: 'ch', tangible: false, title: '세상에 남길 노래', text: '평생 떠돌며 들은 이야기들이 하나의 노래로 모인다. 이 노래의 제목은…', fail: '노래는 끝내 완성되지 않았다. 마지막 소절이 떠오르지 않는다.' },
  { job: '학자', kind: '책', stat: 'in', tangible: true, title: '필생의 저서', text: '평생의 연구를 한 권의 책으로 엮을 때가 왔다. 책의 제목은…', fail: '원고가 불타 버렸다. 사본은 없다.' },
  { job: '마법사', kind: '지팡이', stat: 'ma', tangible: true, title: '대마법사의 지팡이', text: '천 년 묵은 고목의 가지와 별의 수정으로 지팡이를 만들 재료가 모였다. 지팡이의 이름은…', fail: '마나가 폭주해 재료가 재가 되었다.' },
  { job: '연금술사', kind: '물약', stat: 'in', tangible: true, title: '궁극의 물약', text: '수천 번의 실패 끝에 완벽한 배합을 찾아냈다. 이 물약의 이름은…', fail: '마지막 순간 플라스크가 깨졌다.' },
  { job: '사냥꾼', kind: '활', stat: 'mi', tangible: true, title: '명궁의 활', text: '평생 쏜 화살의 감각을 모두 담은 활을 깎는다. 이 활의 이름은…', fail: '나무가 휘어 버렸다. 좋은 나무를 다시 찾아야 한다.' },
  { job: '선원', kind: '지도', stat: 'in', tangible: true, title: '바다의 지도', text: '평생 누빈 바다를 한 장의 지도에 담는다. 이 지도의 이름은…', fail: '지도를 실은 배가 가라앉았다.' },
  { job: '성직자', kind: '찬가', stat: 't5', tangible: false, title: '신께 바치는 찬가', text: '기도 속에서 선율이 내려왔다. 이 찬가의 이름은…', fail: '선율은 꿈과 함께 사라졌다.' },
  { job: '농부', kind: '술', stat: 'in', tangible: false, title: '마을의 술', text: '평생 가꾼 곡식으로 빚은 술이 기가 막히게 익었다. 이 술의 이름은…', fail: '술이 시어 버렸다.' },
  { job: '드루이드', kind: '지팡이', stat: 'ma', tangible: true, title: '숲의 지팡이', text: '천 년 묵은 나무가 가지 하나를 내주었다. 이 지팡이의 이름은…', fail: '나무는 마음을 바꾸었다.' },
  { job: '주술사', kind: '지팡이', stat: 'ma', tangible: true, title: '조상의 지팡이', text: '조상의 뼈와 깃털로 주술 지팡이를 엮는다. 이 지팡이의 이름은…', fail: '조상들이 응답하지 않았다.' },
  { job: '광부', kind: '보석', stat: 'mi', tangible: true, title: '심연의 보석', text: '평생 판 갱도 끝에서 주먹만 한 원석을 캐냈다. 갈고 다듬으면 전설이 될 것이다. 이 보석의 이름은…', fail: '연마하다 원석이 쪼개졌다.' },
  { job: '치유사', kind: '물약', stat: 'in', tangible: true, title: '만병통치약', text: '평생 모은 처방을 하나로 합쳤다. 이 약의 이름은…', fail: '약효가 나오지 않았다.' },
  { job: '함정꾼', kind: '태엽 장치', stat: 'in', tangible: true, title: '함정의 걸작', text: '누구도 빠져나갈 수 없는 정교한 장치를 설계하였다. 이 장치의 이름은…', fail: '시험 중에 장치에 손가락이 끼었다.' },
  { job: '기사', kind: '방패', stat: 'mi', tangible: true, title: '가문의 방패', text: '수많은 전장을 함께한 방패에 문장을 새긴다. 방패의 이름은…', fail: '방패가 마지막 전투에서 쪼개졌다.' },
];

function workEvent(wk: Work): LifeEv {
  return {
    id: 'w_' + wk.job, t: wk.title, cd: 180, w: 2,
    c: all(adult, job(wk.job), yearsInJob(4), x => stat2(x, wk.stat) >= 50),
    data: x => {
      setUsedNames(x.w);
      const names = artNameOptions(x.w.rngSim, wk.kind, x.c);
      while (names.length < 3) names.push(names[0] ?? '무명');
      return { kind: wk.kind, stat: wk.stat, tangible: wk.tangible ? 1 : 0, a0: names[0], a1: names[1], a2: names[2] };
    },
    x: wk.text,
    o: [0, 1, 2].map(i => o(`「{a${i}}」`, { r: '완성되었다!', fx: 'make_art' + i, fame: 10 }, '실력 판정', [wk.stat, 0.35], { r: wk.fail, mood: -10 }) as Opt)
      .concat([o('아직 때가 아니다', { r: '조금 더 갈고닦기로 하였다.', [statKey(wk.stat)]: 2 } as Eff)]),
  };
}
function stat2(x: Ctx, k: Check): number {
  const s = x.c.stats;
  return k === 'mi' ? s.might : k === 'in' ? s.intellect : k === 'ma' ? s.magic : k === 'ch' ? s.charisma : k === 'co' ? s.command : k[0] === 't' ? x.c.traits[+k.slice(1)] : 50;
}
function statKey(k: Check): string { return k === 'mi' ? 'mi' : k === 'in' ? 'in' : k === 'ma' ? 'ma' : k === 'ch' ? 'ch' : 'co'; }

export const WORKS_EV: LifeEv[] = WORKS.map(workEvent);

// ───────────── 이름을 떨치다 (만들지 않는 직업들)
export const RENOWN: LifeEv[] = [
  { id: 'n_knight_feat', t: '전장의 이름', cd: 120, c: all(job('기사', '전사'), atWar, stat('might', 55)), x: '전장 한복판, 적의 깃발이 눈앞에 있다. 저것을 꺾으면 이름이 남는다.',
    o: [o('깃발을 향해 돌격한다', { r: '적의 깃발을 꺾었다! 사람들은 당신을 "깃발꺾기"라 불렀다.', ep: '깃발꺾기', fame: 30, honor: 15 }, '', ['mi', 0.35], { r: '창에 찔려 쓰러졌다.', hp: -45 }), o('동료를 지킨다', { r: '수많은 동료가 살아 돌아갔다.', honor: 20, co: 4 })] },
  { id: 'n_thief_legend', t: '전설의 도둑', once: true, c: all(job('도적', '암살자'), yearsInJob(4), stat('intellect', 50)), x: '도둑들 사이에서 당신의 별명을 짓자는 이야기가 오간다. 마지막으로 큰 일 하나만 해내면 된다. 왕궁의 보물고다.',
    o: [o('왕궁에 잠입한다', { r: '왕관의 보석 하나를 빼 오고 그 자리에 장미를 꽂아 두었다. 사람들은 당신을 "장미 도둑"이라 불렀다.', ep: '장미 도둑', fame: 40, wealth: 200 }, '', ['in', 0.3], { r: '근위대에 쫓겨 도망쳤다.', hp: -25, honor: -10 }), o('전설은 남의 몫이다', { r: '조용히 살기로 하였다.' })] },
  { id: 'n_merchant_house', t: '상회의 이름', once: true, c: all(job('상인'), stat('charisma', 50), x => x.c.wealth >= 300), x: '이제 당신 이름을 건 상회를 열 수 있을 만큼 돈이 모였다.',
    o: [o('"{n} 상회"를 연다', { r: '{n} 상회의 깃발이 시장마다 나부꼈다.', fame: 30, wealth: -150, ep: '거상' }, '', ['ch', 0.5], { r: '경쟁자들의 방해로 문을 닫았다.', wealth: -150 }), o('지금으로 족하다', { r: '조용한 부자로 살기로 하였다.' })] },
  { id: 'n_tamer_beast', t: '전설의 마수', once: true, c: all(job('조련사'), yearsInJob(3)), x: '산맥에 아무도 길들이지 못한 거대한 마수가 산다고 한다.',
    o: [o('길들이러 간다', { r: '마수가 고개를 숙였다. 당신은 마수를 타고 돌아왔다. 사람들은 당신을 "마수의 주인"이라 불렀다.', ep: '마수의 주인', fame: 35, co: 5 }, '', ['ch', 0.3], { r: '마수의 발톱에 크게 다쳤다.', hp: -45 }), o('목숨이 아깝다', { r: '산맥을 바라보기만 하였다.' })] },
  { id: 'n_necro_army', t: '망자의 군세', cd: 120, c: all(job('사령술사'), stat('magic', 55)), x: '옛 전장에 수천 구의 뼈가 잠들어 있다. 모두 일으키면 작은 군대가 된다.',
    o: [o('일으킨다', { r: '뼈들이 덜그럭거리며 일어섰다. 사람들은 당신을 두려워하였다.', ep: '뼈의 군주', fame: 30, honor: -30, ma: 5 }, '', ['ma', 0.4], { r: '망자들이 당신에게 달려들었다.', hp: -40 }), o('망자는 쉬게 둔다', { r: '전장을 떠났다.', honor: 5 })] },
  { id: 'n_hunter_beast', t: '괴수 사냥', cd: 120, c: all(job('사냥꾼', '조련사', '모험가'), stat('might', 55)), x: x => byPlace(x, { surface: '열두 마을을 공포에 떨게 한 괴수가 숲에 산다.', under: '열두 굴을 공포에 떨게 한 거대한 땅벌레가 깊은 갱도에 산다.', demon: '열두 마을을 공포에 떨게 한 지옥견이 황야를 누빈다.', sky: '열두 섬을 공포에 떨게 한 폭풍 독수리가 둥지를 틀었다.' }),
    o: [o('사냥한다', { r: '괴수의 가죽을 들고 돌아왔다. 열두 마을이 잔치를 열었다.', ep: '괴수 사냥꾼', fame: 35 }, '', ['mi', 0.35], { r: '괴수에게 쫓겨 도망쳤다.', hp: -35 }), o('덫을 놓는다', { r: '사흘 만에 괴수가 걸렸다.', fame: 20, in: 2 }, '', ['in', 0.45], { r: '괴수는 덫을 피했다.' })] },
  { id: 'n_healer_saint', t: '치유의 손', once: true, c: all(job('치유사', '성직자'), hi(COM, 60), yearsInJob(5)), x: '당신에게 치료받은 이들이 모여 감사의 뜻을 전하고 싶다고 한다.',
    o: [o('받아들인다', { r: '사람들은 당신을 "치유의 손"이라 불렀다.', ep: '치유의 손', fame: 25, honor: 20 }), o('겸손히 사양한다', { r: '사양할수록 이름은 더 퍼졌다.', honor: 25, fame: 10 })] },
];

// ───────────── 명품을 지닌 자의 운명
const myArt = (x: Ctx) => x.w.artifacts.filter(a => a.tangible && a.holder === x.c.id).sort((a, b) => b.fame - a.fame)[0];
export const ARTFATE: LifeEv[] = [
  { id: 'a_king_wants', t: '군주의 눈길', cd: 60,
    c: x => adult(x) && !x.isLeader && !!x.ld && !!myArt(x) && myArt(x)!.fame >= 30,
    data: x => ({ artId: myArt(x)!.id, art: artLabel(myArt(x)!) }),
    x: '{ld}이(가) {art}의 소문을 듣고 사람을 보냈다. "폐하께서 그 물건을 보고 싶어 하십니다."',
    o: [o('군주에게 바친다', { r: '{ld}이(가) 크게 기뻐하였다.', fx: 'art_to_leader', honor: 15, fame: 10 }),
      o('정중히 거절한다', { r: '사신은 아쉬운 얼굴로 돌아갔다.', honor: 5 }, '매력 판정', ['ch', 0.45], { r: '군주가 병사를 보내 빼앗아 갔다.', fx: 'art_seized', mood: -15 }),
      o('몰래 숨긴다', { r: '사신이 집을 뒤졌지만 찾지 못하였다.' }, '지력 판정', ['in', 0.4], { r: '들켰다. 물건도 빼앗기고 매도 맞았다.', fx: 'art_seized', hp: -15, honor: -10 })] },
  { id: 'a_to_dragon', t: '용에게 바치는 비보', cd: 120,
    c: x => adult(x) && !!myArt(x) && x.w.chars.some(d => d.died < 0 && d.race === 'dragon' && !d.ancient && approxDist(x.w, x.c, d, true) < 50),
    data: x => {
      const d = x.w.chars.filter(d2 => d2.died < 0 && d2.race === 'dragon' && !d2.ancient).sort((a, b) => approxDist(x.w, x.c, a, true) - approxDist(x.w, x.c, b, true))[0];
      return { artId: myArt(x)!.id, art: artLabel(myArt(x)!), dId: d.id };
    },
    x: '근처 산의 용 {d}이(가) 마을을 노린다는 소문이다. 원로들은 {art}을(를) 비보로 바치면 용이 마을을 지켜 줄 것이라 한다.',
    o: [o('용에게 바친다', { r: '용은 비보를 받아 들고 마을 위를 한 바퀴 돌았다. 그 뒤로 마을을 습격하는 자가 없었다.', fx: 'art_to_dragon', honor: 20, fame: 15 }), o('내 것이다', { r: '원로들이 고개를 저었다.', honor: -5 })] },
  { id: 'a_bestow', t: '공신에게 내리는 상', cd: 60,
    c: x => x.isLeader && !!myArt(x),
    data: x => {
      const cands = x.w.chars.filter(c => c.died < 0 && c.faction === x.c.faction && c.id !== x.c.id && c.fame > 20).sort((a, b) => b.fame - a.fame);
      return cands.length ? { artId: myArt(x)!.id, art: artLabel(myArt(x)!), oId: cands[0].id } : null;
    },
    x: '{o}이(가) 전장에서 큰 공을 세웠다. 신하들은 {art}을(를) 하사하라고 권한다.',
    o: [o('{o}에게 하사한다', { r: '{o}이(가) 눈물을 흘리며 충성을 맹세하였다.', fx: 'art_bestow', honor: 10, ch: 2 }), o('금화로 대신한다', { r: '{o}은(는) 조금 서운해하였다.', wealth: -50 })] },
  { id: 'a_buyer', t: '수상한 수집가', cd: 60, c: x => adult(x) && !!myArt(x),
    data: x => ({ artId: myArt(x)!.id, art: artLabel(myArt(x)!) }),
    x: '먼 나라의 수집가가 {art}에 금화 산더미를 내밀었다.',
    o: [o('판다', { r: '부자가 되었다. 그 물건이 어디로 갔는지는 아무도 모른다.', wealth: 300, fx: 'art_sold' }), o('팔지 않는다', { r: '수집가는 씁쓸하게 웃으며 떠났다.', honor: 5 })] },
];

// ───────────── 영주가 되는 길: 눈에 들고 → 시험받고 → 임명된다
const govSeat = (x: Ctx) => {
  if (!x.f || x.f.tier < 1) return null;
  const ss = x.w.settlements.filter(s => s.alive && s.faction === x.c.faction && s.id !== x.f!.capital);
  if (!ss.length) return null;
  const empty = ss.find(s => s.governor < 0 || x.w.chars[s.governor]?.died >= 0);
  return empty ?? ss.sort((a, b) => a.stability - b.stability)[0];
};
export const GOVPATH: LifeEv[] = [
  { id: 'gp_notice', t: '군주의 연회', cd: 120,
    c: x => adult(x) && !x.isLeader && !x.isGov && !!x.ld && !!x.f && x.f.tier >= 1 && (x.c.fame >= 40 || x.c.honor >= 60) && noflag('govCand')(x),
    x: '{ld}의 연회에 초대받았다. 내로라하는 귀족들 사이에서 군주의 눈에 들 기회다.',
    o: [o('공을 세운 이야기를 들려준다', { r: '{ld}이(가) 당신의 이름을 기억하였다.', flag: 'govCand', fame: 5 }, '매력 판정', ['ch', 0.4], { r: '귀족들이 비웃었다. 군주는 하품을 하였다.', honor: -5 }),
      o('충성을 맹세한다', { r: '{ld}이(가) 고개를 끄덕였다.', flag: 'govCand', tr: [[LOY, 5]] }, '충성 판정', ['t4', 0.4], { r: '빈말처럼 들렸다.' }),
      o('조용히 술잔만 비운다', { r: '좋은 술이었다.', mood: 5 })] },
  { id: 'gp_trial', t: '군주의 시험', cd: 24, w: 4, c: all(since('govCand', 12), x => !x.isGov && !x.isLeader && !!x.ld), x: '{ld}이(가) 당신을 불렀다. "변경 마을에 도적 떼가 들끓는다. 네가 해결해 보아라."',
    o: [o('병사를 이끌고 토벌한다', { r: '도적 떼를 소탕하였다. 군주가 흡족해하였다.', flag: 'govReady', unflag: 'govCand', co: 4, fame: 10 }, '통솔 판정', ['co', 0.4], { r: '도적들에게 패해 물러났다. 군주의 눈길이 식었다.', unflag: 'govCand', hp: -15 }),
      o('도적들을 설득해 귀순시킨다', { r: '도적들이 무기를 내려놓았다. 군주가 감탄하였다.', flag: 'govReady', unflag: 'govCand', ch: 3, fame: 10 }, '매력 판정', ['ch', 0.35], { r: '협상 자리에서 칼을 맞을 뻔하였다.', unflag: 'govCand', hp: -20 }),
      o('함정을 파 일망타진한다', { r: '도적들이 한 명도 빠짐없이 걸려들었다.', flag: 'govReady', unflag: 'govCand', in: 3, fame: 10 }, '지력 판정', ['in', 0.4], { r: '도적들이 함정을 눈치챘다.', unflag: 'govCand' })] },
  { id: 'gp_offer', t: '영지 하사', cd: 12, w: 6, c: all(flag('govReady'), x => !x.isGov && !x.isLeader && !!govSeat(x)),
    data: x => { const s = govSeat(x)!; return { sId: s.id, s: s.name }; },
    x: '{ld}이(가) 당신을 {s}의 영주로 삼겠다고 한다. 백성들이 새 영주를 기다리고 있다.',
    o: [o('받아들인다', { r: '{s}의 영주가 되었다.', fx: 'become_gov', unflag: 'govReady', honor: 15 }), o('아직 그릇이 아니다', { r: '군주가 아쉬워하였다.', unflag: 'govReady', honor: 5 })] },
];

// ───────────── 새 직업들
export const NEWJOBS: LifeEv[] = [
  { id: 'nj_druid_fire', t: '숲의 불', cd: 72, c: job('드루이드'), x: '숲에 큰불이 났다. 정령들이 비명을 지른다.',
    o: [o('비를 부른다', { r: '먹구름이 몰려와 불을 껐다.', ma: 4, fame: 15 }, '마력 판정', ['ma', 0.4], { r: '비는 오지 않았다. 숲의 절반이 탔다.', mood: -15 }), o('짐승들을 대피시킨다', { r: '많은 생명을 구하였다.', honor: 10 })] },
  { id: 'nj_druid_tree', t: '나무와의 대화', cd: 96, c: job('드루이드'), x: '천 년 된 고목이 당신에게 말을 건다. "곧 도끼가 올 것이다."',
    o: [o('벌목꾼들을 막는다', { r: '벌목꾼들이 물러갔다.', honor: 10 }, '매력 판정', ['ch', 0.45], { r: '벌목꾼들에게 얻어맞았다.', hp: -15 }), o('나무를 다른 곳에 옮겨 심는다', { r: '나무가 새 땅에 뿌리를 내렸다.', ma: 5 }, '마력 판정', ['ma', 0.35], { r: '나무는 말라 버렸다.', mood: -10 })] },
  { id: 'nj_druid_wolf', t: '늑대의 형상', once: true, c: all(job('드루이드'), stat('magic', 50)), x: '짐승의 형상을 빌리는 고대 의식을 익힐 수 있을 것 같다.',
    o: [o('의식을 치른다', { r: '늑대가 되어 숲을 달렸다. 돌아왔을 때 무언가 달라져 있었다.', mi: 6, ma: 4 }, '', ['ma', 0.4], { r: '돌아오는 길을 잃을 뻔하였다.', hp: -15 }), o('그만둔다', { r: '사람으로 남기로 하였다.' })] },
  { id: 'nj_shaman_spirit', t: '조상의 목소리', cd: 72, c: job('주술사'), x: '부족장이 전쟁에 나설지 조상에게 물어 달라고 한다.',
    o: [o('조상의 진짜 뜻을 전한다', { r: '조상은 평화를 원하였다. 부족장이 화를 냈다.', tr: [[FAI, 4]], honor: 5 }), o('부족장이 듣고 싶은 말을 한다', { r: '부족장이 크게 기뻐하였다.', wealth: 40, honor: -10 }), o('뼈를 던져 점을 친다', { r: '뼈는 피를 가리켰다.', ma: 3 }, '마력 판정', ['ma', 0.5], { r: '뼈가 부러졌다. 흉조다.', mood: -10 })] },
  { id: 'nj_shaman_plague', t: '악령 쫓기', cd: 96, c: job('주술사', '치유사'), x: '마을 아이들이 원인 모를 병에 걸렸다. 사람들은 악령의 짓이라 한다.',
    o: [o('밤새 북을 친다', { r: '아이들의 열이 내렸다.', fame: 15 }, '마력 판정', ['ma', 0.45], { r: '아이 하나를 잃었다.', mood: -20 }), o('약초를 쓴다', { r: '약초가 효과를 보았다.', in: 3 }, '지력 판정', ['in', 0.5], { r: '약초는 듣지 않았다.' })] },
  { id: 'nj_assassin_contract', t: '의뢰', cd: 60, c: job('암살자'),
    data: x => {
      const t = x.w.chars.filter(c => c.died < 0 && c.id !== x.c.id && c.fame > 20 && c.race !== 'dragon' && ageOf(x.w, c) >= 16 && approxDist(x.w, x.c, c) < 40
        && c.id !== x.c.spouse && !x.c.children.includes(c.id) && c.id !== x.c.father && c.id !== x.c.mother && c.id !== x.ld?.id);
      return t.length ? { oId: x.w.rngSim.pick(t).id } : null;
    },
    x: '익명의 의뢰가 들어왔다. 표적은 {o}. 보수는 넉넉하다.',
    o: [o('의뢰를 수행한다', { r: '그림자 속에서 일을 끝냈다.', fx: 'duel', wealth: 120, honor: -20 }, '', ['mi', 0.6], { r: '표적의 호위에게 들켰다.', hp: -30 }), o('표적에게 경고한다', { r: '{o}이(가) 당신에게 큰 빚을 졌다.', fx: 'friend', honor: 10 }), o('거절한다', { r: '그림자 길드가 당신을 지켜보기 시작하였다.' })] },
  { id: 'nj_assassin_guild', t: '그림자의 서열', once: true, c: all(job('암살자'), yearsInJob(3)), x: '그림자 길드의 수장이 늙었다. 후계를 노리는 자들의 칼날이 날카로워진다.',
    o: [o('수장을 노린다', { r: '그림자의 수장이 되었다.', co: 6, fame: 20, ep: '그림자 수장' }, '', ['mi', 0.35], { r: '수장의 칼이 더 빨랐다.', hp: -45 }), o('수장을 지킨다', { r: '수장이 당신을 후계자로 지목하였다.', tr: [[LOY, 5]], fame: 10 })] },
  { id: 'nj_necro_love', t: '되살리고 싶은 이', once: true, c: all(job('사령술사'), x => x.c.spouse < 0 && x.c.relations && Object.keys(x.c.relations).some(id => { const o2 = x.w.chars[+id]; return o2 && o2.died >= 0 && (x.c.relations[+id] ?? 0) > 50; })),
    x: '사랑했던 이를 되살릴 수 있다는 금서의 한 장을 찾았다.',
    o: [o('되살린다', { r: '그는 눈을 떴다. 하지만 그 눈에는 더 이상 빛이 없었다.', ma: 8, mood: -25, honor: -20 }, '', ['ma', 0.4], { r: '의식은 실패하였다. 그것이 다행이었는지도 모른다.', mood: -10 }), o('편히 쉬게 둔다', { r: '금서를 불태웠다.', mood: 5, tr: [[COM, 5]] })] },
  { id: 'nj_necro_hunt', t: '사냥당하는 술사', cd: 96, c: all(job('사령술사'), x => !!x.f && RACES[x.f.race].align !== 'dark'), x: '신전의 심문관들이 사령술사를 사냥하고 있다. 문이 두드려진다.',
    o: [o('맞서 싸운다', { r: '해골 하인들이 심문관들을 몰아냈다.', ma: 3, honor: -10 }, '마력 판정', ['ma', 0.45], { r: '붙잡혀 고문을 당하였다.', hp: -35 }), o('도망친다', { r: '다른 고을로 숨어들었다.', fx: 'jobless' })] },
  { id: 'nj_trap_intruder', t: '갱도의 침입자', cd: 60, c: job('함정꾼'), x: '함정에 커다란 무언가가 걸렸다는 소리가 들린다.',
    o: [o('확인하러 간다', { r: '드워프 첩자였다. 큰 상을 받았다.', wealth: 50, fame: 10 }, '', ['mi', 0.5], { r: '걸린 것은 성난 곰이었다.', hp: -25 }), o('함정을 더 깊게 판다', { r: '갱도가 더 안전해졌다.', in: 3 })] },
  { id: 'nj_trap_design', t: '새 함정', cd: 72, c: job('함정꾼'), x: '기발한 함정이 떠올랐다. 하지만 시험해 볼 대상이 필요하다.',
    o: [o('스스로 시험한다', { r: '함정은 완벽하였다. 당신도 완벽하게 걸렸다.', hp: -10, in: 4, fame: 5 }), o('족장에게 바친다', { r: '족장이 기뻐하며 상을 내렸다.', wealth: 30 }, '지력 판정', ['in', 0.5], { r: '족장이 함정에 걸렸다. 큰일이다.', hp: -20 })] },
  { id: 'nj_tamer_egg', t: '이상한 알', once: true, c: job('조련사'), x: '시장에서 정체불명의 커다란 알을 팔고 있다.',
    o: [o('사서 부화시킨다', { r: '그리핀 새끼가 태어났다! 평생의 동반자가 되었다.', item: '그리핀', fame: 20, co: 3 }, '', ['ch', 0.4], { r: '알에서 독거미 수백 마리가 쏟아져 나왔다.', hp: -20, mood: -10 }), o('지나친다', { r: '그 알이 무엇이었을지 오래 궁금하였다.' })] },
  { id: 'nj_tamer_arena', t: '투기장', cd: 72, c: job('조련사'), x: '귀족들이 투기장에서 마수 싸움을 연다. 당신의 마수를 내보내라고 한다.',
    o: [o('내보낸다', { r: '당신의 마수가 이겼다! 큰돈을 벌었다.', wealth: 80, fame: 10 }, '매력 판정', ['ch', 0.45], { r: '마수가 다쳤다. 마음이 아프다.', mood: -15 }), o('거절한다', { r: '귀족들이 불쾌해하였다.', honor: 5, tr: [[COM, 3]] })] },
  { id: 'nj_assassin_target_king', t: '왕을 노리는 의뢰', once: true, c: all(job('암살자'), stat('might', 60), x => !!x.ld && x.ld.id !== x.c.id), x: '얼굴을 가린 귀족이 {ld}의 목에 막대한 현상금을 걸었다.',
    o: [o('왕궁에 잠입한다', { r: '어둠 속에서 왕좌가 흔들렸다.', fx: 'coup', honor: -30 }, '성공하면 왕좌가 흔들린다', ['mi', 0.3], { r: '근위대에 둘러싸였다.', hp: -50 }), o('귀족을 고발한다', { r: '{ld}이(가) 큰 상을 내렸다.', wealth: 150, honor: 20 })] },
];

// ───────────── 성역의 수호자 (돈과 무관한 존재의 나날)
export const GUARDIAN2: LifeEv[] = [
  { id: 'g2_watch', t: '하늘의 파수', cd: 48, c: guardian, x: '성역의 끝에 서서 지상을 내려다본다. 어디에서 기도가 가장 크게 들리는가?',
    o: [o('굶주린 마을', { r: '구름을 모아 비를 내려 주었다.', honor: 10, ma: 2 }), o('전쟁터', { r: '죽어 가는 이들의 영혼을 거두었다.', tr: [[COM, 4]] }), o('홀로 기도하는 아이', { r: '아이의 꿈속에 내려가 위로해 주었다.', mood: 10 })] },
  { id: 'g2_host', t: '천군 훈련', cd: 60, c: guardian, x: '천군의 젊은 천사들이 지도를 청한다.',
    o: [o('엄격하게 훈련한다', { r: '천군이 더욱 강해졌다.', co: 5 }, '통솔 판정', ['co', 0.5], { r: '젊은 천사 하나가 날개를 다쳤다.', mood: -5 }), o('지상의 이야기를 들려준다', { r: '천사들이 지상을 이해하기 시작하였다.', ch: 3 })] },
  { id: 'g2_fallen', t: '타락한 천사', once: true, c: guardian, x: '한때 동료였던 천사가 마계로 떨어졌다는 소식이다. 그가 지상을 어지럽히고 있다.',
    o: [o('직접 찾아가 구한다', { r: '그의 손을 잡아 다시 빛으로 이끌었다.', honor: 25, fame: 15 }, '매력 판정', ['ch', 0.35], { r: '그는 검으로 답하였다.', hp: -30 }), o('심판한다', { r: '빛의 창이 그를 꿰뚫었다. 마음이 무겁다.', mi: 3, mood: -15 })] },
  { id: 'g2_doubt', t: '수호자의 의문', once: true, c: guardian, x: '지상의 고통은 끝이 없다. 수호자는 왜 모든 것을 막지 못하는가.',
    o: [o('더 많이 개입한다', { r: '하늘의 법을 어기고 지상에 내려가기로 하였다.', tr: [[COM, 8], [LOY, -5]] }), o('균형을 지킨다', { r: '모든 것을 구할 수는 없다. 그러나 봉인은 지킨다.', tr: [[PRU, 6]], ma: 3 })] },
];

function atWar(x: Ctx): boolean { return !!x.f && Object.keys(x.f.wars).length > 0; }
export { C0, AMB, GRE, COM, LOY, FAI, CUR, SOC, PRU, PRI, hi, lo, ruler, leaderOf };
