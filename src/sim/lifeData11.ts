// 인생 이벤트 데이터 11: 넓어진 세상이 '나'의 삶에 닿는 순간들.
// 낯선 세력과의 첫 만남, 고향에 들어온 새 신앙, 성직의 길과 순례, 주둔지 소집, 상단 인솔,
// 열강과의 만남(과 열강이 될 기회), 악마의 속삭임, 끝나지 않는 전쟁과 군주의 강화 협상.
import type { Character, World } from './state';
import { dist } from './state';
import { COMPASSION, FAITH, LOYALTY } from '../data/traits';
import { RACES } from '../data/races';
import { addNews, charLog } from './news';
import { addFacRel, charPower } from './helpers';
import { duel, relocate, setTravel } from './characters';
import { faithOf, pilgrimSite } from './religion';
import { ascendParagon, MOTIVE_NAME } from './paragon';
import { demonTitle } from './demons';
import { offerTerms } from './warfare';
import { playerCaravan } from './caravan';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all, job } from './life';
import { o } from './lifeData1';

const idle = (x: Ctx) => x.c.act.kind === 'idle';
const fresh = (k: string, months = 3) => (x: Ctx) => { const t = x.P.flags?.[k]; return t !== undefined && x.w.t - t <= months; };

/** 가까이 있는 열강 */
function nearParagon(x: Ctx): Character | undefined {
  return x.w.chars.find(p => p.died < 0 && p.paragon && p.l === x.c.l && dist(p, x.c) <= 12);
}
/** '나'를 노리는 악마 (고향 근처로 올라온) */
function nearDemon(x: Ctx): Character | undefined {
  return x.w.chars.find(d => d.died < 0 && d.archdemon && d.l === x.c.l && dist(d, x.c) <= 6);
}
/** 고향 고을에 들어온, 내가 믿지 않는 신앙 */
function newFaith(x: Ctx) {
  const s = x.home;
  const r = faithOf(x.w, s?.faith);
  return r && r.id !== x.c.faith ? r : undefined;
}
/** 내 나라가 세운 주둔지 가운데 가장 가까운 곳 */
function myCamp(x: Ctx) {
  return (x.w.camps ?? []).filter(k => k.alive && k.faction === x.c.faction && k.l === x.c.l).sort((a, b) => dist(a, x.c) - dist(b, x.c))[0];
}

