import * as Tr from './terrain';

export type RaceKey =
  | 'human' | 'elf' | 'darkelf' | 'dwarf' | 'goblin' | 'kobold' | 'orc'
  | 'beast' | 'dragon' | 'majin' | 'angel' | 'undead' | 'demon';

export const L_HEAVEN = 0, L_SKY = 1, L_SURFACE = 2, L_UNDER = 3, L_DEMON = 4;

export type Alignment = 'light' | 'dark' | 'neutral';

export interface RaceDef {
  key: RaceKey;
  name: string;
  glyph: string;
  color: string;
  layers: number[];
  /** 지형 선호도 (정착 위치 선택) */
  prefer: Record<number, number>;
  /** 이동 비용 덮어쓰기 */
  moveOverride: Record<number, number>;
  lifespan: [number, number];
  adult: number;
  /** 월 인구 증가율 (식량 충분 시) */
  growth: number;
  /** 인구 20명당 월 소비 [식량,목재,석재,광석,마나,금] */
  needs: number[];
  /** 생산 보정 */
  prodMul: number[];
  flying: boolean;
  aggression: number;
  trade: number;
  might: number;
  magic: number;
  align: Alignment;
  startFactions: number;
  startPop: [number, number];
  /** 자질 보정 [왕,용사,마왕,현자,상인,배신] */
  aptBias: number[];
  /** 성격 보정 (traits 인덱스 → 값) */
  traitBias: Record<number, number>;
  settlementTiers: string[];
  titles: string[];
  factionPatterns: string[];
  noPop?: boolean;
}

const R = {} as Record<RaceKey, RaceDef>;
function race(d: RaceDef) { R[d.key] = d; }

const baseNeeds = [1, 0.1, 0.05, 0.03, 0, 0.01];

