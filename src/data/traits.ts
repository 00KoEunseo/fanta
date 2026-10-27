// 성격 (0..100)
export const COURAGE = 0, AMBITION = 1, GREED = 2, COMPASSION = 3, LOYALTY = 4, FAITH = 5,
  CURIOSITY = 6, SOCIAL = 7, PRUDENCE = 8, PRIDE = 9;
export const TRAIT_COUNT = 10;
export const TRAIT_NAMES = ['용기', '야망', '탐욕', '자비', '충성', '신앙', '호기심', '사교성', '신중함', '명예욕'];
/** 낮을 때 / 높을 때 형용사 */
export const TRAIT_ADJ: [string, string][] = [
  ['겁 많은', '용맹한'], ['욕심 없는', '야심찬'], ['청렴한', '탐욕스러운'], ['잔혹한', '자비로운'],
  ['변덕스러운', '충직한'], ['불경한', '경건한'], ['무심한', '호기심 많은'], ['고독한', '사교적인'],
  ['무모한', '신중한'], ['소탈한', '오만한'],
];

// 자질 (숨겨진 잠재력, 0..100)
export const APT_KING = 0, APT_HERO = 1, APT_DEMONLORD = 2, APT_SAGE = 3, APT_MERCHANT = 4, APT_TRAITOR = 5;
export const APT_COUNT = 6;
export const APT_NAMES = ['왕의 자질', '용사의 자질', '마왕의 자질', '현자의 자질', '거상의 자질', '배신자의 기질'];

export interface Stats {
  might: number;
  intellect: number;
  magic: number;
  command: number;
  charisma: number;
  health: number;
}
export const STAT_NAMES: Record<keyof Stats, string> = {
  might: '무력', intellect: '지력', magic: '마력', command: '통솔', charisma: '매력', health: '건강',
};

export type Role = '평민' | '백수' | '전사' | '기사' | '마법사' | '학자' | '상인' | '성직자' | '사냥꾼' | '장인' | '모험가' | '도적' | '음유시인'
  | '농부' | '광부' | '대장장이' | '치유사' | '연금술사' | '선원'
  | '드루이드' | '주술사' | '암살자' | '사령술사' | '함정꾼' | '조련사' | '노예';
export const ROLES: Role[] = ['전사', '기사', '마법사', '학자', '상인', '성직자', '사냥꾼', '장인', '모험가', '도적', '음유시인',
  '농부', '광부', '대장장이', '치유사', '연금술사', '선원', '드루이드', '주술사', '암살자', '사령술사', '함정꾼', '조련사'];

/** 종족마다 가질 수 있는 직업 */
export const RACE_JOBS: Record<string, Role[]> = {
  human: ['전사', '기사', '마법사', '학자', '상인', '성직자', '사냥꾼', '장인', '모험가', '도적', '음유시인', '농부', '광부', '대장장이', '치유사', '연금술사', '선원'],
  elf: ['전사', '마법사', '학자', '사냥꾼', '장인', '모험가', '음유시인', '치유사', '드루이드', '연금술사', '상인'],
  darkelf: ['전사', '마법사', '암살자', '상인', '조련사', '도적', '사령술사', '연금술사', '학자', '성직자'],
  dwarf: ['전사', '광부', '대장장이', '장인', '상인', '학자', '성직자', '치유사', '모험가', '연금술사', '농부'],
  goblin: ['전사', '도적', '함정꾼', '광부', '농부', '주술사', '장인', '상인', '조련사', '모험가'],
  kobold: ['함정꾼', '광부', '장인', '주술사', '성직자', '농부', '도적', '대장장이'],
  orc: ['전사', '사냥꾼', '주술사', '대장장이', '조련사', '도적', '농부', '모험가', '광부'],
  beast: ['전사', '사냥꾼', '주술사', '드루이드', '장인', '음유시인', '농부', '모험가', '치유사', '선원', '상인'],
  dragon: ['모험가'],
  majin: ['전사', '기사', '마법사', '사령술사', '암살자', '조련사', '학자', '상인', '연금술사', '대장장이'],
  angel: ['기사', '성직자', '치유사', '학자', '마법사', '음유시인'],
  undead: ['전사', '사령술사', '마법사', '장인', '광부', '학자'],
  demon: ['전사', '조련사', '주술사', '암살자', '도적', '대장장이', '사령술사'],
};

/** 성격 중 두드러진 특징 2개를 형용사로 */
export function describeTraits(traits: number[], count = 2): string[] {
  const scored = traits.map((v, i) => ({ i, d: Math.abs(v - 50), hi: v >= 50 }));
  scored.sort((a, b) => b.d - a.d);
  return scored.slice(0, count).filter(s => s.d >= 15).map(s => TRAIT_ADJ[s.i][s.hi ? 1 : 0]);
}
