import { fixJosa } from '../data/text';
import type { Character, Era, NewsCat, NewsItem, Pos, World } from './state';
import { yearOf } from './state';

export function addNews(
  w: World, text: string, imp: number, cat: NewsCat,
  opts: { pos?: Pos; chars?: number[]; facs?: number[] } = {},
): NewsItem {
  text = fixJosa(text);
  // 위치는 좌표만 남긴다 (인물·고을 객체를 통째로 물고 있으면 저장 파일이 수십 MB로 불어난다)
  const pos = opts.pos ? { l: opts.pos.l, x: opts.pos.x, y: opts.pos.y } : undefined;
  const n: NewsItem = { id: w.nextNewsId++, t: w.t, text, imp, cat, ...opts, pos };
  w.news.push(n);
  if (w.news.length > 6000) {
    // 사소한 소식부터 정리한다. 큰 사건(imp 4 이상)은 역사로 남긴다
    let cut = w.news.findIndex(x => x.imp <= 1);
    if (cut < 0) cut = w.news.findIndex(x => x.imp <= 2);
    if (cut < 0) cut = w.news.findIndex(x => x.imp <= 3);
    w.news.splice(cut >= 0 ? cut : 0, 1);
  }
  const era = w.eras[w.eras.length - 1];
  if (era) {
    era.counters[cat] = (era.counters[cat] || 0) + imp * imp;
    if (imp >= 4) {
      era.highlights.push(n.id);
      if (era.highlights.length > 40) era.highlights.shift();
    }
  }
  // 세력의 일대기: 아주 중요한 사건만 남긴다
  const major = imp >= 5 || (imp === 4 && !/도전하였다|강화를 맺고/.test(text))
    || (imp === 3 && /즉위|거듭났|추대|격하|멸망|독립|폐지|바벨탑|탑을 쌓|해방|왕조가 끝나고/.test(text));
  if (opts.facs && major) {
    for (const id of new Set(opts.facs)) {
      const f = w.factions[id];
      if (!f) continue;
      f.history ??= [];
      const last = f.history[f.history.length - 1];
      // 같은 달의 같은 일(암살과 그로 인한 죽음 등)은 하나만 남긴다
      if (last && last.t === w.t && (last.text === text || (/세상을 떠났다/.test(text) && last.imp >= imp))) continue;
      f.history.push({ t: w.t, text, imp });
      if (f.history.length > 50) {
        const i = f.history.findIndex(h => h.imp <= 3);
        f.history.splice(i >= 0 ? i : 1, 1);
      }
    }
  }
  // 관련 인물 일대기에 기록
  if (opts.chars && imp >= 3) {
    for (const id of opts.chars) {
      const c = w.chars[id];
      if (c && c.died < 0) pushBio(w, c, text, imp);
    }
  }
  return n;
}

export function charLog(w: World, c: Character, text: string, imp = 1): void {
  text = fixJosa(text);
  c.log.push({ t: w.t, text, imp });
  if (c.log.length > 160) c.log.splice(0, c.log.length - 160);
  if (imp >= 2) pushBio(w, c, text, imp);
}

function pushBio(w: World, c: Character, text: string, imp: number) {
  const last = c.bio[c.bio.length - 1];
  if (last && last.t === w.t && last.text === text) return;
  c.bio.push({ t: w.t, text, imp });
  // '나'의 일대기는 넉넉히 남긴다. 넘치면 계절 문구 같은 사소한 줄부터 지운다
  if (c.bio.length > (c.isPlayer ? 600 : 120)) {
    let i = c.bio.findIndex(b => (b.imp ?? 0) <= 1);
    if (i < 0) i = c.bio.findIndex(b => (b.imp ?? 0) <= 2);
    c.bio.splice(i >= 0 ? i : 0, 1);
  }
}

const ERA_NAMES: Record<string, string[]> = {
  war: ['철혈의 시대', '전란의 시대', '칼날의 시대', '피의 연대'],
  dark: ['암흑의 시대', '그림자의 시대', '마의 시대'],
  nature: ['재앙의 시대', '혹한의 시대', '시련의 시대'],
  growth: ['번영의 시대', '개척의 시대', '황금의 시대', '건국의 시대'],
  hero: ['영웅의 시대', '전설의 시대', '용사의 시대'],
  doom: ['종말의 전조', '황혼의 시대'],
  politics: ['왕관의 시대', '음모의 시대', '왕좌 다툼의 시대'],
  trade: ['교역의 시대', '황금 길의 시대'],
  life: ['평온의 시대'],
  player: ['평온의 시대'],
};

export function eraName(era: Era, idx: number): string {
  if (idx === 0 && era.end < 0 && Object.keys(era.counters).length < 3) return '여명의 시대';
  let best = 'life', bv = 0;
  const weight: Record<string, number> = { war: 0.8, dark: 1.3, nature: 1, growth: 0.7, hero: 1.4, doom: 2, politics: 0.8, trade: 0.9, life: 0.1, player: 0 };
  for (const k in era.counters) {
    const v = era.counters[k] * (weight[k] ?? 1);
    if (v > bv) { bv = v; best = k; }
  }
  const arr = ERA_NAMES[best] || ERA_NAMES.life;
  return arr[era.start % arr.length];
}

export function startEra(w: World): void {
  const prev = w.eras[w.eras.length - 1];
  if (prev) {
    prev.end = w.t;
    prev.name = eraName(prev, w.eras.length - 1);
    addNews(w, `${yearOf(w)}년, '${prev.name}'이 저물고 새 시대가 열렸다.`, 3, 'politics');
  }
  w.eras.push({ name: '', start: w.t, end: -1, counters: {}, highlights: [] });
}

/** 매달 호출: 시대 전환 판단 */
export function eraTick(w: World): void {
  const era = w.eras[w.eras.length - 1];
  const years = (w.t - era.start) / 12;
  if (years < 25) return;
  // 오래될수록, 굵직한 사건이 많을수록 전환 확률이 커진다
  const big = era.highlights.length;
  const p = (years > 90 ? 0.03 : 0.002) + Math.min(0.01, big * 0.0004);
  if (w.rngSim.chance(p)) startEra(w);
}

/** 최근 뉴스 중 중요도 기준 필터 */
export function topNews(w: World, sinceT: number, minImp: number, limit: number): NewsItem[] {
  const out: NewsItem[] = [];
  for (let i = w.news.length - 1; i >= 0 && out.length < limit * 4; i--) {
    const n = w.news[i];
    if (n.t < sinceT) break;
    if (n.imp >= minImp) out.push(n);
  }
  out.sort((a, b) => b.imp - a.imp || b.t - a.t);
  return out.slice(0, limit);
}
