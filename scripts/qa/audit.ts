// 통합 검증: 세계·생애 검증을 병렬로 돌리고, 기준선과 비교한다
// 사용: npm run audit                (300년 세계 3개 + 생애 8개)
//       npm run audit:quick          (150년 세계 1개 + 생애 4개)
//       뒤에 -- --save 를 붙이면 현재 결과를 기준선으로 저장한다
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const argv: string[] = (globalThis as any).process.argv;
const quick = argv.includes('--quick');
const save = argv.includes('--save');
const YEARS = quick ? 150 : 300;
const WORLDS = quick ? ['QA-1'] : ['QA-1', 'QA-2', 'QA-3'];
const LIVES: string[][] = [
  ['QL-1', 'human', 'common', 'F'], ['QL-2', 'elf', 'noble', 'M'], ['QL-3', 'orc', 'common', 'F'], ['QL-4', 'dwarf', 'orphan', 'M'],
  ...(quick ? [] : [['QL-5', 'human', 'noble', 'M'], ['QL-6', 'goblin', 'common', 'F'], ['QL-7', 'beast', 'common', 'M'], ['QL-8', 'darkelf', 'noble', 'F']]),
];
const DIR = 'scripts/qa';

function run(script: string, args: string[]): Promise<any> {
  return new Promise(res => {
    const p = spawn('npx', ['tsx', `${DIR}/${script}`, ...args], { shell: true });
    let out = '', err = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => err += d);
    p.on('close', () => {
      const line = out.trim().split('\n').pop() ?? '';
      try { res(JSON.parse(line)); } catch { res({ error: (err || out).slice(-600), args }); }
    });
  });
}

// 동시에 너무 많이 돌리지 않는다
async function pool<T>(jobs: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; out[k] = await jobs[k](); } }));
  return out;
}

const t0 = Date.now();
const jobs = [...WORLDS.map(s => () => run('world.ts', [s, String(YEARS)])), ...LIVES.map(a => () => run('life.ts', a))];
const results = await pool(jobs, 6);
const worlds = results.slice(0, WORLDS.length), lives = results.slice(WORLDS.length);

type Check = { name: string; ok: boolean; detail: string; warn?: boolean };
const checks: Check[] = [];
const chk = (name: string, ok: boolean, detail: string, warn = false) => checks.push({ name, ok, detail, warn });
const avg = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

for (const r of [...worlds, ...lives]) if (r.error) chk('실행 오류', false, `${JSON.stringify(r.args)}: ${r.error}`);
const W = worlds.filter(r => !r.error), Lf = lives.filter(r => !r.error && !r.skipped);

// ── 세계 불변식 (warn: 경고만, 실패로 치지 않음)
for (const r of W) {
  chk(`[${r.seed}] 결정성`, r.deterministic, '같은 시드는 같은 결과');
  chk(`[${r.seed}] 저장·불러오기`, r.saveOk, '직렬화 후 1틱 진행');
  chk(`[${r.seed}] 성능`, r.perf.msPerTick < 60, `평균 ${r.perf.msPerTick}ms/월, 최악 ${r.perf.worst}ms`, true);
  chk(`[${r.seed}] 최상위 소식 반복`, r.news.imp5Repeats.length === 0, r.news.imp5Repeats.map((x: any) => `${x[0]}×${x[1]}`).join(' | ') || '없음');
  const txt = Object.entries(r.text.counts).map(([k, v]) => `${k} ${v}`).join(', ');
  chk(`[${r.seed}] 글자 오류`, !txt, txt + ' ' + JSON.stringify(r.text.samples).slice(0, 300));
  chk(`[${r.seed}] 시대 이름 중복`, r.eras.count <= 1 || r.eras.unique / r.eras.count >= 0.8, `${r.eras.unique}/${r.eras.count}: ${r.eras.names.join(', ')}`);
  chk(`[${r.seed}] 초기 역사 보존`, r.news.oldestStoredYear - r.news.firstYear <= 5, `저장된 가장 오래된 소식 ${r.news.oldestStoredYear}년 (시작 ${r.news.firstYear}년, 총 ${r.news.total}건 중 ${r.news.stored}건 보관)`);
  chk(`[${r.seed}] 명품 쏠림`, r.world.maxArtifactsHeld <= 5, `한 사람 최대 ${r.world.maxArtifactsHeld}개`, true);
  chk(`[${r.seed}] 세력 생존`, r.world.factionsAlive >= 4, `생존 ${r.world.factionsAlive} / 누적 ${r.world.factionsEver}`);
  chk(`[${r.seed}] 직업 쏠림`, !r.world.topRole || r.world.topRole[1] < 0.2, `최다 직업 ${r.world.topRole?.join(' ')}`, true);
}
// ── 생애 불변식
for (const r of Lf) {
  const tag = `[${r.seed} ${r.race}/${r.origin}]`;
  chk(`${tag} 사별 기록`, r.widowLogged === r.spouseDeaths, `배우자 사망 ${r.spouseDeaths}, 일대기 기록 ${r.widowLogged}`);
  chk(`${tag} 미성년 여행`, r.minorTravel === 0, `${r.minorTravel}건`);
  chk(`${tag} 못 고르는 선택지`, r.impossibleOpt === 0, `${r.impossibleOpt}건`);
  chk(`${tag} 칭호=직업명`, r.rankSameAsJob === 0, `${r.rankSameAsJob}건`);
  chk(`${tag} 역병 중복 질문`, r.plagueDouble === 0, `${r.plagueDouble}건`);
  chk(`${tag} 일대기 중복 줄`, r.dupBio === 0, `${r.dupBio}건`);
  const txt = Object.entries(r.text.counts).map(([k, v]) => `${k} ${v}`).join(', ');
  chk(`${tag} 글자 오류`, !txt, txt + ' ' + JSON.stringify(r.text.samples).slice(0, 300));
}

