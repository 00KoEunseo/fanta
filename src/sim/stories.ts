// 지금 세상에서 벌어지고 있는 큰 이야기들: 전쟁, 마왕의 치세, 깨어난 고대 용, 대역병, 토벌대, 심연의 군주.
// 매달 기록부를 갱신해 언제 시작되었는지 기억하고, 끝나면 결말 한 줄을 남긴다. 난수를 쓰지 않는다.
import type { Pos, World } from './state';
import { yearOf } from './state';
import { fixJosa } from '../data/text';

export type StoryKind = 'war' | 'dl' | 'dragon' | 'plague' | 'party' | 'abyss';
export interface StoryView { id: string; kind: StoryKind; title: string; since: number; lines: string[]; pos?: Pos; weight: number }
export interface StoryEnd { id: string; kind: StoryKind; title: string; t0: number; t1: number; end: string }
export interface StoryBook { open: Record<string, { t: number; title: string; kind: StoryKind }>; ended: StoryEnd[] }

const ICON: Record<StoryKind, string> = { war: '⚔', dl: '♛', dragon: '🐉', plague: '☣', party: '⚑', abyss: '🌊' };
export const storyIcon = (k: StoryKind) => ICON[k];

const yrs = (w: World, t: number) => Math.max(0, Math.floor((w.t - t) / 12));
const capital = (w: World, fid: number) => { const f = w.factions[fid]; return f ? w.settlements[f.capital] : undefined; };

/** 지금 이어지고 있는 이야기들 (기록부의 시작 시점을 쓴다) */
export function currentStories(w: World): StoryView[] {
  const book = w.storyBook;
  const since = (id: string) => book?.open[id]?.t ?? w.t;
  const out: StoryView[] = [];
  const countNews = (t0: number, test: (text: string, chars: number[], facs: number[]) => boolean) => {
    let n = 0;
    for (let i = w.news.length - 1; i >= 0; i--) { const x = w.news[i]; if (x.t < t0) break; if (test(x.text, x.chars ?? [], x.facs ?? [])) n++; }
    return n;
  };
  // 마왕의 치세
  const dl = w.demonLord >= 0 ? w.chars[w.demonLord] : null;
  if (dl && dl.died < 0) {
    const id = `dl:${dl.id}`, t0 = since(id);
    const vassals = w.factions.filter(f => f.alive && f.flags.includes('dlvassal')).length;
    const parties = w.parties.filter(p => !p.done && p.target === dl.id).length;
    out.push({ id, kind: 'dl', title: `마왕 ${dl.name}의 치세`, since: t0, weight: 100, pos: dl,
      lines: [`${yrs(w, t0)}년째 어둠이 이어지고 있다.`, vassals ? `무릎 꿇은 나라 ${vassals}곳.` : '아직 그를 따르는 나라는 없다.', parties ? `그를 노리는 토벌대 ${parties}개가 길 위에 있다.` : '그에게 맞서는 토벌대는 아직 없다.'] });
  }
  // 깨어난 고대 용
  for (const d of w.chars) {
    if (d.died >= 0 || !d.ancient) continue;
    const id = `dragon:${d.id}`, t0 = since(id);
    const burned = countNews(t0, (text, chars) => chars.includes(d.id) && /불태웠다/.test(text));
    const hunters = w.parties.filter(p => !p.done && p.target === d.id).length;
    out.push({ id, kind: 'dragon', title: `고대 용 ${d.name}`, since: t0, weight: 80, pos: d,
      lines: [`깨어난 지 ${yrs(w, t0)}년, 불태운 고을 ${burned}곳.`, (d.sleep ?? 0) > 0 ? '지금은 둥지에서 쉬고 있다.' : '하늘을 맴돌며 다음 먹잇감을 찾고 있다.', hunters ? `토벌대 ${hunters}개가 뒤를 쫓는다.` : '아직 맞서는 이가 없다.'] });
  }
  // 심연의 군주
  const V = w.sea?.leviathan;
  if (V && V.active) {
    const id = 'abyss', t0 = since(id);
    const alive = V.tentacles.filter(t => t.alive).length;
    out.push({ id, kind: 'abyss', title: `심연의 군주 ${V.name}`, since: t0, weight: 90, pos: V.eye ? { l: 2, x: V.eye.x, y: V.eye.y } : undefined,
      lines: [`${yrs(w, t0)}년째 바다가 끓고 있다.`, `촉수 ${alive}/${V.tentacles.length}개가 해안을 노린다.`] });
  }
  // 대역병
  for (const d of w.diseases) {
    if (!d.alive || !d.great) continue;
    const id = `plague:${d.id}`, t0 = since(id);
    const sick = w.settlements.filter(s => s.alive && s.plague > 0 && s.disease === d.id);
    out.push({ id, kind: 'plague', title: `대역병 '${d.name}'`, since: t0, weight: 70, pos: sick[0],
      lines: [`${yrs(w, t0)}년째 번지고 있다.`, `앓고 있는 고을 ${sick.length}곳.`] });
  }
  // 토벌대 (마왕·고대 용을 노리는 것은 위 이야기에 함께 적혔으니, 그 밖의 것만)
  for (const p of w.parties) {
    if (p.done) continue;
    const lead = w.chars[p.leader], foe = w.chars[p.target];
    if (!lead || lead.died >= 0 || !foe) continue;
    const id = `party:${p.id}`, t0 = since(id);
    out.push({ id, kind: 'party', title: p.name || `${lead.name}의 토벌대`, since: t0, weight: 40 + p.members.length, pos: lead,
      lines: [`${lead.name}이(가) 이끄는 ${p.members.length}명이 ${foe.name}을(를) 쫓는다.`, `길을 나선 지 ${yrs(w, t0) || '한 해도 되지 않았다'}${yrs(w, t0) ? '년' : ''}.`] });
  }
  // 전쟁 (오래되고 큰 것부터)
  const wars: StoryView[] = [];
  for (const a of w.factions) {
    if (!a.alive) continue;
    for (const k of Object.keys(a.wars)) {
      const b = w.factions[+k];
      if (!b || !b.alive || b.id < a.id) continue;
      const id = `war:${a.id}-${b.id}`, t0 = since(id);
      const fell = countNews(t0, (text, _c, facs) => facs.includes(a.id) && facs.includes(b.id) && /함락하였다/.test(text));
      const lead = a.military >= b.military ? a : b, other = lead === a ? b : a;
      const ratio = Math.max(a.military, b.military) / Math.max(1, Math.min(a.military, b.military));
      wars.push({ id, kind: 'war', title: `${a.name}과(와) ${b.name}의 전쟁`, since: t0, weight: 20 + yrs(w, t0) + (a.tier + b.tier) * 5, pos: capital(w, b.id),
        lines: [`${yrs(w, t0) ? `${yrs(w, t0)}년째` : '막 시작된'} 싸움. 함락된 고을 ${fell}곳.`, ratio > 1.5 ? `${lead.name}이(가) ${other.name}을(를) 밀어붙이고 있다.` : '어느 쪽도 물러서지 않는다.'] });
    }
  }
  wars.sort((x, y) => y.weight - x.weight);
  out.push(...wars.slice(0, 5));
  // 이름에 붙는 조사를 바로잡는다
  for (const s of out) { s.title = fixJosa(s.title); s.lines = s.lines.map(fixJosa); }
  return out.sort((x, y) => y.weight - x.weight);
}

