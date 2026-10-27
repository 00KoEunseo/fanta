// 원정 중의 일들: 부름, 토벌대, 출정군, 길 위, 연맹 (expedition.ts가 무리를 움직인다)
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all } from './life';
import { o } from './lifeData1';
import { charLabel } from './helpers';
import { expeditionFx } from './expedition';

// ───────────── 부름 (매달 가장 먼저 확인한다)

const inviteParty = (x: Ctx) => { const p = x.w.parties[x.P.flags?.partyInvite ?? -1]; return !!p && !p.done && x.c.act.kind === 'idle'; };
const inviteArmy = (x: Ctx) => { const a = x.w.armies[x.P.flags?.armyInvite ?? -1]; return !!a && a.alive && x.c.act.kind === 'idle'; };
const atGate = (x: Ctx) => x.P.flags?.siteGate !== undefined && x.c.act.kind === 'travel';

export const INVITES: LifeEv[] = [
  { id: 'xp_party_invite', t: '토벌대의 부름', cd: 0, c: inviteParty,
    x: x => {
      const p = x.w.parties[x.P.flags!.partyInvite!];
      const lead = x.w.chars[p.leader], foe = x.w.chars[p.target];
      return `${lead?.name ?? '누군가'}이(가) ${foe ? charLabel(x.w, foe) : '공공의 적'}을(를) 치러 갈 토벌대를 꾸리고 있다. ${p.alliance >= 0 ? '연맹의 명부에 이름을 올린 당신에게도 소집령이 왔다.' : '대장이 당신의 어깨를 두드렸다. "함께 가겠나?"'}`;
    },
    o: [o('토벌대에 합류한다', { r: '짐을 꾸려 대열에 섰다.', fx: 'join_party' }, '함께 행군하며 싸운다. 돌아오지 못할 수도 있다'), o('사양한다', { r: '떠나는 토벌대를 배웅하였다.', fx: 'decline_party', honor: -2 })] },
  { id: 'xp_army_invite', t: '출정 명령', cd: 0, c: inviteArmy,
    x: x => { const a = x.w.armies[x.P.flags!.armyInvite!]; return `${x.f?.name ?? '나라'}의 군세가 ${x.w.settlements[a.target]?.name ?? '적지'}(으)로 출정한다. 징집관이 이름을 부른다.`; },
    o: [o('창을 들고 대열에 선다', { r: '북소리에 맞추어 발을 내디뎠다.', fx: 'join_army', honor: 3 }, '군대와 함께 움직인다. 승리하면 공을, 패하면 목숨을 건다'),
      o('뒷돈을 쥐여 주고 빠진다', { r: '징집관이 못 본 척 고개를 돌렸다.', fx: 'decline_army', wealth: -25, honor: -8 }), o('병을 핑계로 몸을 뺀다', { r: '앓는 소리를 내며 누웠다.', fx: 'decline_army', honor: -4 })] },
  { id: 'xp_site_gate', t: '유적 입구', cd: 0, c: atGate,
    x: x => `마침내 ${x.w.sites[x.P.flags!.siteGate!]?.name ?? '유적'}의 입구에 다다랐다. 안쪽에서 차가운 바람이 불어 나온다.`,
    o: [o('정면으로 들이친다', { r: '횃불을 높이 들고 성큼 들어섰다.', fx: 'site_bold' }, '힘으로 밀어붙인다. 보물은 더 많지만 다칠 수 있다'),
      o('몰래 숨어든다', { r: '그림자를 따라 조용히 스며들었다.', fx: 'site_sneak' }, '덜 위험하지만 챙기는 것도 적다'),
      o('입구만 살피고 돌아선다', { r: '', fx: 'site_leave' })] },
];

// ───────────── 함께 움직이는 동안의 일

const inParty = (x: Ctx) => x.c.act.kind === 'party';
const partyLead = (x: Ctx) => { const p = x.w.parties.find(q => !q.done && q.members.includes(x.c.id)); return !!p && p.leader === x.c.id; };
const partyMember = (x: Ctx) => inParty(x) && !partyLead(x);
const vsDL = (x: Ctx) => { const p = x.w.parties.find(q => !q.done && q.members.includes(x.c.id)); return !!p && x.w.demonLord === p.target; };