export const WORLD_LIFE: LifeEv[] = [
  // ── 첫 만남 (조우: contact.ts가 표식을 남긴다)
  { id: 'wl_contact', t: '낯선 이들', cd: 6, c: all(adult, fresh('metFacT')),
    data: x => ({ fac: x.w.factions[x.P.flags?.metFac ?? -1]?.name ?? '낯선 이들', race: RACES[x.w.factions[x.P.flags?.metFac ?? -1]?.race ?? 'human'].name, mf: x.P.flags?.metFac ?? -1 }),
    x: '길 위에서 처음 보는 {race}들과 마주쳤다. 말도 옷차림도 낯설다. 그들도 이쪽을 경계하며 손을 무기에 얹었다.',
    o: [o('가진 것을 나누며 손을 내민다', { r: '불가에 둘러앉아 서로의 말을 몇 마디 배웠다. 돌아가면 이야기할 것이 많다.', fx: 'meet_good', ch: 1, fame: 4 }),
      o('조용히 물러난다', { r: '눈을 떼지 않고 뒷걸음질 쳤다.' }),
      o('먼저 칼을 뽑는다', { r: '피를 보고 갈라섰다. 두 겨레 사이에 나쁜 첫인상이 남았다.', fx: 'meet_bad', mi: 1 }, '', ['mi', 0.5], { r: '수가 많았다. 크게 다쳐 도망쳤다.', hp: -30, fx: 'meet_bad' })] },
  // ── 새 신앙
  { id: 'wl_convert', t: '새 신앙', cd: 72, w: 4, c: all(adult, idle, x => !!newFaith(x)),
    data: x => { const r = newFaith(x)!; return { rel: r.name, deity: r.deity, rid: r.id }; },
    x: '{h}에 {rel}의 사제들이 들어와 \'{deity}\'의 이름을 외친다. 이웃들이 하나둘 그 앞에 무릎을 꿇는다.',
    o: x => [o('{rel}을(를) 받아들인다', { r: '\'{deity}\'의 이름으로 새 삶을 시작하였다.', fx: 'convert', tr: [[FAITH, 5]] }),
      ...(faithOf(x.w, x.c.faith) ? [o('옛 신앙을 지킨다', { r: '홀로 옛 기도를 올렸다. 이웃들의 눈길이 서늘하다.', honor: 4, mood: -4 })] : [o('신을 믿지 않는다', { r: '어느 신에게도 무릎 꿇지 않았다.' })]),
      o('사제들을 쫓아낸다', { r: '사제들은 돌을 맞고 떠났다. 그들의 신도들이 원한을 품었다.', honor: -6, mi: 1 })] },
  // ── 성직의 길
  { id: 'wl_temple_keeper', t: '비어 있는 신전', cd: 60, w: 5, c: all(adult, idle, job('성직자'), x => !!faithOf(x.w, x.c.faith) && !!vacantTemple(x)),
    data: x => { const t = vacantTemple(x)!; return { temple: t.name, tid: t.id }; },
    x: '{temple}을(를) 지키던 신관이 세상을 떠났다. 신도들이 당신의 이름을 입에 올린다.',
    o: [o('신관의 자리를 맡는다', { r: '{temple}의 신관이 되었다. 아침마다 종을 울렸다.', fx: 'keeper', fame: 10, honor: 6 }), o('아직 부족하다며 사양한다', { r: '더 배우기로 하였다.', in: 1 })] },
  { id: 'wl_high_priest', t: '대신관의 자리', cd: 120, w: 4, once: true, c: all(adult, idle, job('성직자'), x => { const r = faithOf(x.w, x.c.faith); return !!r && (r.head < 0 || x.w.chars[r.head]?.died >= 0) && x.c.fame >= 30; }),
    data: x => ({ rel: faithOf(x.w, x.c.faith)!.name }),
    x: '{rel}의 대신관이 세상을 떠났다. 사제들의 회의에서 당신의 이름이 가장 많이 불렸다.',
    o: [o('대신관의 자리에 오른다', { r: '{rel}의 대신관이 되었다. 온 교단이 당신의 말을 기다린다.', fx: 'high_priest', fame: 25, honor: 10 }), o('겸손히 물러난다', { r: '다른 이가 대신관이 되었다.', honor: 5 })] },
  { id: 'wl_pilgrim', t: '성지 순례', cd: 120, w: 3, c: all(adult, idle, x => x.c.traits[FAITH] >= 50 && !!pilgrimSite(x.w, x.c, x.f)),
    data: x => ({ holy: pilgrimSite(x.w, x.c, x.f)!.name, hid: pilgrimSite(x.w, x.c, x.f)!.id }),
    x: '신도들이 {holy}(으)로 순례를 떠난다. 평생 한 번은 그 땅을 밟아야 한다고들 한다.',
    o: [o('순례길에 오른다', { r: '지팡이 하나를 들고 길을 나섰다.', fx: 'pilgrim_go' }), o('다음을 기약한다', { r: '마음속으로만 기도하였다.' })] },
  // ── 주둔지 소집
  { id: 'wl_camp_call', t: '주둔지 소집', cd: 36, w: 5, c: all(adult, idle, x => !x.isLeader && !!myCamp(x)),
    data: x => { const k = myCamp(x)!; return { camp: k.name, kid: k.id, foe: x.w.factions[k.enemy]?.name ?? '적' }; },
    x: '{foe}과(와)의 전선에 세운 {camp}에서 사람이 모자라다며 소집령이 내려왔다.',
    o: [o('주둔지로 간다', { r: '창 한 자루를 받아 들고 {camp}(으)로 향하였다.', fx: 'camp_go' }), o('뒷돈을 쥐여 주고 빠진다', { r: '소집관이 못 본 척 고개를 돌렸다.', wealth: -25, honor: -4 }),
      o('몰래 달아난다', { r: '밤을 틈타 고을을 빠져나왔다. 고향 사람들의 눈길이 차갑다.', honor: -15 })] },
  { id: 'wl_camp_night', t: '주둔지의 밤', cd: 10, c: all(adult, x => x.P.flags?.campSoldier !== undefined && x.c.act.kind === 'camp'),
    data: x => ({ camp: x.w.camps?.[x.P.flags!.campSoldier!]?.name ?? '주둔지' }),
    x: '{camp}의 밤. 적의 횃불이 지평선을 따라 늘어서 있다. 오늘 밤 기습이 있을 거라는 소문이다.',
    o: [o('보초를 선다', { r: '긴 밤을 버텼다. 새벽 안개 속에서 적의 횃불이 물러갔다.', co: 2, fame: 6 }, '', ['co', 0.55], { r: '기습에 무너진 보초선에서 크게 다쳤다.', hp: -35 }),
      o('기습대에 자원한다', { r: '적의 보급 수레에 불을 지르고 돌아왔다!', fame: 15, mi: 2 }, '살아 돌아오면 이름이 남는다', ['mi', 0.45], { r: '적진 한가운데서 쓰러졌다.', hp: -60 })] },
  // ── 상단 인솔
  { id: 'wl_caravan', t: '상단 인솔', cd: 48, w: 4, c: all(adult, idle, job('상인'), x => !!x.f && x.f.treaties.length > 0 && !!x.home && x.home.id === x.f.capital),
    data: x => { const t = x.f!.treaties[0]; const o2 = x.w.factions[t.with]; return { to: o2?.name ?? '이웃 나라', tf: t.with }; },
    x: '{to}(으)로 떠날 상단에 대상주가 없다. 짐을 실은 수레가 당신의 결정을 기다린다.',
    o: [o('상단을 이끈다', { r: '수레의 맨 앞에 섰다.', fx: 'lead_caravan' }), o('다른 이에게 맡긴다', { r: '다른 상인이 상단을 이끌고 떠났다.' })] },
  // ── 열강과의 만남
  { id: 'wl_paragon', t: '열강', cd: 60, w: 6, c: all(adult, idle, x => !!nearParagon(x)),
    data: x => { const p = nearParagon(x)!; return { pId: p.id, motive: MOTIVE_NAME[p.paragon!.motive] }; },
    x: '{p}이(가) 길을 지나간다. 세상이 열강이라 부르는, {motive}의 길을 걷는 이다. 그 눈이 잠시 당신에게 머문다.',
    o: [o('결투를 청한다', { r: '', fx: 'duel_paragon' }, '이기면 이름이 천하에 퍼지고, 지면 죽을 수도 있다'),
      o('가르침을 청한다', { r: '{p}은(는) 한동안 당신의 칼끝을 고쳐 주었다.', mi: 4, ma: 2, fame: 5 }, '', ['ch', 0.4], { r: '{p}은(는) 대꾸도 없이 지나갔다.', mood: -3 }),
      o('고개를 숙이고 길을 비킨다', { r: '바람처럼 지나갔다.' })] },
  { id: 'wl_become_paragon', t: '홀로 선다', once: true, w: 8, c: all(adult, idle, x => !x.isLeader && !x.c.paragon && charPower(x.c, x.w) >= 130 && x.c.fame >= 80 && !x.w.settlements.some(s => s.alive && s.governor === x.c.id)),
    x: '어느덧 당신의 칼끝을 받아낼 이가 나라 안에 없다. 깃발과 왕의 명령이 갑갑하게 느껴진다.',
    o: [o('나라를 떠나 홀로 선다', { r: '', fx: 'go_paragon' }), o('그래도 나라에 남는다', { r: '깃발 아래 남기로 하였다.', tr: [[LOYALTY, 5]] })] },
  // ── 악마의 속삭임
  { id: 'wl_demon', t: '속삭임', cd: 120, w: 8, c: all(adult, x => !!nearDemon(x)),
    data: x => { const d = nearDemon(x)!; return { dId: d.id, dt: demonTitle(d) }; },
    x: '{dt} {d}이(가) 그림자 속에서 웃는다. "갈망하는 것을 주마. 값은… 나중에 받지."',
    o: [o('손을 맞잡는다', { r: '몸 안에서 무언가 뒤틀리며 힘이 차올랐다. 거울 속의 눈빛이 낯설다.', mi: 12, ma: 12, tr: [[COMPASSION, -30]], honor: -20, fx: 'demon_pact' }),
      o('거절한다', { r: '{d}은(는) 어깨를 으쓱하고 그림자 속으로 사라졌다.', honor: 6, tr: [[FAITH, 4]] }),
      o('칼을 뽑아 맞선다', { r: '', fx: 'fight_demon' }, '마계의 존재와의 싸움이다. 살아남기 어렵다')] },
  // ── 끝나지 않는 전쟁
  { id: 'wl_long_war', t: '끝나지 않는 전쟁', cd: 120, w: 5, c: all(adult, idle, x => !x.isLeader && !!x.f && Object.values(x.f.wars).some(t => x.w.t - t >= 120)),
    data: x => { const [id, t] = Object.entries(x.f!.wars).find(([, t]) => x.w.t - t >= 120)!; return { foe: x.w.factions[+id]?.name ?? '적', yrs: String(Math.floor((x.w.t - t) / 12)) }; },
    x: '{foe}과(와)의 전쟁이 {yrs}년째다. 마을에 젊은이가 남지 않았다. 과부들이 모여 강화를 청하자는 탄원서를 쓴다.',
    o: [o('탄원서에 이름을 올린다', { r: '탄원서는 궁에 닿았지만 답은 없었다.', honor: 3, fx: 'petition_peace' }), o('자원해서 전선으로 간다', { r: '피에 젖은 들판으로 떠났다.', mi: 2, fame: 6, hp: -10 }),
      o('국경 너머로 피난한다', { r: '짐을 꾸려 전쟁이 없는 땅으로 떠났다.', fx: 'flee_home' })] },
  // ── 군주: 강화 협상
  { id: 'wl_peace_terms', t: '강화의 값', cd: 24, w: 8, c: all(x => x.isLeader && !!losingWar(x)),
    data: x => { const e = losingWar(x)!; return { foe: e.name, eid: e.id }; },
    x: '{foe}과(와)의 전쟁에서 밀리고 있다. 대신들이 무엇을 내주고서라도 강화를 청하자고 한다.',
    o: [o('금고를 열어 공물을 바친다', { r: '', fx: 'terms_gold' }), o('국경의 고을 하나를 내준다', { r: '', fx: 'terms_land' }), o('끝까지 버틴다', { r: '"한 뼘의 땅도 내줄 수 없다." 궁정이 술렁였다.', honor: 6 })] },
];

