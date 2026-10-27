// 원정: 탄생 모드의 인물이 실제로 무리에 섞여 길을 떠난다.
// 탐험길, 토벌대, 연맹 공격대, 출정군. 함께 움직이는 동안에는 그 무리의 일만 일어난다.
import { RACES } from '../data/races';
import { addNews, charLog } from './news';
import type { Army, Character, World } from './state';
import { dist } from './state';
import { addRel, approxDist, charLabel, clamp, isAdult } from './helpers';
import { killChar, relocate, resolveAdventure, setPos } from './characters';
import type { Party } from './crusade';
import type { Ctx } from './life';

const pf = (w: World) => { w.player!.flags ??= {}; return w.player!.flags; };
const me = (w: World) => (w.player ? w.chars[w.player.charId] : undefined);

/** 탄생 모드 인물이 무리에 낄 수 있는가 */
function canJoin(w: World, c: Character | undefined): c is Character {
  if (!c || c.died >= 0 || !isAdult(w, c) || c.act.kind !== 'idle' || c.race === 'dragon') return false;
  if (c.role === '노예' || w.factions[c.faction]?.leader === c.id || w.demonLord === c.id) return false;
  return c.stats.health > 30;
}

// ───────────── 무리에서 부르는 소리 (crusade/military가 부른다)

/** 토벌대가 꾸려졌다: 가까이 있거나, 연맹에 의용군으로 지원해 두었으면 부른다 */
export function offerParty(w: World, p: Party): void {
  const c = me(w);
  if (!canJoin(w, c) || p.members.includes(c.id)) return;
  const lead = w.chars[p.leader];
  const volunteer = p.alliance >= 0 && (pf(w).volunteer ?? -1) >= 0 && w.alliances[p.alliance]?.members.includes(c.faction);
  // 같은 고을이나 바로 곁에 있어야 함께 떠날 수 있다
  if (!lead || approxDist(w, c, lead) > (volunteer ? 12 : 6)) return;
  pf(w).partyInvite = p.id;
}

/** 나라가 군대를 일으켰다: 그 고을 사람이면 출정 명령이 온다 */
export function offerArmy(w: World, a: Army): void {
  const c = me(w);
  if (!canJoin(w, c) || c.faction !== a.faction || (a.goal !== 'conquer' && a.goal !== 'holywar')) return;
  const home = w.settlements[c.home];
  const from = w.settlements[a.home];
  if (!home || !from || (home.id !== from.id && dist(home, from) > 6) || c.l !== from.l || dist(c, from) > 6) return;
  pf(w).armyInvite = a.id;
}

// ───────────── 매달: 함께 움직이고, 끝나면 결과를 받는다

export function expeditionMonth(w: World): void {
  const P = w.player;
  const c = me(w);
  if (!P || !c || c.died >= 0) return;
  const F = pf(w);
  // 출정군을 따라 움직인다
  if (c.act.kind === 'army' && F.armyId !== undefined) {
    const a = w.armies[F.armyId];
    if (a && a.alive) { c.pl = c.l; c.px = c.x; c.py = c.y; setPos(c, a); return; }
    armyOutcome(w, c, a);
  }
}

function armyOutcome(w: World, c: Character, a: Army | undefined) {
  const F = pf(w);
  const rng = w.rngSim;
  const start = F.armyStart ?? 1;
  const tgt = a ? w.settlements[a.target] : undefined;
  delete F.armyId; delete F.armyStart;
  c.act = { kind: 'idle' };
  const home = w.settlements[c.home];
  if (home && home.alive) relocate(w, c, home);
  if (!a) return;
  // 주둔지에 합류한 군대: 한 철 보초를 서고 교대해 돌아왔다
  if (a.toCamp) {
    const camp = w.camps?.[a.camp ?? -1];
    c.fame += 3; c.stats.command = clamp(c.stats.command + 1);
    charLog(w, c, `${camp ? camp.name : '주둔지'}에 닿아 한 철 동안 보초를 섰다. 교대 명령을 받고 고향으로 돌아왔다.`, 2);
    return;
  }
  const won = !!tgt && tgt.faction === a.faction;
  const crushed = !won && a.soldiers < start * 0.35;
  if (won) {
    const gold = rng.int(20, 60);
    c.wealth += gold; c.fame += 20; c.honor += 10;
    c.stats.might = clamp(c.stats.might + 2); c.stats.command = clamp(c.stats.command + 2);
    charLog(w, c, `${tgt!.name} 원정에서 살아 돌아왔다. 성벽을 넘던 날의 함성이 아직 귓가에 맴돈다. (전리품 금화 ${gold}닢)`, 3);
    return;
  }
  if (crushed) {
    const dmg = rng.int(20, 55) * clamp(1.2 - c.stats.might / 200, 0.6, 1.2);
    c.stats.health = clamp(c.stats.health - dmg);
    if (c.stats.health <= 5 || rng.chance(0.18)) { killChar(w, c, `${tgt?.name ?? '원정'} 싸움터에서 전사`); return; }
    charLog(w, c, `원정군이 무너졌다. 시체 더미 사이를 기어 간신히 살아 돌아왔다.`, 3);
    return;
  }
  c.fame += 5;
  charLog(w, c, `원정군과 함께 고향으로 돌아왔다. 뚜렷한 승패 없이 끝난 원정이었다.`, 2);
}

// ───────────── 효과 (life.ts의 runFx에서 넘겨받는다)

