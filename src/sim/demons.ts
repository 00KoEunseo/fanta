// 악마: 마계에 사는 예순여섯의 이름 있는 존재. 세상이 열릴 때부터 정해져 있고, 어느 세력에도 속하지 않는다.
// 서로에게는 무심한 개인주의자들이다. 대개 마계에서 마족의 공양을 받거나 마족을 돕고, 마왕이 서면 그 곁에 서기도 한다.
// 가끔 지상으로 올라와 악한 신앙을 퍼뜨리고, 역병을 뿌리고, 선한 이를 타락시킨다.
// 기분에 따라 용사를 돕기도 하고, 오래 끄는 전쟁에 끼어들어 판을 뒤집기도 하는 골칫거리다.
import { RACES } from '../data/races';
import { COMPASSION, LOYALTY } from '../data/traits';
import { GOLD, MANA } from '../data/terrain';
import type { Character, Pos, Settlement, World } from './state';
import { dist } from './state';
import { addNews, charLog } from './news';
import { charPower, clamp, isAdult, isHero } from './helpers';
import { awaken, createCharacter, duel, setTravel } from './characters';
import { faithOf, foundFaith, spreadTo } from './religion';
import { outbreak } from './disease';

/** 예순여섯 악마의 이름 (서열 순) */
export const DEMON_NAMES = [
  '바알', '아가레스', '바사고', '사미기나', '마르바스', '발레포르', '아몬', '바르바토스', '파이몬', '부에르', '구시온', '시트리',
  '벨레트', '레라제', '엘리고스', '제파르', '보티스', '바틴', '살로스', '푸르손', '마락스', '이포스', '아임', '나베리우스',
  '글라샤라볼라스', '부네', '로노베', '베리트', '아스타로트', '포르네우스', '포라스', '아스모데우스', '가프', '푸르푸르', '마르코시아스', '스톨라스',
  '페넥스', '할파스', '말파스', '라움', '포칼로르', '베파르', '사브낙', '샥스', '비네', '비프론스', '부알', '하겐티',
  '크로켈', '푸르카스', '발람', '알로케스', '카임', '무르무르', '오로바스', '그레모리', '오세', '아미', '오리아스', '바풀라',
  '자간', '발락', '안드라스', '플라우로스', '안드레알푸스', '키메리스',
];

export type Whim = 'feast' | 'aid' | 'serve' | 'ascend' | 'joker' | 'idle';
export interface Archdemon { rank: number; lair: Pos; task?: { kind: string; target: number; t: number }; servesDL?: number }

/** 악마마다 타고난 본성 (이름의 순서로 정해진다): 하는 일과 일대기의 결이 달라진다 */
export const NATURES = ['분노', '탐욕', '거짓', '역병', '전쟁', '욕망', '절망'] as const;
export function natureOf(c: Character): typeof NATURES[number] {
  const i = DEMON_NAMES.indexOf(c.name);
  return NATURES[(i >= 0 ? i : (c.archdemon?.rank ?? 0)) % NATURES.length];
}
const NATURE_LINES: Record<typeof NATURES[number], string[]> = {
  분노: ['화산의 목을 움켜쥐고 불을 토하게 하였다.', '분노에 겨워 산 하나를 무너뜨렸다.', '잿빛 황야에 핏빛 번개를 내리꽂았다.'],
  탐욕: ['보물 더미 위에서 금화를 세며 한 철을 보냈다.', '다른 악마의 보물고를 엿보며 입맛을 다셨다.', '마족들에게서 거둔 공물을 녹여 왕관을 하나 더 만들었다.'],
  거짓: ['마족 둘 사이에 거짓말을 흘려 싸움을 붙였다.', '스스로의 그림자에게 거짓 이름을 붙여 돌려보냈다.', '지상의 꿈속을 떠돌며 달콤한 거짓말을 속삭였다.'],
  역병: ['썩은 늪에서 새 병을 빚어 병에 담았다.', '마계의 우물 하나에 독을 풀어 보았다.', '파리 떼를 거느리고 잿빛 들판을 걸었다.'],
  전쟁: ['마족 전사들을 모아 피의 시합을 열었다.', '부러진 칼들을 녹여 거대한 대검을 벼렸다.', '옛 전쟁의 해골들을 일으켜 진법을 익히게 하였다.'],
  욕망: ['마계의 연회장에서 밤새 춤추고 마셨다.', '지상에서 홀린 이들의 넋을 보석 상자에 모았다.', '자신에게 바칠 노래를 짓게 하고는 듣다가 싫증을 냈다.'],
  절망: ['끝없는 잿빛 황야에 홀로 앉아 침묵하였다.', '지상의 비명을 엿들으며 눈을 감았다.', '무너진 신전의 잔해 위에 앉아 백 년 전의 일을 곱씹었다.'],
};

