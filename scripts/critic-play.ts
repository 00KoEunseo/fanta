// 비평용 플레이: 관전 300년 통계 + 탄생 모드 한 생애 전체 기록
import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { createPlayer, resolvePlayer } from '../src/sim/player';
import { dateStr, ageOf } from '../src/sim/state';
const argv: string[] = (globalThis as any).process?.argv ?? [];
const seed = argv[2] ?? 'CRIT-1';
const mode = argv[3] ?? 'watch';
const w = createWorld(seed);
const norm = (s: string) => s.replace(/[가-힣]{2,}(?=(이|가|을|를|은|는|과|와|의|에게|에서|\(|\s|,|\.))/g, 'X').replace(/\d+/g, 'N');
if (mode === 'watch') {
  const facBorn = w.factions.length;
  const snaps: string[] = [];
  for (let i = 0; i < 12 * 300; i++) {
    tick(w);
    if (w.doom.ended) { console.log('WORLD ENDED', dateStr(w)); break; }
    if (i % 600 === 599) snaps.push(`[${dateStr(w)}] fac=${w.factions.filter(f => f.alive).length} chars=${w.chars.filter(c => c.died < 0).length} seals=${w.doom.seals.filter(Boolean).length} wars=${w.factions.filter(f=>f.alive).reduce((a,f)=>a+Object.keys(f.wars).length,0)/2}`);
  }
  console.log(snaps.join('\n'));
  console.log('factions total', w.factions.length, 'initial', facBorn, 'alive', w.factions.filter(f => f.alive).length);
  const cat: Record<string, number> = {}; const imp: Record<number, number> = {};
  const tmpl: Record<string, number> = {};
  for (const n of w.news) { cat[n.cat] = (cat[n.cat] ?? 0) + 1; imp[n.imp] = (imp[n.imp] ?? 0) + 1; const k = norm(n.text).slice(0, 40); tmpl[k] = (tmpl[k] ?? 0) + 1; }
  console.log('news', w.news.length, cat, imp);
  console.log('== most repeated templates ==');
  for (const [k, v] of Object.entries(tmpl).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(v, k);
  console.log('== imp>=4 news sample ==');
  for (const n of w.news.filter(n => n.imp >= 4).slice(-60)) console.log(dateStr(w, n.t), n.imp, n.text.slice(0, 140));
  const dead = w.chars.filter(c => c.died >= 0);
  const causes: Record<string, number> = {};
  for (const c of dead) { const k = (c.cause ?? '?').replace(/[가-힣]+의 /, '').slice(0, 14); causes[k] = (causes[k] ?? 0) + 1; }
  console.log('causes', Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 25));
  const roles: Record<string, number> = {};
  for (const c of w.chars.filter(c => c.died < 0)) roles[c.role] = (roles[c.role] ?? 0) + 1;
  console.log('roles alive', roles);
  console.log('eras', w.eras.map(e => e.name).join(' / '));
  const top = w.chars.slice().sort((a, b) => b.fame - a.fame).slice(0, 5);
  for (const c of top) { console.log('\n## ', c.name, c.race, c.role, 'fame', Math.round(c.fame), 'bio', c.bio.length); for (const b of c.bio.slice(0, 25)) console.log('   ', dateStr(w, b.t), b.text.slice(0, 110)); }
} else {
  for (let i = 0; i < 12 * 20; i++) tick(w);
  const pc = createPlayer(w, { race: argv[4] ?? 'human', sex: 'F', origin: argv[5] ?? 'common', traits: [55, 55, 55, 55, 55, 55, 55, 55, 55, 55] } as any)!;
  let n = 0; const prompts: string[] = [];
  for (let i = 0; i < 12 * 400; i++) {
    tick(w);
    const P = w.player!;
    if (P.dead) break;
    if (P.prompt) {
      const ch = P.prompt.choices[(n * 5 + 1) % P.prompt.choices.length]; n++;
      prompts.push(`${dateStr(w)} (${ageOf(w, pc)}세) [${P.prompt.eventId}] ${P.prompt.text.slice(0, 120)} → ${ch.label}`);
      resolvePlayer(w, ch.id);
    }
  }
  const c = w.chars[w.player!.charId];
  console.log('player', c.name, c.race, c.role, 'age', ageOf(w, c), 'died', c.died >= 0 ? c.cause : 'alive', 'prompts', prompts.length);
  const ev: Record<string, number> = {};
  for (const p of prompts) { const id = p.match(/\[(.+?)\]/)![1]; ev[id] = (ev[id] ?? 0) + 1; }
  console.log('event freq', Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 25));
  console.log('== prompts ==');
  for (const p of prompts) console.log(p);
  console.log('== bio ==');
  for (const b of c.bio) console.log(dateStr(w, b.t), b.imp ?? '', b.text.slice(0, 160));
}
