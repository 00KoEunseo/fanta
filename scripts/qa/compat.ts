// 옛 저장 호환: 예전 코드로 만든 저장 파일을 지금 코드로 불러와 계속 돌리고, 화면을 만들어 본다
// 사용: tsx scripts/qa/compat.ts <저장 파일>
import { deserialize, serialize } from '../../src/sim/save';
import { tick } from '../../src/sim/tick';
import { resolvePlayer } from '../../src/sim/player';
import * as P from '../../src/ui/panels';
import { bookHTML } from '../../src/ui/book';
const fsName = 'node:fs';
const fs: any = await import(fsName);
const file: string = (globalThis as any).process.argv[2];
const w = deserialize(fs.readFileSync(file, 'utf8'));
const t0 = w.t;
const errors: string[] = [];
try {
  for (let i = 0; i < 12 * 30; i++) { tick(w); const PL = w.player; if (PL?.prompt) resolvePlayer(w, PL.prompt.choices[0].id); }
} catch (e) { errors.push('진행: ' + String(e).slice(0, 200)); }
for (const [name, f] of [['이야기', () => P.storiesTab(w)], ['연대기', () => P.chronicleTab(w)], ['나의 일대기', () => P.myLifeTab(w)], ['책', () => bookHTML(w)], ['세력', () => P.inspectFaction(w, w.factions[0])]] as [string, () => string][]) {
  try { const h = f(); if (/undefined|NaN/.test(h.replace(/<[^>]+>/g, ''))) errors.push(`${name}: 빈 값`); } catch (e) { errors.push(`${name}: ${String(e).slice(0, 160)}`); }
}
try { deserialize(serialize(w)); } catch (e) { errors.push('다시 저장: ' + String(e).slice(0, 160)); }
console.log(JSON.stringify({ from: t0, to: w.t, months: w.t - t0, player: w.player ? (w.player.dead ? 'dead' : 'alive') : 'none', caravans: w.caravans?.length ?? 0, stories: Object.keys(w.storyBook?.open ?? {}).length, errors }));
