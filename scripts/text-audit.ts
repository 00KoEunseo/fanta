import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer, continueAsHeir } from '../src/sim/player';
const bad: Record<string, string[]> = {};
const add = (k: string, t: string) => { (bad[k] ??= []); if (bad[k].length < 6 && !bad[k].includes(t)) bad[k].push(t); };
const checks: [string, RegExp][] = [
  ['미치환 변수', /\{[a-zA-Z]+\}/], ['undefined/NaN', /undefined|NaN|null/], ['조사 겹침', /(으로로|로로|을를|를을|이가|가이|은는|는은|과와|와과)(?![가-힣])/],
  ['조사 표기 잔존', /\((이|을|은|과|으)\)|이\(가\)|을\(를\)|은\(는\)|과\(와\)/], ['빈칸 겹침', / {2,}/], ['0세/음수', /(^|[^0-9])0세|-\d+세|-\d+닢/],
  ['빈 이름', /(^|\s)(의|이|가|을|를|은|는)\s/], ['물음표 이름', /\?\?|'\s*'/],
];
for (const seed of ['TXT-1', 'TXT-2']) {
  const w = createWorld(seed);
  for (let i = 0; i < 12 * 10; i++) tick(w);
  createPlayer(w, { race: 'human', sex: 'F', origin: 'orphan', traits: [60, 55, 50, 50, 50, 50, 60, 50, 50, 50] } as any);
  let n = 0;
  for (let i = 0; i < 12 * 200; i++) {
    tick(w);
    const P = w.player!;
    if (P.prompt) {
      for (const t of [P.prompt.text, ...P.prompt.choices.map(c => c.label + ' ' + c.desc)]) for (const [k, re] of checks) if (re.test(t)) add(k, `[선택지 ${P.prompt.eventId}] ${t.slice(0, 90)}`);
      const r = resolvePlayer(w, P.prompt.choices[(n++ * 5) % P.prompt.choices.length].id);
      for (const [k, re] of checks) if (re.test(r)) add(k, `[결과] ${r.slice(0, 90)}`);
    }
    if (P.dead) continueAsHeir(w);
  }
  for (const nw of w.news) for (const [k, re] of checks) if (re.test(nw.text)) add(k, `[소식] ${nw.text.slice(0, 100)}`);
  for (const c of w.chars) for (const b of c.bio) for (const [k, re] of checks) if (re.test(b.text)) add(k, `[일대기] ${b.text.slice(0, 90)}`);
}
for (const [k, v] of Object.entries(bad)) { console.log('──', k); for (const t of v) console.log('  ', t); }
