// 한국어 조사 처리 + 템플릿

const DIGIT_JONG = [true, true, false, true, false, false, true, true, true, false];

function lastJong(word: string): number {
  // -1: 판단 불가, 0: 받침 없음, 그 외: 종성 인덱스
  const w = word.replace(/[\s)\]」』'"]+$/, '');
  if (!w) return 0;
  const ch = w.charCodeAt(w.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28;
  if (ch >= 48 && ch <= 57) return DIGIT_JONG[ch - 48] ? (ch === 49 || ch === 55 || ch === 56 ? 8 : 1) : 0;
  return 0;
}

const PAIRS: Record<string, [string, string]> = {
  '이': ['이', '가'], '가': ['이', '가'],
  '을': ['을', '를'], '를': ['을', '를'],
  '은': ['은', '는'], '는': ['은', '는'],
  '과': ['과', '와'], '와': ['과', '와'],
  '아': ['아', '야'], '야': ['아', '야'],
  '이라': ['이라', '라'], '라': ['이라', '라'],
  '이었다': ['이었다', '였다'], '였다': ['이었다', '였다'],
  '이었으나': ['이었으나', '였으나'], '이었던': ['이었던', '였던'],
};

export function josa(word: string, j: string): string {
  const jong = lastJong(word);
  if (j === '으로' || j === '로') return word + (jong !== 0 && jong !== 8 ? '으로' : '로');
  const p = PAIRS[j];
  if (!p) return word + j;
  return word + (jong !== 0 ? p[0] : p[1]);
}

/** "{a:이} {b:을} 무찔렀다" 형태 템플릿 */
export function tpl(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)(?::([^}]+))?\}/g, (_, k: string, j?: string) => {
    const v = vars[k];
    const s = v === undefined ? `?${k}` : String(v);
    return j ? josa(s, j) : s;
  });
}

const MARKS: Record<string, string> = {
  '이(가)': '이', '을(를)': '을', '은(는)': '은', '과(와)': '과', '와(과)': '과', '(으)로': '으로', '아(야)': '아',
  '이(라)': '이라', '(이)라': '이라', '(이)었으나': '이었으나', '(이)었던': '이었던', '(이)었다': '이었다',
};

/** "알릭이(가)" 같은 표기를 실제 받침에 맞게 고친다 */
export function fixJosa(s: string): string {
  return s.replace(/([가-힣0-9])(['"’」』)\]]*)(이\(가\)|을\(를\)|은\(는\)|과\(와\)|와\(과\)|\(으\)로|아\(야\)|이\(라\)|\(이\)라|\(이\)었으나|\(이\)었던|\(이\)었다)/g,
    (_m, prev: string, quotes: string, mk: string) => {
      const withJ = josa(prev, MARKS[mk]);
      return prev + quotes + withJ.slice(prev.length);
    });
}

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('ko-KR');
}

export function pct(p: number): string {
  if (p <= 0) return '0%';
  if (p < 0.0001) return '<0.01%';
  if (p < 0.01) return (p * 100).toFixed(2) + '%';
  if (p < 0.1) return (p * 100).toFixed(1) + '%';
  return Math.round(p * 100) + '%';
}
