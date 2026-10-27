// 자원 인덱스
export const FOOD = 0, WOOD = 1, STONE = 2, ORE = 3, MANA = 4, GOLD = 5;
export const RES_COUNT = 6;
export const RES_NAMES = ['식량', '목재', '석재', '광석', '마나', '금'];
export const RES_COLORS = ['#9ad06a', '#b9874a', '#a9a9a9', '#d08a4a', '#8a9cff', '#f0d050'];

export interface TerrainDef {
  id: number;
  name: string;
  glyph: string;
  fg: string;
  bg: string;
  /** 칸당 월 생산량 [식량,목재,석재,광석,마나,금] */
  yields: number[];
  /** 걷는 종족 이동 비용. 0이면 걸어서 통과 불가 */
  move: number;
  /** 비행 종족이 통과 가능한지 (기본: move>0 이면 가능) */
  fly: boolean;
}

const T: TerrainDef[] = [];
function def(id: number, name: string, glyph: string, fg: string, bg: string, yields: number[], move: number, fly = true) {
  T[id] = { id, name, glyph, fg, bg, yields, move, fly };
}

// ── 지상
export const OCEAN = 0, SHALLOW = 1, PLAIN = 2, GRASS = 3, FOREST = 4, DEEPFOREST = 5, HILL = 6, MOUNTAIN = 7,
  DESERT = 8, TUNDRA = 9, SWAMP = 10, PEAK = 11;
def(OCEAN, '깊은 바다', '≈', '#2f5d9a', '#14294d', [0, 0, 0, 0, 0, 0], 0);
def(SHALLOW, '얕은 바다', '~', '#5d8fd0', '#1f4277', [0.6, 0, 0, 0, 0, 0], 5);
def(PLAIN, '평원', '.', '#b7d27a', '#4b6a2a', [3, 0.3, 0.2, 0, 0, 0], 1);
def(GRASS, '초원', '"', '#cfe08a', '#5b7b30', [2.4, 0.2, 0, 0, 0, 0.05], 1);
def(FOREST, '숲', '♣', '#5fb35a', '#244f20', [1.2, 3, 0, 0, 0.2, 0], 2);
def(DEEPFOREST, '깊은 숲', '♠', '#3f9a4c', '#163817', [1, 3, 0, 0, 1, 0], 3);
def(HILL, '언덕', 'n', '#c4a774', '#5e5133', [1, 0.5, 2, 1, 0, 0.1], 2);
def(MOUNTAIN, '산', '▲', '#cfcfcf', '#55565b', [0, 0, 3, 2, 0.2, 0.5], 4);
def(DESERT, '사막', '∴', '#ecd68e', '#9a8140', [0.2, 0, 0.5, 0.2, 0, 0.4], 2);
def(TUNDRA, '설원', '*', '#f2f6ff', '#8e9cae', [0.5, 0.3, 0.3, 0.2, 0.2, 0], 2);
def(SWAMP, '늪', '≡', '#7fa57a', '#33452e', [1, 0.5, 0, 0, 0.8, 0], 3);
def(PEAK, '만년설 봉우리', '▲', '#ffffff', '#858b96', [0, 0, 1, 0, 0.3, 0], 0);

// ── 지하
export const ROCK = 20, CAVE = 21, FUNGUS = 22, CRYSTAL = 23, OREVEIN = 24, UNDERLAKE = 25, LAVA = 26, CHASM = 27;
def(ROCK, '암반', '#', '#3d3731', '#191512', [0, 0, 0, 0, 0, 0], 0, false);
def(CAVE, '동굴', '·', '#8f7f6c', '#2d251f', [0.4, 0.1, 1, 0.3, 0, 0], 1);
def(FUNGUS, '버섯 숲', 'ϕ', '#d39be4', '#3b2442', [2.2, 0.8, 0, 0, 0.3, 0], 1.5);
def(CRYSTAL, '수정굴', '◊', '#9fe8ff', '#1d3a4a', [0, 0, 0.5, 0, 2.5, 0.5], 2);
def(OREVEIN, '광맥', '%', '#eba85a', '#3a2918', [0, 0, 1, 3, 0, 1], 2);
def(UNDERLAKE, '지하 호수', '~', '#5a86d0', '#132640', [0.8, 0, 0, 0, 0.3, 0], 0);
def(LAVA, '용암', '≈', '#ffb040', '#8a2a08', [0, 0, 0, 0.5, 0.5, 0], 0, false);
def(CHASM, '심연의 틈', ' ', '#000000', '#060508', [0, 0, 0, 0, 0, 0], 0);

// ── 하늘
export const AIR = 30, CLOUD = 31, ISLE = 32, STORM = 33;
def(AIR, '창공', ' ', '#ffffff', '#86b6e6', [0, 0, 0, 0, 0, 0], 0);
def(CLOUD, '구름 다리', '░', '#ffffff', '#bcd6f2', [0.3, 0, 0, 0, 0.5, 0], 2);
def(ISLE, '부유섬', '♣', '#7bd060', '#4a8a3a', [2, 1.2, 0.5, 0.3, 1, 0.2], 1);
def(STORM, '폭풍 지대', '§', '#f5ec7a', '#4b5372', [0, 0, 0, 0, 2.5, 0], 0);

// ── 천상
export const AETHER = 40, CLOUDHALL = 41, GARDEN = 42, SANCTUM = 43;
def(AETHER, '에테르', ' ', '#ffffff', '#dcd6f0', [0, 0, 0, 0, 0, 0], 0);
def(CLOUDHALL, '구름 대지', '░', '#fffbe6', '#cfc6a6', [1, 0.3, 0.5, 0, 1, 0.1], 1);
def(GARDEN, '빛의 정원', '✿', '#ffe270', '#a9bb84', [3, 1, 0, 0, 1.5, 0.1], 1);
def(SANCTUM, '성역', '✚', '#fff6c0', '#c2a24a', [0.5, 0, 1, 0, 4, 1], 1);

// ── 마계
export const ASH = 50, BRIMSTONE = 51, DLAVA = 52, OBSIDIAN = 53, BLOODMIRE = 54, ABYSS = 55;
def(ASH, '잿빛 황야', "'", '#9a8888', '#382626', [0.5, 0.1, 1, 0.3, 0.3, 0], 1);
def(BRIMSTONE, '유황 지대', ':', '#ead44a', '#5a4010', [0.2, 0, 0.5, 1.5, 1, 0.5], 2);
def(DLAVA, '용암강', '≈', '#ff7a2a', '#9c2008', [0, 0, 0, 0.5, 1, 0], 0);
def(OBSIDIAN, '흑요석 산', '▲', '#8a76b0', '#1c1530', [0, 0, 3, 2, 0.5, 0.3], 4);
def(BLOODMIRE, '핏빛 늪', '≡', '#e04858', '#4a1018', [1.6, 0.4, 0, 0, 2, 0], 2);
def(ABYSS, '심연', ' ', '#000000', '#030103', [0, 0, 0, 0, 0, 0], 0);

export const TERRAIN = T;
