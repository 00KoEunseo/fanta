// 나의 일대기: 계절이 지나도록 별일이 없으면, 그 계절의 평범한 하루를 한 줄 남긴다.
// 문장마다 어울리는 곳·종족·처지가 있다. 맞지 않는 문장은 고르지 않는다.
import { fixJosa } from '../data/text';
import { RACES } from '../data/races';
import * as T from '../data/terrain';
import type { Character, Settlement, World } from './state';
import { ageOf, seasonOf } from './state';
import { isAdult } from './helpers';
import { isPort } from './sea';

interface Cx { w: World; c: Character; home?: Settlement; tid: number; undead: boolean; town: boolean; port: boolean; ruler: boolean }
type Line = string | [string, (x: Cx) => boolean];

const notUndead = (x: Cx) => !x.undead;
const town = (x: Cx) => x.town;
const port = (x: Cx) => x.port;
const plainLand = (x: Cx) => x.tid !== T.DESERT && x.tid !== T.TUNDRA;
const forestNear = (x: Cx) => x.tid === T.FOREST || x.tid === T.DEEPFOREST || RACES[x.c.race].key === 'elf';

const SURFACE: Line[][] = [
  // 봄
  [['들판에 첫 싹이 돋았다.', plainLand], ['얼었던 개울이 풀려 물소리가 다시 들렸다.', plainLand], ['봄비가 사흘 내리 내렸다.', plainLand], ['제비가 처마 밑에 집을 지었다.', town],
    ['꽃가루에 재채기를 하며 봄을 났다.', x => !x.undead && plainLand(x)], ['모래바람이 잦아들고 낮이 길어졌다.', x => x.tid === T.DESERT], ['설원의 눈이 조금 녹아 질척거렸다.', x => x.tid === T.TUNDRA]],
  // 여름
  [['뙤약볕 아래 땀을 훔치며 여름을 났다.', notUndead], ['밤마다 풀벌레 소리가 시끄러웠다.', plainLand], ['소나기를 피해 처마 밑에서 한참을 서 있었다.', x => town(x) && plainLand(x)],
    ['개울에 발을 담그고 더위를 식혔다.', x => notUndead(x) && plainLand(x)], ['{h}의 장터가 여름 과일로 북적였다.', x => town(x) && plainLand(x)], ['늪의 모기 떼에 시달린 여름이었다.', x => notUndead(x) && x.tid === T.SWAMP],
    ['한낮의 모래가 발을 델 듯 뜨거웠다.', x => x.tid === T.DESERT], ['짧은 여름 동안 설원에 이끼꽃이 피었다.', x => x.tid === T.TUNDRA]],
  // 가을
  [['들판이 누렇게 익어 갔다.', plainLand], ['{h}에 추수 잔치가 열렸다.', x => town(x) && plainLand(x)], ['낙엽을 밟으며 먼 길을 걸었다.', forestNear], ['곳간이 채워지는 소리에 마음이 놓였다.', x => notUndead(x) && plainLand(x)],
    ['서늘한 바람에 두꺼운 옷을 꺼냈다.', notUndead], ['단풍이 산을 붉게 물들였다.', plainLand], ['사막의 밤이 하루가 다르게 차가워졌다.', x => x.tid === T.DESERT]],
  // 겨울
  [['눈이 무릎까지 쌓였다.', x => x.tid !== T.DESERT], ['화롯가에 모여 긴 밤을 보냈다.', notUndead], ['{h}의 우물이 꽁꽁 얼어붙었다.', x => town(x) && x.tid !== T.DESERT], '겨울이 길고 지루하였다.',
    ['장작을 패며 겨울을 났다.', notUndead], ['눈보라가 그치기만을 기다렸다.', x => x.tid !== T.DESERT], ['설원의 겨울은 혹독하였다. 바람이 살을 에었다.', x => x.tid === T.TUNDRA],
    ['사막에도 겨울은 왔다. 밤마다 모래가 서리로 반짝였다.', x => x.tid === T.DESERT]],
];
const SKY: Line[] = ['구름 아래로 지상의 계절이 바뀌는 것을 내려다보았다.', '부유섬 가장자리에 서서 바람의 결이 바뀌는 것을 느꼈다.', '구름 다리를 건너는 바람이 한결 차가워졌다.', '섬 아래로 철새 떼가 지나갔다.'];
const UNDER: Line[] = ['지상은 계절이 바뀌었다고 하였다. 땅 밑은 언제나처럼 서늘하였다.', '버섯 숲에 새 포자가 날렸다.', '갱도 깊은 곳에서 물방울 떨어지는 소리를 세며 하루를 보냈다.', '수정굴의 빛이 유난히 푸르렀다.',
  ['지상에서 내려온 상인에게 햇빛 이야기를 들었다.', town]];
