// 시드 기반 난수 (sfc32). 시뮬레이션 전체에서 Math.random 대신 이것만 사용한다.

export function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export type RngState = [number, number, number, number];

export class Rng {
  s: RngState;

  constructor(seed: string | number) {
    const str = String(seed);
    this.s = [hashString(str + '#a'), hashString(str + '#b'), hashString(str + '#c'), hashString(str + '#d')];
    for (let i = 0; i < 15; i++) this.next();
  }

  static fromState(st: RngState): Rng {
    const r = new Rng(0);
    r.s = [st[0], st[1], st[2], st[3]];
    return r;
  }

  next(): number {
    let [a, b, c, d] = this.s;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.s = [a, b, c, d];
    return (t >>> 0) / 4294967296;
  }

  float(a = 0, b = 1): number {
    return a + (b - a) * this.next();
  }

  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  normal(mean = 0, sd = 1): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

const SEED_A = ['ASH', 'IRON', 'MOON', 'STAR', 'BLOOD', 'FROST', 'GOLD', 'STORM', 'RUNE', 'VOID', 'SUN', 'BONE', 'OAK', 'MIST', 'EMBER', 'SILVER'];
const SEED_B = ['DRAGON', 'CROWN', 'BLADE', 'TOWER', 'WOLF', 'ROSE', 'GATE', 'SPIRE', 'HOLLOW', 'FLAME', 'RAVEN', 'THRONE', 'SERPENT', 'LANTERN'];

/** 새 시드 문자열을 만든다 (세계 생성 이전에만 Math.random 사용). */
export function randomSeed(): string {
  const a = SEED_A[Math.floor(Math.random() * SEED_A.length)];
  const b = SEED_B[Math.floor(Math.random() * SEED_B.length)];
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `${a}-${b}-${n}`;
}
