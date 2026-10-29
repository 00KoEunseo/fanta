// 인생의 큰 변화: 나라가 바뀌고, 배우자를 잃고, 자리에 오르고, 사슬에 묶인다.
// 매달 '나'의 처지를 지난달과 견주어, 크게 달라졌으면 그 순간을 붙잡아 선택지로 묻는다.
import type { Character, World } from './state';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all } from './life';
import { o } from './lifeData1';
import { charLog } from './news';
import { relocate } from './characters';

type Watch = { faction: number; spouse: number; gov: number; leader: number; head: number; slave: number };

function snapshot(w: World, c: Character): Watch {
  const f = w.factions[c.faction];
  const h = c.house !== undefined ? w.houses[c.house] : undefined;
  return {
    faction: c.faction,
    spouse: c.spouse,
    gov: w.settlements.find(s => s.alive && s.governor === c.id)?.id ?? -1,
    leader: f && f.leader === c.id ? f.id : -1,
    head: h && h.alive && h.head === c.id ? h.id : -1,
    slave: c.role === '노예' ? 1 : 0,
  };
}

/** 매달: 처지가 크게 바뀌었으면 표식을 남긴다 (곧 선택지가 뜬다) */
export function watchMilestones(w: World): void {
  const P = w.player;
  if (!P || P.dead) return;
  const c = w.chars[P.charId];
  if (!c || c.died >= 0) return;
  const now = snapshot(w, c);
  const prev = P.watch as Watch | undefined;
  P.watch = now as unknown as Record<string, number>;
  if (!prev) return;
  P.flags ??= {};
  const mark = (k: string, v = w.t) => { P.flags!['ms_' + k] = v; };
  const perilRecent = (k: string) => (P.flags!['peril_' + k] ?? -99) >= w.t - 3;
  // 내가 막 골라서 바뀐 소속은 큰 변화가 아니다
  const chose = (P.flags.lastResolve ?? -99) >= w.t - 1;
  if (prev.faction !== now.faction && now.faction >= 0 && !chose && !perilRecent('fallen') && !perilRecent('fall')) { mark('faction'); P.flags.msOldFaction = prev.faction; }
  if (prev.spouse >= 0 && now.spouse < 0 && w.chars[prev.spouse]?.died >= 0) { mark('widowed'); P.flags.msSpouse = prev.spouse; P.flags.mourning = w.t; }
  if (now.leader >= 0 && prev.leader < 0) mark('crowned');
  else if (now.gov >= 0 && prev.gov !== now.gov) { mark('lord'); P.flags.msSeat = now.gov; }
  if (now.head >= 0 && prev.head !== now.head) mark('head');
  if (now.slave && !prev.slave) mark('enslaved');
  if (!now.slave && prev.slave) mark('freed');
  // 사는 고을의 깃발이 바뀌었는데 '나'는 여전히 옛 나라의 백성이다 (함락·반란·할양·흡수)
  const home = w.settlements[c.home];
  const recentFlip = (P.flags.ms_homeflip ?? -99) >= w.t - 12;
  if (home && home.alive && c.faction >= 0 && home.faction !== c.faction && w.factions[home.faction]?.alive && c.act.kind !== 'prison' && w.factions[c.faction]?.leader !== c.id && c.role !== '노예'
    && !recentFlip && !perilRecent('fallen') && !perilRecent('fallenAway') && !perilRecent('fall') && (P.flags.exiled ?? -99) < w.t - 3) {
    const nf = w.factions[home.faction]!;
    const born = nf.rulers[0]?.from ?? -99;
    const why = born >= w.t - 3 && /독립|계승 전쟁|반란/.test(nf.rulers[0]?.how ?? '') ? 1 : nf.wars[c.faction] !== undefined ? 2 : 3;
    mark('homeflip'); P.flags.msOldFaction = c.faction; P.flags.homeFlipWhy = why;
  }
}

const fresh = (k: string) => (x: Ctx) => { const t = x.P.flags?.['ms_' + k]; return t !== undefined && x.w.t - t <= 3; };
const flipWhy = (x: Ctx) => x.P.flags?.homeFlipWhy ?? 3;
const newFac = (x: Ctx) => x.w.factions[x.home?.faction ?? -1];
const clear = (k: string) => 'ms_' + k;

