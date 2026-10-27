// 인생 이벤트 데이터 8: 직업 권유.
// 일을 구하러 다니기 전에, 누군가가 먼저 당신의 재능과 처지를 보고 일을 권하기도 한다.
// 권하는 일은 능력치와 성향, 종족, 사는 곳(땅과 층), 나라 형편을 함께 따져 고른다.
import { RACE_JOBS, type Role } from '../data/traits';
import { TERRAIN } from '../data/terrain';
import * as T from '../data/terrain';
import type { Character } from './state';
import type { Ctx, LifeEv } from './life';
import { adult, all } from './life';
import { o } from './lifeData1';
import { isPort } from './sea';

const C0 = 0, GRE = 2, COM = 3, LOY = 4, FAI = 5, CUR = 6, SOC = 7, PRU = 8;

interface Offer { job: Role; score: number; who: number; pitch: string }

/** 고을 둘레 땅에 이런 칸이 얼마나 있는가 */
function landShare(x: Ctx, f: (tid: number) => boolean): number {
  const h = x.home;
  if (!h || !h.tiles.length) return 0;
  const L = x.w.layers[h.l];
  let n = 0;
  for (const k of h.tiles) if (f(L.terrain[k])) n++;
  return n / h.tiles.length;
}

/** 이 고을에서 그 일을 하는 가장 이름난 사람 (권하러 오는 이) */
function senior(x: Ctx, job: Role): Character | undefined {
  return x.w.chars.filter(c => c.died < 0 && c.id !== x.c.id && c.role === job && c.home === x.c.home && c.act.kind === 'idle')
    .sort((a, b) => b.fame - a.fame)[0];
}

/** 지금 이 사람에게 가장 어울리는 일 하나 (같은 상황이면 언제나 같은 답) */
export function bestOffer(x: Ctx): Offer | null {
  const { c, f, home } = x;
  if (!home) return null;
  const st = c.stats, t = c.traits;
  const l = home.l;
  const war = !!f && Object.keys(f.wars).length > 0;
  const town = home.tier >= 2;
  const allowed = new Set(RACE_JOBS[c.race] ?? []);
  const forest = landShare(x, tid => tid === T.FOREST || tid === T.DEEPFOREST || tid === T.SWAMP);
  const ore = landShare(x, tid => { const y = TERRAIN[tid].yields; return y[2] + y[3] >= 1.5; });
  const farm = landShare(x, tid => TERRAIN[tid].yields[0] >= 1.5);
  const cands: [Role, number, string][] = [
    ['전사', st.might + t[C0] * 0.4 + (war ? 30 : 0), war ? '전쟁이 길어지고 있소. 당신 같은 팔뚝이 필요하오.' : '경비대에 빈자리가 났소. 그 팔뚝이 아깝구려.'],
    ['기사', st.might * 0.6 + st.command * 0.5 + t[LOY] * 0.4 + (f && f.tier >= 1 ? 10 : -50), '기사단이 종자를 찾고 있소. 충직하고 굳센 이를.'],
    ['학자', st.intellect + t[CUR] * 0.4 + (town ? 15 : -20), '서고에 일손이 모자라오. 글을 읽을 줄 아는 이가 귀하다오.'],
    ['마법사', st.magic * 1.2 + st.intellect * 0.3 + (town ? 10 : -15), '당신 곁에만 가면 촛불이 흔들리오. 마탑에서 한번 시험을 보시오.'],
    ['상인', st.charisma + t[GRE] * 0.4 + t[SOC] * 0.3 + (f && f.treaties.length ? 15 : 0) + (isPort(x.w, home) ? 10 : 0), '말솜씨가 장사꾼 감이오. 우리 상단에서 일해 보지 않겠소?'],
    ['성직자', t[FAI] * 1.1 + t[COM] * 0.4, '신께서 당신을 부르고 계시오. 신전에 자리가 있소.'],
    ['치유사', t[COM] + st.intellect * 0.4 + (home.plague > 0 ? 30 : 0), home.plague > 0 ? '병자가 넘쳐나오. 손이 하나라도 더 필요하오.' : '약초를 알아보는 눈이 있구려. 내 일을 도와주시오.'],
    ['사냥꾼', st.might * 0.6 + forest * 120 + t[C0] * 0.2, '숲에 짐승이 넘쳐나오. 함께 사냥을 다니지 않겠소?'],
    ['광부', st.might * 0.6 + ore * 140 + (l === 3 ? 25 : 0), '새 갱도를 여는데 일꾼이 모자라오. 품삯은 넉넉히 주겠소.'],
    ['농부', 10 + farm * 70 + t[PRU] * 0.2 + (home.hunger > 0 ? 25 : 0), home.hunger > 0 ? '굶주리는 이가 많소. 땅을 일굴 손이 필요하오.' : '내 밭이 너무 넓어 혼자 감당이 안 되오. 같이 일구지 않겠소?'],
    ['선원', (isPort(x.w, home) ? 40 : -200) + t[C0] * 0.3 + t[CUR] * 0.5, '배가 곧 떠나는데 선원이 하나 모자라오. 바다가 부르지 않소?'],
    ['모험가', t[CUR] * 0.6 + t[C0] * 0.6 + st.might * 0.3, '근처 유적에 보물이 잠들어 있다는 소문이오. 한몫 잡으러 가지 않겠소?'],
    ['대장장이', st.might * 0.5 + ore * 60 + t[PRU] * 0.3 + (war ? 15 : 0), war ? '전쟁 통에 칼이 모자라오. 풀무질을 배워 보겠소?' : '대장간에 견습이 필요하오. 힘 좋은 이로.'],
    ['장인', st.intellect * 0.4 + t[PRU] * 0.5 + (town ? 10 : 0), '손재주가 좋구려. 내 공방에 들어오시오.'],
    ['음유시인', st.charisma * 0.8 + t[SOC] * 0.5, '목소리가 곱구려. 주점에서 노래 한 곡 불러 보지 않겠소?'],
    ['사령술사', st.magic * 0.8 + (100 - t[COM]) * 0.4 + (f && f.race !== 'human' && f.race !== 'elf' && f.race !== 'angel' ? 10 : -40), '죽음은 끝이 아니오. 그 너머를 배워 보지 않겠소?'],
    ['암살자', st.might * 0.4 + (100 - t[COM]) * 0.5 + t[PRU] * 0.3, '조용히 일을 처리할 사람을 찾고 있소. 돈은 섭섭지 않게.'],
    ['드루이드', t[FAI] * 0.5 + st.magic * 0.6 + forest * 80, '숲의 정령들이 당신 이야기를 하더이다.'],
    ['주술사', t[FAI] * 0.5 + st.magic * 0.6, '조상의 혼이 당신에게 말을 걸고 있소.'],
    ['연금술사', st.intellect * 0.6 + st.magic * 0.3 + t[CUR] * 0.5 + (town ? 10 : -10), '내 실험실을 함께 쓸 조수를 찾고 있소.'],
    ['조련사', t[C0] * 0.5 + st.charisma * 0.4 + forest * 40, '사나운 짐승을 길들일 배짱이 있어 보이오.'],
    ['함정꾼', t[PRU] * 0.6 + st.intellect * 0.5 + (l === 3 ? 15 : 0), '굴 입구마다 덫을 놓을 사람이 필요하오.'],
  ];
  let best: Offer | null = null;
  for (const [job, score0, pitch] of cands) {
    if (!allowed.has(job) || job === c.role) continue;
    // 비슷한 재능 사이에서는 사람과 시기에 따라 다른 이가 먼저 찾아온다 (같은 상황엔 같은 답)
    const score = score0 + ((c.id * 31 + job.length * 7 + Math.floor(x.w.t / 24) * 17 + job.charCodeAt(0)) % 15);
    if (best && score <= best.score) continue;
    best = { job, score, who: senior(x, job)?.id ?? -1, pitch };
  }
  return best && best.score >= 70 ? best : null;
}

