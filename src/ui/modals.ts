import { RACES, type RaceKey } from '../data/races';
import { TRAIT_NAMES, TRAIT_COUNT } from '../data/traits';
import { randomSeed } from '../core/rng';
import type { World } from '../sim/state';
import { dateStr } from '../sim/state';
import { PLAYABLE, birthplaces, playerSummary, type Origin, type PlayerOpts } from '../sim/player';
import { esc } from './panels';
import { legendHTML } from './panels';

const root = () => document.getElementById('modal-root')!;
let open = false;

export function isModalOpen(): boolean { return open; }

export function openModal(html: string, closable = true): HTMLElement {
  const r = root();
  r.innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  open = true;
  const back = r.firstElementChild as HTMLElement;
  if (closable) back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
  return back.querySelector('.modal') as HTMLElement;
}

export function closeModal(): void {
  root().innerHTML = '';
  open = false;
}

export function toast(msg: string): void {
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

const TITLE_ART = String.raw`
   /\                         /\
  /  \   ⚜  세 계  연 대 기  ⚜  /  \
 /____\  ~~~~~~~~~~~~~~~~~~~~~~ /____\
`;

export function startModal(opts: { canContinue: boolean; onCreate: (seed: string) => void; onContinue: () => void; onFile: (f: File) => void; current?: string }): void {
  const m = openModal(`
    <div class="title-art">${esc(TITLE_ART)}</div>
    <p>천상·하늘·지상·지하·마계로 이루어진 세계가 스스로 역사를 써 내려갑니다.
    인간, 엘프, 다크엘프, 드워프, 고블린, 코볼트, 오크, 수인, 용, 마족, 천사, 언데드, 악마가
    저마다의 성격과 숨은 자질을 품고 살아가며, 왕국이 서고 무너지고, 용사와 마왕이 태어납니다.</p>
    <p class="dim">한 달 = 한 턴. 지켜보기만 해도 되고, <b>✦ 탄생</b>으로 이 세계의 한 생명이 되어 인생의 갈림길마다 선택할 수도 있습니다.</p>
    <h3>세계의 씨앗 (시드)</h3>
    <div class="row">
      <input id="seed-in" style="flex:1;font-family:var(--mono)" value="${esc(opts.current ?? randomSeed())}">
      <button id="seed-rand">🎲</button>
    </div>
    <p class="dim">같은 시드는 같은 지형, 같은 종족 시작 위치, (개입이 없다면) 같은 역사를 만듭니다.</p>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <label class="link" style="margin-right:auto">파일에서 불러오기<input type="file" id="file-in" accept=".json" hidden></label>
      ${opts.canContinue ? '<button id="btn-continue">저장된 세계 이어하기</button>' : ''}
      <button id="btn-create" class="accent">세계 창조</button>
    </div>
  `, !!opts.current);
  const inp = m.querySelector('#seed-in') as HTMLInputElement;
  m.querySelector('#seed-rand')!.addEventListener('click', () => { inp.value = randomSeed(); });
  m.querySelector('#btn-create')!.addEventListener('click', () => {
    const s = inp.value.trim() || randomSeed();
    closeModal();
    opts.onCreate(s);
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') (m.querySelector('#btn-create') as HTMLButtonElement).click(); });
  m.querySelector('#btn-continue')?.addEventListener('click', () => { closeModal(); opts.onContinue(); });
  m.querySelector('#file-in')!.addEventListener('change', e => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { closeModal(); opts.onFile(f); }
  });
}

export function birthModal(w: World, onBorn: (o: PlayerOpts) => void): void {
  const races = PLAYABLE.filter(r => birthplaces(w, r).length > 0);
  const traits = new Array(TRAIT_COUNT).fill(50);
  const m = openModal(`
    <h2>✦ 탄생</h2>
    <p>이 세계의 한 생명으로 태어납니다. 어린 시절과 평범한 나날은 건너뛰고, 인생의 갈림길에서만 선택하게 됩니다.</p>
    <div class="row"><button id="b-random" class="accent" style="flex:1">🎲 운명에 맡긴다 (완전 무작위 탄생)</button></div>
    <h3>또는 직접 정하기</h3>
    <div class="row"><span style="width:60px">이름</span><input id="b-name" placeholder="비우면 종족 이름 중 무작위" style="flex:1"></div>
    <div class="row"><span style="width:60px">종족</span>
      <select id="b-race">${races.map(r => `<option value="${r}">${RACES[r].name} (${birthplaces(w, r).length}곳)</option>`).join('')}</select>
      <select id="b-sex"><option value="M">남</option><option value="F">여</option></select>
      <select id="b-origin"><option value="common">평민 출신</option><option value="noble">귀족·왕족 출신</option><option value="orphan">고아</option></select>
    </div>
    <div class="row"><span style="width:60px">세력</span><select id="b-fac" style="flex:1"></select></div>
    <h3>타고난 성격 <button class="mini" id="b-trand">무작위</button></h3>
    <div class="sliders" id="b-sliders">${TRAIT_NAMES.map((n, i) => `<span>${n}</span><input type="range" min="0" max="100" value="50" data-ti="${i}"><span id="tv${i}">50</span>`).join('')}</div>
    <p class="dim">숨은 자질(왕·용사·마왕·현자…)은 정할 수 없습니다. 살아가며 드러날 뿐입니다.
    아주 드물게, 운명이 당신의 선택을 비틀어 전혀 다른 존재로 태어나게 하기도 합니다.</p>
    <div class="row" style="justify-content:flex-end"><button id="b-cancel">취소</button><button id="b-go" class="accent">탄생</button></div>
  `);
  // 고른 종족이 사는 나라만 고를 수 있다
  const facSel = m.querySelector('#b-fac') as HTMLSelectElement;
  const raceSel = m.querySelector('#b-race') as HTMLSelectElement;
  const fillFac = () => {
    const places = birthplaces(w, raceSel.value as RaceKey);
    const byFac = new Map<number, number>();
    for (const s of places) byFac.set(s.faction, (byFac.get(s.faction) ?? 0) + 1);
    const facs = [...byFac.keys()].map(id => w.factions[id]).sort((a, b) => b.pop - a.pop);
    facSel.innerHTML = `<option value="">어느 나라든 (운명에 맡긴다)</option>` + facs.map(f => `<option value="${f.id}">${esc(f.name)} — ${RACES[f.race].titles[f.tier]}의 나라 · 고을 ${byFac.get(f.id)}곳 · 인구 ${Math.round(f.pop)}${Object.keys(f.wars).length ? ' · 전쟁 중' : ''}</option>`).join('');
  };
  raceSel.addEventListener('change', fillFac);
  fillFac();
  const sliders = m.querySelectorAll<HTMLInputElement>('#b-sliders input');
  const sync = () => sliders.forEach(s => { const i = +s.dataset.ti!; traits[i] = +s.value; m.querySelector(`#tv${i}`)!.textContent = s.value; });
  sliders.forEach(s => s.addEventListener('input', sync));
  m.querySelector('#b-trand')!.addEventListener('click', () => { sliders.forEach(s => { s.value = String(Math.round(15 + Math.random() * 70)); }); sync(); });
  m.querySelector('#b-cancel')!.addEventListener('click', closeModal);
  m.querySelector('#b-random')!.addEventListener('click', () => {
    closeModal();
    const race = races[Math.floor(Math.random() * races.length)];
    const origins: Origin[] = ['common', 'common', 'noble', 'orphan'];
    onBorn({ race, sex: Math.random() < 0.5 ? 'M' : 'F', origin: origins[Math.floor(Math.random() * origins.length)] });
  });
  m.querySelector('#b-go')!.addEventListener('click', () => {
    const name = (m.querySelector('#b-name') as HTMLInputElement).value.trim().slice(0, 12);
    closeModal();
    onBorn({
      name: name || undefined,
      race: (m.querySelector('#b-race') as HTMLSelectElement).value as RaceKey,
      sex: (m.querySelector('#b-sex') as HTMLSelectElement).value as 'M' | 'F',
      origin: (m.querySelector('#b-origin') as HTMLSelectElement).value as Origin,
      traits: [...traits],
      faction: facSel.value === '' ? undefined : +facSel.value,
    });
  });
}

export function choiceModal(w: World, onChoose: (id: string) => string, onDone: () => void): void {
  const P = w.player!;
  const pr = P.prompt!;
  const c = w.chars[P.charId];
  const m = openModal(`
    <h2>${esc(pr.title)}</h2>
    <div class="dim">${dateStr(w)} · ${esc(c.name)} (${Math.floor((w.t - c.born) / 12)}세)</div>
    <div class="story">${esc(pr.text)}</div>
    <div class="choices">${pr.choices.map(ch => `<button class="choice" data-ch="${esc(ch.id)}">
      ${ch.chance !== undefined ? `<span class="pc">${Math.round(ch.chance * 100)}%</span>` : ''}<b>${esc(ch.label)}</b><small>${esc(ch.desc)}</small>${ch.preview ? `<small class="pv">${ch.failPreview !== undefined ? '성공: ' : ''}${esc(ch.preview)}</small>` : ''}${ch.failPreview ? `<small class="pv bad">실패: ${esc(ch.failPreview)}</small>` : ''}</button>`).join('')}</div>
  `, false);
  m.querySelectorAll<HTMLButtonElement>('.choice').forEach(b => b.addEventListener('click', () => {
    const result = onChoose(b.dataset.ch!);
    const [body, diff] = result.split(' 【변화】');
    m.innerHTML = `<h2>${esc(pr.title)}</h2><div class="story">${esc(body)}</div>${diff ? `<div class="diff">변화: ${esc(diff.trim())}</div>` : ''}<div class="row" style="justify-content:flex-end"><button id="c-ok" class="accent">계속</button></div>`;
    const ok = m.querySelector('#c-ok') as HTMLButtonElement;
    ok.focus();
    ok.addEventListener('click', () => { closeModal(); onDone(); });
  }));
}

export function deathModal(w: World, h: { onHeir: () => void; onWatch: () => void; onReborn: () => void }): void {
  const P = w.player!;
  const c = w.chars[P.charId];
  const sum = playerSummary(w);
  const heirs = c.children.filter(id => w.chars[id]?.died < 0).length;
  const m = openModal(`
    <h2>† ${esc(c.name)}의 생애</h2>
    <p>${sum.lines.map(esc).join('<br>')}</p>
    <h3>일대기</h3>
    <div class="log" style="max-height:260px;overflow-y:auto">${c.bio.map(b => `<div><span class="when">${dateStr(w, b.t)}</span>${esc(b.text)}</div>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      ${heirs ? `<button id="d-heir" class="accent">자식으로 이어하기 (${heirs}명)</button>` : ''}
      <button id="d-reborn">새로 태어나기</button>
      <button id="d-watch">관람으로 돌아가기</button>
    </div>`, false);
  m.querySelector('#d-heir')?.addEventListener('click', () => { closeModal(); h.onHeir(); });
  m.querySelector('#d-reborn')!.addEventListener('click', () => { closeModal(); h.onReborn(); });
  m.querySelector('#d-watch')!.addEventListener('click', () => { closeModal(); h.onWatch(); });
}

export function endModal(w: World, onNew: () => void): void {
  const m = openModal(`
    <h2>☠ 세계의 종말</h2>
    <div class="story">${esc(w.doom.endText)}</div>
    <p>시드 <b style="font-family:var(--mono)">${esc(w.seed)}</b> · ${dateStr(w)} · ${Math.floor(w.t / 12)}년의 역사</p>
    <p class="dim">극히 낮은 확률이 겹쳐야만 일어나는 결말입니다. 연대기 탭에서 이 세계의 마지막 시대를 돌아볼 수 있습니다.</p>
    <div class="row" style="justify-content:flex-end"><button id="e-close">연대기 보기</button><button id="e-new" class="accent">새 세계</button></div>`, false);
  m.querySelector('#e-close')!.addEventListener('click', closeModal);
  m.querySelector('#e-new')!.addEventListener('click', () => { closeModal(); onNew(); });
}

export function helpModal(): void {
  const m = openModal(`
    <h2>도움말</h2>
    <h3>조작</h3>
    <div class="kv">
      <span>지도 이동</span><span>드래그 · 휠로 확대/축소 · 더블클릭 확대</span>
      <span>선택</span><span>정착지·인물·땅 클릭 → 오른쪽 '살펴보기'</span>
      <span>추적</span><span>인물을 선택하고 [추적] — 카메라가 따라가며 매달 행적이 쌓입니다</span>
      <span>소식 클릭</span><span>사건이 일어난 곳으로 이동</span>
      <span>단축키</span><span>Space 일시정지 · 1~4 속도 · . 한 달 진행 · Q/W/E/R/T 층 전환</span>
    </div>
    <h3>시간</h3>
    <p>한 턴은 한 달입니다. 느림 30초 · 중간 20초 · 빠름 10초 · 매우빠름 5초.</p>
    <h3>세계의 규칙</h3>
    <p>모든 칸에는 식량·목재·석재·광석·마나·금이 나고, 정착지는 인구만큼 소비합니다. 부족하면 지도자의 성격에 따라 교역을 맺거나 약탈·전쟁을 벌입니다.
    인구와 발전도가 오르면 야영지는 마을·도시·성채로 자라고, 세력은 부족에서 공국·왕국·제국으로 커집니다. 왕관은 저절로 주어지지 않습니다.
    추대, 찬탈, 계승 전쟁, 독립 같은 사건을 거쳐야 왕이 납니다.</p>
    <p>인물마다 성격 10가지와 숨은 자질 6가지가 있습니다. 자질은 사건(고향의 함락, 성검, 계시, 심연의 속삭임…)을 겪을 때 깨어납니다.</p>
    <p>일곱 봉인 중 넷 이상이 동시에 무너지면, 희박한 확률로 세계가 멸망합니다.</p>
    <h3>범례</h3>
    <div class="help-grid">${legendHTML().replace(/<div>/g, '').replace(/<\/div>/g, '')}</div>
    <div class="row" style="justify-content:flex-end"><button id="h-ok" class="accent">닫기</button></div>`);
  m.querySelector('#h-ok')!.addEventListener('click', closeModal);
}

export function loadModal(hasLocal: boolean, h: { onLocal: () => void; onFile: (f: File) => void }): void {
  const m = openModal(`
    <h2>불러오기</h2>
    <div class="choices">
      <button class="choice" id="l-local" ${hasLocal ? '' : 'disabled'}><b>브라우저에 저장된 세계</b><small>${hasLocal ? '마지막으로 [저장]한 세계' : '저장된 세계가 없습니다'}</small></button>
      <label class="choice" style="cursor:pointer;border:1px solid var(--line);border-radius:3px;background:var(--panel2)"><b>파일에서 불러오기</b><small>[내보내기]로 받은 .json 파일</small><input type="file" id="l-file" accept=".json" hidden></label>
    </div>
    <div class="row" style="justify-content:flex-end"><button id="l-cancel">취소</button></div>`);
  m.querySelector('#l-local')!.addEventListener('click', () => { closeModal(); h.onLocal(); });
  m.querySelector('#l-file')!.addEventListener('change', e => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { closeModal(); h.onFile(f); }
  });
  m.querySelector('#l-cancel')!.addEventListener('click', closeModal);
}
