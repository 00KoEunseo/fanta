// 재앙과 재앙이 부딪친다: 마왕과 고대 용, 심연의 군주, 바다 괴수.
// 세상은 영웅만이 아니라 재앙끼리의 다툼으로도 바뀐다.
import { RACES } from '../data/races';
import { addNews, charLog } from './news';
import type { Character, World } from './state';
import { approxDist, charLabel, charPower, clamp } from './helpers';
import type { Pos } from './state';
import { dragonRaid, killChar, setTravel } from './characters';

const alive = (c: Character | undefined): c is Character => !!c && c.died < 0;

/** 마왕 편인가 (마왕의 나라와 그 가신) */
export function dlSide(w: World, factionId: number): boolean {
  const dl = w.chars[w.demonLord];
  if (!alive(dl)) return false;
  return factionId === dl.faction || !!w.factions[factionId]?.flags.includes('dlvassal');
}

function dlPower(w: World, dl: Character): number {
  const officers = w.chars.filter(o => o.died < 0 && o.officer);
  return charPower(dl, w) * 2.5 + officers.reduce((a, o) => a + charPower(o, w) * 0.5, 0);
}
const winChance = (a: number, b: number) => Math.pow(a, 1.4) / (Math.pow(a, 1.4) + Math.pow(b, 1.4));
/** 날짐승의 눈으로 본 거리 (닫힌 하늘 계단도 지난다) */
const near = (w: World, a: Pos, b: Pos, r: number) => approxDist(w, a, b, true) <= r;
/** 마왕 편 고을 중 이 자리에서 r칸 안에 있는 곳 */
const dlLandNear = (w: World, p: Pos, r: number) => w.settlements.filter(s => s.alive && dlSide(w, s.faction) && near(w, p, s, r));