/** 매달: 새로 시작된 이야기를 적고, 끝난 이야기에 결말을 붙인다 */
export function updateStories(w: World): void {
  w.storyBook ??= { open: {}, ended: [] };
  const book = w.storyBook;
  const now = new Map(currentStories(w).map(s => [s.id, s]));
  for (const [id, s] of now) if (!book.open[id]) book.open[id] = { t: w.t, title: s.title, kind: s.kind };
  for (const id of Object.keys(book.open)) {
    if (now.has(id)) continue;
    const o = book.open[id];
    delete book.open[id];
    // 한 달 남짓 스쳐 간 일은 이야기라 부르지 않는다
    if (w.t - o.t < 3) continue;
    book.ended.push({ id, kind: o.kind, title: o.title, t0: o.t, t1: w.t, end: fixJosa(ending(w, id)) });
    if (book.ended.length > 40) book.ended.shift();
  }
}

function ending(w: World, id: string): string {
  const [kind, rest] = id.split(':');
  if (kind === 'war') {
    const [a, b] = rest.split('-').map(n => w.factions[+n]);
    if (a && !a.alive) return `${a.name}이(가) 무너지며 끝났다.`;
    if (b && !b.alive) return `${b.name}이(가) 무너지며 끝났다.`;
    return '강화로 칼을 거두었다.';
  }
  if (kind === 'dl' || kind === 'dragon' || kind === 'party') {
    const c = w.chars[+rest];
    if (kind === 'party') { const p = w.parties[+rest]; const foe = p && w.chars[p.target]; return foe && foe.died >= 0 ? `${foe.name}이(가) 쓰러졌다. 토벌대는 뜻을 이루었다.` : '토벌대는 흩어졌다.'; }
    if (c && c.died >= 0) return `${c.name}이(가) ${c.cause || '쓰러졌다'}${c.cause ? '(으)로 쓰러졌다' : ''}.`;
    return kind === 'dl' ? '마왕의 자리에서 물러났다.' : '긴 잠에 들었다.';
  }
  if (kind === 'plague') return '역병이 물러갔다. 살아남은 이들이 거리로 나왔다.';
  if (kind === 'abyss') return '심연의 군주가 바다 밑으로 가라앉았다.';
  return '끝이 났다.';
}

export function storyYears(w: World, t0: number, t1: number): string {
  const a = yearOf(w, t0), b = yearOf(w, t1);
  return a === b ? `${a}년` : `${a}~${b}년`;
}
