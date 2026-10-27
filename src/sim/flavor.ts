// 일상의 한 줄: 같은 '수련'이라도 어디서, 누가, 어느 계절에 하느냐에 따라 다르다.
// 사는 곳·계절·직업·종족·곁에 있는 사람을 보고, 최근에 쓴 문장은 피해서 고른다.
import type { Character, World } from './state';
import { dist, seasonOf } from './state';

type Pool = (string | false | null | undefined)[];

const GOD: Partial<Record<string, string>> = {
  human: '빛의 신', elf: '숲의 정령', darkelf: '거미 여신', dwarf: '대장장이 신', goblin: '달의 도깨비신', kobold: '광맥의 용신',
  orc: '전쟁의 신', beast: '조상의 혼', majin: '마계의 군주', angel: '천상의 빛', undead: '죽음 그 자체', demon: '심연',
};

function where(w: World, c: Character) {
  const h = w.settlements[c.home];
  const l = h ? h.l : c.l;
  return { h, l, season: seasonOf(w.t), town: !!h && h.tier >= 1 };
}

/** 최근 기록과 겹치지 않는 문장을 고른다 */
function pick(w: World, c: Character, pool: Pool): string {
  const ok = pool.filter((s): s is string => !!s);
  const recent = new Set(c.log.slice(-6).map(l => l.text));
  const fresh = ok.filter(s => !recent.has(s));
  return w.rngSim.pick(fresh.length ? fresh : ok);
}

export function trainLine(w: World, c: Character): string {
  const { h, l, season } = where(w, c);
  const hn = h?.name ?? '마을';
  const mage = c.role === '마법사' || c.role === '사령술사' || c.role === '주술사';
  return pick(w, c, [
    '검술을 수련하였다.', '몸을 단련하였다.', '병법서를 읽고 진법을 익혔다.',
    `${hn}의 훈련장에서 신병들과 목검을 맞부딪쳤다.`, '맨발로 언덕을 오르내리며 숨을 골랐다.', '방패를 들고 하루 종일 버티는 훈련을 하였다.',
    '노련한 고참에게 찌르기 한 수를 배웠다.', '창을 천 번 내지르고서야 잠자리에 들었다.',
    c.role === '기사' && '말을 타고 창 겨루기를 연습하였다.',
    c.role === '사냥꾼' && '과녁 대신 나뭇잎을 쏘아 맞혔다.',
    c.role === '암살자' && '소리 없이 걷는 법을 다시 익혔다.',
    mage && '주문을 외우며 지팡이 휘두르는 법을 익혔다.',
    l === 2 && season === 3 && '눈보라 속에서 웃통을 벗고 장작을 팼다.',
    l === 2 && season === 1 && '한여름 뙤약볕 아래에서 갑옷을 입고 달렸다.',
    l === 3 && '굴 천장 바위에 매달려 팔힘을 길렀다.',
    l === 4 && '용암 강가의 뜨거운 바위 위에서 버티는 수련을 하였다.',
    l <= 1 && '구름 다리 위에서 균형을 잡으며 검을 휘둘렀다.',
  ]);
}

export function studyLine(w: World, c: Character): string {
  const { l } = where(w, c);
  return pick(w, c, [
    '학문에 몰두하였다.', '고대 문자를 해독하였다.', '마법의 원리를 연구하였다.',
    '낡은 연대기 한 권을 필사하였다.', '별의 움직임을 기록하였다.', '약초 도감에 새 풀을 그려 넣었다.', '선대 현자의 주석을 읽으며 밤을 새웠다.',
    '틀린 계산을 찾느라 하루를 다 보냈다.', '먼 나라의 말을 몇 마디 익혔다.',
    c.role === '사령술사' && '무덤에서 가져온 뼈의 결을 살폈다.',
    c.role === '연금술사' && '플라스크 속 액체가 세 번 색을 바꾸는 것을 지켜보았다.',
    c.role === '마법사' && '마나의 흐름을 지도로 그려 보았다.',
    c.race === 'elf' && '백 년 전에 쓰다 만 시를 이어 썼다.',
    c.race === 'dwarf' && '룬 문자의 획 하나하나를 돌에 새겨 보았다.',
    l === 3 && '수정 등불 아래에서 두꺼운 책을 넘겼다.',
    l === 4 && '마계의 금서를 몰래 펼쳐 보았다.',
  ]);
}

export function prayLine(w: World, c: Character): string {
  const god = GOD[c.race] ?? '신';
  const { season, l } = where(w, c);
  return pick(w, c, [
    `${god}께 기도를 올렸다.`, '경건하게 금식하였다.', '신전에 공물을 바쳤다.',
    `${god}의 이름을 부르며 밤을 지새웠다.`, '병든 이웃을 위해 기도하였다.', '신전 계단을 쓸고 닦았다.', '조상의 무덤을 돌보았다.',
    c.race === 'orc' && '전쟁의 신께 바칠 짐승을 잡았다.',
    c.race === 'elf' && '오래된 나무 아래에서 정령의 목소리를 기다렸다.',
    c.race === 'undead' && '죽음 앞에 무릎 꿇고 영원을 맹세하였다.',
    c.race === 'demon' || c.race === 'majin' ? '심연을 향해 피 한 방울을 떨어뜨렸다.' : null,
    l === 2 && season === 2 && '가을걷이를 감사하는 제를 올렸다.',
    l === 2 && season === 0 && '봄 파종을 앞두고 풍년을 빌었다.',
  ]);
}