race({
  key: 'human', name: '인간', glyph: 'H', color: '#f0c674', layers: [L_SURFACE],
  prefer: { [Tr.PLAIN]: 3, [Tr.GRASS]: 3, [Tr.HILL]: 1, [Tr.FOREST]: 1 },
  moveOverride: {}, lifespan: [64, 12], adult: 16, growth: 0.0045,
  needs: baseNeeds, prodMul: [1.1, 1, 1, 1, 0.8, 1.1], flying: false,
  aggression: 0.55, trade: 0.7, might: 1, magic: 0.6, align: 'light', startFactions: 3, startPop: [130, 220],
  aptBias: [5, 10, -5, 0, 5, 3], traitBias: {},
  settlementTiers: ['야영지', '마을', '도시', '성채 도시', '왕도'],
  titles: ['장로', '족장', '왕', '황제'],
  factionPatterns: ['{X} 일족', '{X} 공국', '{X} 왕국', '{X} 제국'],
});
race({
  key: 'elf', name: '엘프', glyph: 'E', color: '#7fe07f', layers: [L_SURFACE],
  prefer: { [Tr.DEEPFOREST]: 4, [Tr.FOREST]: 3 },
  moveOverride: { [Tr.FOREST]: 1, [Tr.DEEPFOREST]: 1 }, lifespan: [420, 80], adult: 40, growth: 0.0026,
  needs: [0.8, 0.05, 0.02, 0.01, 0.15, 0.01], prodMul: [1, 0.8, 0.8, 0.6, 1.6, 0.9], flying: false,
  aggression: 0.3, trade: 0.4, might: 1.1, magic: 1.4, align: 'light', startFactions: 2, startPop: [160, 230],
  aptBias: [0, 5, -10, 15, -5, -3], traitBias: { 3: 10, 6: 10 },
  settlementTiers: ['숲속 쉼터', '나무 마을', '숲의 도시', '세계수 성', '숲의 왕도'],
  titles: ['장로', '대족장', '엘프왕', '숲의 대왕'],
  factionPatterns: ['{X}의 숲', '{X} 숲의회', '{X} 엘프 왕국', '{X} 대왕국'],
});
race({
  key: 'darkelf', name: '다크엘프', glyph: 'e', color: '#b48be8', layers: [L_UNDER],
  prefer: { [Tr.CRYSTAL]: 3, [Tr.FUNGUS]: 2, [Tr.CAVE]: 2 },
  moveOverride: {}, lifespan: [350, 70], adult: 40, growth: 0.0026,
  needs: [0.8, 0.05, 0.05, 0.03, 0.12, 0.02], prodMul: [1, 0.8, 1, 1, 1.5, 1.1], flying: false,
  aggression: 0.7, trade: 0.4, might: 1.15, magic: 1.3, align: 'dark', startFactions: 1, startPop: [100, 160],
  aptBias: [5, -5, 10, 10, 0, 15], traitBias: { 1: 10, 3: -15 },
  settlementTiers: ['은신처', '거미굴 마을', '그림자 도시', '흑요 성채', '그림자 왕도'],
  titles: ['대모', '사제장', '그림자 여왕', '심연의 여제'],
  factionPatterns: ['{X} 가문', '{X} 사제회', '{X} 그림자 왕국', '{X} 심연 제국'],
});
race({
  key: 'dwarf', name: '드워프', glyph: 'D', color: '#e8a050', layers: [L_UNDER],
  prefer: { [Tr.OREVEIN]: 4, [Tr.CAVE]: 2, [Tr.CRYSTAL]: 1 },
  moveOverride: { [Tr.MOUNTAIN]: 2, [Tr.HILL]: 1 }, lifespan: [240, 40], adult: 30, growth: 0.003,
  needs: [1, 0.1, 0.1, 0.1, 0, 0.03], prodMul: [0.9, 0.8, 1.4, 1.6, 0.7, 1.3], flying: false,
  aggression: 0.45, trade: 0.8, might: 1.3, magic: 0.6, align: 'light', startFactions: 2, startPop: [110, 180],
  aptBias: [5, 5, -10, 0, 10, -5], traitBias: { 4: 15, 8: 10 },
  settlementTiers: ['채굴 야영지', '굴 마을', '석조 도시', '산중 요새', '지하 대왕도'],
  titles: ['씨족장', '영주', '산의 왕', '대왕'],
  factionPatterns: ['{X} 씨족', '{X} 영지', '{X} 산왕국', '{X} 대왕국'],
});
race({
  key: 'goblin', name: '고블린', glyph: 'g', color: '#a8d43a', layers: [L_UNDER],
  prefer: { [Tr.FUNGUS]: 3, [Tr.CAVE]: 2 },
  moveOverride: {}, lifespan: [38, 8], adult: 10, growth: 0.009,
  needs: [1, 0.05, 0.02, 0.03, 0, 0.01], prodMul: [1, 1, 0.8, 0.9, 0.6, 0.8], flying: false,
  aggression: 0.8, trade: 0.3, might: 0.6, magic: 0.5, align: 'dark', startFactions: 2, startPop: [120, 200],
  aptBias: [-5, -10, 5, -5, 5, 20], traitBias: { 2: 15, 3: -10, 8: -15 },
  settlementTiers: ['소굴', '고블린 굴', '고블린 마을', '고블린 요새', '고블린 왕굴'],
  titles: ['두목', '족장', '고블린 왕', '고블린 대왕'],
  factionPatterns: ['{X} 패거리', '{X} 부족', '{X} 고블린 왕국', '{X} 대왕국'],
});
race({
  key: 'kobold', name: '코볼트', glyph: 'k', color: '#df7a52', layers: [L_UNDER],
  prefer: { [Tr.OREVEIN]: 2, [Tr.CRYSTAL]: 2, [Tr.CAVE]: 2 },
  moveOverride: {}, lifespan: [34, 7], adult: 8, growth: 0.01,
  needs: [0.9, 0.05, 0.05, 0.05, 0, 0.01], prodMul: [0.9, 0.8, 1.1, 1.3, 0.8, 1], flying: false,
  aggression: 0.45, trade: 0.5, might: 0.5, magic: 0.6, align: 'neutral', startFactions: 2, startPop: [120, 200],
  aptBias: [-5, -5, 0, 0, 5, 5], traitBias: { 4: 10, 5: 10 },
  settlementTiers: ['굴', '함정굴', '코볼트 마을', '용의 신전굴', '코볼트 왕굴'],
  titles: ['우두머리', '족장', '코볼트 왕', '용의 대사제'],
  factionPatterns: ['{X} 굴족', '{X} 부족', '{X} 코볼트 왕국', '{X} 용신국'],
});
race({
  key: 'orc', name: '오크', glyph: 'O', color: '#d0503e', layers: [L_SURFACE],
  prefer: { [Tr.HILL]: 3, [Tr.PLAIN]: 1, [Tr.DESERT]: 2, [Tr.TUNDRA]: 2 },
  moveOverride: { [Tr.HILL]: 1 }, lifespan: [48, 9], adult: 13, growth: 0.006,
  needs: [1.2, 0.1, 0.03, 0.08, 0, 0.01], prodMul: [0.9, 1, 1, 1.2, 0.5, 0.8], flying: false,
  aggression: 0.95, trade: 0.25, might: 1.4, magic: 0.4, align: 'dark', startFactions: 2, startPop: [120, 190],
  aptBias: [5, 0, 5, -10, -5, 0], traitBias: { 0: 15, 3: -15, 8: -10 },
  settlementTiers: ['천막', '부족 촌락', '전쟁 마을', '피의 요새', '대족장의 본진'],
  titles: ['우두머리', '족장', '대족장', '워로드'],
  factionPatterns: ['{X} 무리', '{X} 부족', '{X} 대부족', '{X} 호드'],
});
race({
  key: 'beast', name: '수인', glyph: 'B', color: '#d8aa66', layers: [L_SURFACE],
  prefer: { [Tr.FOREST]: 3, [Tr.GRASS]: 3, [Tr.SWAMP]: 1 },
  moveOverride: { [Tr.FOREST]: 1 }, lifespan: [58, 10], adult: 14, growth: 0.005,
  needs: [1.1, 0.08, 0.02, 0.02, 0, 0.01], prodMul: [1.2, 1, 0.8, 0.7, 0.9, 0.8], flying: false,
  aggression: 0.5, trade: 0.5, might: 1.2, magic: 0.7, align: 'neutral', startFactions: 2, startPop: [110, 180],
  aptBias: [0, 5, -5, 0, -5, -5], traitBias: { 0: 10, 6: -5, 7: 10 },
  settlementTiers: ['사냥 야영지', '부족 마을', '수인 도시', '야수의 성', '야수왕의 도읍'],
  titles: ['장로', '족장', '수인왕', '야수 대왕'],
  factionPatterns: ['{X} 무리', '{X} 부족연합', '{X} 수인 왕국', '{X} 야수 제국'],
});
race({
  key: 'dragon', name: '용', glyph: 'Ð', color: '#ff5a4a', layers: [L_SKY, L_SURFACE],
  prefer: { [Tr.MOUNTAIN]: 3, [Tr.ISLE]: 3, [Tr.PEAK]: 2 },
  moveOverride: {}, lifespan: [2500, 400], adult: 100, growth: 0,
  needs: [0, 0, 0, 0, 0, 0], prodMul: [1, 1, 1, 1, 1, 1], flying: true,
  aggression: 0.6, trade: 0.1, might: 30, magic: 3, align: 'neutral', startFactions: 0, startPop: [0, 0],
  aptBias: [0, -30, 10, 10, -10, 0], traitBias: { 1: 20, 2: 25 },
  settlementTiers: ['둥지', '둥지', '둥지', '둥지', '둥지'],
  titles: ['용', '용', '용왕', '용황'],
  factionPatterns: ['{X}', '{X}', '{X}', '{X}'], noPop: true,
});
race({
  key: 'majin', name: '마족', glyph: 'M', color: '#b84ee0', layers: [L_DEMON],
  prefer: { [Tr.BLOODMIRE]: 3, [Tr.ASH]: 2, [Tr.BRIMSTONE]: 2 },
  moveOverride: {}, lifespan: [480, 90], adult: 30, growth: 0.0026,
  needs: [0.9, 0.05, 0.05, 0.05, 0.1, 0.02], prodMul: [1, 0.8, 1, 1.2, 1.4, 1], flying: false,
  aggression: 0.8, trade: 0.3, might: 1.5, magic: 1.4, align: 'dark', startFactions: 2, startPop: [100, 170],
  aptBias: [5, -20, 25, 5, 0, 10], traitBias: { 1: 15, 3: -10, 9: 10 },
  settlementTiers: ['마굴', '마족 촌', '마도시', '마성', '마왕성'],
  titles: ['수장', '마공', '마족왕', '마제'],
  factionPatterns: ['{X} 마족령', '{X} 마공국', '{X} 마국', '{X} 마제국'],
});
race({
  key: 'angel', name: '천사', glyph: 'A', color: '#fff3a8', layers: [L_HEAVEN],
  prefer: { [Tr.SANCTUM]: 4, [Tr.GARDEN]: 3, [Tr.CLOUDHALL]: 2 },
  moveOverride: {}, lifespan: [300, 1], adult: 50, growth: 0,
  needs: [0.4, 0.02, 0.02, 0.02, 0.2, 0.01], prodMul: [1, 1, 1, 1, 1.6, 1], flying: true,
  aggression: 0.35, trade: 0.3, might: 4, magic: 3, align: 'light', startFactions: 1, startPop: [90, 110],
  aptBias: [5, 10, -30, 15, -10, -15], traitBias: { 3: 20, 5: 25, 4: 10 },
  settlementTiers: ['성소', '빛의 마을', '천상 도시', '천공 성채', '천상의 옥좌'],
  titles: ['천사장', '대천사', '치천사', '천군장'],
  factionPatterns: ['{X} 성가대', '{X} 천사단', '{X} 천군', '{X} 천상왕국'],
});
race({
  key: 'undead', name: '언데드', glyph: 'U', color: '#9fb4b0', layers: [L_SURFACE, L_UNDER],
  prefer: { [Tr.SWAMP]: 3, [Tr.TUNDRA]: 1, [Tr.CAVE]: 1 },
  moveOverride: { [Tr.SWAMP]: 1 }, lifespan: [3000, 300], adult: 0, growth: 0.0012,
  needs: [0, 0.02, 0.05, 0.03, 0.2, 0], prodMul: [0, 0.5, 1, 1, 1.5, 1], flying: false,
  aggression: 0.8, trade: 0.05, might: 0.9, magic: 1.2, align: 'dark', startFactions: 1, startPop: [100, 150],
  aptBias: [0, -30, 20, 10, -10, 5], traitBias: { 3: -25, 7: -20 },
  settlementTiers: ['묘지', '망자의 마을', '사령 도시', '해골 성채', '죽음의 왕좌'],
  titles: ['리치', '망령 군주', '망자의 왕', '죽음의 황제'],
  factionPatterns: ['{X} 망령단', '{X} 사령국', '{X} 망자의 왕국', '{X} 죽음의 제국'],
});
race({
  key: 'demon', name: '악마', glyph: 'd', color: '#ff3a66', layers: [L_DEMON],
  prefer: { [Tr.BRIMSTONE]: 3, [Tr.BLOODMIRE]: 2, [Tr.ASH]: 2 },
  moveOverride: {}, lifespan: [700, 120], adult: 20, growth: 0.003,
  needs: [0.8, 0.02, 0.03, 0.05, 0.12, 0.01], prodMul: [0.9, 0.6, 1, 1.2, 1.3, 1], flying: false,
  aggression: 1, trade: 0.1, might: 1.6, magic: 1.2, align: 'dark', startFactions: 2, startPop: [110, 170],
  aptBias: [0, -30, 30, -5, -10, 20], traitBias: { 2: 15, 3: -30, 1: 10 },
  settlementTiers: ['소환진', '악마 소굴', '불지옥 마을', '지옥 요새', '불타는 옥좌'],
  titles: ['두목', '악마공', '악마군주', '대악마'],
  factionPatterns: ['{X} 무리', '{X} 군세', '{X} 군단', '{X} 대군단'],
});