export const PARTY_EV: LifeEv[] = [
  { id: 'xp_scout', t: '정찰 명령', cd: 8, c: partyMember, x: '대장이 당신을 불렀다. "앞길을 살펴보고 오게. 매복이 있을지도 모른다."',
    o: [o('홀로 앞서 나간다', { r: '숨은 지름길을 찾아 돌아왔다.', fx: 'party_scout', fame: 4 }, '', ['in', 0.55], { r: '길을 잃고 헤매다 짐승에게 물렸다.', hp: -15 }),
      o('다른 이를 보내자고 한다', { r: '대장이 못마땅한 눈치였다.', fx: 'party_down' })] },
  { id: 'xp_orders', t: '대장의 결정', cd: 10, c: partyLead, x: '갈림길이다. 험하지만 빠른 산길과, 안전하지만 먼 강변길이 있다. 대원들이 당신의 입만 바라본다.',
    o: [o('산길로 간다', { r: '숨이 턱에 차도록 산을 넘었다.', fx: 'party_scout', hp: -8 }, '', ['co', 0.5], { r: '낙석에 대원 하나가 다쳤다.', fx: 'party_down' }),
      o('강변길로 간다', { r: '느리지만 무사히 나아갔다. 대원들의 얼굴이 밝다.', fx: 'party_up' })] },
  { id: 'xp_camp', t: '야영의 밤', cd: 6, c: inParty, x: '모닥불이 타닥거린다. 대원들이 저마다 고향 이야기를 꺼낸다.',
    o: [o('동료와 밤새 이야기한다', { r: '', fx: 'party_friend', mood: 5 }), o('보초를 자청한다', { r: '밤새 눈을 부릅떴다. 대원들이 편히 잤다.', fx: 'party_up', co: 1, hp: -3 }),
      o('몰래 술병을 딴다', { r: '다음 날 머리가 깨질 듯 아팠다.', mood: 6, hp: -5 })] },
  { id: 'xp_quarrel', t: '대원들의 다툼', cd: 12, c: inParty, x: '전리품 분배를 두고 두 대원이 칼자루에 손을 얹었다.',
    o: [o('사이에 끼어들어 말린다', { r: '둘을 화해시켰다. 대열이 다시 하나가 되었다.', fx: 'party_up2', ch: 1 }, '', ['ch', 0.5], { r: '오히려 불똥이 튀었다.', fx: 'party_down', hp: -6 }),
      o('못 본 척한다', { r: '분위기가 험악해졌다.', fx: 'party_down' })] },
  { id: 'xp_deserter', t: '달아나려는 대원', cd: 18, c: inParty, x: '한밤중, 대원 하나가 짐을 챙겨 몰래 대열을 빠져나가는 것을 보았다.',
    o: [o('붙잡아 설득한다', { r: '그는 부끄러워하며 대열로 돌아왔다.', fx: 'party_up' }, '', ['ch', 0.45], { r: '그는 뿌리치고 어둠 속으로 사라졌다.', fx: 'party_desert' }),
      o('조용히 보내 준다', { r: '', fx: 'party_desert', honor: 2 }), o('나도 함께 떠난다', { r: '', fx: 'leave_party', honor: -15 })] },
  { id: 'xp_wounded', t: '쓰러진 동료', cd: 14, c: inParty, x: '행군 도중 동료 하나가 열병으로 쓰러졌다. 갈 길은 멀다.',
    o: [o('업고 간다', { r: '등이 끊어질 듯하였지만 끝내 함께 걸었다.', fx: 'party_up2', hp: -10, honor: 6 }), o('마을에 맡기고 간다', { r: '그를 남겨 두고 떠났다.', fx: 'party_down' })] },
  { id: 'xp_omen', t: '마왕성의 그림자', cd: 24, c: all(inParty, vsDL), x: '지평선 끝에 검은 성이 보인다. 대원들의 얼굴에서 핏기가 가셨다.',
    o: [o('앞장서 노래를 부른다', { r: '떨리던 목소리들이 하나둘 따라 불렀다.', fx: 'party_up2', ch: 1 }, '', ['ch', 0.5], { r: '아무도 따라 부르지 않았다.', fx: 'party_down' }),
      o('묵묵히 칼을 간다', { r: '숫돌 소리만이 밤을 채웠다.', mi: 1 })] },
];

