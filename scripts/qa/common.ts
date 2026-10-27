// 검증 도구 공용: 문장 틀 뽑기, 글자 검사
import type { World } from '../../src/sim/state';

/** 고유명사·숫자·인용을 지워 문장의 '틀'만 남긴다 */
export function templater(w: World): (t: string) => string {
  const names = new Set<string>();
  for (const c of w.chars) names.add(c.name);
  for (const s of w.settlements) names.add(s.name);
  for (const f of w.factions) { names.add(f.name); if ((f as any).baseName) names.add((f as any).baseName); }
  for (const s of w.sites ?? []) names.add(s.name);
  for (const b of (w as any).sea?.beasts ?? []) names.add(b.name);
  const sorted = [...names].filter(n => n && n.length >= 2).sort((a, b) => b.length - a.length);
  return (t: string) => {
    let s = t.replace(/「[^」]*」/g, '「…」').replace(/'[^']*'/g, "'…'").replace(/\([^)]*\)/g, '()');
    for (const n of sorted) if (s.includes(n)) s = s.split(n).join('○');
    return s.replace(/\d+/g, '#');
  };
}

export const TEXT_CHECKS: [string, RegExp][] = [
  ['미치환 변수', /\{[a-zA-Z]+\}/],
  ['undefined/NaN', /undefined|NaN|\bnull\b/],
  ['조사 겹침', /(으로로|을를|를을|은는|는은|과와|와과)(?![가-힣])/],
  ['조사 표기 잔존', /이\(가\)|을\(를\)|은\(는\)|과\(와\)|\(으\)로|\(이\)라/],
  ['빈칸 겹침', / {2,}/],
  ['음수 나이·돈', /-\d+세|-\d+닢/],
  ['불로 종족에 아이 표기', /아이 [가-힣]+의 천사|아이 (천사|고대 용|용) /],
];

export function textIssues(texts: string[], max = 4): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const t of texts) for (const [k, re] of TEXT_CHECKS) if (re.test(t)) { const a = (out[k] ??= []); if (a.length < max) a.push(t.slice(0, 100)); else a.length; }
  return out;
}

export function countIssues(texts: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of texts) for (const [k, re] of TEXT_CHECKS) if (re.test(t)) out[k] = (out[k] ?? 0) + 1;
  return out;
}
