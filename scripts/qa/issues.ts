// 지적받은 허점들을 숫자로 잰다 (4차 점검): 전쟁 거리·전선·스쳐 지나간 군대, 고대 용, 수호룡, 천사의 거취, 마족, 반란의 수명,
// 심연의 군주, 하늘 용, 성역 함락, 용사와 마왕.
// 사용: npx tsx scripts/qa/issues.ts 씨앗1,씨앗2 [년수]
import { createWorld } from '../../src/sim/world';
import { tick } from '../../src/sim/tick';
import { dist, yearOf } from '../../src/sim/state';
import { facDist, isNeighbor } from '../../src/sim/factions';
import { RACES } from '../../src/data/races';
const argv: string[] = (globalThis as any).process.argv;
const years = +(argv[3] ?? 300);
const agg: Record<string, number[]> = {};
const put = (k: string, v: number) => (agg[k] ??= []).push(v);
for (const seed of (argv[2] ?? 'IS-1').split(',')) {
  const w = createWorld(seed);
  const y0 = yearOf(w);
  const c: Record<string, number> = {};
  const inc = (k: string, n = 1) => (c[k] = (c[k] ?? 0) + n);
  const prevWars = new Map<number, Set<number>>();
  const born = new Map<number, { t: number; how: string; n: number }>();
  for (const f of w.factions) born.set(f.id, { t: 0, how: '건국', n: f.settlements.length });
  const crossed = new Set<string>();
  const angelOut = new Set<number>(), angelKing = new Set<number>();
  let last = -1, prevDL = w.demonLord, treeOwner = w.settlements[w.worldTree?.sid ?? -1]?.faction ?? -1, treeFlips = 0, treeRaids = 0;
  const dlEnds: string[] = [];
  const samples: string[] = [];
  for (let i = 0; i < 12 * years; i++) {
    const before = w.armies.filter(a => a.alive && a.goal !== 'colonize' && a.goal !== 'clear').map(a => ({ id: a.id, f: a.faction, l: a.l, x: a.x, y: a.y }));
    tick(w);
    // 새 세력 (반란·독립)
    for (const f of w.factions) if (!born.has(f.id)) born.set(f.id, { t: w.t, how: f.rulers[0]?.how ?? '?', n: f.settlements.length });
    // 새 전쟁: 이웃인가, 얼마나 먼가
    for (const f of w.factions) {
      if (!f.alive) continue;
      const was = prevWars.get(f.id) ?? new Set();
      for (const k of Object.keys(f.wars)) {
        const e = w.factions[+k];
        if (was.has(+k) || !e || f.id > e.id) continue;
        inc('전쟁');
        const d = facDist(w, f, e);
        if (isNeighbor(w, f, e) || isNeighbor(w, e, f) || d <= 20) inc('전쟁:이웃');
        if (d > 40) { inc('전쟁:먼(40+)'); if (samples.length < 3) samples.push(`먼 전쟁 ${yearOf(w) - y0}년 ${f.name}↔${e.name} 거리 ${Math.round(d)}`); }
      }
      prevWars.set(f.id, new Set(Object.keys(f.wars).map(Number)));
    }
    // 스쳐 지나간 군대: 전쟁 중인 두 군대가 이번 달 서로를 지나쳤는데 싸우지 않았다
    const now = w.armies;
    for (let a = 0; a < before.length; a++) for (let b = a + 1; b < before.length; b++) {
      const A0 = before[a], B0 = before[b];
      if (A0.l !== B0.l || A0.f === B0.f) continue;
      const fa = w.factions[A0.f];
      if (!fa || fa.wars[B0.f] === undefined) continue;
      const A1 = now[A0.id], B1 = now[B0.id];
      if (!A1?.alive || !B1?.alive || A1.l !== A0.l || B1.l !== B0.l) continue;
      // 이동 선분 사이의 최소 거리 (몇 점을 찍어 잰다)
      let md = Infinity;
      for (let s = 0; s <= 4; s++) { const t = s / 4; const ax = A0.x + (A1.x - A0.x) * t, ay = A0.y + (A1.y - A0.y) * t, bx = B0.x + (B1.x - B0.x) * t, by = B0.y + (B1.y - B0.y) * t; md = Math.min(md, Math.hypot(ax - bx, ay - by)); }
      // 달 초에도 떨어져 있었고 달 끝에도 떨어져 있는데, 그 사이에 스쳤다 (싸운 뒤 흩어지는 것은 세지 않는다)
      const apart0 = Math.abs(A0.x - B0.x) > 2 || Math.abs(A0.y - B0.y) > 2;
      if (apart0 && md <= 1.5 && (Math.abs(A1.x - B1.x) > 2 || Math.abs(A1.y - B1.y) > 2)) inc('군대:스쳐지남');
    }
    { const ts = w.settlements[w.worldTree?.sid ?? -1]; if (ts && ts.faction !== treeOwner) { treeFlips++; treeOwner = ts.faction; } if (ts && ts.lastAttacked === w.t) treeRaids++; }
    if (w.demonLord !== prevDL) { if (prevDL >= 0) { const d = w.chars[prevDL]; dlEnds.push(`${yearOf(w) - y0}년 ${d.died >= 0 ? d.cause : '물러남'}`); } prevDL = w.demonLord; }
    if (i % 6 === 0) {
      // 엇갈린 주둔지
      const camps = (w.camps ?? []).filter(k => k.alive);
      for (const a of camps) for (const b of camps) {
        if (b.faction !== a.enemy || b.enemy !== a.faction || b.l !== a.l || b.id <= a.id || dist(a, b) > 12) continue;
        const ah = w.settlements[a.home], bh = w.settlements[b.home];
        if (ah && bh && dist(a, bh) < dist(b, bh) && dist(b, ah) < dist(a, ah)) crossed.add(`${a.id}-${b.id}`);
      }
      // 천사의 거취
      for (const ch of w.chars) {
        if (ch.died >= 0 || ch.race !== 'angel') continue;
        const f = w.factions[ch.faction];
        if (f && f.race !== 'angel') { angelOut.add(ch.id); if (f.leader === ch.id) angelKing.add(ch.id); }
      }
    }
    if (i % 12 === 0) {
      const mp = w.settlements.filter(s => s.alive && s.race === 'majin').reduce((a, s) => a + s.pop, 0);
      inc('마족인구합', mp); inc('마족인구표본');
      inc('마족인물합', w.chars.filter(ch => ch.died < 0 && ch.race === 'majin').length);
      // 하늘에 자리 잡은 하늘 밖 종족의 고을
      inc('하늘침범고을(연)', w.settlements.filter(s => s.alive && s.l === 1 && !RACES[s.race].layers.includes(1)).length);
      if (w.sea.leviathan?.active) inc('심연 활동 연수');
    }
    for (const n of w.news) {
      if (n.id <= last) continue;
      const t = n.text;
      for (const [k, re] of [
        ['야전', /들판에서 .+의 군대를 격파/], ['고대용 각성', /고대 용 .+(깨어났다|눈을 떴다)/], ['용 원한+', /원한이 쌓여 간다|용의 원한 \d\/3/],
        ['수호룡 배신(공물)', /공물을 끊자 수호룡/], ['수호룡 배신(사냥)', /수호룡 .+의 보물을 탐내/], ['수호룡 출격', /수호룡/],
        ['반란:독립', /독립하여 .+선포|스스로 깃발을 올렸다|독립을 선언/], ['반란:동참', /함께 .+에 등을 돌렸다/], ['반란:분리', /정착지를 이끌고 .+에서 떨어져 나와/],
        ['심연 촉수 베임', /촉수 하나를 베어 냈다/], ['심연 물러감', /심연으로 가라앉았다/], ['바다괴수 전투', /맞서 깊은 상처|맞섰으나 참패/],
        ['하늘 용 습격', /하늘을 더럽히는|하늘섬의 침입자/], ['성역 함락', /천상의 성역이 .+에게 짓밟혔다/], ['하늘의 왕좌', /【하늘의 왕좌】/],
        ['마왕 강림', /봉인 붕괴】.*마왕이 왕좌/], ['마왕 토벌대', /토벌대/], ['용사-마왕 결전', /용사 .+마왕 .+옥좌 앞에 섰다/], ['용사가 마왕을', /용사 .+의 검이 마왕/], ['대치', /맞닥뜨렸다. 양쪽이 진을/], ['들판 진지', /그 자리에 진지를 세웠다/], ['수호룡 요격', /수호룡 .+군대를 하늘에서 덮쳤다/], ['권속', /심연의 권속 .+기어 나와/], ['천사 탈환', /천사들.+되찾았다/], ['길의 칼부림', /칼부림이 벌어졌다/], ['선포', /전쟁을 선포하였다/], ['배신(통수)', /등에 칼을 꽂았다/], ['세계 멸망', /【세계 멸망】/],
      ] as [string, RegExp][]) if (re.test(t)) inc(k);
    }
    last = w.nextNewsId - 1;
    if (w.doom.ended) break;
  }
  // 반란 세력의 수명
  const rebels = [...born.entries()].filter(([, b]) => b.how === '독립' || b.how === '계승 전쟁' || b.how === '반란' || /반란|독립/.test(b.how));
  const life = rebels.map(([id, b]) => ((w.factions[id].alive ? w.t : w.factions[id].fell ?? w.t) - b.t) / 12).sort((a, b) => a - b);
  const out = {
    전쟁: c['전쟁'] ?? 0, 이웃비율: Math.round(((c['전쟁:이웃'] ?? 0) / Math.max(1, c['전쟁'] ?? 0)) * 100), 먼전쟁: c['전쟁:먼(40+)'] ?? 0,
    야전: c['야전'] ?? 0, 스쳐지남: c['군대:스쳐지남'] ?? 0, 엇갈린주둔지: crossed.size,
    고대용: c['고대용 각성'] ?? 0, 원한: c['용 원한+'] ?? 0, 배신: (c['수호룡 배신(공물)'] ?? 0) + (c['수호룡 배신(사냥)'] ?? 0),
    천사이탈: angelOut.size, 천사가남의왕: angelKing.size,
    마족인구: Math.round((c['마족인구합'] ?? 0) / Math.max(1, c['마족인구표본'] ?? 1)), 마족인물: Math.round((c['마족인물합'] ?? 0) / Math.max(1, c['마족인구표본'] ?? 1)),
    반란: rebels.length, 반란수명중앙: life.length ? Math.round(life[Math.floor(life.length / 2)]) : -1, 반란5년내소멸: life.filter(x => x < 5).length,
    심연연수: c['심연 활동 연수'] ?? 0, 촉수베임: c['심연 촉수 베임'] ?? 0,
    하늘침범: Math.round((c['하늘침범고을(연)'] ?? 0) / years * 10) / 10, 하늘용습격: c['하늘 용 습격'] ?? 0,
    성역함락: c['성역 함락'] ?? 0, 하늘왕좌: c['하늘의 왕좌'] ?? 0, 마왕강림: c['마왕 강림'] ?? 0, 토벌대소식: c['마왕 토벌대'] ?? 0, 멸망: c['세계 멸망'] ?? 0,
    악마: w.chars.filter(ch => ch.died < 0 && ch.archdemon).length,
    용사마왕결전: c['용사-마왕 결전'] ?? 0, 용사의승리: c['용사가 마왕을'] ?? 0, 대치: c['대치'] ?? 0, 들판진지: c['들판 진지'] ?? 0, 수호룡요격: c['수호룡 요격'] ?? 0, 권속: c['권속'] ?? 0, 반란동참: c['반란:동참'] ?? 0, 천사탈환: c['천사 탈환'] ?? 0, 선포: c['선포'] ?? 0,
  };
  // 세력 사이 관계의 퍼짐 (서로 아는 살아 있는 세력 쌍)
  const rels: number[] = [];
  for (const f of w.factions) if (f.alive) for (const [k, v] of Object.entries(f.relations)) { const o = w.factions[+k]; if (o && o.alive && o.id > f.id) rels.push(v); }
  const share = (p: (v: number) => boolean) => Math.round(rels.filter(p).length / Math.max(1, rels.length) * 100);
  Object.assign(out, { 세계수주인바뀜: treeFlips, 세계수공격받음: treeRaids, 통수: c['배신(통수)'] ?? 0, '관계±90+%': share(v => Math.abs(v) >= 90), '관계±30안%': share(v => Math.abs(v) < 30), '관계30~90%': share(v => Math.abs(v) >= 30 && Math.abs(v) < 90) });
  console.log(`== ${seed} (${Math.floor(w.t / 12)}년)`, JSON.stringify(out));
  if (dlEnds.length || w.demonLord >= 0) console.log('   마왕의 최후:', dlEnds.join(' / ') || '-', w.demonLord >= 0 ? '(지금도 군림)' : '');
  for (const s of samples) console.log('   ', s);
  for (const [k, v] of Object.entries(out)) put(k, v as number);
}
console.log('== 평균', JSON.stringify(Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10]))));
