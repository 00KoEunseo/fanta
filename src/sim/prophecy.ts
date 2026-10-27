import { RACES } from '../data/races';
import { fixJosa, pct } from '../data/text';
import type { Prophecy, World } from './state';
import { aliveFactions, leaderOf } from './helpers';
import { pTierUp, pWarMonth } from './factions';
import { pDeathMonth } from './characters';
import { pAttackWin } from './military';
import { EVENTS } from './events';
import { brokenCount, omen, pDoomMonth, sealTotal } from './doom';

const H = 3; // 한 계절 = 3개월
const agg = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), H);

export function computeProphecy(w: World): Prophecy[] {
  const out: Prophecy[] = [];
  const facs = aliveFactions(w);

  // 전쟁 발발
  for (let i = 0; i < facs.length; i++) for (let j = i + 1; j < facs.length; j++) {
    const a = facs[i], b = facs[j];
    const p = 1 - (1 - agg(pWarMonth(w, a, b))) * (1 - agg(pWarMonth(w, b, a)));
    if (p > 0.015) out.push({ text: `${a.name}과(와) ${b.name} 사이에 전쟁이 일어난다`, p, imp: a.tier + b.tier >= 3 ? 4 : 3, cat: 'war' });
  }
  // 진행 중인 공성
  for (const a of w.armies) {
    if (!a.alive || (a.goal !== 'conquer' && a.goal !== 'holywar')) continue;
    const s = w.settlements[a.target];
    if (!s || !s.alive || s.faction === a.faction) continue;
    const months = Math.ceil(a.path.length / (RACES[a.race].flying ? 5 : 2.5));
    if (months > H) continue;
    const f = w.factions[a.faction];
    const cap = w.factions[s.faction]?.capital === s.id;
    out.push({ text: `${f.name}의 군대가 ${s.name}을(를) 함락한다`, p: pAttackWin(w, a, s) * (cap ? 0.45 : 0.75), imp: cap ? 4 : 3, cat: 'war' });
  }
  // 군주의 죽음
  for (const f of facs) {
    const ld = leaderOf(w, f);
    if (!ld) continue;
    const p = agg(pDeathMonth(w, ld));
    if (p > 0.03) out.push({ text: `${f.name}의 ${RACES[f.race].titles[f.tier]} ${ld.name}이(가) 세상을 떠난다`, p, imp: f.tier >= 2 ? 4 : 3, cat: 'politics' });
    // 국가 승격
    const pt = agg(pTierUp(w, f));
    if (pt > 0) out.push({ text: `${f.name}에 새 ${RACES[f.race].titles[f.tier + 1]}이(가) 즉위한다`, p: pt, imp: f.tier >= 1 ? 4 : 3, cat: 'politics' });
  }
  // 반역 (진영별로 묶는다)
  const coup = new Map<number, number>();
  for (const c of w.chars) {
    if (c.died >= 0 || c.plot < 60 || c.faction < 0) continue;
    const p = Math.min(0.8, ((c.plot - 50) / 50) * 0.5);
    coup.set(c.faction, 1 - (1 - (coup.get(c.faction) ?? 0)) * (1 - p));
  }
  for (const [fid, p] of coup) {
    const f = w.factions[fid];
    if (f?.alive) out.push({ text: `${f.name}에서 누군가 왕좌를 노리고 반역을 일으킨다`, p, imp: 3, cat: 'politics' });
  }
  // 깨어나는 용
  for (const c of w.chars) {
    if (c.died < 0 && c.race === 'dragon' && (c.sleep ?? 0) > 0 && (c.sleep ?? 0) <= H) {
      out.push({ text: `잠들어 있던 용 ${c.name}이(가) 깨어난다`, p: 1, imp: 2, cat: 'dark' });
    }
  }
  // 이벤트 기반 예측
  for (const ev of EVENTS) {
    if (!ev.forecast) continue;
    const targets: any[] = ev.scope === 'world' ? [null] : ev.scope === 'faction' ? facs
      : ev.scope === 'settlement' ? w.settlements.filter(s => s.alive) : [];
    let best: { p: number; x: any } | null = null;
    let none = 1;
    for (const x of targets) {
      const p = ev.p(w, x);
      if (p <= 0) continue;
      none *= Math.pow(1 - p, H);
      if (!best || p > best.p) best = { p, x };
    }
    if (!best) continue;
    const fc = ev.forecast(w, best.x);
    if (!fc) continue;
    const total = 1 - none;
    if (total > 0.005) out.push({ text: fc.text, p: ev.scope === 'world' ? total : agg(best.p), imp: fc.imp, cat: fc.cat });
  }
  // 세계수와 용의 원한
  const T = w.worldTree;
  if (T && T.alive && T.hp < 40) {
    const s = w.settlements[T.sid];
    const f = s && w.factions[s.faction];
    const dark = f && RACES[f.race].align === 'dark';
    const drain = dark ? 2 : T.felling ? 4 : 1.2;
    out.push({ text: `세계수가 쓰러진다 (생명력 ${Math.ceil(T.hp)}%)`, p: T.hp <= drain * H ? 0.9 : Math.max(0.02, 1 - T.hp / 40), imp: 5, cat: 'doom' });
  }
  if (w.doom.dragonGrievance >= 2) out.push({ text: `용들의 원한이 임계에 다다랐다 (${w.doom.dragonGrievance}/3)`, p: 0.5, imp: 4, cat: 'doom' });
  // 이번 계절 멸망 확률
  const pd = 1 - Math.pow(1 - pDoomMonth(w), H);
  out.sort((a, b) => b.p * Math.pow(b.imp, 2) - a.p * Math.pow(a.imp, 2));
  const top = out.slice(0, 9);
  top.push({ text: `세계 멸망 (봉인 ${brokenCount(w)}/${sealTotal(w)} 붕괴)${omen(w) ? ' — ' + omen(w) : ''}`, p: pd, imp: 5, cat: 'doom' });
  for (const p of top) p.text = fixJosa(p.text);
  return top;
}

export function prophecyLine(p: Prophecy): string {
  return `${p.text} — ${pct(p.p)}`;
}