const DEMON: Line[] = ['유황 냄새가 한층 짙어졌다.', '붉은 하늘이 오늘따라 더 어두웠다.', '용암 강이 넘실대는 소리를 들으며 하루를 보냈다.', '마계의 바람이 뼛속까지 뜨거웠다.'];
const HEAVEN: Line[] = ['빛의 정원에 새 꽃이 피었다.', '천상의 종소리가 고요히 울렸다.', '지상의 기도 소리가 희미하게 들려왔다.', '영원한 오후 속에서 하루가 또 지났다.'];
const SEA: Line[] = ['수평선만 바라본 날들이었다.', '돛을 깁고 밧줄을 꼬며 하루를 보냈다.', '날치 떼가 뱃전을 스쳐 지나갔다.', ['바닷물에 젖은 빵으로 끼니를 때웠다.', notUndead], '별을 보며 항로를 가늠하였다.',
  ['파도가 잔잔해 모처럼 깊이 잠들었다.', notUndead]];

const CHILD: Line[] = ['또래들과 술래잡기를 하였다.', ['부엌에서 먹을 것을 몰래 집어 먹다 혼이 났다.', notUndead], '나무 막대를 칼 삼아 용사 놀이를 하였다.', '어른들의 옛이야기를 들으며 잠들었다.',
  '처음으로 혼자 심부름을 다녀왔다.', ['키가 한 뼘 자랐다.', notUndead]];
const ELDER: Line[] = ['무릎이 쑤셔 오래 걷지 못하였다.', ['손주들에게 젊은 날의 무용담을 들려주었다.', x => x.c.children.length > 0], '오래된 친구의 부고를 들었다.', '양지바른 곳에 앉아 지난날을 떠올렸다.',
  '젊은이들의 말이 빨라 잘 알아듣지 못하였다.'];
const UNDEAD: Line[] = ['잠들지 않는 밤이 또 지나갔다.', '썩어 가는 손가락 하나를 실로 꿰매어 붙였다.', '살아 있던 시절의 이름이 잘 떠오르지 않았다.', '산 자들이 길을 비켜 가는 것을 지켜보았다.'];

