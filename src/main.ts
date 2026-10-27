import { createWorld } from './sim/world';
import { tick } from './sim/tick';
import type { World } from './sim/state';
import { LAYER_INFO, SEASON_NAMES, dateStr, seasonOf, yearOf } from './sim/state';
import { createPlayer, continueAsHeir, resolvePlayer } from './sim/player';
import { bookHTML } from './ui/book';
import { RES_NAMES } from './data/terrain';
import { exportFile, hasLocalSave, importFile, loadLocal, saveLocal } from './sim/save';
import { MapRenderer, type MapMode } from './ui/renderer';
import * as P from './ui/panels';
import * as M from './ui/modals';
import { isCinemaOpen, playCinematics } from './ui/cinema';
import { SEAL_NAMES } from './sim/doom';
import { summaryHTML, takeSnapshot, type Snapshot } from './ui/summary';
import { fixJosa } from './data/text';
import { ACHIEVEMENTS, TIER_COLORS, TIER_NAMES, evalAchievements } from './sim/achievements';

const ACHV_KEY = 'fanta-achievements';
const unlocked = new Set<string>(loadAchv());
function loadAchv(): string[] {
  try { return JSON.parse(localStorage.getItem(ACHV_KEY) ?? '[]'); } catch { return []; }
}
let achvToasts = 0;
function checkAchievements() {
  const w = S.w;
  if (!w) return;
  const fresh = evalAchievements(w, unlocked);
  if (!fresh.length) return;
  for (const id of fresh) unlockAchv(id, false);
  saveAchv();
}

/** 화면 조작 업적 등 즉시 해금 */
function uiUnlock(id: string) {
  if (unlocked.has(id)) return;
  unlockAchv(id, true);
}

function saveAchv() {
  try { localStorage.setItem(ACHV_KEY, JSON.stringify([...unlocked])); } catch { /* 저장 불가 */ }
  if (S.bottomTab === 'achv') updateBottom();
}

function unlockAchv(id: string, save: boolean) {
  unlocked.add(id);
  const a = ACHIEVEMENTS.find(x => x.id === id)!;
  const d = document.createElement('div');
  d.className = 'achv-toast';
  d.style.setProperty('--tc', TIER_COLORS[a.tier]);
  d.style.top = `${60 + (achvToasts % 4) * 78}px`;
  d.innerHTML = `<div class="tier">업적 달성 · ${TIER_NAMES[a.tier]}</div><div class="nm">🏆 ${P.esc(a.name)}</div><small>${P.esc(a.desc)}</small>`;
  document.body.appendChild(d);
  achvToasts++;
  setTimeout(() => { d.remove(); achvToasts = Math.max(0, achvToasts - 1); }, 5000);
  if (save) saveAchv();
}

const SPEEDS = [20000, 10000, 5000, 2000];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Inspect = { kind: 'none' } | { kind: 'char'; id: number } | { kind: 'set'; id: number } | { kind: 'fac'; id: number } | { kind: 'house'; id: number } | { kind: 'caravan'; id: number } | { kind: 'camp'; id: number } | { kind: 'tile'; l: number; x: number; y: number };

const S = {
  w: null as World | null,
  speed: 1,
  paused: false,
  acc: 0,
  last: performance.now(),
  newsRange: 3,
  bottomTab: 'log',
  logCat: 'all',
  peopleQ: '',
  peopleFilter: 'all',
  inspect: { kind: 'none' } as Inspect,
  track: -1,
  skipping: false,
  skipStart: 0,
  hudPrev: {} as Record<string, number>,
  secret: false,
  deathShown: false,
  endShown: false,
  artSel: -1,
  /** 나의 일대기: 사소한 줄까지 모두 보기 */
  lifeAll: false,
  /** 큰일이 생기면 속도를 늦춘다 */
  autoSlow: true,
  /** 여러 해 건너뛰기 진행 상태 */
  ff: null as null | { target: number; snap: Snapshot; years: number; stopped: string },
};

const renderer = new MapRenderer($<HTMLCanvasElement>('map'));

// ───────────── 세계 시작

function startWorld(w: World) {
  S.w = w;
  S.inspect = { kind: 'none' };
  S.track = -1;
  S.deathShown = !!w.player?.dead;
  S.endShown = w.doom.ended;
  S.hudPrev = {};
  S.acc = 0;
  w.cinematics = [];
  renderer.setWorld(w);
  renderer.resize();
  renderer.fitLayer(2);
  renderer.selectedChar = -1;
  renderer.selectedSettlement = -1;
  $('seed-text').textContent = w.seed;
  if (w.player && !w.player.dead) S.track = w.player.charId;
  updateAll();
  checkAchievements();
}

function newWorldDialog(first = false) {
  M.startModal({
    canContinue: hasLocalSave(),
    current: first ? undefined : S.w?.seed,
    onCreate: seed => {
      $('date-text').textContent = '세계 창조 중…';
      setTimeout(() => startWorld(createWorld(seed)), 20);
    },
    onContinue: () => loadSaved(),
    onFile: f => loadFromFile(f),
  });
}