const inArmy = (x: Ctx) => x.c.act.kind === 'army' && x.P.flags?.armyId !== undefined;
export const ARMY_EV: LifeEv[] = [
  { id: 'xa_supply', t: '보급 부족', cd: 10, c: inArmy, x: '보급 마차가 늦는다. 병사들이 배를 곯기 시작하였다.',
    o: [o('사냥을 나가 식량을 구한다', { r: '사슴 두 마리를 끌고 돌아왔다. 대열이 환호하였다.', fx: 'army_up', fame: 3 }, '', ['mi', 0.5], { r: '빈손으로 돌아왔다.', hp: -5 }),
      o('근처 마을을 턴다', { r: '배는 채웠지만 원성이 자자하였다.', fx: 'army_loot', honor: -8, wealth: 10 }), o('허리띠를 졸라맨다', { r: '모두 함께 굶주렸다.', fx: 'army_down', hp: -4 })] },
  { id: 'xa_ambush', t: '매복', cd: 12, c: inArmy, x: '골짜기를 지나는데 양쪽 비탈에서 화살이 쏟아졌다!',
    o: [o('방패를 들고 앞으로', { r: '매복을 뚫고 적을 쫓아냈다.', fx: 'army_up', fame: 6, mi: 1 }, '', ['mi', 0.5], { r: '화살 한 대가 어깨에 박혔다.', hp: -20 }),
      o('바위 뒤로 몸을 숨긴다', { r: '살아남았다. 그뿐이었다.', hp: -3 })] },
  { id: 'xa_discipline', t: '군기', cd: 14, c: inArmy, x: '병사 몇이 지휘관의 명령을 비웃으며 술판을 벌이고 있다.',
    o: [o('지휘관에게 알린다', { r: '군기가 바로 섰다. 동료들의 눈초리는 따가웠다.', fx: 'army_up', honor: 3 }), o('술판에 낀다', { r: '모처럼 웃었다.', mood: 8, fx: 'army_down' })] },
  { id: 'xa_prisoner', t: '포로', cd: 18, c: inArmy, x: '정찰 중에 붙잡은 적병이 목숨만 살려 달라고 빈다.',
    o: [o('놓아준다', { r: '그는 몇 번이고 고개를 숙이고 달아났다.', honor: 5, tr: [[3, 3]] }), o('지휘관에게 넘긴다', { r: '적의 배치를 알아냈다.', fx: 'army_up', honor: 1 }),
      o('그 자리에서 벤다', { r: '피 묻은 칼을 닦았다.', honor: -6, tr: [[3, -4]] })] },
  { id: 'xa_desert', t: '고향 생각', cd: 24, c: inArmy, x: '밤마다 고향 꿈을 꾼다. 탈영병의 말로는 모두가 알지만, 오늘 밤 경계는 허술하다.',
    o: [o('끝까지 남는다', { r: '이를 악물고 버텼다.', honor: 3 }), o('밤을 틈타 달아난다', { r: '고향으로 향하는 샛길에 몸을 숨겼다.', fx: 'army_desert', honor: -20 })] },
];

const traveling = (x: Ctx) => x.c.act.kind === 'travel' && x.P.flags?.siteGate === undefined;
export const TRAVEL_EV: LifeEv[] = [
  { id: 'xt_companion', t: '길동무', cd: 12, c: traveling, x: '같은 방향으로 가는 나그네가 말을 걸어왔다.',
    o: [o('함께 걷는다', { r: '길이 한결 짧게 느껴졌다.', mood: 6, ch: 1 }), o('혼자 가겠다고 한다', { r: '나그네는 어깨를 으쓱하고 앞서 갔다.' })] },
  { id: 'xt_bandits', t: '산적', cd: 18, c: all(adult, traveling), x: '숲길에서 복면을 쓴 자들이 길을 막아섰다. "가진 걸 내놓고 가라."',
    o: [o('맞서 싸운다', { r: '산적들을 쫓아 버렸다.', fame: 5, mi: 1 }, '', ['mi', 0.5], { r: '흠씬 두들겨 맞고 털렸다.', hp: -20, wealth: -20 }),
      o('돈주머니를 던진다', { r: '목숨은 건졌다.', wealth: -25 }), o('달아난다', { r: '덤불을 헤치고 도망쳤다.', hp: -5 }, '', ['luck', 0.6], { r: '붙잡혀 털렸다.', wealth: -30 })] },
  { id: 'xt_inn', t: '길가의 여관', cd: 10, c: traveling, x: '해가 진다. 길가에 낡은 여관 하나가 불을 밝히고 있다.',
    o: [o('하룻밤 묵는다', { r: '따뜻한 국과 마른 침상. 몸이 풀렸다.', wealth: -5, hp: 8 }), o('노숙한다', { r: '별을 이불 삼아 잠들었다.', hp: -2 })] },
  { id: 'xt_fork', t: '갈림길', cd: 12, c: traveling, x: '지도에 없는 샛길이 보인다. 지름길일 것 같기도, 아닐 것 같기도 하다.',
    o: [o('샛길로 간다', { r: '정말 지름길이었다!', fx: 'trip_shortcut' }, '', ['in', 0.5], { r: '한참을 헤매다 원래 길로 돌아왔다.', hp: -4 }), o('큰길로 간다', { r: '느리지만 확실하였다.' })] },
];

// ───────────── 연맹의 부름 (평소에 뜬다)
const allyCall = (x: Ctx) => adult(x) && x.c.act.kind === 'idle' && x.P.flags?.volunteer === undefined && !!x.f
  && x.w.alliances.some(a => a.alive && a.members.includes(x.f!.id)) && x.c.role !== '노예' && !x.isLeader;
export const ALLIANCE_EV: LifeEv[] = [
  { id: 'xp_alliance_call', t: '연맹의 부름', cd: 36, w: 4, c: allyCall,
    x: x => { const a = x.w.alliances.find(a => a.alive && a.members.includes(x.f!.id))!; return `${a.name}이(가) 의용군을 모은다는 방이 붙었다. 공격대가 꾸려지면 맨 앞에 설 이들이다.`; },
    o: [o('의용군 명부에 이름을 올린다', { r: '', fx: 'volunteer', honor: 5 }, '공격대가 꾸려질 때 소집된다'), o('지켜본다', { r: '방 앞을 지나쳤다.' })] },
];

FX_HOOKS.push((x, fx) => expeditionFx(x, fx));