/** 서열에 따른 칭호 */
export function demonTitle(c: Character): string {
  const r = c.archdemon?.rank ?? 66;
  return r <= 9 ? '마계의 왕' : r <= 32 ? '마계의 공작' : '마계의 후작';
}

/** 세상이 열릴 때 예순여섯 악마가 마계 곳곳에 자리를 잡는다 */
export function seedDemons(w: World): void {
  const rng = w.rngSim;
  const L = w.layers[4];
  if (!L) return;
  for (let i = 0; i < DEMON_NAMES.length; i++) {
    let pos: Pos | null = null;
    for (let k = 0; k < 400 && !pos; k++) {
      const x = rng.int(2, L.w - 3), y = rng.int(2, L.h - 3);
      if (L.terrain[y * L.w + x] === undefined) continue;
      if (w.settlements.some(s => s.alive && s.l === 4 && s.x === x && s.y === y)) continue;
      pos = { l: 4, x, y };
    }
    if (!pos) continue;
    const age = rng.int(300, 2000);
    const c = createCharacter(w, { race: 'demon', faction: -1, home: -1, pos, born: w.t - age * 12, name: DEMON_NAMES[i] });
    // 서열이 높을수록 강하다
    const top = 1 - i / DEMON_NAMES.length;
    c.stats.might = clamp(60 + top * 35 + rng.int(-5, 5)); c.stats.magic = clamp(60 + top * 35 + rng.int(-5, 5));
    c.stats.health = 100; c.stats.command = clamp(40 + top * 40);
    c.lifespan = 99999;
    c.role = '주술사';
    c.fame = 40 + Math.round(top * 80);
    c.archdemon = { rank: i + 1, lair: pos };
    c.epithet = demonTitle(c);
    charLog(w, c, `마계의 ${pos.x},${pos.y} 언저리에 둥지를 틀었다.`, 1);
  }
}

const isDemon = (c: Character) => !!c.archdemon && c.died < 0;
export { isDemon };

/** 매달 (악마 한 명): 기분 내키는 대로 */
export function demonMonth(w: World, c: Character): void {
  const A = c.archdemon!;
  const rng = w.rngSim;
  c.stats.health = clamp(c.stats.health + 4);
  if (c.act.kind !== 'idle') return;
  // 마계의 정치: 서열 다툼, 어둠의 군주와의 계약, 마왕을 버림
  if (!A.task && rng.chance(0.004) && rivalry(w, c)) return;
  if (!A.task && rng.chance(0.0025) && darkPact(w, c)) return;
  if (A.servesDL !== undefined && rng.chance(0.01) && forsake(w, c)) return;
  if (A.task) {
    const done = resolve(w, c, A.task);
    if (done || w.t - A.task.t > 30) A.task = undefined;
    if (!A.task && !(c.l === A.lair.l && dist(c, A.lair) <= 2)) setTravel(w, c, A.lair, 'quest');
    return;
  }
  if (!rng.chance(0.06)) return;
  const task = pick(w, c);
  if (!task) return;
  // 둥지 주변을 어슬렁거린다
  if (task.kind === 'roam') {
    if (rng.chance(0.35)) { const lines = NATURE_LINES[natureOf(c)]; charLog(w, c, rng.pick(lines), 2); }
    const L = w.layers[A.lair.l];
    const to = { l: A.lair.l, x: clamp(A.lair.x + rng.int(-8, 8), 1, L.w - 2), y: clamp(A.lair.y + rng.int(-8, 8), 1, L.h - 2) };
    setTravel(w, c, to, 'quest');
    return;
  }
  const pos = task.kind === 'boon' || task.kind === 'serve' ? w.chars[task.target] : w.settlements[task.target];
  if (!pos) return;
  A.task = { ...task, t: w.t };
  if (c.l !== pos.l || dist(c, pos) > 2) setTravel(w, c, pos, 'quest');
}

