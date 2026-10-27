import type { Cinematic, World } from '../sim/state';
import { dateStr } from '../sim/state';
import { esc } from './panels';

interface Theme { icon: string; c1: string; c2: string; particle: string; pcol: string }

export const SEAL_THEME: Theme[] = [
  { icon: 'Ψ', c1: '#ff2a2a', c2: '#1a0000', particle: '✦', pcol: '#ff5a3a' },   // 마왕 강림
  { icon: '♆', c1: '#2affc8', c2: '#00121a', particle: '◦', pcol: '#3ad0b0' },   // 심해의 분노
  { icon: '✚', c1: '#ffd860', c2: '#120c00', particle: '❖', pcol: '#fff6d0' },   // 천상 성역 함락
  { icon: '♣', c1: '#7dff8a', c2: '#0f0a03', particle: '❦', pcol: '#a07a3a' },   // 세계수 고사
  { icon: 'Ð', c1: '#ff7a1a', c2: '#1a0600', particle: '✦', pcol: '#ffb040' },   // 고대 용의 분노
  { icon: '☣', c1: '#b6ff3a', c2: '#061200', particle: '•', pcol: '#9ad03a' },   // 대역병
  { icon: '◉', c1: '#ff4fd8', c2: '#12001a', particle: '✧', pcol: '#d070ff' },   // 차원문 대개방
];
const END_THEME: Theme = { icon: '☠', c1: '#ffffff', c2: '#000000', particle: '·', pcol: '#ff3030' };
const SKY_THEME: Theme = { icon: '♛', c1: '#b04aff', c2: '#0a0012', particle: '✦', pcol: '#ff4a8a' };
const LOVE_THEME: Theme = { icon: '♥', c1: '#ff7ab8', c2: '#1a0610', particle: '♥', pcol: '#ffb0d0' };
const ORDINAL = ['첫 번째', '두 번째', '세 번째', '네 번째', '다섯 번째', '여섯 번째', '일곱 번째'];

let queue: Cinematic[] = [];
let showing = false;
let onAllDone: (() => void) | null = null;

export function isCinemaOpen(): boolean { return showing; }

/** 대기 중인 연출을 차례로 보여준다. 다 끝나면 done 호출 */
export function playCinematics(w: World, done: () => void): boolean {
  if (!w.cinematics.length) return false;
  queue.push(...w.cinematics);
  w.cinematics = [];
  onAllDone = done;
  if (!showing) next(w);
  return true;
}

function next(w: World) {
  const c = queue.shift();
  const root = document.getElementById('cinema')!;
  if (!c) {
    showing = false;
    root.hidden = true;
    root.innerHTML = '';
    const d = onAllDone;
    onAllDone = null;
    d?.();
    return;
  }
  showing = true;
  const theme = c.kind === 'love' ? LOVE_THEME : c.kind === 'end' ? (c.seal === -2 ? SKY_THEME : END_THEME) : SEAL_THEME[c.seal];
  const restore = c.kind === 'restore' || c.kind === 'love';
  const broken = w.doom.seals.filter(Boolean).length;
  const label = c.kind === 'love' ? '전설이 비틀리다' : c.kind === 'end' ? (c.seal === -2 ? '숨겨진 결말' : '세계 멸망') : restore ? '봉인 회복' : `${ORDINAL[c.seal]} 봉인 붕괴`;
  const particles = Array.from({ length: restore ? 30 : 60 }, () => {
    const x = Math.random() * 100, dl = Math.random() * 4, du = 3 + Math.random() * 5, sz = 8 + Math.random() * 18;
    return `<i style="left:${x}%;animation-delay:${dl}s;animation-duration:${du}s;font-size:${sz}px">${theme.particle}</i>`;
  }).join('');
  const seals = w.doom.seals.map((b, i) => (!b && !w.doom.seen?.[i] ? '<span>?</span>' : `<span class="${b ? 'b' : ''} ${i === c.seal ? 'cur' : ''}">${SEAL_THEME[i].icon}</span>`)).join('');
  root.className = `cin ${restore ? 'restore' : c.kind === 'end' ? 'end' : 'break'}`;
  const gold = c.kind === 'restore';
  root.style.setProperty('--c1', gold ? '#ffe9a0' : theme.c1);
  root.style.setProperty('--c2', gold ? '#1a1406' : theme.c2);
  root.style.setProperty('--pc', gold ? '#fff3c0' : theme.pcol);
  root.innerHTML = `
    <div class="cin-flash"></div>
    <div class="cin-bg"></div>
    <div class="cin-particles ${restore ? 'up' : ''}">${particles}</div>
    <div class="cin-content">
      <div class="cin-label">${esc(label)} · ${dateStr(w)}</div>
      <div class="cin-icon">${theme.icon}</div>
      <div class="cin-title">${esc(c.title)}</div>
      <div class="cin-text">${esc(c.text).replace(/\n/g, '<br>')}</div>
      ${c.kind === 'end' || c.kind === 'love' ? '' : `<div class="cin-seals">${seals}</div><div class="cin-count">무너진 봉인 ${broken} / 7${broken >= 4 ? ' — 세계가 멸망할 수 있다' : ''}</div>`}
      <div class="cin-hint">클릭하여 계속</div>
    </div>`;
  root.hidden = false;
  if (!restore) {
    const app = document.getElementById('app')!;
    app.classList.remove('shake');
    void app.offsetWidth;
    app.classList.add('shake');
  }
  const opened = performance.now();
  const close = () => {
    if (performance.now() - opened < 1400) return;
    root.removeEventListener('click', close);
    window.removeEventListener('keydown', key);
    root.classList.add('out');
    setTimeout(() => next(w), 450);
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); close(); } };
  root.addEventListener('click', close);
  window.addEventListener('keydown', key);
}
