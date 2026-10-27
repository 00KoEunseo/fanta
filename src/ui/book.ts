// 연대기 책: 한 세계의 역사를 책처럼 읽을 수 있는 HTML 한 장으로 엮는다 (내려받아 브라우저로 연다)
import { RACES } from '../data/races';
import type { World } from '../sim/state';
import { dateStr, yearOf } from '../sim/state';
import { titleOf } from '../sim/helpers';
import { storySummary } from '../sim/lifeData7';
import { storyIcon, storyYears } from '../sim/stories';

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const TIER = ['부족', '공국', '왕국', '제국'];

export function bookHTML(w: World): string {
  const y0 = yearOf(w, 0), y1 = yearOf(w);
  // 시대마다: 엮인 장, 그리고 그 시대의 큰 사건
  const eras = w.eras.map((e, i) => {
    const end = e.end >= 0 ? e.end : w.t;
    const big = w.news.filter(n => n.t >= e.start && n.t <= end && n.imp >= 4);
    const name = e.name || '지금의 시대';
    return `<section><h2>제${i + 1}장 · ${esc(name)} <small>${yearOf(w, e.start)}~${e.end >= 0 ? yearOf(w, e.end) + '년' : '지금'}</small></h2>
      ${e.chapter?.length ? `<div class="chapter">${e.chapter.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      ${big.length ? `<details${e.chapter?.length ? '' : ' open'}><summary>이 시대의 큰 사건 ${big.length}건</summary><ul>${big.map(n => `<li><span class="when">${dateStr(w, n.t)}</span>${esc(n.text)}</li>`).join('')}</ul></details>` : ''}</section>`;
  }).join('');
  const facs = w.factions.slice().sort((a, b) => a.founded - b.founded).map(f => {
    const hist = (f.history ?? []).slice(0, 12);
    return `<div class="fac"><h3><span class="sw" style="background:${f.color}"></span>${esc(f.name)} <small>${RACES[f.race].name} · ${TIER[f.tier]} · ${yearOf(w, f.founded)}년 건국${f.alive ? '' : ` · ${yearOf(w, f.fell)}년 멸망`}</small></h3>
      ${hist.length ? `<ul>${hist.map(h => `<li><span class="when">${dateStr(w, h.t)}</span>${esc(h.text)}</li>`).join('')}</ul>` : ''}</div>`;
  }).join('');
  const people = w.chars.slice().sort((a, b) => b.fame - a.fame).slice(0, 24).map(c => {
    const lines = c.bio.filter(b => (b.imp ?? 2) >= 3).slice(0, 6);
    return `<div class="who"><h3>${esc(titleOf(w, c))} ${esc(c.epithet ? `${c.epithet} ${c.name}` : c.name)} <small>${RACES[c.race].name} · ${yearOf(w, c.born)}~${c.died >= 0 ? yearOf(w, c.died) + '년' : ''}${c.died >= 0 && c.cause ? ` · ${esc(c.cause)}` : ''}</small></h3>
      <ul>${lines.map(b => `<li><span class="when">${dateStr(w, b.t)}</span>${esc(b.text)}</li>`).join('')}</ul></div>`;
  }).join('');
  const arts = w.artifacts.slice().sort((a, b) => b.fame - a.fame).slice(0, 15).map(a =>
    `<div class="art"><h3>${esc(a.makerName)}의 ${a.kind} 「${esc(a.name)}」 <small>${yearOf(w, a.t)}년${a.lost !== undefined ? ` · ${yearOf(w, a.lost)}년에 스러짐` : ''}</small></h3><ul>${a.story.slice(0, 5).map(s => `<li><span class="when">${dateStr(w, s.t)}</span>${esc(s.text)}</li>`).join('')}</ul></div>`).join('');
  const ended = (w.storyBook?.ended ?? []).slice().reverse().map(e => `<li>${storyIcon(e.kind)} <b>${esc(e.title)}</b> <span class="when">${storyYears(w, e.t0, e.t1)}</span> — ${esc(e.end)}</li>`).join('');
  const P = w.player;
  const me = P ? w.chars[P.charId] : null;
  const life = me ? `<section><h2>나의 일대기 · ${esc(me.name)}</h2><div class="chapter">${storySummary(w, me).map(l => `<p>${esc(l)}</p>`).join('')}</div>
    <ul>${me.bio.filter(b => (b.imp ?? 2) >= 2).map(b => `<li><span class="when">${dateStr(w, b.t)}</span>${esc(b.text)}</li>`).join('')}</ul></section>` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(w.seed)} 세계의 연대기</title>
<style>
:root{--bg:#f6f1e4;--ink:#2b2418;--dim:#7a6c52;--gold:#9a6b1c;--line:#d8ccb0}
@media (prefers-color-scheme:dark){:root{--bg:#14110c;--ink:#e8dcc0;--dim:#9a8d72;--gold:#d9ad55;--line:#3a3224}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.75 "Pretendard","Malgun Gothic","Apple SD Gothic Neo",serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 80px}
h1{font-size:28px;margin:0 0 4px;color:var(--gold)}h2{font-size:20px;margin:36px 0 8px;color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:4px}
h3{font-size:15px;margin:16px 0 4px}small{color:var(--dim);font-weight:normal;font-size:12px}
.chapter{border-left:3px solid var(--gold);padding:2px 14px;margin:8px 0}.chapter p{margin:0 0 4px}
ul{padding-left:18px;margin:4px 0}li{margin:2px 0}.when{color:var(--dim);font-size:12px;margin-right:8px;white-space:nowrap}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}details summary{cursor:pointer;color:var(--dim);font-size:13px}
nav a{color:var(--gold);margin-right:12px}
</style></head><body><main>
<h1>${esc(w.seed)} 세계의 연대기</h1>
<div class="when">${y0}년 ~ ${y1}년 · ${w.eras.length}개의 시대 · 세력 ${w.factions.length}곳이 일어나고 ${w.factions.filter(f => !f.alive).length}곳이 무너졌다${w.doom.ended ? ' · 세계는 멸망하였다' : ''}</div>
<nav><a href="#eras">시대</a><a href="#stories">이야기</a><a href="#facs">세력</a><a href="#people">인물</a><a href="#arts">명품</a>${life ? '<a href="#me">나의 일대기</a>' : ''}</nav>
<div id="eras">${eras}</div>
${ended ? `<section id="stories"><h2>끝난 이야기들</h2><ul>${ended}</ul></section>` : ''}
<section id="facs"><h2>세력의 흥망</h2>${facs}</section>
<section id="people"><h2>이름을 남긴 이들</h2>${people}</section>
${arts ? `<section id="arts"><h2>명품</h2>${arts}</section>` : ''}
${life ? `<div id="me">${life}</div>` : ''}
</main></body></html>`;
}