async function loadSaved() {
  try {
    const w = await loadLocal();
    if (w) { startWorld(w); M.toast('저장된 세계를 불러왔다.'); }
    else M.toast('저장된 세계가 없다.');
  } catch (e) {
    console.error(e);
    M.toast('불러오기에 실패하였다.');
  }
}

async function loadFromFile(f: File) {
  try { startWorld(await importFile(f)); M.toast('파일에서 세계를 불러왔다.'); }
  catch (e) { console.error(e); M.toast('파일을 읽지 못하였다.'); }
}

// ───────────── 진행

function doTick(render = true) {
  const w = S.w;
  if (!w || w.doom.ended) return;
  const firstNew = w.nextNewsId;
  tick(w);
  // 빠르게 흘려보내다 세상을 뒤흔드는 일이 생기면 '중간' 속도로 늦춘다
  if (S.autoSlow && !S.ff && !S.skipping && !S.paused && S.speed >= 2) {
    const big = w.news.find(n => n.id >= firstNew && n.imp >= 5);
    if (big) { setSpeed(1); M.toast(`큰일이 일어나 속도를 늦추었다 — ${big.text.slice(0, 40)}…`); }
  }
  renderer.tickTime = performance.now();
  renderer.animMs = Math.min(1500, SPEEDS[S.speed] * 0.6);
  renderer.refreshTerritory();
  if (render) updateAll();
  checkAchievements();
  checkInterrupts();
}

function checkInterrupts() {
  const w = S.w!;
  if (isCinemaOpen()) return;
  if (w.cinematics.length) {
    // 재앙의 연출: 시간을 멈추고 화면 전체를 덮는다
    S.skipping = false;
    if (S.ff && !S.ff.stopped) {
      // 여러 해 건너뛰기 도중이면 여기서 끝내고, 연출 뒤에 요약을 보여 준다
      const ff = S.ff;
      const done = Math.floor((ff.years * 12 - (ff.target - w.t)) / 12);
      const titles = [...new Set(w.cinematics.map(c => c.title))].join(', ');
      ff.stopped = `${dateStr(w)}, 「${titles}」(으)로 멈추었다 (${done}/${ff.years}년 진행)`;
    }
    updateAll();
    playCinematics(w, () => { updateAll(); checkInterrupts(); });
    return;
  }
  if (w.doom.ended && !S.endShown) {
    S.endShown = true;
    S.skipping = false;
    updateAll();
    M.endModal(w, () => newWorldDialog());
    return;
  }
  const PL = w.player;
  if (!PL) return;
  if (PL.dead && !S.deathShown) {
    S.deathShown = true;
    S.skipping = false;
    if (S.ff && !S.ff.stopped) {
      const ff = S.ff;
      const done = Math.floor((ff.years * 12 - (ff.target - w.t)) / 12);
      ff.stopped = `${dateStr(w)}, ${w.chars[PL.charId].name}의 생이 끝나 멈추었다 (${done}/${ff.years}년 진행)`;
    }
    updateAll();
    M.deathModal(w, {
      onHeir: () => {
        if (continueAsHeir(w)) { S.deathShown = false; S.track = w.player!.charId; S.hudPrev = {}; M.toast('자식의 삶이 이어진다.'); }
        updateAll();
      },
      onWatch: () => { S.track = -1; updateAll(); },
      onReborn: () => openBirth(),
    });
    return;
  }
  if (PL.prompt && !M.isModalOpen()) {
    S.skipping = false;
    if (S.ff && !S.ff.stopped) {
      const ff = S.ff;
      const done = Math.floor((ff.years * 12 - (ff.target - w.t)) / 12);
      ff.stopped = `${dateStr(w)}, 인생의 갈림길 「${PL.prompt.title}」에서 멈추었다 (${done}/${ff.years}년 진행)`;
    }
    updateAll();
    M.choiceModal(w, id => {
      const r = resolvePlayer(w, id);
      updateAll();
      return r;
    }, () => { updateAll(); checkInterrupts(); });
  }
}

function loop(now: number) {
  const dt = Math.min(250, now - S.last);
  S.last = now;
  const w = S.w;
  if (w && !M.isModalOpen() && !isCinemaOpen()) {
    if (S.ff) {
      // 여러 해 건너뛰기: 한 프레임에 약 30ms씩 진행
      const ff = S.ff;
      const until = performance.now() + 30;
      while (w.t < ff.target && !ff.stopped && !w.doom.ended && performance.now() < until && !M.isModalOpen() && !isCinemaOpen()) doTick(false);
      const done = ff.years * 12 - (ff.target - w.t);
      $('ff-bar').querySelector<HTMLElement>('.ff-text')!.textContent = `${ff.years}년을 흘려보내는 중… ${dateStr(w)} (${Math.floor(done / 12)}/${ff.years}년)`;
      $('ff-bar').querySelector<HTMLElement>('i')!.style.width = `${(done / (ff.years * 12)) * 100}%`;
      if ((w.t >= ff.target || w.doom.ended || ff.stopped) && !M.isModalOpen() && !isCinemaOpen()) finishFastForward();
      else if (Math.floor(done) % 6 === 0) updateAll();
    } else if (S.skipping) {
      // 다음 중요한 순간까지 빠르게 진행
      const until = performance.now() + 28;
      let n = 0;
      while (S.skipping && performance.now() < until && !M.isModalOpen() && !isCinemaOpen()) {
        doTick(false);
        n++;
        if (w.t - S.skipStart > 12 * 80) S.skipping = false;
      }
      if (n) updateAll();
    } else if (!S.paused && !w.doom.ended) {
      S.acc += dt;
      if (S.acc >= SPEEDS[S.speed]) { S.acc = 0; doTick(); }
    }
  }
  $('progress-bar').style.width = `${S.paused ? 0 : Math.min(100, (S.acc / SPEEDS[S.speed]) * 100)}%`;
  if (w) {
    followTrack();
    renderer.draw(now);
  }
  requestAnimationFrame(loop);
}