const fromUnder = (x: Cx) => (x.home?.l ?? x.c.l) === 3;
const onSurface = (x: Cx) => (x.home?.l ?? x.c.l) === 2;
const ROLE: Record<string, Line[]> = {
  농부: [['밭을 갈고 씨를 뿌렸다.', onSurface], ['김을 매느라 허리가 휘었다.', onSurface], ['하늘을 올려다보며 비를 기다렸다.', onSurface], ['버섯밭에 새 포자를 뿌렸다.', fromUnder], ['버섯 수확이 예년만 못하였다.', fromUnder]],
  상인: ['장부를 맞추느라 밤을 새웠다.', '헐값에 들여온 물건을 제값에 팔았다.', ['단골손님과 오래 흥정하였다.', town], '이웃 고을의 시세를 알아보았다.'],
  장인: ['새 연장을 손에 익혔다.', '주문받은 물건을 날짜에 맞춰 넘겼다.', '제자에게 손놀림을 가르쳤다.'],
  대장장이: ['풀무질에 팔이 저려 왔다.', '편자와 못을 한 자루 가득 만들었다.', '식은 쇠를 다시 달구었다.'],
  광부: ['새 갱도를 한 길 더 팠다.', '광맥이 끊겨 하루 헛삽질을 하였다.', '등불 기름이 떨어져 일찍 갱도를 나왔다.'],
  전사: ['동틀 녘마다 검을 휘둘렀다.', '훈련장에서 신참들을 굴렸다.', '갑옷 끈을 새것으로 갈았다.'],
  기사: ['말을 돌보고 마구를 손질하였다.', ['영주의 행차를 호위하였다.', x => !x.ruler], '창술 시합에 나가 이름을 알렸다.'],
  사냥꾼: ['덫을 놓고 하루를 기다렸다.', ['사슴 발자국을 따라 숲 깊이 들어갔다.', x => onSurface(x) && forestNear(x)], '가죽을 무두질하였다.', ['동굴 박쥐 떼를 잡아 왔다.', fromUnder]],
  학자: ['낡은 책 한 권을 다 읽었다.', '난해한 구절 하나를 두고 며칠을 고민하였다.', '제자들의 질문에 답하느라 하루가 갔다.'],
  마법사: ['주문 하나를 외우느라 밤을 새웠다.', '마나가 흐트러져 실험이 실패하였다.', '촛불을 손끝으로 켜는 연습을 하였다.'],
  성직자: ['새벽 기도를 올렸다.', '병자의 손을 잡고 기도하였다.', '신전 바닥을 닦았다.'],
  치유사: ['약초를 말리고 빻았다.', '열이 오른 아이를 밤새 돌보았다.'],
  선원: [['부두에서 그물을 손질하였다.', port], ['먼 바다 이야기를 술잔에 섞어 떠들었다.', port], ['바다를 떠나온 뒤로 파도 소리가 그리웠다.', x => !x.port]],
  음유시인: ['새 노래의 첫 소절을 지었다.', ['주점에서 노래하고 저녁값을 벌었다.', town]],
  도적: [['장터에서 지갑 몇 개를 슬쩍하였다.', town], '경비병의 순찰 시간을 외웠다.'],
  모험가: ['다음 모험지의 소문을 모았다.', '낡은 지도를 펴 놓고 길을 그렸다.', ['여관에 동료를 구한다는 쪽지를 붙였다.', town]],
  연금술사: ['플라스크 하나를 깨뜨렸다.', '이상한 색의 연기가 피어올라 이웃이 항의하였다.'],
  사령술사: ['묘지에서 쓸 만한 뼈를 골랐다.', '죽은 자의 속삭임을 받아 적었다.'],
  드루이드: ['숲의 정령에게 제물을 바쳤다.', '병든 나무를 돌보았다.'],
  주술사: ['조상의 영혼에게 점을 쳤다.', '부적을 만들어 마을에 나누었다.'],
  암살자: ['칼날을 갈고 독을 새로 탔다.', '표적이 없는 계절이었다. 그림자 속에서 기다렸다.'],
  함정꾼: ['새 덫의 용수철을 손보았다.', '길목마다 덫을 다시 놓았다.'],
  조련사: ['짐승들에게 먹이를 주고 털을 빗겼다.', '새로 잡은 짐승이 좀처럼 길들지 않았다.'],
  백수: [['하릴없이 장터를 어슬렁거렸다.', town], '일자리를 알아본다며 나섰다가 해 질 녘에야 돌아왔다.', ['해가 중천에 뜰 때까지 늦잠을 잤다.', notUndead]],
  노예: ['주인의 채찍 소리에 하루가 시작되었다.', '사슬에 쓸린 발목이 쓰라렸다.', '고향 하늘을 떠올리며 견뎠다.'],
};
const RULER: Line[] = ['신하들의 상소를 읽느라 하루가 갔다.', '사절을 맞아 연회를 베풀었다.', '세금을 두고 대신들과 다투었다.', '영토를 순시하며 백성들의 얼굴을 살폈다.'];
const LORD: Line[] = ['영지의 세금을 거두었다.', '마을 사이의 땅 다툼을 판결하였다.', '성벽 보수를 명하였다.'];
const WAR: Line[] = [['전쟁 소식에 {h}의 공기가 무거웠다.', x => !x.ruler], ['징집관이 마을을 돌았다.', x => !x.ruler && isAdult(x.w, x.c)], ['전선에서 돌아오지 않은 이웃의 이름을 들었다.', x => !x.ruler],
  ['전선에서 올라온 보고를 밤늦도록 읽었다.', x => x.ruler], ['전쟁 비용을 대느라 곳간이 말라 갔다.', x => x.ruler]];
