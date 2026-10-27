import { Rng } from './rng';

// 시드 기반 2D 펄린 노이즈
const GRAD: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

export class Noise2D {
  private perm = new Uint8Array(512);

  constructor(rng: Rng) {
    const p: number[] = [];
    for (let i = 0; i < 256; i++) p.push(i);
    rng.shuffle(p);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private grad(ix: number, iy: number, x: number, y: number): number {
    const g = GRAD[this.perm[(ix & 255) + this.perm[iy & 255]] & 7];
    return g[0] * (x - ix) + g[1] * (y - iy);
  }

  noise(x: number, y: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = fade(x - x0), sy = fade(y - y0);
    const n00 = this.grad(x0, y0, x, y);
    const n10 = this.grad(x0 + 1, y0, x, y);
    const n01 = this.grad(x0, y0 + 1, x, y);
    const n11 = this.grad(x0 + 1, y0 + 1, x, y);
    const a = n00 + sx * (n10 - n00);
    const b = n01 + sx * (n11 - n01);
    return (a + sy * (b - a)) * 1.4;
  }

  /** 대략 -1..1 범위 */
  fbm(x: number, y: number, octaves = 5, lac = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lac;
    }
    return sum / norm;
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