export function expeditionFx(x: Ctx, fx: string): string | undefined | null {
  const { w, c } = x;
  const F = pf(w);
  const rng = w.rngSim;
  const party = (): Party | undefined => (c.act.kind === 'party' ? w.parties.find(p => !p.done && p.members.includes(c.id)) : undefined);
  switch (fx) {
    case 'join_party': {
      const p = w.parties[F.partyInvite ?? -1];
      delete F.partyInvite;
      if (!p || p.done || !canJoin(w, c)) return '토벌대는 이미 떠나고 없었다.';
      p.members.push(c.id);
      c.act = { kind: 'party', target: p.id };
      const lead = w.chars[p.leader];
      if (lead) { setPos(c, lead); addRel(w, c, lead, 10); }
      addNews(w, `${charLabel(w, c)}이(가) ${p.name}에 합류하였다.`, 2, 'player', { chars: [c.id, p.leader] });
      return `${p.name}의 일원이 되었다. 대장 ${lead?.name ?? ''}의 깃발 아래 함께 걷는다.`;
    }
    case 'decline_party': delete F.partyInvite; return;
    case 'join_army': {
      const a = w.armies[F.armyInvite ?? -1];
      delete F.armyInvite;
      if (!a || !a.alive || !canJoin(w, c)) return '군대는 이미 떠난 뒤였다.';
      F.armyId = a.id; F.armyStart = a.soldiers;
      c.act = { kind: 'army', target: a.id };
      setPos(c, a);
      a.soldiers += 1;
      return `${w.settlements[a.target]?.name ?? '적지'}(으)로 향하는 군세에 섞여 발을 맞추었다.`;
    }
    case 'decline_army': delete F.armyInvite; return;
    case 'volunteer': F.volunteer = w.t; return '연맹의 의용군 명부에 이름을 올렸다. 공격대가 꾸려지면 부름이 올 것이다.';
    // 토벌대의 사기
    case 'party_up': case 'party_up2': case 'party_down': {
      const p = party();
      if (!p) return;
      p.morale = clamp((p.morale ?? 0) + (fx === 'party_up' ? 0.06 : fx === 'party_up2' ? 0.12 : -0.08), -0.4, 0.5);
      return;
    }
    case 'party_scout': {
      const p = party();
      if (!p) return;
      const cut = Math.floor(p.path.length * 0.25);
      p.path.splice(0, cut);
      return '지름길을 찾아냈다. 행군이 며칠 앞당겨졌다.';
    }
    case 'party_desert': {
      const p = party();
      if (!p) return;
      const d = p.members.map(id => w.chars[id]).find(m => m && m.died < 0 && m.id !== c.id && m.id !== p.leader);
      if (!d) return;
      p.members = p.members.filter(id => id !== d.id);
      d.act = { kind: 'idle' };
      const h = w.settlements[d.home];
      if (h && h.alive) relocate(w, d, h);
      charLog(w, d, `${p.name}에서 몰래 빠져나와 고향으로 돌아갔다.`, 2);
      return `${d.name}은(는) 밤사이 사라졌다.`;
    }
    case 'leave_party': {
      const p = party();
      if (!p) return;
      p.members = p.members.filter(id => id !== c.id);
      c.act = { kind: 'idle' };
      const h = w.settlements[c.home];
      if (h && h.alive) relocate(w, c, h);
      return '토벌대를 등지고 홀로 돌아섰다.';
    }
    case 'party_friend': {
      const p = party();
      const m = p?.members.map(id => w.chars[id]).filter(m => m && m.died < 0 && m.id !== c.id);
      if (!m?.length) return;
      const f = rng.pick(m);
      addRel(w, c, f, 25);
      return `${f.name}와(과) 밤새 이야기를 나누었다. 둘 사이에 우정이 싹텄다.`;
    }
    // 출정군
    case 'army_up': case 'army_down': {
      const a = w.armies[F.armyId ?? -1];
      if (a && a.alive) a.soldiers = Math.round(a.soldiers * (fx === 'army_up' ? 1.06 : 0.94));
      return;
    }
    case 'army_loot': {
      const a = w.armies[F.armyId ?? -1];
      if (a && a.alive) a.loot[5] += 20;
      return;
    }
    case 'army_desert': {
      const a = w.armies[F.armyId ?? -1];
      delete F.armyId; delete F.armyStart;
      if (a && a.alive) a.soldiers = Math.max(1, a.soldiers - 1);
      c.act = { kind: 'idle' };
      const h = w.settlements[c.home];
      if (h && h.alive) relocate(w, c, h);
      return;
    }
    // 유적 입구
    case 'site_bold': case 'site_sneak': {
      const site = w.sites[F.siteGate ?? -1];
      delete F.siteGate; delete F.siteGateT;
      c.act = { kind: 'idle' };
      if (!site) return '유적은 이미 무너져 있었다.';
      const before = c.wealth;
      const res = resolveAdventure(w, c, site.id, fx === 'site_bold' ? { power: 1.3, risk: 1.0, loot: 1.3, quiet: true } : { power: 1.1, risk: 0.45, loot: 0.7, quiet: true });
      if (c.died < 0) { const h = w.settlements[c.home]; if (h && h.alive) relocate(w, c, h); }
      if (res === 'dead') return '';
      if (res === 'fail') return '어둠 속에서 괴물에게 쫓겨 간신히 살아 돌아왔다.';
      return c.wealth > before ? `금화 ${Math.round(c.wealth - before)}닢을 챙겨 돌아왔다.` : '보물은 이미 누군가 쓸어 간 뒤였다. 빈손으로 돌아왔다.';
    }
    case 'site_leave': {
      delete F.siteGate; delete F.siteGateT;
      c.act = { kind: 'idle' };
      const h = w.settlements[c.home];
      if (h && h.alive) relocate(w, c, h);
      return '입구에서 불길한 기운을 느끼고 발길을 돌렸다.';
    }
    case 'trip_shortcut': {
      if (c.act.kind === 'travel' && c.act.path) c.act.path.splice(0, Math.floor(c.act.path.length * 0.3));
      return;
    }
  }
  return null;
}