const PLAGUE: Line[] = ['역병이 돈다는 소문에 문을 걸어 잠갔다.', '거리마다 약초 태우는 연기가 자욱하였다.'];
const HUNGER: Line[] = ['곳간이 비어 묽은 죽으로 끼니를 때웠다.', '배를 곯으며 잠들었다.'];
const FAMILY: Line[] = ['{sp}와(과) 오랜만에 둘이서 산책을 하였다.', ['아이들이 마당에서 노는 소리를 들었다.', x => x.c.children.some(id => x.w.chars[id]?.died < 0 && !isAdult(x.w, x.w.chars[id]))], '{sp}의 생일을 챙겼다.'];

const text = (l: Line) => (typeof l === 'string' ? l : l[0]);
const fits = (x: Cx, l: Line) => typeof l === 'string' || l[1](x);

export function seasonalLine(w: World, c: Character): string {
  const rng = w.rngSim;
  const home = w.settlements[c.home];
  const f = w.factions[c.faction];
  const L = home ? w.layers[home.l] : null;
  const x: Cx = {
    w, c, home, tid: home && L ? L.terrain[home.y * L.w + home.x] : -1,
    undead: RACES[c.race].needs[0] === 0, town: !!home && home.tier >= 1, port: !!home && isPort(w, home), ruler: !!f && f.leader === c.id,
  };
  const pools: [Line[], number][] = [];
  const l = c.act.kind === 'voyage' ? -1 : home ? home.l : c.l;
  pools.push([l === -1 ? SEA : l === 2 ? SURFACE[seasonOf(w.t)] : l === 1 ? SKY : l === 3 ? UNDER : l === 4 ? DEMON : HEAVEN, 3]);
  if (c.act.kind !== 'voyage') {
    if (x.undead) pools.push([UNDEAD, 2]);
    if (!isAdult(w, c)) pools.push([CHILD, 4]);
    else {
      if (!x.undead && ageOf(w, c) > c.lifespan * 0.7) pools.push([ELDER, 2]);
      if (x.ruler) pools.push([RULER, 3]);
      else if (w.settlements.some(s => s.alive && s.governor === c.id)) pools.push([LORD, 2]);
      else if (ROLE[c.role]) pools.push([ROLE[c.role], 3]);
      if (!x.undead && c.spouse >= 0 && w.chars[c.spouse]?.died < 0) pools.push([FAMILY, 1]);
    }
    if (f && Object.keys(f.wars).length) pools.push([WAR, 1]);
    if (!x.undead && home && home.plague > 0) pools.push([PLAGUE, 2]);
    if (!x.undead && home && home.hunger > 0) pools.push([HUNGER, 2]);
  }
  // 최근에 쓴 문장은 되풀이하지 않는다
  const recent = new Set(c.bio.slice(-8).map(b => b.text));
  const sp = w.chars[c.spouse];
  const render = (l: Line) => fixJosa(text(l).replace(/\{h\}/g, home?.name ?? '마을').replace(/\{sp\}/g, sp?.name ?? '배우자'));
  const cand = pools.flatMap(([pool, wt]) => {
    const ok = pool.filter(l => fits(x, l)).map(render).filter(t => !recent.has(t));
    return ok.map(t => [t, wt / Math.max(1, ok.length)] as [string, number]);
  });
  return rng.weighted(cand, e => e[1])?.[0] ?? '조용한 계절이 지나갔다.';
}

/** 계절이 바뀔 때, 지난 석 달 동안 일대기에 남은 일이 없으면 한 줄을 남긴다 */
export function seasonFiller(w: World): void {
  const P = w.player;
  if (!P || P.dead || w.t % 3 !== 0) return;
  const c = w.chars[P.charId];
  if (!c || c.died >= 0 || c.race === 'dragon') return;
  const last = c.bio[c.bio.length - 1];
  if (last && w.t - last.t < 3) return;
  c.bio.push({ t: w.t, text: seasonalLine(w, c), imp: 1 });
  if (c.bio.length > 120) {
    const i = c.bio.findIndex(b => (b.imp ?? 0) <= 1);
    c.bio.splice(i >= 0 ? i : 0, 1);
  }
}