/** 매달 */
export function clashMonth(w: World): void {
  const rng = w.rngSim;
  const dl = w.chars[w.demonLord];
  const anc = w.chars.find(c => c.died < 0 && c.ancient);
  const V = w.sea?.leviathan?.active ? w.sea.leviathan : null;
  const beasts = w.sea?.beasts.filter(b => b.alive) ?? [];

  // ── 마왕과 고대 용: 서로의 영역에 들어섰을 때만 맞붙는다
  // 마왕 본인과 마주쳐야 결전이 벌어진다
  const ancMeetsDl = alive(dl) && alive(anc) && near(w, anc, dl, 30);
  if (ancMeetsDl && rng.chance(0.15)) {
    const pd = dlPower(w, dl), pa = charPower(anc, w) * 1.8;
    const dlWins = rng.chance(winChance(pd, pa));
    const W = dlWins ? dl : anc, Lo = dlWins ? anc : dl;
    if (rng.chance(0.55)) {
      addNews(w, `마왕 ${dl.name}과(와) 고대 용 ${anc.name}이(가) 맞붙었다. 사흘 밤낮 하늘이 불타고 땅이 갈라졌다. 마지막에 선 것은 ${W.name}이었다.`, 5, 'doom', { pos: Lo, chars: [dl.id, anc.id] });
      killChar(w, Lo, dlWins ? `마왕 ${dl.name}과의 결전` : `고대 용 ${anc.name}과의 결전`, W);
      if (dlWins) {
        dl.stats.might = clamp(dl.stats.might + 10); dl.stats.magic = clamp(dl.stats.magic + 10); dl.fame += 120;
        if (!dl.items.includes('고대 용의 심장')) dl.items.push('고대 용의 심장');
        charLog(w, dl, `고대 용 ${anc.name}을(를) 쓰러뜨리고 그 심장을 삼켰다.`, 5);
      } else {
        anc.fame += 150;
        charLog(w, anc, `마왕 ${dl.name}을(를) 불태워 재로 만들었다.`, 5);
      }
      w.stats.calamityClash = (w.stats.calamityClash ?? 0) + 1;
    } else {
      // 둘 다 큰 상처를 입고 물러난다. 분노한 용은 마왕의 땅을 불태운다
      dl.stats.health = clamp(dl.stats.health - rng.int(25, 55));
      anc.stats.health = clamp(anc.stats.health - rng.int(25, 55));
      const prey = dlLandNear(w, anc, 15).sort((a, b) => b.pop - a.pop)[0];
      addNews(w, `고대 용 ${anc.name}이(가) 마왕 ${dl.name}의 성채로 날아들었다. 둘은 서로에게 깊은 상처를 남기고 물러났다.${prey ? ` 분풀이로 ${prey.name}이(가) 불길에 휩싸였다.` : ''}`, 5, 'doom', { chars: [dl.id, anc.id] });
      if (prey) dragonRaid(w, anc, prey);
    }
  }

  // ── 마왕과 심연의 군주: 촉수가 마왕의 해안을 덮칠 때만
  const tentOnDl = V ? V.tentacles.filter(t => t.alive && dlLandNear(w, t, 10).length > 0) : [];
  if (alive(dl) && V && tentOnDl.length && rng.chance(0.12)) {
    if (V.boundBy === dl.id) {
      // 이미 계약하였다
    } else if (rng.chance(clamp(dl.stats.magic / 220, 0.1, 0.45))) {
      V.boundBy = dl.id;
      addNews(w, `마왕 ${dl.name}이(가) 심연의 군주 ${V.name.replace('심연의 군주 ', '')}와(과) 피의 계약을 맺었다. 이제 촉수는 마왕의 땅을 비켜 가고, 빛의 해안만을 노린다.`, 5, 'doom', { chars: [dl.id] });
    } else {
      const t = rng.pick(tentOnDl);
      if (t) {
        t.hp -= rng.int(80, 180);
        dl.stats.health = clamp(dl.stats.health - rng.int(10, 35));
        if (t.hp <= 0) t.alive = false;
        addNews(w, `심연의 촉수가 마왕 ${dl.name}의 해안을 덮치자, 마왕이 몸소 나서 ${t.alive ? '촉수 하나에 깊은 상처를 냈다' : '촉수 하나를 잘라 냈다'}. 두 재앙이 서로를 할퀴었다.`, 4, 'doom', { chars: [dl.id] });
      }
    }
  }
  if (V && V.boundBy !== undefined && (!alive(w.chars[V.boundBy]) || w.demonLord !== V.boundBy)) {
    V.boundBy = undefined;
    addNews(w, '마왕이 사라지자 심연의 군주를 묶어 두었던 계약이 풀렸다. 촉수가 다시 아무 해안이나 더듬기 시작하였다.', 4, 'doom');
  }

  // ── 고대 용과 심연의 군주: 촉수 가까이 날아든 용만 내리꽂힌다
  const tentNearAnc = alive(anc) && V ? V.tentacles.filter(t => t.alive && near(w, anc, t, 20)) : [];
  if (alive(anc) && V && tentNearAnc.length && rng.chance(0.15)) {
    const t = rng.pick(tentNearAnc);
    if (t) {
      t.hp -= rng.int(80, 160);
      anc.stats.health = clamp(anc.stats.health - rng.int(15, 45));
      const cut = t.hp <= 0;
      if (cut) t.alive = false;
      if (anc.stats.health <= 0 || rng.chance(0.06)) {
        addNews(w, `고대 용 ${anc.name}이(가) 심연의 촉수와 뒤엉켜 바다 밑으로 끌려 들어갔다. 수면 위로 거품만이 오래도록 올라왔다.`, 5, 'doom', { chars: [anc.id] });
        killChar(w, anc, '심연의 촉수와의 사투');
      } else {
        addNews(w, `고대 용 ${anc.name}이(가) 바다로 내리꽂혀 심연의 촉수를 ${cut ? '찢어 끊었다' : '물어뜯었다'}. 끓어오르는 바다 위로 용의 포효가 울렸다.`, 4, 'doom', { chars: [anc.id] });
      }
    }
  }

  // ── 고대 용과 바다 괴수: 마주쳤을 때만
  const beastsNearAnc = alive(anc) ? beasts.filter(b => near(w, anc, b, 15)) : [];
  if (alive(anc) && beastsNearAnc.length && rng.chance(0.2)) {
    const b = rng.pick(beastsNearAnc);
    if (rng.chance(0.85)) {
      b.alive = false; b.hp = 0;
      anc.fame += 20;
      addNews(w, `고대 용 ${anc.name}이(가) ${b.name}을(를) 바다에서 낚아채 하늘로 끌어올렸다. 괴수의 비명이 구름 위에서 끊겼다.`, 4, 'nature', { chars: [anc.id] });
    } else {
      anc.stats.health = clamp(anc.stats.health - 40);
      addNews(w, `${b.name}이(가) 사냥하러 내려온 고대 용 ${anc.name}을(를) 휘감아 물속으로 끌어들였다. 용은 겨우 빠져나왔다.`, 4, 'nature', { chars: [anc.id] });
    }
  }

  // ── 마왕이 바다 괴수를 길들인다: 괴수가 마왕의 항구 앞바다에 왔을 때만
  const beastsAtDl = alive(dl) ? beasts.filter(b => b.tamedBy !== dl.id && dlLandNear(w, b, 15).length > 0) : [];
  if (alive(dl) && beastsAtDl.length && rng.chance(0.1)) {
    const b = beastsAtDl[0];
    const prey = w.settlements.filter(s => s.alive && s.l === 2 && !dlSide(w, s.faction) && RACES[s.race].align === 'light' && s.pop > 100);
    if (b && prey.length && rng.chance(clamp(dl.stats.magic / 180, 0.15, 0.6))) {
      const t = rng.pick(prey);
      b.tamedBy = dl.id;
      b.target = t.id;
      b.route = [];
      if (b.mode === 'ashore') b.mode = 'approach';
      b.ashore = false;
      addNews(w, `마왕 ${dl.name}이(가) ${b.name}의 머리에 핏빛 낙인을 찍었다. 길들여진 괴수가 ${t.name}의 바다로 향한다.`, 4, 'dark', { chars: [dl.id], facs: [t.faction] });
    }
  }
}