/** 비어 있는 신전 (그 사람의 신앙, 같은 층) */
function vacantTemple(x: Ctx) {
  return x.w.sites.find(s => s.temple && s.temple.faith === x.c.faith && (s.temple.keeper < 0 || x.w.chars[s.temple.keeper]?.died >= 0) && s.l === x.c.l && dist(s, x.c) <= 30);
}
function atCamp(x: Ctx): boolean {
  const k = x.w.camps?.[x.P.flags?.campDuty ?? -1];
  return !!k && k.l === x.c.l && dist(k, x.c) <= 3;
}
/** 밀리고 있는 전쟁의 상대 */
function losingWar(x: Ctx) {
  const f = x.f;
  if (!f) return undefined;
  for (const [id, t] of Object.entries(f.wars)) {
    const st = f.warState?.[+id];
    if (st && st.score <= -25 && x.w.t - t >= 24) return x.w.factions[+id];
  }
  return undefined;
}

FX_HOOKS.push((x, fx, data) => {
  const { w, c } = x;
  switch (fx) {
    case 'meet_good': { const o2 = w.factions[+data.mf]; if (o2 && x.f) addFacRel(w, x.f, o2, 12); return ''; }
    case 'meet_bad': { const o2 = w.factions[+data.mf]; if (o2 && x.f) addFacRel(w, x.f, o2, -15); return ''; }
    case 'convert': { c.faith = +data.rid; return ''; }
    case 'keeper': {
      const t = w.sites[+data.tid];
      if (t?.temple) t.temple.keeper = c.id;
      return '';
    }
    case 'high_priest': { const r = faithOf(w, c.faith); if (r) { r.head = c.id; addNews(w, `${c.name}이(가) ${r.name}의 대신관이 되었다.`, 3, 'politics', { pos: c, chars: [c.id] }); } return ''; }
    case 'pilgrim_go': { const s = w.sites[+data.hid]; if (s && setTravel(w, c, s, 'pilgrim', s.id)) return ''; return '길이 막혀 떠나지 못하였다.'; }
    case 'camp_go': {
      const k = w.camps?.[+data.kid];
      if (!k || !k.alive) return '주둔지는 이미 거두어진 뒤였다.';
      x.P.flags ??= {};
      x.P.flags.campDuty = k.id;
      if (!setTravel(w, c, k, 'quest')) { delete x.P.flags.campDuty; return '길이 막혀 가지 못하였다.'; }
      return '';
    }
    case 'camp_done': {
      x.P.flags ??= {};
      delete x.P.flags.campDuty;
      const h = w.settlements[c.home];
      if (c.died < 0 && h && h.alive) relocate(w, c, h);
      return '';
    }
    case 'lead_caravan': {
      const f = x.f, o2 = w.factions[+data.tf];
      if (!f || !o2 || !o2.alive) return '상대 나라가 사라져 상단은 떠나지 못하였다.';
      return playerCaravan(w, c, f, o2);
    }
    case 'duel_paragon': {
      const p = w.chars[+data.pId];
      if (!p || p.died >= 0) return '열강은 이미 떠나고 없었다.';
      const win = duel(w, c, p, '열강과의 결투');
      if (win === c) { addNews(w, `${c.name}이(가) 열강 ${p.name}에게 결투를 청하여 꺾었다! 그 이름이 온 세상에 퍼졌다.`, 4, 'hero', { pos: c, chars: [c.id, p.id] }); return '믿기지 않게도, 쓰러진 것은 열강이었다.'; }
      return c.died >= 0 ? '' : '처참하게 졌다. 열강은 목숨만은 거두지 않았다.';
    }
    case 'go_paragon': { ascendParagon(w, c); return '깃발을 내려놓고 홀로 길을 나섰다. 사람들은 당신을 열강이라 부르기 시작하였다.'; }
    case 'demon_pact': { const d = w.chars[+data.dId]; if (d) charLog(w, d, `${c.name}과(와) 계약을 맺었다.`, 2); x.P.flags ??= {}; x.P.flags.demonPact = w.t; return ''; }
    case 'fight_demon': {
      const d = w.chars[+data.dId];
      if (!d || d.died >= 0) return '악마는 이미 사라지고 없었다.';
      const win = duel(w, c, d, '악마와의 결투');
      if (win === c) { addNews(w, `${c.name}이(가) ${demonTitle(d)} ${d.name}을(를) 쓰러뜨렸다! 마계의 예순여섯 가운데 하나가 스러졌다.`, 4, 'hero', { pos: c, chars: [c.id, d.id] }); return '마계의 존재가 재가 되어 흩어졌다.'; }
      return c.died >= 0 ? '' : `${d.name}은(는) 웃으며 사라졌다. 몸에 검은 화상이 남았다.`;
    }
    case 'petition_peace': { if (x.f) x.f.warWeariness += 20; return ''; }
    case 'terms_gold': case 'terms_land': {
      const e = w.factions[+data.eid];
      if (!x.f || !e || !e.alive || x.f.wars[e.id] === undefined) return '전쟁은 이미 끝나 있었다.';
      return offerTerms(w, x.f, e, fx === 'terms_land' ? 'land' : 'gold');
    }
  }
  return null;
});