function startFastForward(years: number) {
  const w = S.w;
  if (!w || w.doom.ended || S.ff) return;
  S.skipping = false;
  S.ff = { target: w.t + years * 12, snap: takeSnapshot(w), years, stopped: '' };
  $('ff-bar').hidden = false;
}

function finishFastForward() {
  const w = S.w!;
  const ff = S.ff!;
  S.ff = null;
  $('ff-bar').hidden = true;
  updateAll();
  const why = fixJosa(ff.stopped || (w.doom.ended ? '세계가 멸망하여 멈추었다' : ''));
  const m = M.openModal(summaryHTML(w, ff.snap, why));
  m.classList.add('wide');
  m.querySelector('#sum-ok')!.addEventListener('click', () => { M.closeModal(); checkInterrupts(); });
}

function followTrack() {
  const w = S.w!;
  if (S.track < 0) return;
  const c = w.chars[S.track];
  if (!c || c.died >= 0) return;
  if (renderer.cam.l !== c.l) { renderer.cam.l = c.l; updateLayerTabs(); }
  const t = Math.min(1, (performance.now() - renderer.tickTime) / renderer.animMs);
  const x = (c.pl === c.l ? c.px + (c.x - c.px) * t : c.x) + 0.5;
  const y = (c.pl === c.l ? c.py + (c.y - c.py) * t : c.y) + 0.5;
  renderer.cam.x += (x - renderer.cam.x) * 0.08;
  renderer.cam.y += (y - renderer.cam.y) * 0.08;
}

// ───────────── 화면 갱신

function updateAll() {
  const w = S.w;
  if (!w) return;
  $('date-text').textContent = dateStr(w);
  $('season-text').textContent = SEASON_NAMES[seasonOf(w.t)];
  document.querySelectorAll<HTMLButtonElement>('#top .speed [data-speed]').forEach(b => {
    const v = +b.dataset.speed!;
    b.classList.toggle('on', v === -1 ? S.paused : !S.paused && v === S.speed);
  });
  $('news-list').innerHTML = P.newsHTML(w, S.newsRange);
  // 최근 2년의 큰 사건 자리
  renderer.pins = [];
  for (let i = w.news.length - 1; i >= 0; i--) { const n = w.news[i]; if (n.t < w.t - 24) break; if (n.imp >= 4 && n.pos) renderer.pins.push({ l: n.pos.l, x: n.pos.x, y: n.pos.y, imp: n.imp, age: w.t - n.t }); }
  document.querySelectorAll<HTMLButtonElement>('#news-range button').forEach(b => b.classList.toggle('on', +b.dataset.range! === S.newsRange));
  updateInspect();
  updateBottom();
  updateHud();
  updateLayerTabs();
}

function updateInspect() {
  const w = S.w!;
  const box = $('inspect');
  const top = box.scrollTop;
  const I = S.inspect;
  renderer.selectedCaravan = I.kind === 'caravan' ? I.id : -1;
  renderer.selectedCamp = I.kind === 'camp' ? I.id : -1;
  let html = '<p class="dim">지도에서 정착지·인물·땅을 클릭하세요.</p>';
  let actions = '';
  if (I.kind === 'char') {
    const c = w.chars[I.id];
    html = P.inspectChar(w, c, S.secret);
    actions = `<button class="mini ${S.track === c.id ? 'on' : ''}" id="ins-track">${S.track === c.id ? '추적 중' : '추적'}</button> <button class="mini" id="ins-goto">위치로</button>`;
  } else if (I.kind === 'set') {
    html = P.inspectSettlement(w, w.settlements[I.id]);
    actions = '<button class="mini" id="ins-goto">위치로</button>';
  } else if (I.kind === 'fac') {
    html = P.inspectFaction(w, w.factions[I.id]);
    actions = '<button class="mini" id="ins-goto">수도로</button>';
  } else if (I.kind === 'house') {
    html = P.inspectHouse(w, w.houses[I.id]);
    actions = '<button class="mini" id="ins-goto">영지로</button>';
  } else if (I.kind === 'camp') {
    const k = w.camps?.[I.id];
    if (k) { html = P.inspectCamp(w, k); actions = '<button class="mini" id="ins-goto">위치로</button>'; }
  } else if (I.kind === 'caravan') {
    const k = w.caravans?.[I.id];
    if (k) { html = P.inspectCaravan(w, k); actions = k.alive ? '<button class="mini" id="ins-goto">위치로</button>' : ''; }
  } else if (I.kind === 'tile') html = P.inspectTile(w, I.l, I.x, I.y);
  box.innerHTML = html;
  $('inspect-actions').innerHTML = actions;
  box.scrollTop = top;
  $('ins-track')?.addEventListener('click', () => {
    if (I.kind !== 'char') return;
    S.track = S.track === I.id ? -1 : I.id;
    if (S.track >= 0) uiUnlock('u_track');
    updateInspect();
  });
  $('ins-goto')?.addEventListener('click', () => {
    if (I.kind === 'char') jumpTo(w.chars[I.id]);
    if (I.kind === 'set') jumpTo(w.settlements[I.id]);
    if (I.kind === 'fac') { const cap = w.settlements[w.factions[I.id].capital]; if (cap) jumpTo(cap); }
    if (I.kind === 'house') { const s = w.settlements[w.houses[I.id].seat]; if (s) jumpTo(s); }
    if (I.kind === 'caravan') { const k = w.caravans?.[I.id]; if (k) jumpTo(k); }
    if (I.kind === 'camp') { const k = w.camps?.[I.id]; if (k) jumpTo(k); }
  });
}

