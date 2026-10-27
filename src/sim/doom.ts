import { RACES } from '../data/races';
import { addNews } from './news';
import { epidemicActive } from './disease';
import { leviathanActive } from './sea';
import type { World } from './state';

export const SEAL_NAMES = [
  '마왕 강림',
  '심해의 분노',
  '천상 성역 함락',
  '세계수 고사',
  '고대 용의 분노',
  '대역병 창궐',
  '차원문 대개방',
];
/** 봉인의 이름은 한 번 무너지는 것을 본 뒤에야 알려진다 */
export function sealVisible(w: World, i: number): boolean {
  return !!w.doom.seals[i] || !!w.doom.seen?.[i];
}
export function sealTotal(_w: World): number {
  return 7;
}

const BREAK_TEXT = [
  '첫 번째 봉인 — 마왕이 왕좌에 앉았다.',
  '두 번째 봉인 — 심해의 분노. 대륙만 한 심연의 군주가 바다 밑에서 눈을 떴다.',
  '세 번째 봉인 — 천상의 성역이 무너졌다.',
  '네 번째 봉인 — 세계수가 쓰러졌다.',
  '다섯 번째 봉인 — 고대의 용이 깨어나 하늘을 지배한다.',
  '여섯 번째 봉인 — 대역병이 대지를 뒤덮었다.',
  '일곱 번째 봉인 — 마계로 통하는 문 넷이 활짝 열렸다.',
];

const OMENS = [
  '',
  '까마귀 떼가 남쪽으로 날아간다.',
  '밤하늘에 붉은 혜성이 걸렸다.',
  '우물물이 피처럼 붉게 물들었다는 소문이 돈다.',
  '예언자들이 같은 꿈을 꾸기 시작하였다: 무너지는 하늘.',
  '태양이 사흘 동안 떠오르지 않았다.',
  '죽은 자들이 무덤 속에서 속삭인다.',
  '세계의 끝이 문턱에 다다랐다.',
];

export function evalSeals(w: World): boolean[] {
  const s: boolean[] = [];
  s[0] = w.demonLord >= 0;
  s[1] = leviathanActive(w);
  const sanctum = w.settlements.find(x => x.flags.includes('sanctum'));
  s[2] = !!sanctum && sanctum.alive && RACES[w.factions[sanctum.faction]?.race ?? 'angel'].align === 'dark';
  const T = w.worldTree;
  s[3] = !!T && (!T.alive || T.growth < 100);
  s[4] = w.chars.some(c => c.died < 0 && c.ancient);
  s[5] = epidemicActive(w);
  s[6] = w.portals.filter(p => p.kind === 'rift' && p.open).length >= 4;
  return s;
}

export function brokenCount(w: World): number {
  return w.doom.seals.filter(Boolean).length;
}

export function pDoomMonth(w: World): number {
  const n = brokenCount(w);
  if (n < 4) return 0;
  // 넷이 겹쳐도 세계는 쉽게 무너지지 않는다. 다섯, 여섯이 겹칠수록 급격히 위험해진다
  return 0.00002 * Math.pow(5, n - 4);
}

export function omen(w: World): string {
  return OMENS[Math.min(OMENS.length - 1, brokenCount(w))];
}

export function doomTick(w: World): void {
  const now = evalSeals(w);
  for (let i = 0; i < now.length; i++) {
    if (now[i] && !w.doom.seals[i]) {
      const first = !w.doom.seen?.[i];
      w.doom.seals[i] = true;
      w.doom.seen ??= [];
      w.doom.seen[i] = true;
      const text = first ? `이름조차 알려지지 않았던 봉인이 깨지며 그 이름이 드러났다. ${BREAK_TEXT[i]}` : BREAK_TEXT[i];
      addNews(w, `【봉인 붕괴】 ${text} (${brokenCount(w)}/${sealTotal(w)})`, 5, 'doom');
      // 화면 전체 연출은 그 봉인이 처음 깨질 때만. 그 뒤로는 붉은 소식으로만 남는다
      if (first) w.cinematics.push({ kind: 'break', seal: i, title: SEAL_NAMES[i], text });
    } else if (!now[i] && w.doom.seals[i]) {
      w.doom.seals[i] = false;
      addNews(w, `【봉인 회복】 '${SEAL_NAMES[i]}'의 위기가 지나갔다. (${brokenCount(w)}/${sealTotal(w)})`, 4, 'doom');
      w.doom.restored ??= [];
      if (!w.doom.restored[i]) w.doom.restored[i] = true;
      else continue;
      w.cinematics.push({ kind: 'restore', seal: i, title: SEAL_NAMES[i], text: `'${SEAL_NAMES[i]}'의 위기가 지나갔다.` });
    }
  }
  w.stats.maxBroken = Math.max(w.stats.maxBroken ?? 0, brokenCount(w));
  const p = pDoomMonth(w);
  if (p > 0 && w.rngSim.chance(p)) {
    w.doom.ended = true;
    const broken = SEAL_NAMES.filter((_, i) => w.doom.seals[i]);
    w.doom.endText = `${broken.join(', ')}. 우연과 우연이 겹쳐 마침내 세계의 기둥이 무너졌다. 하늘이 갈라지고 대지가 마계로 가라앉았다. 이 세계의 역사는 여기서 끝을 맺는다.`;
    addNews(w, `【세계 멸망】 ${w.doom.endText}`, 5, 'doom');
    w.cinematics.push({ kind: 'end', seal: -1, title: '세계의 종말', text: w.doom.endText });
  }
}