/** 무엇을 할까: 마왕 섬기기 > 공양 받기·마족 돕기 > 둥지 주변 배회 > 변덕 > 지상 강림(아주 드묾) */
function pick(w: World, c: Character): { kind: string; target: number } | null {
  const rng = w.rngSim;
  const A = c.archdemon!;
  const roll = rng.float(0, 1);
  // 지상에 오르는 것은 세상이 무르익은 뒤, 아주 가끔 (악마 한 명이 수십 년에 한 번꼴)
  if (roll < 0.008 && w.t > 12 * 30) {
    const up = w.settlements.filter(s => s.alive && (s.l === 2 || s.l === 3) && !RACES[s.race].noPop);
    if (up.length) return { kind: rng.pick(['preach', 'plague', 'corrupt']), target: rng.pick(up).id };
  }
  // 마왕이 섰으면 셋에 하나는 곁에 선다
  const dl = w.demonLord >= 0 ? w.chars[w.demonLord] : null;
  // 마왕 곁에 서는 것은 본성이 맞는 악마가 더 잦다 (분노·전쟁·절망은 마왕의 칼이 되고, 거짓·탐욕은 제 잇속을 먼저 챙긴다)
  const nat = natureOf(c);
  if (dl && dl.died < 0 && A.servesDL !== dl.id && rng.chance(nat === '분노' || nat === '전쟁' || nat === '절망' ? 0.06 : 0.025)) return { kind: 'serve', target: dl.id };
  const majin = w.settlements.filter(s => s.alive && s.race === 'majin' && s.l === c.l && dist(s, c) <= 25);
  if (roll < 0.55 && majin.length) {
    const s = rng.pick(majin);
    const f = w.factions[s.faction];
    // 싸우는 마족을 돕거나, 공양을 받는다
    const foe = f ? Object.keys(f.wars).map(Number).map(id => w.factions[id]).find(o => o && o.alive) : undefined;
    const prey = foe ? w.settlements.filter(x => x.alive && x.faction === foe.id && x.l === c.l && dist(x, c) <= 40).sort((a, b) => dist(a, c) - dist(b, c))[0] : undefined;
    if (prey && rng.chance(0.5)) return { kind: 'aid', target: prey.id };
    return { kind: 'feast', target: s.id };
  }
  // 변덕 (드묾): 오래 끄는 전쟁에 끼어들거나, 용사를 돕는다. 용사 한 사람은 평생 한 번만 악마의 힘을 받는다
  if (roll >= 0.55 && roll < 0.553) {
    const hero = w.chars.find(h => h.died < 0 && isHero(h) && !h.isPlayer && !w.stats[`demonBoon${h.id}`]);
    if (hero && rng.chance(0.3)) { w.stats[`demonBoon${hero.id}`] = w.t; return { kind: 'boon', target: hero.id }; }
    const long = longWar(w);
    if (long) return { kind: 'meddle', target: long };
  }
  return { kind: 'roam', target: -1 };
}

