// 여러 해를 건너뛴 뒤 보여 주는 요약
import { RACES } from '../data/races';
import { fmtNum } from '../data/text';
import type { World } from '../sim/state';
import { dateStr } from '../sim/state';
import { SEAL_NAMES } from '../sim/doom';
import { charLink, esc, facLink, newsItemHTML } from './panels';

export interface Snapshot {
  t: number;
  newsId: number;
  pop: number;
  factions: Map<number, { tier: number; leader: number; alive: boolean }>;
  seals: boolean[];
  eras: number;
  artifacts: number;
  playerId: number;
  playerWealth: number;
  playerFame: number;
}

export function takeSnapshot(w: World): Snapshot {
  const P = w.player;
  const pc = P ? w.chars[P.charId] : null;
  return {
    t: w.t,
    newsId: w.nextNewsId,
    pop: w.factions.filter(f => f.alive).reduce((a, f) => a + f.pop, 0),
    factions: new Map(w.factions.map(f => [f.id, { tier: f.tier, leader: f.leader, alive: f.alive }])),
    seals: [...w.doom.seals],
    eras: w.eras.length,
    artifacts: w.artifacts.length,
    playerId: P ? P.charId : -1,
    playerWealth: pc ? pc.wealth : 0,
    playerFame: pc ? pc.fame : 0,
  };
}

export function summaryHTML(w: World, s: Snapshot, interrupted: string): string {
  const years = Math.round((w.t - s.t) / 12);
  const news = w.news.filter(n => n.id >= s.newsId);
  const big = news.filter(n => n.imp >= 4).sort((a, b) => b.imp - a.imp || a.t - b.t).slice(0, 18).sort((a, b) => a.t - b.t);
  const pop = w.factions.filter(f => f.alive).reduce((a, f) => a + f.pop, 0);

  const born = w.factions.filter(f => !s.factions.has(f.id));
  const fallen = w.factions.filter(f => s.factions.get(f.id)?.alive && !f.alive);
  const risen = w.factions.filter(f => f.alive && s.factions.has(f.id) && f.tier > (s.factions.get(f.id)!.tier));
  const newRulers = w.factions.filter(f => f.alive && s.factions.has(f.id) && f.leader !== s.factions.get(f.id)!.leader);

  const sealChanges = w.doom.seals.map((b, i) => (b !== s.seals[i] ? `${b ? '🔴 붕괴' : '🟢 회복'}: ${SEAL_NAMES[i]}` : '')).filter(Boolean);
  const newEras = w.eras.slice(Math.max(0, s.eras - 1)).filter(e => e.end >= 0 && e.end >= s.t).map(e => e.name);
  const newArts = w.artifacts.slice(s.artifacts);

  const counts: Record<string, number> = {};
  for (const n of news) counts[n.cat] = (counts[n.cat] ?? 0) + 1;
  const wars = news.filter(n => /전쟁을 선포/.test(n.text)).length;
  const deaths = w.chars.filter(c => c.died >= s.t && c.died <= w.t && (c.fame >= 40 || w.factions.some(f => f.rulers.some(r => r.id === c.id)))).length;

  let playerBlock = '';
  if (s.playerId >= 0) {
    const c = w.chars[s.playerId];
    if (c) {
      const bio = c.bio.filter(b => b.t >= s.t).slice(-8);
      playerBlock = `<h3>나의 이야기</h3>
        <p>${charLink(w, c)} ${c.died >= 0 ? `— <b style="color:var(--red)">${dateStr(w, c.died)} ${esc(c.cause)}(으)로 세상을 떠남</b>` : ''}<br>
        <small>재산 ${fmtNum(s.playerWealth)} → ${fmtNum(c.wealth)} · 명성 ${fmtNum(s.playerFame)} → ${fmtNum(c.fame)}</small></p>
        <div class="log">${bio.map(b => `<div><span class="when">${dateStr(w, b.t)}</span>${esc(b.text)}</div>`).join('') || '<span class="dim">조용한 세월이었다.</span>'}</div>`;
    }
  }

  return `
    <h2>📖 ${years}년의 연대기</h2>
    <div class="dim">${dateStr(w, s.t)} → ${dateStr(w)}${interrupted ? ` · <b style="color:var(--gold)">${esc(interrupted)}</b>` : ''}</div>
    <div class="sum-grid">
      <div><b>${fmtNum(pop)}</b><small>세계 인구 (${pop >= s.pop ? '+' : ''}${fmtNum(pop - s.pop)})</small></div>
      <div><b>${wars}</b><small>선전포고</small></div>
      <div><b>${born.length} / ${fallen.length}</b><small>건국 / 멸망</small></div>
      <div><b>${deaths}</b><small>떠나간 이름난 이들</small></div>
    </div>
    ${newEras.length ? `<p>저물어 간 시대: <b>${newEras.map(esc).join(', ')}</b></p>` : ''}
    ${sealChanges.length ? `<h3>일곱 봉인</h3><div>${sealChanges.map(esc).join('<br>')}</div>` : ''}
    ${playerBlock}
    <h3>주요 사건</h3>
    <div class="sum-news">${big.map(n => newsItemHTML(w, n)).join('') || '<p class="dim">세상을 뒤흔든 큰 사건은 없었다.</p>'}</div>
    ${risen.length || born.length || fallen.length ? `<h3>세력의 흥망</h3>
      ${risen.map(f => `<div>⬆ ${facLink(f)} <small>${['부족', '공국', '왕국', '제국'][f.tier]}으로 성장</small></div>`).join('')}
      ${born.map(f => `<div>✦ ${facLink(f)} <small>${RACES[f.race].name} · 새로 일어섬</small></div>`).join('')}
      ${fallen.map(f => `<div>✝ ${facLink(f)}</div>`).join('')}` : ''}
    ${newRulers.length ? `<h3>바뀐 군주 (${newRulers.length})</h3><div>${newRulers.slice(0, 12).map(f => `${facLink(f)} → ${charLink(w, w.chars[f.leader])}`).join('<br>')}</div>` : ''}
    ${newArts.length ? `<h3>새로 태어난 명품 (${newArts.length})</h3><div>${newArts.slice(0, 8).map(a => `<span class="link" data-art="${a.id}">${esc(a.makerName)}의 ${a.kind} 「${esc(a.name)}」</span>`).join(' · ')}</div>` : ''}
    <p class="dim">소식 ${news.length}건 (전쟁 ${counts.war ?? 0} · 정치 ${counts.politics ?? 0} · 영웅 ${counts.hero ?? 0} · 어둠 ${counts.dark ?? 0} · 자연 ${counts.nature ?? 0})</p>
    <div class="row" style="justify-content:flex-end"><button id="sum-ok" class="accent">닫기</button></div>`;
}
