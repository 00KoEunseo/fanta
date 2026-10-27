// 화면 연기 시험: 세계를 돌린 뒤 모든 탭·정보창의 HTML을 실제로 만들어 보고, 오류나 빈 값이 섞이지 않는지 본다.
// 사용: tsx scripts/qa/ui-smoke.ts <시드> <년수>
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { createPlayer, resolvePlayer } from '../../src/sim/player';
import * as P from '../../src/ui/panels';
import { summaryHTML, takeSnapshot } from '../../src/ui/summary';
import { bookHTML } from '../../src/ui/book';
const argv: string[] = (globalThis as any).process.argv;
const seed = argv[2] ?? 'UI-1', years = +(argv[3] ?? 200);

const w = createWorld(seed);
for (let i = 0; i < 12 * 20; i++) tick(w);
createPlayer(w, { race: 'human', sex: 'F', origin: 'noble', traits: [55, 55, 55, 55, 55, 55, 55, 55, 55, 55] } as any);
const snap = takeSnapshot(w);
let n = 0;
for (let i = 0; i < 12 * years; i++) {
  tick(w);
  const PL = w.player!;
  if (PL.prompt) { resolvePlayer(w, PL.prompt.choices[(n++ * 5 + 1) % PL.prompt.choices.length].id); }
}
const errors: string[] = [];
const bad: Record<string, string[]> = {};
const check = (name: string, f: () => string) => {
  let html = '';
  try { html = f(); } catch (e) { errors.push(`${name}: ${String(e).slice(0, 160)}`); return; }
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const [k, re] of [['undefined', /undefined/], ['NaN', /\bNaN\b/], ['null', /\bnull\b/], ['[object', /\[object/], ['미치환 {변수}', /\{[a-zA-Z]+\}/], ['조사 표기', /이\(가\)|을\(를\)|은\(는\)|과\(와\)|\(으\)로|\(이\)라/]] as [string, RegExp][])
    if (re.test(text)) { const a = (bad[k] ??= []); if (a.length < 3) a.push(`${name}: …${text.slice(Math.max(0, text.search(re) - 40), text.search(re) + 30).replace(/\s+/g, ' ')}…`); }
};
check('소식', () => P.newsHTML(w, 99999));
check('예언', () => P.prophecyHTML(w));
check('이달의 기록', () => P.logTab(w, 'all'));
check('연대기', () => P.chronicleTab(w));
check('세력', () => P.factionsTab(w));
check('인물', () => P.peopleTab(w, '', 'all'));
check('봉인', () => P.sealsTab(w));
check('통계', () => P.statsTab(w));
check('나의 일대기', () => P.myLifeTab(w));
check('나의 일대기(전부)', () => P.myLifeTab(w, true));
check('이야기', () => P.storiesTab(w));
check('범례', () => P.legendHTML());
check('명품', () => P.artifactsTab(w, 0));
check('HUD', () => P.playerHudHTML(w, {}).html);
check('요약', () => summaryHTML(w, snap, ''));
check('연대기 책', () => bookHTML(w));
for (const c of w.chars.filter((_, i) => i % 25 === 0)) check(`인물 ${c.id}`, () => P.inspectChar(w, c, true));
for (const s of w.settlements.filter((_, i) => i % 5 === 0)) check(`고을 ${s.id}`, () => P.inspectSettlement(w, s));
for (const f of w.factions) check(`세력 ${f.id}`, () => P.inspectFaction(w, f));
for (const h of w.houses.slice(0, 20)) check(`가문 ${h.id}`, () => P.inspectHouse(w, h));
for (let k = 0; k < 20; k++) { const l = k % 5, L = w.layers[l]; check(`땅 ${l}`, () => P.inspectTile(w, l, (k * 37) % L.w, (k * 23) % L.h)); }
const stories = w.storyBook;
console.log(JSON.stringify({
  seed, errors, bad,
  stories: { open: Object.keys(stories?.open ?? {}).length, ended: stories?.ended.length ?? 0, sampleEnd: stories?.ended.slice(-3).map(e => `${e.title} — ${e.end}`) },
  chapters: w.eras.filter(e => e.end >= 0).map(e => ({ name: e.name, lines: e.chapter?.length ?? 0, first: e.chapter?.[0] })).slice(-3),
}));