function updateBottom() {
  const w = S.w!;
  const body = $('bottom-body');
  const top = body.scrollTop;
  document.querySelectorAll<HTMLButtonElement>('#bottom-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.bottomTab));
  $('tab-mylife').hidden = !w.player;
  const focused = document.activeElement?.id === 'people-q';
  switch (S.bottomTab) {
    case 'log': body.innerHTML = P.logTab(w, S.logCat); break;
    case 'chronicle': body.innerHTML = P.chronicleTab(w); break;
    case 'factions': body.innerHTML = P.factionsTab(w); break;
    case 'people':
      if (focused) return;
      body.innerHTML = P.peopleTab(w, S.peopleQ, S.peopleFilter);
      break;
    case 'seals': body.innerHTML = P.sealsTab(w); break;
    case 'stats': body.innerHTML = P.statsTab(w); break;
    case 'mylife': body.innerHTML = P.myLifeTab(w, S.lifeAll); break;
    case 'stories': body.innerHTML = P.storiesTab(w); break;
    case 'faith': body.innerHTML = P.faithTab(w); break;
    case 'achv': body.innerHTML = P.achievementsTab(unlocked); break;
    case 'arts': body.innerHTML = P.artifactsTab(w, S.artSel); break;
  }
  body.scrollTop = top;
}

function updateHud() {
  const w = S.w!;
  const hud = $('player-hud');
  if (!w.player) { hud.hidden = true; return; }
  hud.hidden = false;
  const { html, snap } = P.playerHudHTML(w, S.hudPrev, S.skipping);
  hud.innerHTML = html;
  S.hudPrev = snap;
  $('btn-skip')?.addEventListener('click', () => {
    S.skipping = !S.skipping;
    S.skipStart = w.t;
    if (S.skipping) M.toast('다음 중요한 순간까지 시간을 흘려보낸다…');
    updateHud();
  });
  $('btn-track-me')?.addEventListener('click', () => {
    S.track = w.player!.charId;
    selectChar(S.track, false);
  });
}

function updateLayerTabs() {
  const w = S.w;
  if (!w) return;
  const since = w.t - 2;
  const counts = [0, 0, 0, 0, 0];
  for (let i = w.news.length - 1; i >= 0; i--) {
    const n = w.news[i];
    if (n.t < since) break;
    if (n.imp >= 3 && n.pos) counts[n.pos.l]++;
  }
  $('layer-tabs').innerHTML = LAYER_INFO.map(L => `<button data-layer="${L.id}" class="${renderer.cam.l === L.id ? 'on' : ''}">${'QWERT'[L.id]} · ${L.name}${counts[L.id] ? `<span class="badge">${counts[L.id]}</span>` : ''}</button>`).join('');
  $('map-layer-name').textContent = LAYER_INFO[renderer.cam.l].name;
}

// ───────────── 선택 / 이동

function jumpTo(p: { l: number; x: number; y: number }) {
  if (renderer.cam.l !== p.l) { renderer.cam.l = p.l; updateLayerTabs(); }
  renderer.cam.x = p.x + 0.5;
  renderer.cam.y = p.y + 0.5;
  if (renderer.cam.s < 10) renderer.cam.s = 14;
}

function selectChar(id: number, jump = true) {
  S.inspect = { kind: 'char', id };
  renderer.selectedChar = id;
  renderer.selectedSettlement = -1;
  renderer.selectedTile = null;
  const c = S.w!.chars[id];
  if (c.race === 'dragon') uiUnlock('u_dragon');
  if (jump && c.died < 0) jumpTo(c);
  updateInspect();
}
function selectSettlement(id: number, jump = true) {
  S.inspect = { kind: 'set', id };
  renderer.selectedSettlement = id;
  renderer.selectedChar = -1;
  renderer.selectedTile = null;
  if (jump) jumpTo(S.w!.settlements[id]);
  updateInspect();
}
/** 무너진 봉인을 누르면 재앙이 벌어지는 곳으로 간다. 여러 곳이면 누를 때마다 다음 곳으로 */
let sealCycle = 0;
function focusSeal(i: number) {
  const w = S.w!;
  sealCycle++;
  const showTile = (p: { l: number; x: number; y: number }) => {
    jumpTo(p);
    S.inspect = { kind: 'tile', l: p.l, x: p.x, y: p.y };
    renderer.selectedTile = { l: p.l, x: p.x, y: p.y };
    renderer.selectedChar = -1; renderer.selectedSettlement = -1;
    updateInspect();
  };
  const chase = (id: number) => { selectChar(id); S.track = id; updateInspect(); };
  switch (i) {
    case 0: { if (w.demonLord >= 0) { chase(w.demonLord); M.toast('마왕을 추적한다.'); } return; }
    case 1: {
      // 대륙만 한 그림자: 지상 전체를 내려다본다
      const V = w.sea.leviathan;
      if (!V) return;
      S.track = -1;
      if (renderer.cam.l !== 2) { renderer.cam.l = 2; updateLayerTabs(); }
      renderer.cam.x = w.layers[2].w / 2; renderer.cam.y = w.layers[2].h / 2;
      renderer.cam.s = renderer.minScale();
      S.inspect = { kind: 'tile', l: 2, x: V.eye.x, y: V.eye.y };
      renderer.selectedTile = { l: 2, x: V.eye.x, y: V.eye.y };
      updateInspect();
      M.toast(`${V.name} — 남은 촉수 ${V.tentacles.filter(t => t.alive).length}/${V.tentacles.length}`);
      return;
    }
    case 2: { const s = w.settlements.find(x => x.flags.includes('sanctum')); if (s) { S.track = -1; selectSettlement(s.id); } return; }
    case 3: { const s = w.settlements[w.worldTree?.sid ?? -1]; if (s) { S.track = -1; selectSettlement(s.id); } return; }
    case 4: { const d = w.chars.find(c => c.died < 0 && c.ancient); if (d) { chase(d.id); M.toast('고대 용을 추적한다.'); } return; }
    case 5: {
      const sick = w.settlements.filter(s => s.alive && s.plague > 0 && w.diseases[s.disease ?? -1]?.great).sort((a, b) => b.pop - a.pop);
      if (!sick.length) return;
      const s = sick[sealCycle % sick.length];
      S.track = -1;
      selectSettlement(s.id);
      M.toast(`역병이 도는 고을 ${sealCycle % sick.length + 1}/${sick.length}: ${s.name} (다시 누르면 다음 곳)`);
      return;
    }
    case 6: {
      const open = w.portals.filter(p => p.kind === 'rift' && p.open);
      if (!open.length) return;
      const p = open[sealCycle % open.length];
      S.track = -1;
      showTile(p.a.l === 4 ? p.b : p.a);
      M.toast(`열린 균열 ${sealCycle % open.length + 1}/${open.length}: ${p.name} (다시 누르면 다음 곳)`);
      return;
    }
  }
}

function selectFaction(id: number) {
  S.inspect = { kind: 'fac', id };
  const f = S.w!.factions[id];
  const cap = f && S.w!.settlements[f.capital];
  if (cap && cap.alive) { S.track = -1; jumpTo(cap); renderer.selectedSettlement = cap.id; }
  updateInspect();
}

function clickMap(sx: number, sy: number) {
  const w = S.w;
  if (!w) return;
  const [tx, ty] = renderer.toTile(sx, sy);
  const l = renderer.cam.l;
  const L = w.layers[l];
  if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return;
  const st = w.settlements.find(s => s.alive && s.l === l && s.x === tx && s.y === ty);
  if (st) { selectSettlement(st.id, false); return; }
  if (renderer.showChars) {
    const c = w.chars.find(c => c.died < 0 && c.l === l && c.x === tx && c.y === ty && c.act.kind !== 'army' && c.act.kind !== 'colonize');
    if (c) { selectChar(c.id, false); return; }
  }
  // 주둔지
  const cp = renderer.showArmies ? (w.camps ?? []).find(k => k.alive && k.l === l && Math.abs(k.x - tx) <= 1 && Math.abs(k.y - ty) <= 1) : undefined;
  if (cp) { S.inspect = { kind: 'camp', id: cp.id }; renderer.selectedChar = -1; renderer.selectedSettlement = -1; renderer.selectedTile = null; updateInspect(); return; }
  // 상단: 그 칸이나 바로 옆 칸 (움직이는 중이라 조금 너그럽게)
  const k = renderer.showArmies ? (w.caravans ?? []).find(k => k.alive && k.l === l && Math.abs(k.x - tx) <= 1 && Math.abs(k.y - ty) <= 1) : undefined;
  if (k) {
    S.inspect = { kind: 'caravan', id: k.id };
    renderer.selectedCaravan = k.id; renderer.selectedChar = -1; renderer.selectedSettlement = -1; renderer.selectedTile = null;
    updateInspect();
    return;
  }
  renderer.selectedCaravan = -1;
  S.inspect = { kind: 'tile', l, x: tx, y: ty };
  renderer.selectedTile = { l, x: tx, y: ty };
  renderer.selectedChar = -1;
  renderer.selectedSettlement = -1;
  updateInspect();
}

// ───────────── 입력

function bindInput() {
  const wrap = $('mapwrap');
  const canvas = renderer.canvas;
  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  canvas.addEventListener('mousedown', e => {
    drag = { x: e.clientX, y: e.clientY, cx: renderer.cam.x, cy: renderer.cam.y, moved: false };
    wrap.classList.add('drag');
  });
  window.addEventListener('mousemove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        S.track = -1;
        renderer.cam.x = drag.cx - dx / renderer.cam.s;
        renderer.cam.y = drag.cy - dy / renderer.cam.s;
      }
    }
    hover(e);
  });
  window.addEventListener('mouseup', e => {
    if (drag && !drag.moved && e.target === canvas) {
      const r = canvas.getBoundingClientRect();
      clickMap(e.clientX - r.left, e.clientY - r.top);
    }
    drag = null;
    wrap.classList.remove('drag');
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const before = [(mx - renderer.viewW / 2) / renderer.cam.s + renderer.cam.x, (my - renderer.viewH / 2) / renderer.cam.s + renderer.cam.y];
    const f = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    renderer.cam.s = Math.max(renderer.minScale(), Math.min(48, renderer.cam.s * f));
    renderer.cam.x = before[0] - (mx - renderer.viewW / 2) / renderer.cam.s;
    renderer.cam.y = before[1] - (my - renderer.viewH / 2) / renderer.cam.s;
  }, { passive: false });
  canvas.addEventListener('dblclick', e => {
    const r = canvas.getBoundingClientRect();
    const [tx, ty] = renderer.toTile(e.clientX - r.left, e.clientY - r.top);
    renderer.cam.x = tx + 0.5; renderer.cam.y = ty + 0.5;
    renderer.cam.s = Math.min(48, renderer.cam.s * 1.8);
  });
  canvas.addEventListener('mouseleave', () => { $('tooltip').hidden = true; });

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || M.isModalOpen() || isCinemaOpen()) return;
    if (e.code === 'Space') { e.preventDefault(); setPaused(!S.paused); }
    else if (e.key >= '1' && e.key <= '4') setSpeed(+e.key - 1);
    else if (e.key === '.') doTick();
    else {
      const li = 'qwert'.indexOf(e.key.toLowerCase());
      if (li >= 0) switchLayer(li);
    }
  });

  document.querySelectorAll<HTMLButtonElement>('#top .speed [data-speed]').forEach(b => b.addEventListener('click', () => {
    const v = +b.dataset.speed!;
    if (v < 0) setPaused(!S.paused); else setSpeed(v);
  }));
  $('btn-step').addEventListener('click', () => doTick());
  $('btn-10y').addEventListener('click', () => startFastForward(10));
  $('btn-100y').addEventListener('click', () => startFastForward(100));
  $('ff-stop').addEventListener('click', () => { if (S.ff && S.w) S.ff.stopped = `${dateStr(S.w)}, 직접 멈추었다 (${Math.floor((S.ff.years * 12 - (S.ff.target - S.w.t)) / 12)}/${S.ff.years}년 진행)`; });
  $('btn-year').addEventListener('click', () => {
    for (let i = 0; i < 12 && !M.isModalOpen() && !isCinemaOpen() && !S.w?.doom.ended; i++) doTick(false);
    updateAll();
  });
  $('btn-copy-seed').addEventListener('click', () => {
    if (!S.w) return;
    uiUnlock('u_seed');
    navigator.clipboard?.writeText(S.w.seed).then(() => M.toast('시드를 복사하였다.'), () => M.toast(S.w!.seed));
  });
  $('btn-new').addEventListener('click', () => newWorldDialog());
  $('btn-help').addEventListener('click', () => M.helpModal());
  $('btn-save').addEventListener('click', async () => {
    if (!S.w) return;
    try { await saveLocal(S.w); M.toast(`${dateStr(S.w)} — 세계를 저장하였다.`); uiUnlock('u_save'); }
    catch (e) { console.error(e); M.toast('저장 공간이 부족하다. [내보내기]로 파일 저장을 이용하라.'); }
  });
  $('btn-load').addEventListener('click', () => M.loadModal(hasLocalSave(), { onLocal: loadSaved, onFile: loadFromFile }));
  $('btn-export').addEventListener('click', () => S.w && exportFile(S.w));
  $('btn-book').addEventListener('click', () => {
    if (!S.w) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bookHTML(S.w)], { type: 'text/html' }));
    a.download = `연대기-${S.w.seed}-${yearOf(S.w)}년.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    M.toast('연대기를 한 권의 책으로 엮었다.');
  });
  $('btn-born').addEventListener('click', () => openBirth());

  document.querySelectorAll<HTMLButtonElement>('#mode-tabs button').forEach(b => b.addEventListener('click', () => {
    renderer.mode = b.dataset.mode as MapMode;
    document.querySelectorAll('#mode-tabs button').forEach(x => x.classList.toggle('on', x === b));
  }));
  ($('chk-chars') as HTMLInputElement).addEventListener('change', e => { renderer.showChars = (e.target as HTMLInputElement).checked; });
  ($('chk-armies') as HTMLInputElement).addEventListener('change', e => { renderer.showArmies = (e.target as HTMLInputElement).checked; });
  ($('chk-names') as HTMLInputElement).addEventListener('change', e => { renderer.showNames = (e.target as HTMLInputElement).checked; });
  ($('chk-secret') as HTMLInputElement).addEventListener('change', e => { S.secret = (e.target as HTMLInputElement).checked; updateInspect(); });
  ($('chk-pins') as HTMLInputElement).addEventListener('change', e => { renderer.showPins = (e.target as HTMLInputElement).checked; });
  ($('chk-slow') as HTMLInputElement).addEventListener('change', e => { S.autoSlow = (e.target as HTMLInputElement).checked; });
  document.querySelectorAll<HTMLButtonElement>('#news-range button').forEach(b => b.addEventListener('click', () => {
    S.newsRange = +b.dataset.range!;
    updateAll();
  }));
  document.querySelectorAll<HTMLButtonElement>('#bottom-tabs button').forEach(b => b.addEventListener('click', () => {
    S.bottomTab = b.dataset.tab!;
    if (S.bottomTab === 'chronicle') uiUnlock('u_chronicle');
    $('bottom-body').scrollTop = 0;
    updateBottom();
  }));

  // 위임 클릭: 링크들
  document.addEventListener('click', e => {
    const w = S.w;
    if (!w) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-char],[data-set],[data-fac],[data-news],[data-portal],[data-logcat],[data-pfilter],[data-layer],[data-art],[data-house],[data-seal],[data-jump],[data-lifeall],[data-trackchar]');
    if (!el) return;
    const d = el.dataset;
    if (d.seal !== undefined) focusSeal(+d.seal);
    else if (d.lifeall !== undefined) { S.lifeAll = d.lifeall === '1'; updateBottom(); }
    else if (d.trackchar !== undefined) { selectChar(+d.trackchar); S.track = +d.trackchar; updateInspect(); }
    else if (d.jump !== undefined) {
      const [l, x, y] = d.jump.split(',').map(Number);
      jumpTo({ l, x, y });
      const st = w.settlements.find(s => s.alive && s.l === l && s.x === x && s.y === y);
      if (st) selectSettlement(st.id, false);
    }
    else if (d.house !== undefined) { S.inspect = { kind: 'house', id: +d.house }; updateInspect(); }
    else if (d.art !== undefined) { S.artSel = +d.art; S.bottomTab = 'arts'; updateBottom(); }
    else if (d.layer !== undefined) switchLayer(+d.layer);
    else if (d.char !== undefined) selectChar(+d.char);
    else if (d.set !== undefined) selectSettlement(+d.set);
    else if (d.fac !== undefined) selectFaction(+d.fac);
    else if (d.portal !== undefined) {
      const p = w.portals[+d.portal];
      const I = S.inspect;
      const here = I.kind === 'tile' && p.a.l === I.l && p.a.x === I.x && p.a.y === I.y;
      const other = here ? p.b : p.a;
      jumpTo(other);
      S.inspect = { kind: 'tile', ...other };
      renderer.selectedTile = { ...other };
      updateInspect();
    } else if (d.logcat !== undefined) { S.logCat = d.logcat; updateBottom(); }
    else if (d.pfilter !== undefined) { S.peopleFilter = d.pfilter; updateBottom(); }
    else if (d.news !== undefined) {
      const n = w.news.find(x => x.id === +d.news!);
      if (!n) return;
      const ch = n.chars?.map(id => w.chars[id]).find(c => c && c.died < 0);
      if (ch) selectChar(ch.id);
      else if (n.pos) {
        jumpTo(n.pos);
        const st = w.settlements.find(s => s.alive && s.l === n.pos!.l && s.x === n.pos!.x && s.y === n.pos!.y);
        if (st) selectSettlement(st.id, false);
      } else if (n.facs?.length) selectFaction(n.facs[0]);
    }
  });
  document.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'people-q') {
      S.peopleQ = t.value;
      const pos = t.selectionStart;
      $('bottom-body').innerHTML = P.peopleTab(S.w!, S.peopleQ, S.peopleFilter);
      const ni = $('people-q') as HTMLInputElement;
      ni.focus();
      ni.setSelectionRange(pos, pos);
    }
  });
}

function hover(e: MouseEvent) {
  const w = S.w;
  const tip = $('tooltip');
  if (!w || e.target !== renderer.canvas) { tip.hidden = true; return; }
  const r = renderer.canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const [tx, ty] = renderer.toTile(sx, sy);
  const l = renderer.cam.l;
  const L = w.layers[l];
  if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) { tip.hidden = true; return; }
  const parts: string[] = [];
  const st = w.settlements.find(s => s.alive && s.l === l && s.x === tx && s.y === ty);
  if (st) parts.push(`<b>${P.esc(st.name)}</b> · ${P.esc(w.factions[st.faction]?.name ?? '')} · 인구 ${Math.round(st.pop)}`);
  const cs = w.chars.filter(c => c.died < 0 && c.l === l && c.x === tx && c.y === ty).slice(0, 4);
  for (const c of cs) parts.push(P.esc(`${c.epithet ? c.epithet + ' ' : ''}${c.name}`));
  const a = w.armies.find(a => a.alive && a.l === l && a.x === tx && a.y === ty);
  if (a) parts.push(`${P.esc(w.factions[a.faction]?.name ?? '')} 군대 ${Math.round(a.soldiers)}명`);
  const cpv = (w.camps ?? []).find(k => k.alive && k.l === l && Math.abs(k.x - tx) <= 1 && Math.abs(k.y - ty) <= 1);
  if (cpv) parts.push(`${P.esc(cpv.name)} · 병력 ${Math.round(cpv.soldiers)} → ${P.esc(w.factions[cpv.enemy]?.name ?? '')} <small>(눌러서 자세히)</small>`);
  const kv = (w.caravans ?? []).find(k => k.alive && k.l === l && Math.abs(k.x - tx) <= 1 && Math.abs(k.y - ty) <= 1);
  if (kv) parts.push(`${P.esc(w.factions[kv.fac]?.name ?? '')}의 상단 · ${RES_NAMES[kv.res]} → ${P.esc(w.settlements[kv.to]?.name ?? '')} <small>(눌러서 자세히)</small>`);
  const site = w.sites.find(s => s.l === l && s.x === tx && s.y === ty);
  if (site) parts.push(P.esc(site.name));
  const portal = w.portals.find(p => (p.a.l === l && p.a.x === tx && p.a.y === ty) || (p.b.l === l && p.b.x === tx && p.b.y === ty));
  if (portal) parts.push(`${P.esc(portal.name)} ${portal.open ? '(열림)' : '(봉인)'}`);
  if (!parts.length) { tip.hidden = true; return; }
  tip.innerHTML = parts.join('<br>');
  tip.hidden = false;
  tip.style.left = Math.min(sx + 14, renderer.viewW - 200) + 'px';
  tip.style.top = sy + 14 + 'px';
}

function setPaused(p: boolean) { S.paused = p; updateAll(); }
function setSpeed(i: number) { S.speed = i; S.paused = false; S.acc = Math.min(S.acc, SPEEDS[i] * 0.9); updateAll(); }
function switchLayer(l: number) {
  S.track = -1;
  const layerAch: Record<number, string> = { 0: 'u_heaven', 3: 'u_under', 4: 'u_demon' };
  if (layerAch[l]) uiUnlock(layerAch[l]);
  renderer.fitLayer(l);
  updateLayerTabs();
}

function openBirth() {
  const w = S.w;
  if (!w) return;
  if (w.player && !w.player.dead) { M.toast('이미 이 세계에서 살아가고 있다.'); return; }
  M.birthModal(w, opts => {
    const c = createPlayer(w, opts);
    if (!c) { M.toast('그 종족이 사는 곳이 남아 있지 않다.'); return; }
    S.deathShown = false;
    S.hudPrev = {};
    S.track = c.id;
    S.bottomTab = 'mylife';
    selectChar(c.id);
    renderer.cam.s = Math.max(renderer.cam.s, 16);
    const sp = w.player?.special;
    M.toast(sp === 'dragon' ? `운명이 선택을 비틀었다! ${c.name}, 용으로 태어나다.` : sp === 'guardian' ? `운명이 선택을 비틀었다! ${c.name}, 성역의 수호자로 깨어나다.` : `${c.name}, 세상에 태어나다.`);
    updateAll();
    checkAchievements();
  });
}

// ───────────── 초기화

$('legend').innerHTML = P.legendHTML();
document.querySelector('#mode-tabs [data-mode="political"]')!.classList.add('on');
bindInput();
renderer.resize();
const qs = new URLSearchParams(location.search);
const qSeed = qs.get('seed');
if (qs.has('noanim')) document.body.classList.add('noanim');
if (qSeed) {
  // ?seed=시드 [&years=N] 로 바로 시작 (시드 공유용)
  const w = createWorld(qSeed);
  for (let i = 0; i < Math.min(600, +(qs.get('years') ?? 0)) * 12; i++) tick(w);
  startWorld(w);
  // 개발용: &zoom=N &char=ID &born=1&life=N
  if (qs.get('born')) {
    const c = createPlayer(w, { race: 'human', sex: 'M', origin: 'noble' });
    if (c) {
      S.track = c.id;
      for (let i = 0; i < +(qs.get('life') ?? 0) * 12 && !w.player?.prompt; i++) tick(w);
      selectChar(c.id); updateAll(); checkInterrupts();
    }
  }
  if (qs.get('layer')) switchLayer(+qs.get('layer')!);
  if (qs.get('tab')) { S.bottomTab = qs.get('tab')!; updateBottom(); }
  if (qs.get('char')) selectChar(+qs.get('char')!);
  if (qs.get('zoom')) renderer.cam.s = +qs.get('zoom')!;
  if (qs.get('ff')) startFastForward(+qs.get('ff')!);
  if (qs.get('cine')) {
    const i = +qs.get('cine')!;
    w.doom.seals[i] = true;
    w.cinematics.push({ kind: qs.get('kind') === 'restore' ? 'restore' : 'break', seal: i, title: SEAL_NAMES[i], text: '시험용 연출입니다.' });
    checkInterrupts();
  }
} else newWorldDialog(true);
requestAnimationFrame(loop);