function offerData(x: Ctx): Record<string, number | string> {
  const b = bestOffer(x)!;
  return b.who >= 0 ? { oId: b.who, pitch: b.pitch } : { pitch: b.pitch, o: '낯선 이' };
}
const jobless = (x: Ctx) => x.c.role === '평민' || x.c.role === '백수';
const free = (x: Ctx) => x.c.role !== '노예' && !x.isLeader && !x.isGov && x.c.act.kind === 'idle' && x.c.race !== 'dragon';

export const JOB_OFFER: LifeEv[] = [
  // 아직 일이 없는 이에게: 먼저 찾아와 권한다
  { id: 'jo_offer', t: '일자리 제안', cd: 18, w: 5, c: all(adult, jobless, free, x => !!bestOffer(x)),
    data: offerData,
    x: '{o}이(가) 당신을 찾아왔다. "{pitch}"',
    o: x => { const b = bestOffer(x); if (!b) return []; return [
      o(`${b.job}(으)로 일해 보겠다`, { r: `${b.job}의 길을 걷기 시작하였다.`, job: b.job, mood: 8 }),
      o('조금 더 생각해 보겠다', { r: '정중히 사양하였다. 아직 내 길을 모르겠다.' }),
    ]; } },
  // 일하고 있는 이에게도 이따금, 더 어울리는 일이 찾아온다
  { id: 'jo_switch', t: '다른 길의 부름', cd: 72, w: 2, c: all(adult, free, x => !jolessOr(x) && x.years >= 3 && (x.P.jobRank ?? 0) < 2 && !!bestOffer(x) && bestOffer(x)!.score >= 110),
    data: offerData,
    x: '{job} 일을 한 지 몇 해, {o}이(가) 뜻밖의 제안을 해 왔다. "{pitch}"',
    o: x => { const b = bestOffer(x); if (!b) return []; return [
      o(`하던 일을 그만두고 ${b.job}이(가) 된다`, { r: `${x.c.role}의 연장을 내려놓고 ${b.job}의 길로 들어섰다.`, job: b.job, mood: 5 }),
      o('지금 하는 일에 충실하겠다', { r: '내 자리를 지키기로 하였다.', tr: [[LOY, 3]] }),
    ]; } },
];
function jolessOr(x: Ctx): boolean { return jobless(x); }