export const RACES = R;
export const RACE_KEYS = Object.keys(R) as RaceKey[];
export const POP_RACES = RACE_KEYS.filter(k => !R[k].noPop);

/** 종족 간 기본 우호도 (-100..100) */
export function raceAffinity(a: RaceKey, b: RaceKey): number {
  if (a === b) return 25;
  const key = [a, b].sort().join('|');
  const special: Record<string, number> = {
    'darkelf|elf': -70, 'dwarf|goblin': -60, 'dwarf|kobold': -30, 'dwarf|elf': 10, 'elf|human': 25,
    'dwarf|human': 25, 'human|orc': -40, 'elf|orc': -50, 'goblin|orc': 15, 'goblin|kobold': -10,
    'angel|demon': -100, 'angel|majin': -80, 'angel|undead': -90, 'demon|majin': -10, 'majin|undead': 10,
    'beast|human': 0, 'beast|elf': 20, 'beast|orc': -10, 'darkelf|majin': 20, 'darkelf|dwarf': -40,
    'demon|undead': 0, 'human|undead': -70, 'elf|undead': -70, 'dwarf|undead': -60, 'beast|undead': -60,
  };
  if (special[key] !== undefined) return special[key];
  const ra = R[a].align, rb = R[b].align;
  if (ra === rb) return ra === 'dark' ? 0 : 15;
  if (ra === 'neutral' || rb === 'neutral') return -10;
  return -45;
}
