// 길 위의 풍경: 어느 층, 어떤 땅, 어느 계절을 걷고 있는가.
// 같은 '산적'이라도 사막에서는 약탈자가, 굴에서는 굴 도적떼가 나타난다.
import { TERRAIN, DESERT, TUNDRA, SWAMP, FOREST, DEEPFOREST, HILL, MOUNTAIN, SHALLOW } from '../data/terrain';
import type { Character, World } from './state';
import { seasonOf } from './state';

export type Ground = 'field' | 'forest' | 'hill' | 'desert' | 'snow' | 'swamp' | 'shore' | 'under' | 'demon' | 'sky';

export function groundOf(w: World, c: Character): Ground {
  if (c.l === 3) return 'under';
  if (c.l === 4) return 'demon';
  if (c.l <= 1) return 'sky';
  const L = w.layers[c.l];
  const t = L ? L.terrain[c.y * L.w + c.x] : -1;
  if (t === DESERT) return 'desert';
  if (t === TUNDRA) return 'snow';
  if (t === SWAMP) return 'swamp';
  if (t === FOREST || t === DEEPFOREST) return 'forest';
  if (t === HILL || t === MOUNTAIN) return 'hill';
  if (t === SHALLOW) return 'shore';
  return TERRAIN[t]?.name.includes('눈') ? 'snow' : 'field';
}

const ROAD: Record<Ground, string> = {
  field: '들길', forest: '숲길', hill: '산길', desert: '모랫길', snow: '눈길', swamp: '늪지의 둑길', shore: '바닷가 길', under: '굴길', demon: '잿빛 황야의 길', sky: '구름다리',
};
const BANDIT: Record<Ground, string> = {
  field: '복면을 쓴 자들이', forest: '나무 위에서 뛰어내린 자들이', hill: '바위 뒤에 숨어 있던 산적들이', desert: '낙타를 탄 약탈자들이',
  snow: '털가죽을 뒤집어쓴 자들이', swamp: '갈대숲에 숨어 있던 자들이', shore: '난파선 약탈꾼들이', under: '굴 도적떼가', demon: '떠돌이 악마들이', sky: '날개 달린 강도들이',
};
const INN: Record<Ground, string[]> = {
  field: ['길가에 낡은 여관 하나가 불을 밝히고 있다', '마을 어귀의 헛간 주인이 하룻밤 재워 주겠다고 한다'],
  forest: ['숲속 오두막에 나무꾼의 등불이 켜져 있다', '사냥꾼들이 쓰는 숲속 움막이 비어 있다'],
  hill: ['고갯마루에 돌로 지은 주막이 보인다', '양치기의 돌집에서 연기가 오른다'],
  desert: ['오아시스 곁에 대상들의 천막이 서 있다', '모래언덕 그늘에 옛 대상 숙소가 남아 있다'],
  snow: ['눈 속에 반쯤 묻힌 산장에서 연기가 오른다', '얼음 동굴 입구에 누군가 장작을 쌓아 두었다'],
  swamp: ['말뚝 위에 지은 늪지 주막이 보인다', '갈대로 엮은 어부의 오두막이 보인다'],
  shore: ['어부들이 묵어 가는 바닷가 주막이 보인다', '뒤집어 놓은 낡은 배 아래가 비바람을 막아 줄 것 같다'],
  under: ['버섯불을 켠 굴 주막이 보인다', '광부들이 쉬어 가는 갱도 쉼터가 보인다'],
  demon: ['유황 냄새 나는 길손 쉼터가 보인다', '식은 용암 동굴이 하룻밤 몸을 누일 만하다', '해골 장식을 단 악마 상인의 천막이 보인다'],
  sky: ['구름 위 정자에 쉬어 갈 자리가 보인다', '바람을 피할 하늘섬 바위 그늘이 보인다'],
};

export function road(w: World, c: Character): string { return ROAD[groundOf(w, c)]; }
export function bandits(w: World, c: Character): string { return BANDIT[groundOf(w, c)]; }
export function inn(w: World, c: Character, k = w.t): string { const a = INN[groundOf(w, c)]; return a[k % a.length]; }

/** 계절과 땅이 만드는 궂은 날씨 (없으면 null) */
export function badWeather(w: World, c: Character): string | null {
  const g = groundOf(w, c), s = seasonOf(w.t);
  if (g === 'under') return '굴 천장에서 돌이 우수수 떨어지기 시작하였다.';
  if (g === 'demon') return '잿빛 폭풍이 지평선을 삼키며 다가온다.';
  if (g === 'sky') return '발아래 구름이 갈라지며 거센 바람이 몰아친다.';
  if (g === 'desert') return s === 1 ? '한낮의 열기가 숨을 막는다. 물주머니가 가볍다.' : '모래 폭풍이 지평선을 삼키며 다가온다.';
  if (g === 'snow' || s === 3) return '눈보라가 몰아쳐 한 치 앞이 보이지 않는다.';
  if (s === 1) return '하늘이 갑자기 어두워지더니 장대비가 쏟아진다.';
  if (s === 2) return '짙은 가을 안개가 길을 지워 버렸다.';
  return '봄비에 불어난 개울이 길을 끊어 놓았다.';
}
