import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
const argv: string[] = (globalThis as any).process?.argv ?? [];
const w = createWorld(argv[2] ?? 'IRON-CROWN-1234');
for (let i = 0; i < +(argv[3] ?? 2400); i++) tick(w);
function dup(label: string, names: string[]) {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  const d = [...m.entries()].filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const extra = d.reduce((a, [, v]) => a + v - 1, 0);
  console.log(`${label}: ${names.length}개 중 고유 ${m.size}, 겹친 이름 ${d.length}종 (중복 ${extra}건, ${(extra / names.length * 100).toFixed(1)}%)  예: ${d.slice(0, 8).map(([n, v]) => `${n}×${v}`).join(', ')}`);
}
dup('살아있는 인물', w.chars.filter(c => c.died < 0).map(c => c.name));
dup('전체 인물(고인 포함)', w.chars.map(c => c.name));
dup('정착지', w.settlements.filter(s => s.alive).map(s => s.name));
dup('세력(현존)', w.factions.filter(f => f.alive).map(f => f.name));
dup('세력(역대)', w.factions.map(f => f.name));
const byRace = new Map<string, string[]>();
for (const c of w.chars.filter(c => c.died < 0)) { if (!byRace.has(c.race)) byRace.set(c.race, []); byRace.get(c.race)!.push(c.name); }
for (const [r, ns] of byRace) dup(`  ${r}`, ns);