// ── 지표 (기준선과 비교)
const metrics: Record<string, number> = {
  '소식/년': avg(W.map(r => r.news.perYear)),
  '상위소식(imp4+)/년': avg(W.map(r => r.news.imp4PerYear)),
  'imp5 건수': avg(W.map(r => r.news.imp5)),
  '전쟁 소식 비율': avg(W.map(r => r.news.catShare.war ?? 0)),
  '교역 소식 비율': avg(W.map(r => r.news.catShare.trade ?? 0)),
  '최다 소식틀 비율': avg(W.map(r => r.news.top[0][0] / r.news.total)),
  '시대 이름 고유율': avg(W.map(r => r.eras.unique / Math.max(1, r.eras.count))),
  '생존 세력': avg(W.map(r => r.world.factionsAlive)),
  '생존 인물': avg(W.map(r => r.world.charsAlive)),
  '총인구': avg(W.map(r => r.world.pop)),
  '봉인 붕괴': avg(W.map(r => r.world.sealsBroken)),
  '멸망한 세계 수': W.filter(r => r.doomAt >= 0).length,
  'ms/월': avg(W.map(r => r.perf.msPerTick)),
  ...Object.fromEntries(Object.keys(W[0]?.patternsPer100y ?? {}).map(k => [`100년당 ${k}`, avg(W.map(r => r.patternsPer100y[k]))])),
  '생애 선택지/년': avg(Lf.map(r => r.perYear)),
  '생애 여행·유적 비율': avg(Lf.map(r => r.travelShare)),
  '생애 같은 문장 최다반복': avg(Lf.map(r => r.maxSameText[0])),
  '생애 서로 다른 이벤트 수': avg(Lf.map(r => r.distinct)),
  '생애 수명': avg(Lf.map(r => r.ageAtEnd)),
  '생애 혼인율': avg(Lf.map(r => r.married ? 1 : 0)),
  '생애 자녀 수': avg(Lf.map(r => r.kids)),
};
const BASE = `${DIR}/baseline${quick ? '-quick' : ''}.json`;
const base = existsSync(BASE) ? JSON.parse(readFileSync(BASE, 'utf8')) : null;

const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)));
console.log(`\n══ 불변식 (${checks.filter(c => c.ok).length}/${checks.length} 통과) ══`);
for (const c of checks.filter(c => !c.ok)) console.log(`${c.warn ? '⚠' : '✗'} ${c.name}: ${c.detail}`);
console.log('\n══ 지표 ══' + (base ? ' (기준선 대비, ◀는 30% 넘게 변함)' : ' (기준선 없음)'));
for (const [k, v] of Object.entries(metrics)) {
  const b = base?.metrics?.[k];
  const d = b === undefined ? '' : b === 0 ? (v === 0 ? '' : ' (새로 생김)') : ` (${v >= b ? '+' : ''}${(((v - b) / Math.abs(b)) * 100).toFixed(0)}%, 기준 ${+b.toFixed(3)})`;
  const big = b !== undefined && b !== 0 && Math.abs((v - b) / b) > 0.3 ? ' ◀' : '';
  console.log(`  ${pad(k, 30)} ${(+v.toFixed(3)).toString().padStart(9)}${d}${big}`);
}
console.log('\n══ 생애 ══');
for (const r of Lf) console.log(`  ${r.seed} ${r.race}/${r.origin} ${r.role} ${r.ageAtEnd}세 (${r.cause}) 선택지 ${r.prompts} 여행비율 ${r.travelShare} 자녀 ${r.kids} | ${r.topEvents.map((e: any) => e.join('×')).join(' ')}`);
console.log('\n══ 세계별 상위 반복 소식 (imp4+) ══');
for (const r of W) console.log(`  ${r.seed}: ${r.news.hiTop.slice(0, 4).map((x: any) => `${x[0]}×${x[1]}`).join(' | ')}`);
writeFileSync(`${DIR}/last${quick ? '-quick' : ''}.json`, JSON.stringify({ metrics, checks, worlds, lives }, null, 1));
if (save) { writeFileSync(BASE, JSON.stringify({ metrics, at: new Date().toISOString() }, null, 1)); console.log(`\n기준선 저장: ${BASE}`); }
const hard = checks.filter(c => !c.ok && !c.warn).length;
console.log(`\n${hard ? `✗ 실패 ${hard}건` : '✓ 필수 불변식 모두 통과'} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
