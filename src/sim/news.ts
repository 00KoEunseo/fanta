import { fixJosa } from '../data/text';
import type { Character, Era, NewsCat, NewsItem, Pos, World } from './state';
import { yearOf } from './state';

/** 문장의 낱말 묶음 (숫자는 지운다): 같은 틀의 소식인지 견줄 때 쓴다 */
function words(text: string): Set<string> {
  // 괄호·인용 속 고유명은 빼고 견준다 (마왕탑 (옛 ○○의 탑)처럼 이름만 다른 같은 틀을 알아보도록)
  return new Set(text.replace(/\([^)]*\)|「[^」]*」|'[^']*'/g, '').replace(/\d+/g, '').split(/\s+/).filter(Boolean));
}
function similar(a: Set<string>, b: Set<string>): boolean {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both) >= 0.6;
}

/** 소식이 얼마나 눈에 띄어야 하는가.
 *  - 최상위(5)는 세상에서 처음 일어난 일에만 준다. 같은 틀의 일이 전에 있었으면 4로 낮춘다
 *  - 큰 소식(4)이 3년 안에 같은 틀로 되풀이되면 3으로 낮춘다 (용이 또 도시를 태웠다, 천군이 또 내려왔다…)
 *  봉인 붕괴·회복 표제(【봉인 …】)는 낮추지 않는다 */
function shownImp(w: World, text: string, imp: number, cat: NewsCat): number {
  if (imp < 4 || text.startsWith('【봉인')) return imp;
  const me = words(text);
  if (imp >= 5) {
    for (let i = w.news.length - 1; i >= 0; i--) {
      const n = w.news[i];
      if (n.imp >= 4 && n.cat === cat && similar(me, words(n.text))) return 4;
    }
    return imp;
  }
  for (let i = w.news.length - 1; i >= 0; i--) {
    const n = w.news[i];
    if (n.t < w.t - 36) break;
    if (n.imp >= 3 && n.cat === cat && similar(me, words(n.text))) return 3;
  }
  return imp;
}