export const MILESTONES: LifeEv[] = [
  { id: 'ms_homeflip', t: '고향의 깃발', cd: 6, c: all(adult, fresh('homeflip'), x => !!x.home && x.home.faction !== x.c.faction),
    data: x => ({ fo: x.w.factions[x.P.flags?.msOldFaction ?? -1]?.name ?? '옛 나라', fn: newFac(x)?.name ?? '새 나라', nl: x.w.chars[newFac(x)?.leader ?? -1]?.name ?? '새 주인' }),
    x: x => [
      '',
      '{h}이(가) {fo}에 맞서 들고 일어났다. 성문 위에 {fn}의 깃발이 올랐다. 광장에서 {nl}이(가) 외친다. "오늘부터 우리는 누구의 종도 아니다!"',
      '{h}이(가) {fn}의 손에 떨어졌다. 낯선 병사들이 거리를 지나며 집집마다 문을 두드린다. 당신은 아직 {fo}의 백성이다.',
      '강화의 값으로, 혹은 큰 나라에 삼켜져, {h}이(가) {fn}에 넘어갔다. 어제까지의 {fo}은(는) 이제 국경 너머에 있다.',
    ][flipWhy(x)],
    o: x => {
      const why = flipWhy(x);
      const old = x.w.factions[x.P.flags?.msOldFaction ?? -1];
      const opts = [
        why === 1 ? o('반란에 가담한다', { r: '{nl}의 깃발 아래 섰다. 새 나라의 첫 백성이 되었다.', fx: 'hf_join', fame: 4, tr: [[1, 4], [4, -4]], unflag: clear('homeflip') })
          : o('새 주인을 받아들인다', { r: '살아가는 땅이 곧 나라라고 마음먹었다.', fx: 'hf_join', unflag: clear('homeflip') }),
        o('겉으로만 따른다', { r: '고개는 숙였지만 마음까지 내주지는 않았다.', fx: 'hf_join', tr: [[4, -5]], unflag: clear('homeflip'), seed: ['old_loyalty', '{fo}에 대한 옛 충성'] }),
      ];
      if (old && old.alive) opts.push(o(why === 1 ? '반역자들을 피해 옛 나라로 간다' : '옛 나라의 땅으로 떠난다', { r: '', fx: 'ms_go_old', honor: why === 1 ? 4 : 0, unflag: clear('homeflip') }));
      if (why === 1 && old && old.alive) opts.push(o('옛 나라에 몰래 성문을 열어 줄 날을 노린다', { r: '밤마다 옛 나라의 밀사와 만났다.', fx: 'hf_join', honor: -3, unflag: clear('homeflip'), seed: ['old_loyalty', '{fo}을(를) 위한 밀약'] }, '들키면 목숨이 위험하다', ['luck', 0.75], { r: '밀사와 만나는 것을 들켰다. 매질 끝에 쫓겨났다.', hp: -25, fx: 'ms_go_old', unflag: clear('homeflip') }));
      return opts;
    } },
  { id: 'ms_faction', t: '다른 깃발 아래', cd: 12, c: all(adult, fresh('faction')),
    data: x => ({ fo: x.w.factions[x.P.flags?.msOldFaction ?? -1]?.name ?? '옛 나라' }),
    x: '이제 {f}의 백성이 되었다. 어제까지 {fo}의 깃발이 걸렸던 자리에 낯선 깃발이 나부낀다.',
    o: [o('새 주인을 받아들인다', { r: '살아가는 땅이 곧 나라라고 마음먹었다.', unflag: clear('faction') }),
      o('겉으로만 따른다', { r: '고개는 숙였지만 마음까지 내주지는 않았다.', tr: [[4, -5]], unflag: clear('faction'), seed: ['old_loyalty', '{fo}에 대한 옛 충성'] }),
      { ...o('옛 나라의 땅으로 떠난다', { r: '', fx: 'ms_go_old', unflag: clear('faction') }), show: (x: Ctx) => !!x.w.factions[x.P.flags?.msOldFaction ?? -1]?.alive }] },
  { id: 'ms_widowed', t: '빈자리', cd: 12, c: all(adult, fresh('widowed')),
    // 떠난 이의 이름이 걸린 이야기라 'Id' 키를 쓰지 않는다 (죽은 인물 이야기는 건너뛰는 규칙에 걸린다)
    data: x => ({ ws: x.P.flags?.msSpouse ?? -1 }),
    x: x => `${x.w.chars[x.P.flags?.msSpouse ?? -1]?.name ?? '배우자'}이(가) 세상을 떠났다. 함께 쓰던 잔 하나가 식탁 위에 그대로 놓여 있다.`,
    o: [o('성대한 장례를 치른다', { r: '마을 사람들이 모두 와서 고인을 기렸다.', wealth: -30, honor: 6, mood: -10, unflag: clear('widowed') }),
      o('슬픔을 일로 잊는다', { r: '밤낮없이 일에 매달렸다.', mood: -15, mi: 1, in: 1, unflag: clear('widowed') }),
      o('홀로 무덤가를 지킨다', { r: '한동안 아무도 만나지 않았다.', mood: -20, tr: [[7, -5]], unflag: clear('widowed') })] },
  { id: 'ms_crowned', t: '왕좌', cd: 12, c: all(adult, fresh('crowned')),
    x: '{f}의 왕좌가 당신의 것이 되었다. 신하들이 고개를 숙이고, 백성들은 새 군주가 어떤 사람일지 숨죽여 지켜본다.',
    o: [o('자비로운 군주가 되겠다', { r: '첫 칙령으로 세금을 덜어 주었다. 백성들이 환호하였다.', honor: 10, tr: [[3, 6]], unflag: clear('crowned') }),
      o('강한 군주가 되겠다', { r: '첫 칙령으로 군대를 늘렸다. 이웃 나라들이 긴장하였다.', co: 3, tr: [[1, 6]], unflag: clear('crowned') }),
      o('지혜로운 군주가 되겠다', { r: '현자들을 궁정에 불러 모았다.', in: 3, tr: [[8, 5]], unflag: clear('crowned') })] },
  { id: 'ms_lord', t: '영지', cd: 12, c: all(adult, fresh('lord')),
    data: x => ({ seatId: x.P.flags?.msSeat ?? -1 }),
    x: '{seat}의 영주가 되었다. 성문 열쇠 꾸러미가 손에 쥐어졌다. 이 고을의 운명이 이제 당신 손에 달렸다.',
    o: [o('백성의 살림부터 살핀다', { r: '곳간을 열어 굶주린 이들을 먹였다.', honor: 8, unflag: clear('lord') }),
      o('성벽부터 고친다', { r: '무너진 성벽이 다시 섰다.', co: 2, unflag: clear('lord') }),
      o('세금부터 걷는다', { r: '금고가 묵직해졌다. 원성도 함께 쌓였다.', wealth: 40, honor: -5, unflag: clear('lord') })] },
  { id: 'ms_head', t: '가주', cd: 12, c: all(adult, fresh('head')),
    x: x => `${x.w.houses[x.c.house ?? -1]?.name ?? '가문'}의 가주가 되었다. 선대의 초상화가 걸린 방에서, 가문의 인장이 당신에게 건네졌다.`,
    o: [o('가문의 이름을 드높이겠다', { r: '가문의 깃발을 새로 짓게 하였다.', fame: 5, unflag: clear('head') }),
      o('식구들을 먼저 돌보겠다', { r: '흩어졌던 친척들을 불러 모아 잔치를 열었다.', wealth: -20, honor: 5, unflag: clear('head') })] },
  { id: 'ms_enslaved', t: '사슬', cd: 12, c: all(adult, fresh('enslaved')),
    x: '목에 차가운 쇠사슬이 채워졌다. 어제의 이름은 오늘 아무 의미가 없다.',
    o: [o('살아남는 것만 생각한다', { r: '고개를 숙이고 이를 악물었다.', tr: [[8, 4]], unflag: clear('enslaved') }),
      o('언젠가 반드시 도망치겠다', { r: '밤마다 사슬의 이음새를 살폈다.', tr: [[0, 5]], unflag: clear('enslaved') })] },
  { id: 'ms_freed', t: '자유', cd: 12, c: all(adult, fresh('freed')),
    x: '사슬이 풀렸다. 손목에 남은 자국을 오래도록 쓰다듬었다.',
    o: [o('새 삶을 시작한다', { r: '처음으로 내 뜻대로 걸었다.', mood: 20, unflag: clear('freed') }),
      o('사슬을 채운 자들을 잊지 않겠다', { r: '그들의 이름을 가슴에 새겼다.', tr: [[0, 4]], mood: 10, unflag: clear('freed') })] },
];

FX_HOOKS.push((x, fx) => {
  if (fx === 'hf_join') {
    const s = x.home;
    if (s && s.alive) { x.c.faction = s.faction; charLog(x.w, x.c, `${x.w.factions[s.faction]?.name ?? '새 나라'}의 백성이 되었다.`, 3); }
    return '';
  }
  if (fx !== 'ms_go_old') return null;
  const of = x.w.factions[x.P.flags?.msOldFaction ?? -1];
  const to = of?.alive ? x.w.settlements.filter(s => s.alive && s.faction === of.id).sort((a, b) => Math.hypot(a.x - x.c.x, a.y - x.c.y) - Math.hypot(b.x - x.c.x, b.y - x.c.y))[0] : undefined;
  if (!to || !of) return '돌아갈 옛 나라가 남아 있지 않았다.';
  x.c.home = to.id; x.c.faction = of.id;
  relocate(x.w, x.c, to);
  charLog(x.w, x.c, `낯선 깃발을 등지고 ${of.name}의 ${to.name}(으)로 떠났다.`, 3);
  return `${of.name}의 ${to.name}(으)로 길을 떠났다.`;
});