/** 오래 끌고 있는 전쟁터 (10년 넘게): 한쪽의 고을 */
function longWar(w: World): number | null {
  for (const f of w.factions) {
    if (!f.alive) continue;
    for (const [id, t] of Object.entries(f.wars)) {
      if (w.t - t < 120) continue;
      const o = w.factions[+id];
      if (!o || !o.alive) continue;
      // 변덕: 이기는 쪽을 꺾을지, 지는 쪽을 꺾을지는 그날 기분
      const victim = w.rngSim.chance(0.5) ? (f.military > o.military ? f : o) : (f.military > o.military ? o : f);
      const s = w.settlements[victim.capital];
      if (s && s.alive) return s.id;
    }
  }
  return null;
}

function resolve(w: World, c: Character, t: { kind: string; target: number }): boolean {
  const rng = w.rngSim;
  const A = c.archdemon!;
  if (t.kind === 'serve' || t.kind === 'boon') {
    const o = w.chars[t.target];
    if (!o || o.died >= 0) return true;
    if (c.l !== o.l || dist(c, o) > 4) return false;
    if (t.kind === 'serve') {
      A.servesDL = o.id;
      charLog(w, c, `마왕 ${o.name}의 곁에 섰다.`, 3);
      addNews(w, `${demonTitle(c)} ${c.name}이(가) 마왕 ${o.name}의 곁에 섰다. 마왕군의 기세가 더욱 사나워졌다.`, A.rank <= 9 ? 3 : 2, 'dark', { pos: c, chars: [c.id, o.id] });
    } else {
      o.stats.might = clamp(o.stats.might + 8); o.stats.magic = clamp(o.stats.magic + 8);
      charLog(w, o, `악마 ${c.name}이(가) 까닭 모를 힘을 빌려주었다.`, 3);
      addNews(w, `${demonTitle(c)} ${c.name}이(가) 변덕스럽게도 용사 ${o.name}에게 힘을 빌려주었다. 그 값이 무엇일지는 아무도 모른다.`, 3, 'dark', { pos: o, chars: [c.id, o.id] });
    }
    return true;
  }
  const s = w.settlements[t.target];
  if (!s || !s.alive) return true;
  if (c.l !== s.l || dist(c, s) > 3) return false;
  switch (t.kind) {
    case 'feast': {
      const g = Math.min(s.stock[GOLD] * 0.15, 40), m = Math.min(s.stock[MANA] * 0.15, 30);
      s.stock[GOLD] -= g; s.stock[MANA] -= m; c.wealth += g;
      s.stability = clamp(s.stability + 4);
      charLog(w, c, `${s.name}의 마족들에게서 공양을 받았다.`, rng.chance(0.3) ? 2 : 1);
      if (rng.chance(0.1)) addNews(w, `${s.name}의 마족들이 ${demonTitle(c)} ${c.name}에게 제물을 바쳤다. 마계의 하늘이 붉게 일렁였다.`, 2, 'dark', { pos: s, chars: [c.id], facs: [s.faction] });
      return true;
    }
    case 'aid': case 'meddle': {
      const killed = Math.round(s.pop * rng.float(0.04, 0.1));
      s.pop -= killed; s.stability = clamp(s.stability - 15); s.lastAttacked = w.t;
      const f = w.factions[s.faction];
      addNews(w, t.kind === 'aid' ? `${demonTitle(c)} ${c.name}이(가) 마족의 편에 서서 ${s.name}을(를) 덮쳤다. ${killed}명이 쓰러졌다.`
        : `${demonTitle(c)} ${c.name}이(가) 오래 끄는 전쟁에 끼어들어 ${f?.name ?? s.name}을(를) 덮쳤다. 판이 뒤집혔다.`, 3, 'dark', { pos: s, chars: [c.id], facs: [s.faction] });
      return true;
    }
    case 'preach': {
      let r = faithOf(w, c.faith);
      if (!r) { r = foundFaith(w, c) ?? undefined; if (r) addNews(w, `${demonTitle(c)} ${c.name}이(가) 지상에 올라 '${r.deity}'을(를) 섬기는 ${r.name}을(를) 퍼뜨리기 시작하였다.`, 3, 'dark', { pos: s, chars: [c.id] }); }
      if (r && spreadTo(w, s, r)) addNews(w, `${s.name}에 악마 ${c.name}의 속삭임이 스며들었다. 사람들이 ${r.name}을(를) 따르기 시작하였다.`, 3, 'dark', { pos: s, chars: [c.id] });
      return true;
    }
    case 'plague': {
      if (s.plague > 0) return true;
      outbreak(w, s, `마계에서 올라온 ${c.name}이(가) 우물에 무언가를 떨어뜨렸다는 소문이 돌았다.`);
      return true;
    }
    case 'corrupt': {
      const prey = w.chars.filter(o => o.died < 0 && !o.isPlayer && o.home === s.id && isAdult(w, o) && o.traits[COMPASSION] > 55 && !o.archdemon)
        .sort((a, b) => charPower(b, w) - charPower(a, w))[0];
      if (!prey) return true;
      prey.traits[COMPASSION] = clamp(prey.traits[COMPASSION] - 30);
      prey.traits[LOYALTY] = clamp(prey.traits[LOYALTY] - 20);
      charLog(w, prey, `낯선 이의 속삭임을 들은 뒤로 마음이 차갑게 식었다.`, 3);
      if (rng.chance(0.25) && !prey.awakened.includes('seed')) awaken(w, prey, 'seed', `악마 ${c.name}의 속삭임 끝에`);
      addNews(w, `${s.name}의 ${prey.name}이(가) 악마 ${c.name}의 속삭임에 넘어갔다. 그는 예전의 그가 아니었다.`, 3, 'dark', { pos: s, chars: [prey.id, c.id] });
      return true;
    }
  }
  return true;
}

