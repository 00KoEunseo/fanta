// @ts-nocheck — node 전용 실행 스크립트
// 저장 파일에서 무엇이 자리를 차지하는지
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { serialize } from '../../src/sim/save';
const argv: string[] = (globalThis as any).process.argv;
const w = createWorld(argv[2] ?? 'QA-1');
for (let i = 0; i < 12 * +(argv[3] ?? 300); i++) tick(w);
const kb = (x: unknown) => Math.round(JSON.stringify(x).length / 1024);
console.log('total', Math.round(serialize(w).length / 1024), 'KB');
const parts: Record<string, number> = {};
for (const k of Object.keys(w)) parts[k] = kb((w as any)[k]);
console.log(Object.entries(parts).sort((a, b) => b[1] - a[1]).slice(0, 10));
const dead = w.chars.filter(c => c.died >= 0), alive = w.chars.filter(c => c.died < 0);
console.log('chars', w.chars.length, 'dead', dead.length, 'deadKB', kb(dead), 'aliveKB', kb(alive));
const c0 = dead[dead.length - 1];
const f: Record<string, number> = {};
for (const k of Object.keys(c0)) f[k] = kb(dead.map(c => (c as any)[k]));
console.log('dead char fields', Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 8));
// 브라우저 저장과 같은 방식(gzip → base64)으로 잰 크기
const zlib = await import('node:zlib');
const gz = (zlib as any).gzipSync(Buffer.from(serialize(w)));
console.log('gzip+base64', Math.round(gz.toString('base64').length / 1024), 'KB');