export function addNews(
  w: World, text: string, imp: number, cat: NewsCat,
  opts: { pos?: Pos; chars?: number[]; facs?: number[] } = {},
): NewsItem {
  text = fixJosa(text);
  // 세력·인물의 기록에는 일 자체의 무게(baseImp)를, 소식 목록과 시대 판단에는 되풀이를 감안한 무게를 쓴다
  const baseImp = imp;
  imp = shownImp(w, text, imp, cat);
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
  const major = baseImp >= 5 || (baseImp === 4 && !/도전하였다|강화를 맺고/.test(text))
    || (baseImp === 3 && /즉위|거듭났|추대|격하|멸망|독립|폐지|바벨탑|탑을 쌓|해방|왕조가 끝나고|처음으로 조우/.test(text));
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
  if (opts.chars && baseImp >= 3) {
    for (const id of opts.chars) {
      const c = w.chars[id];
      if (c && c.died < 0) pushBio(w, c, text, baseImp);
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

/** 그 시대의 큰 소식에 가장 자주 나온 세력과 인물 */
function eraActors(w: World, era: Era, cat: string): { fac?: string; char?: string } {
  const ids = new Set(era.highlights);
  const fc = new Map<number, number>(), cc = new Map<number, number>();
  for (let i = w.news.length - 1; i >= 0; i--) {
    const n = w.news[i];
    if (n.t < era.start) break;
    if (!ids.has(n.id) || n.cat !== cat) continue;
    for (const f of n.facs ?? []) fc.set(f, (fc.get(f) ?? 0) + 1);
    for (const c of n.chars ?? []) cc.set(c, (cc.get(c) ?? 0) + 1);
  }
  const top = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  const f = w.factions[top(fc) ?? -1], c = w.chars[top(cc) ?? -1];
  return { fac: f ? (f.baseName || f.name) : undefined, char: c?.name };
}

// 그 시대를 이끈 이름으로 짓는 시대 이름 (k: 시대가 시작된 달로 말투를 고른다)
const ERA_PROPER: Record<string, (a: { fac?: string; char?: string }, k: number) => string | null> = {
  war: (a, k) => a.fac ? [`${a.fac} 패권의 시대`, `${a.fac} 정복기`, `${a.fac}의 깃발 아래`, `${a.fac} 전쟁기`][k % 4] : null,
  dark: (a, k) => a.char ? [`${a.char}의 그림자`, `${a.char}의 밤`][k % 2] : a.fac ? `${a.fac}의 어둠` : null,
  nature: a => a.fac ? `${a.fac}의 시련` : null,
  growth: (a, k) => a.fac ? [`${a.fac} 융성기`, `${a.fac}의 봄`][k % 2] : null,
  hero: a => a.char ? `${a.char}의 시대` : null,
  doom: a => a.char ? `${a.char}의 황혼` : null,
  politics: (a, k) => a.fac ? [`${a.fac} 왕좌 다툼기`, `${a.fac}의 왕관 아래`][k % 2] : null,
  trade: a => a.fac ? `${a.fac} 상단의 시대` : null,
  life: () => null, player: () => null,
};
const ORDINAL = ['두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째', '일곱 번째'];

export function eraName(w: World, era: Era, idx: number): string {
  if (idx === 0 && era.end < 0 && Object.keys(era.counters).length < 3) return '여명의 시대';
  let best = 'life', bv = 0;
  const weight: Record<string, number> = { war: 0.8, dark: 1.3, nature: 1, growth: 0.7, hero: 1.4, doom: 2, politics: 0.8, trade: 0.9, life: 0.1, player: 0 };
  for (const k in era.counters) {
    const v = era.counters[k] * (weight[k] ?? 1);
    if (v > bv) { bv = v; best = k; }
  }
  const arr = ERA_NAMES[best] || ERA_NAMES.life;
  const used = new Set(w.eras.filter(e => e !== era && e.name).map(e => e.name));
  // 1) 아직 쓰지 않은 이름
  for (let k = 0; k < arr.length; k++) { const n = arr[(era.start + k) % arr.length]; if (!used.has(n)) return n; }
  // 2) 그 시대를 이끈 이름으로
  const proper = (ERA_PROPER[best] ?? (() => null))(eraActors(w, era, best), era.start);
  if (proper && !used.has(proper)) return proper;
  // 3) 그래도 겹치면 몇 번째인지 밝힌다
  const base = arr[era.start % arr.length];
  for (const o of ORDINAL) { const n = `${o} ${base}`; if (!used.has(n)) return n; }
  return base;
}

/** 연대기의 한 장을 엮는다: 그 시대의 가장 큰 일 서너 가지와, 일어나고 무너진 나라의 수 */
function compileChapter(w: World, era: Era): string[] {
  const ids = new Set(era.highlights);
  const inEra = w.news.filter(n => n.t >= era.start && n.t <= era.end);
  const big = inEra.filter(n => ids.has(n.id)).sort((a, b) => b.imp - a.imp || a.t - b.t).slice(0, 4).sort((a, b) => a.t - b.t);
  const first = (t: string) => { const m = t.match(/^.+?[.!?](?=\s|$)/); return (m ? m[0] : t).replace(/^【[^】]*】\s*/, ''); };
  const lines = big.map(n => `${yearOf(w, n.t)}년, ${first(n.text)}`);
  const fell = inEra.filter(n => /멸망하였다/.test(n.text)).length;
  const rose = inEra.filter(n => /왕국을 세웠다|제국을 선포하였다|독립하였다|깃발을 올렸다/.test(n.text)).length;
  const yrs = Math.round((era.end - era.start) / 12);
  lines.push(`${yrs}년 동안 ${rose ? `나라 ${rose}곳이 일어나고 ` : ''}${fell ? `${fell}곳이 무너졌다.` : '무너진 나라는 없었다.'}`);
  return lines;
}

export function startEra(w: World): void {
  const prev = w.eras[w.eras.length - 1];
  if (prev) {
    prev.end = w.t;
    prev.name = eraName(w, prev, w.eras.length - 1);
    prev.chapter = compileChapter(w, prev);
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