/** 마왕 곁에 선 악마의 수 (마왕군의 기세) */
export function demonsServing(w: World, dlId: number): number {
  let n = 0;
  for (const c of w.chars) if (c.died < 0 && c.archdemon?.servesDL === dlId) n++;
  return n;
}

/** 악마에게 도전: 이름을 얻으려는 이에게 악마는 좋은 상대다 (paragon의 명예 목적에서 쓴다) */
export function demonDuel(w: World, a: Character, d: Character): Character { return duel(w, a, d, '악마와의 결투'); }

// ───────────── 마계의 정치

/** 서열 다툼: 바로 위의 악마(다섯 자리 안)에게 도전한다. 이기면 자리를 바꾼다 (악마는 죽지 않고 물러날 뿐) */
function rivalry(w: World, c: Character): boolean {
  const rng = w.rngSim;
  const A = c.archdemon!;
  if (A.rank <= 1) return false;
  const above = w.chars.filter(o => o.died < 0 && o.archdemon && o.archdemon.rank < A.rank && o.archdemon.rank >= A.rank - 5 && o.l === c.l);
  if (!above.length) return false;
  const o = rng.pick(above);
  const pa = charPower(c, w) * rng.float(0.7, 1.3), po = charPower(o, w) * rng.float(0.7, 1.3);
  const nat = natureOf(c);
  const how = { 분노: '정면으로 들이받았다', 탐욕: '보물을 걸고 내기를 청하였다', 거짓: '거짓 소문으로 그의 가신들을 빼돌렸다', 역병: '그의 둥지에 병을 풀었다', 전쟁: '군세를 이끌고 둥지를 에워쌌다', 욕망: '그의 총신들을 홀려 등을 돌리게 하였다', 절망: '그의 귀에 끝없는 절망을 속삭였다' }[nat];
  if (pa > po) {
    const r = A.rank; A.rank = o.archdemon!.rank; o.archdemon!.rank = r;
    c.epithet = demonTitle(c); o.epithet = demonTitle(o);
    c.fame += 15; o.stats.health = clamp(o.stats.health - 40);
    charLog(w, c, `${o.name}에게 도전하여 ${how}. 서열 ${A.rank}위의 자리를 빼앗았다.`, 3);
    charLog(w, o, `${c.name}에게 서열을 빼앗기고 ${o.archdemon!.rank}위로 밀려났다.`, 3);
    addNews(w, `마계가 흔들렸다. ${c.name}이(가) ${o.name}에게 ${how}. ${c.name}은(는) 이제 마계 서열 ${A.rank}위의 ${demonTitle(c)}이다.`, A.rank <= 9 ? 3 : 2, 'dark', { pos: c, chars: [c.id, o.id] });
  } else {
    c.stats.health = clamp(c.stats.health - 50);
    charLog(w, c, `${o.name}에게 도전하였으나 물러났다. 상처를 핥으며 둥지로 돌아갔다.`, 2);
    charLog(w, o, `서열을 노린 ${c.name}을(를) 물리쳤다.`, 2);
  }
  return true;
}

