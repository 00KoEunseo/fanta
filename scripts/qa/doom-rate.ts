// @ts-nocheck — node 전용: 세계 여러 개를 300년씩 돌려 멸망 빈도와 봉인 붕괴를 잰다
// 사용: tsx scripts/qa/doom-rate.ts <세계 수> <년수>
import { spawn } from 'node:child_process';
const n = +(process.argv[2] ?? 12), years = process.argv[3] ?? '300';
const run = (seed) => new Promise(res => { const p = spawn('npx', ['tsx', 'scripts/qa/world.ts', seed, years], { shell: true }); let out = ''; p.stdout.on('data', d => out += d); p.on('close', () => { try { res(JSON.parse(out.trim().split('\n').pop())); } catch { res({ seed, error: true }); } }); });
const seeds = Array.from({ length: n }, (_, i) => `QD-${i + 1}`);
const results = []; let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (i < seeds.length) { const s = seeds[i++]; results.push(await run(s)); } }));
const ok = results.filter(r => !r.error);
const ended = ok.filter(r => r.doomAt >= 0);
console.log(`세계 ${ok.length}개 × ${years}년: 멸망 ${ended.length}개 (${ended.map(r => r.seed).join(', ') || '없음'})`);
console.log('봉인 붕괴 횟수', ok.map(r => r.world.sealsBroken).join(' '));
console.log('봉인 넷 이상인 달', ok.map(r => r.seals?.months4).join(' '), '· 최대 동시 붕괴', ok.map(r => r.seals?.max).join(' '));
console.log('생존 세력', ok.map(r => r.world.factionsAlive).join(' '), '· 전쟁 중앙값', ok.map(r => r.wars?.median).join(' '), '· 10년 이상', ok.map(r => Math.round((r.wars?.over10 ?? 0) * 100) + '%').join(' '));
console.log('마계 인물%', ok.map(r => Math.round(r.people.demonNamedShare * 100)).join(' '), '· 인물 없는 큰 종족', ok.map(r => r.people.starved.join('/') || '-').join(' '));