export function serveLine(w: World, c: Character, ld: Character): string {
  const near = ld.l === c.l && dist(ld, c) < 8;
  return pick(w, c, near ? [
    `${ld.name}을(를) 충실히 보좌하였다.`, `${ld.name}의 곁에서 회의에 참석하였다.`, `${ld.name}의 사냥에 동행하였다.`, `${ld.name}의 명으로 사절을 맞이하였다.`,
    `${ld.name}에게 백성들의 사정을 아뢰었다.`, `${ld.name}의 연회에서 술잔을 받았다.`, `${ld.name}의 서고를 정리하였다.`,
  ] : [
    `멀리 있는 ${ld.name}에게 보낼 보고서를 썼다.`, `${ld.name}의 명을 받들어 고을의 일을 살폈다.`, `${ld.name}의 이름으로 세금 장부를 맞추었다.`,
  ]);
}

export function socialLine(w: World, c: Character, o: Character, mood: 'good' | 'bad' | 'plain'): string {
  const { h, l, season } = where(w, c);
  if (mood === 'bad') return pick(w, c, [`${o.name}과(와) 크게 말다툼을 하였다.`, `${o.name}과(와) 사소한 일로 언성을 높였다.`, `${o.name}의 험담을 듣고 얼굴을 붉혔다.`]);
  if (mood === 'good') return pick(w, c, [
    `${o.name}과(와) 술잔을 기울이며 우정을 쌓았다.`, `${o.name}과(와) 옛이야기로 밤을 새웠다.`, `${o.name}의 집에서 저녁을 얻어먹었다.`,
    `${o.name}과(와) 내기 장기를 두었다.`, `${o.name}의 지붕 고치는 일을 거들었다.`,
    o.children.some(id => w.chars[id]?.died < 0) && `${o.name}의 아이들에게 옛날이야기를 들려주었다.`,
    l === 2 && season === 1 && `${o.name}과(와) 개울에서 고기를 잡았다.`,
    l === 2 && season === 3 && `${o.name}과(와) 화롯가에서 군밤을 나눠 먹었다.`,
  ]);
  return pick(w, c, [
    `${o.name}과(와) 담소를 나누었다.`, `${o.name}과(와) ${h && h.tier >= 1 ? '장터' : '우물가'}에서 마주쳐 안부를 물었다.`, `${o.name}에게 빌린 연장을 돌려주었다.`,
    `${o.name}과(와) 날씨 이야기를 하였다.`, `${o.name}이(가) 들려준 소문에 귀를 기울였다.`,
  ]);
}

export function marketLine(w: World, c: Character): string {
  const { l, h } = where(w, c);
  const market = l === 3 ? '지하 시장' : l === 4 ? '유황 시장' : l <= 1 ? '바람 시장' : h && h.tier >= 1 ? '장터' : '마을 어귀';
  return pick(w, c, [
    `${market}에서 장사를 하였다.`, `${market}에서 값을 두고 한참 흥정하였다.`, '창고의 물품을 정리하였다.', '외상값을 받으러 다녔다.',
    '새로 들어온 물건의 값을 매겼다.', '단골에게 덤을 얹어 주었다.', '장부의 숫자가 맞지 않아 머리를 싸맸다.',
  ]);
}

export function rulerLine(w: World, c: Character): string {
  const { season, l } = where(w, c);
  return pick(w, c, [
    '국정을 돌보았다.', '신하들의 간언을 들었다.', '영토를 순시하였다.', '연회를 열어 귀족들을 다독였다.',
    '백성의 상소를 직접 읽었다.', '이웃 나라의 사절을 맞았다.', '세금을 두고 대신들과 다투었다.', '젊은 기사들의 서임식을 열었다.',
    l === 2 && season === 2 && '가을 수확을 살피러 들판에 나갔다.',
    l === 2 && season === 3 && '굶주리는 고을에 곡식 창고를 열라 명하였다.',
  ]);
}

export function lordLine(w: World, c: Character, sName: string): string {
  const { season } = where(w, c);
  return pick(w, c, [
    `${sName}의 송사를 처리하였다.`, `${sName}의 성벽을 보수하였다.`, `${sName}에서 세금을 거두었다.`,
    `${sName}의 우물을 새로 파게 하였다.`, `${sName} 장터의 저울을 바로잡았다.`, `${sName}의 다리를 고치라 명하였다.`, `${sName}의 노인들을 찾아 안부를 물었다.`,
    season === 2 && `${sName}의 곳간을 채우게 하였다.`,
    season === 0 && `${sName}의 들판에 씨앗을 나누어 주었다.`,
  ]);
}