/** 어둠의 군주와 계약한다: 피의 제물을 받고, 그 나라의 군세에 십 년 동안 힘을 보탠다 */
function darkPact(w: World, c: Character): boolean {
  const cands = w.factions.filter(f => f.alive && RACES[f.race].align === 'dark' && !RACES[f.race].noPop && !f.flags.some(x => x.startsWith('demonpact:')) && w.chars[f.leader]?.died < 0);
  if (!cands.length) return false;
  const f = w.rngSim.pick(cands);
  const ld = w.chars[f.leader];
  const cap = w.settlements[f.capital];
  if (!cap || !ld) return false;
  f.flags.push(`demonpact:${w.t + 120}`);
  const paid = Math.round(cap.pop * 0.03);
  cap.pop -= paid;
  charLog(w, c, `${f.name}의 ${ld.name}과(와) 피의 계약을 맺었다.`, 3);
  charLog(w, ld, `악마 ${c.name}과(와) 피의 계약을 맺었다. ${paid}명의 피가 제물로 바쳐졌다.`, 3);
  addNews(w, `${f.name}의 ${ld.name}이(가) ${demonTitle(c)} ${c.name}과(와) 피의 계약을 맺었다. ${cap.name}의 제단에 ${paid}명의 피가 흘렀다. 그 나라의 군세에 마계의 힘이 깃들었다.`, 3, 'dark', { pos: cap, facs: [f.id], chars: [ld.id, c.id] });
  return true;
}

/** 마왕을 버린다: 마왕이 밀리거나, 본성이 맞지 않으면 제 둥지로 돌아간다 */
function forsake(w: World, c: Character): boolean {
  const A = c.archdemon!;
  const dl = w.chars[A.servesDL ?? -1];
  if (!dl || dl.died >= 0 || w.demonLord !== dl.id) { A.servesDL = undefined; return false; }
  const dlf = w.factions[dl.faction];
  const losing = !!dlf && Object.keys(dlf.wars).some(id => (dlf.warState?.[+id]?.score ?? 0) < -40);
  const fickle = natureOf(c) === '거짓' || natureOf(c) === '탐욕' || natureOf(c) === '욕망';
  if (!losing && !(fickle && w.rngSim.chance(0.3))) return false;
  A.servesDL = undefined;
  charLog(w, c, `마왕 ${dl.name}의 곁을 떠났다.`, 3);
  addNews(w, `${demonTitle(c)} ${c.name}이(가) ${losing ? '기울어 가는 ' : ''}마왕 ${dl.name}의 곁을 떠나 마계의 둥지로 돌아갔다.`, 3, 'dark', { pos: c, chars: [c.id, dl.id] });
  return true;
}