/** 마왕과 계약한 심연은 마왕 편의 땅을 비켜 간다 */
export function spared(w: World, factionId: number): boolean {
  const V = w.sea?.leviathan;
  return !!V && V.boundBy !== undefined && V.boundBy === w.demonLord && dlSide(w, factionId);
}

// ───────────── 용과 용: 용은 홀로 다닌다. 같은 하늘에 둘이 있으면 다툼이 난다

/** 진 용은 상처를 안고 둥지로 달아난다 */
function flee(w: World, d: Character) {
  d.stats.health = clamp(d.stats.health - w.rngSim.int(25, 55));
  if (d.lair && d.act.kind !== 'travel') setTravel(w, d, d.lair, 'return');
}

/** 일반 용끼리의 영역 다툼: 죽기까지 싸우지는 않는다 */
export function dragonSpat(w: World, a: Character, b: Character): void {
  const rng = w.rngSim;
  const key = `dspat:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
  if ((w.stats[key] ?? -999) > w.t - 60) return;
  w.stats[key] = w.t;
  const aWins = rng.chance(winChance(charPower(a, w), charPower(b, w)));
  const W = aWins ? a : b, Lo = aWins ? b : a;
  W.fame += 10;
  flee(w, Lo);
  charLog(w, W, `영역을 침범한 ${Lo.name}을(를) 쫓아냈다.`, 2);
  charLog(w, Lo, `${W.name}과(와)의 다툼에서 밀려나 둥지로 달아났다.`, 2);
  addNews(w, rng.pick([`${charLabel(w, a)}과(와) ${charLabel(w, b)}이(가) 하늘에서 맞붙었다. 비늘이 비처럼 쏟아진 끝에 ${Lo.name}이(가) 꼬리를 말고 달아났다.`,
    `영역을 두고 두 용이 다투었다. 산봉우리 하나가 무너져 내린 끝에 ${W.name}이(가) 하늘을 차지하였다.`]), 3, 'dark', { pos: a, chars: [a.id, b.id] });
}

/** 매달: 같은 곳에서 마주친 용들이 싸운다. 고대 용끼리는 서로를 찾아 날아간다 */
export function dragonClashes(w: World): void {
  const rng = w.rngSim;
  const ds = w.chars.filter(d => d.died < 0 && d.race === 'dragon' && (d.sleep ?? 0) === 0);
  const ancients = ds.filter(d => d.ancient);
  // 고대 용은 다른 고대 용의 기척을 느끼면 그를 찾아 날아간다
  if (ancients.length >= 2) for (const a of ancients) {
    if (a.act.kind === 'travel' || a.isPlayer || !rng.chance(0.15)) continue;
    const foe = ancients.filter(o => o !== a).sort((x, y) => approxDist(w, a, x, true) - approxDist(w, a, y, true))[0];
    if (foe && approxDist(w, a, foe, true) > 6 && setTravel(w, a, foe, 'visit')) charLog(w, a, `또 다른 고대 용 ${foe.name}의 기척을 느끼고 날아올랐다.`, 3);
  }
  const met = new Set<number>();
  for (const a of ds) {
    if (met.has(a.id) || a.died >= 0) continue;
    const b = ds.find(o => o !== a && !met.has(o.id) && o.died < 0 && approxDist(w, a, o, true) <= 6);
    if (!b) continue;
    met.add(a.id); met.add(b.id);
    if (a.ancient && b.ancient) {
      // 고대 용끼리: 한쪽이 죽을 때까지
      if (a.isPlayer || b.isPlayer) continue;
      const aWins = rng.chance(winChance(charPower(a, w), charPower(b, w)));
      const W = aWins ? a : b, Lo = aWins ? b : a;
      addNews(w, `두 고대 용 ${a.name}과(와) ${b.name}이(가) 마주쳤다. 하늘이 둘로 갈라지고 땅이 녹아내렸다. 이레 밤낮의 싸움 끝에 ${Lo.name}의 거대한 몸이 산맥 위로 떨어졌다.`, 5, 'doom', { pos: Lo, chars: [a.id, b.id] });
      killChar(w, Lo, `고대 용 ${W.name}과(와)의 사투`, W);
      W.stats.health = clamp(W.stats.health - rng.int(30, 60));
      W.fame += 120;
      charLog(w, W, `같은 하늘을 나눌 수 없던 고대 용 ${Lo.name}을(를) 쓰러뜨렸다.`, 5);
      w.stats.ancientDuels = (w.stats.ancientDuels ?? 0) + 1;
    } else if (a.ancient || b.ancient) {
      // 고대 용과 일반 용: 대개 일반 용이 두들겨 맞고 달아난다
      const anc = a.ancient ? a : b, young = a.ancient ? b : a;
      // 같은 둘은 한동안 다시 부딪치지 않는다 (쫓겨난 용은 그 하늘을 피한다)
      const key = `dchase:${anc.id}:${young.id}`;
      if ((w.stats[key] ?? -999) > w.t - 36) continue;
      w.stats[key] = w.t;
      const r = rng.next();
      if (r < 0.08 && !young.isPlayer) {
        addNews(w, `고대 용 ${anc.name}이(가) 제 하늘에 들어온 ${young.name}을(를) 물어 찢었다. 젊은 용은 다시 날아오르지 못하였다.`, 4, 'dark', { pos: young, chars: [anc.id, young.id] });
        killChar(w, young, `고대 용 ${anc.name}의 이빨`, anc);
      } else if (r < 0.13) {
        anc.stats.health = clamp(anc.stats.health - rng.int(10, 25));
        flee(w, young);
        addNews(w, `${young.name}이(가) 고대 용 ${anc.name}에게 맞서 상처를 남기고 달아났다. 고대 용의 포효가 산맥을 흔들었다.`, 4, 'dark', { pos: young, chars: [anc.id, young.id] });
      } else {
        flee(w, young);
        charLog(w, young, `고대 용 ${anc.name}에게 두들겨 맞고 꼬리를 말고 달아났다.`, 3);
        addNews(w, `고대 용 ${anc.name}이(가) 제 하늘을 침범한 ${young.name}을(를) 두들겨 쫓아냈다.`, 3, 'dark', { pos: young, chars: [anc.id, young.id] });
      }
    } else if (!(a.patronOf !== undefined && a.patronOf === b.patronOf)) {
      dragonSpat(w, a, b);
    }
  }
}
