// 서로를 불러오면 고리가 생기는 모듈끼리 함수를 건네는 자리 (아무것도 불러오지 않는다)
import type { Faction, World } from './state';

export const hooks = {
  /** 강화 (factions.ts가 채운다) */
  makePeace: (_w: World, _a: Faction, _b: Faction): void => {},
};
