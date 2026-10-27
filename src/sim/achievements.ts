import { RACES } from '../data/races';
import type { Character, PlayerState, World } from './state';
import { ageOf } from './state';
import { isAdult, isHero } from './helpers';

export const TIER_NAMES = ['커먼', '언커먼', '레어', '에픽', '레전더리', '신화'];
export const TIER_COLORS = ['#b8b8b8', '#5ad06a', '#4aa0ff', '#b56cff', '#ffb030', '#ff4060'];

type Chk = (w: World, P: PlayerState | null, c: Character | null) => boolean;
export interface Achv {
  id: string; tier: number; name: string; desc: string; secret?: boolean; check: Chk;
  /** 화면 조작으로 달성한다 (main.ts가 직접 해금) */
  ui?: boolean;
}

const pf = (k: string, n = 1): Chk => (_w, P) => (P?.flags?.[k] ?? 0) >= n && P?.flags?.[k] !== undefined;
const st = (k: string, n = 1): Chk => w => (w.stats[k] ?? 0) >= n;
const years = (n: number): Chk => w => w.t >= n * 12;
/** 선택지 결과로 얻는 업적 */
const ach = (k: string): Chk => (_w, P) => P?.flags?.['ach_' + k] !== undefined;
/** 특정 인생 이벤트를 겪으면 */
const lived = (k: string): Chk => (_w, P) => P?.lastEvents?.[k] !== undefined;
const ui: Chk = () => false;
const age = (n: number): Chk => (w, _P, c) => !!c && ageOf(w, c) >= n && c.race !== 'dragon';
const leaderTier = (n: number): Chk => (w, _P, c) => !!c && c.died < 0 && w.factions[c.faction]?.leader === c.id && w.factions[c.faction].tier >= n;

export const ACHIEVEMENTS: Achv[] = [
  // 커먼
  { id: 'world', tier: 0, name: '세계의 시작', desc: '세계를 창조한다.', check: () => true },
  { id: 'born', tier: 0, name: '첫 숨', desc: '탄생 모드로 이 세계에 태어난다.', check: (_w, P) => !!P },
  { id: 'adult', tier: 0, name: '어른이 되다', desc: '조종하는 인물이 성인이 된다.', check: (w, _P, c) => !!c && c.died < 0 && isAdult(w, c) },
  { id: 'job', tier: 0, name: '밥벌이', desc: '첫 직업을 얻는다.', check: (_w, P) => (P?.jobsHad?.length ?? 0) >= 1 },
  { id: 'war', tier: 0, name: '전쟁의 북소리', desc: '세력 간 전쟁을 목격한다.', check: w => w.factions.some(f => f.alive && Object.keys(f.wars).length > 0) },
  { id: 'married', tier: 0, name: '백년가약', desc: '조종하는 인물이 혼인한다.', check: (_w, _P, c) => !!c && c.spouse >= 0 },
  { id: 'kingdom', tier: 0, name: '왕관의 탄생', desc: '왕국급 세력의 등장을 목격한다.', check: w => w.factions.some(f => f.alive && f.tier >= 2) },
  { id: 'y10', tier: 0, name: '십 년의 관찰자', desc: '한 세계를 10년 동안 지켜본다.', check: years(10) },
  // 언커먼
  { id: 'jobless3', tier: 1, name: '세 번의 퇴짜', desc: '구직에 세 번 실패해 모험가가 된다.', check: pf('advForced') },
  { id: 'kids3', tier: 1, name: '북적이는 집', desc: '자녀를 셋 이상 둔다.', check: (_w, _P, c) => !!c && c.children.length >= 3 },
  { id: 'gov', tier: 1, name: '영주님', desc: '정착지의 영주가 된다.', check: (w, _P, c) => !!c && c.died < 0 && w.settlements.some(s => s.alive && s.governor === c.id) },
  { id: 'seal', tier: 1, name: '첫 번째 균열', desc: '봉인이 무너지는 것을 목격한다.', check: w => w.doom.seals.some(Boolean) },
  { id: 'raid', tier: 1, name: '하늘에서 내리는 불', desc: '용의 습격을 목격한다.', check: st('dragonRaids') },
  { id: 'jobs5', tier: 1, name: '만물박사', desc: '한 인물로 직업을 다섯 가지 거친다.', check: (_w, P) => (P?.jobsHad?.length ?? 0) >= 5 },
  { id: 'old', tier: 1, name: '천수를 누리다', desc: '조종하는 인물이 종족 평균 수명을 넘긴다.', check: (w, _P, c) => !!c && ageOf(w, c) >= RACES[c.race].lifespan[0] },
  { id: 'y100', tier: 1, name: '백 년의 관찰자', desc: '한 세계를 100년 동안 지켜본다.', check: years(100) },
  // 레어
  { id: 'ruler', tier: 2, name: '군주', desc: '세력의 군주가 된다.', check: leaderTier(0) },
  { id: 'hero', tier: 2, name: '선택받은 자', desc: '용사로 각성한다.', check: (_w, _P, c) => !!c && isHero(c) },
  { id: 'slayer', tier: 2, name: '용살자', desc: '직접 용을 쓰러뜨린다.', check: pf('dragonKills') },
  { id: 'rich', tier: 2, name: '황금의 산', desc: '금화 5,000닢을 모은다.', check: (_w, _P, c) => !!c && c.wealth >= 5000 },
  { id: 'dlwatch', tier: 2, name: '어둠의 강림', desc: '마왕의 강림을 목격한다.', check: w => w.demonLord >= 0 },
  { id: 'treefell', tier: 2, name: '쓰러진 거목', desc: '세계수가 쓰러지는 것을 목격한다.', check: w => !!w.worldTree && !w.worldTree.alive },
  { id: 'gen3', tier: 2, name: '삼대의 이야기', desc: '자식으로 이어 3대째 살아간다.', check: (_w, P) => (P?.generation ?? 1) >= 3 },
  { id: 'coup', tier: 2, name: '찬탈자', desc: '반역으로 왕좌를 차지한다.', check: (w, _P, c) => !!c && w.factions.some(f => f.rulers.some(r => r.id === c.id && r.how === '찬탈')) },
  { id: 'y300', tier: 2, name: '삼백 년의 관찰자', desc: '한 세계를 300년 동안 지켜본다.', check: years(300) },
  // 에픽
  { id: 'emperor', tier: 3, name: '황제', desc: '제국의 군주가 된다.', check: leaderTier(3) },
  { id: 'dlself', tier: 3, name: '마왕', desc: '스스로 마왕이 된다.', check: (w, _P, c) => !!c && w.demonLord === c.id },
  { id: 'slaydl', tier: 3, name: '마왕 토벌', desc: '직접 마왕을 쓰러뜨린다.', check: pf('slayDl') },
  { id: 'ancient', tier: 3, name: '고대의 분노', desc: '고대 용의 각성을 목격한다.', check: w => w.chars.some(c => c.died < 0 && c.ancient) },
  { id: 'woke', tier: 3, name: '잠든 용의 꼬리', desc: '직접 고대 용을 깨운다.', check: pf('wokeAncient') },
  { id: 'seals4', tier: 3, name: '종말의 문턱', desc: '봉인 넷 이상이 동시에 무너진 것을 목격한다.', check: st('maxBroken', 4) },
  { id: 'treemade', tier: 3, name: '세계수의 어버이', desc: '세계수를 새로 만든다.', check: pf('treeMade') },
  { id: 'calm', tier: 3, name: '용의 마음', desc: '고대 용의 분노를 잠재운다.', check: pf('calmAncient') },
  { id: 'dlslain', tier: 3, name: '전설의 결말', desc: '용사가 마왕을 쓰러뜨리는 것을 목격한다.', check: st('dlSlain') },
  // 레전더리
  { id: 'doom', tier: 4, name: '세계의 끝', desc: '세계의 멸망을 목격한다.', check: w => w.doom.ended },
  { id: 'elopewatch', tier: 4, name: '금지된 사랑', desc: '용사와 마왕의 사랑의 도피를 목격한다.', check: st('elope') },
  { id: 'dragonborn', tier: 4, name: '용으로 태어나다', desc: '운명이 비틀려 용으로 태어난다.', check: (_w, P) => P?.special === 'dragon' },
  { id: 'guardian', tier: 4, name: '성역의 수호자', desc: '운명이 비틀려 성역의 수호자로 깨어난다.', check: (_w, P) => P?.special === 'guardian' },
  { id: 'gen5', tier: 4, name: '오대의 연대기', desc: '자식으로 이어 5대째 살아간다.', check: (_w, P) => (P?.generation ?? 1) >= 5 },
  { id: 'savior', tier: 4, name: '구원자', desc: '재앙을 세 번 해결한다.', check: pf('saved', 3) },
  { id: 'y500', tier: 4, name: '오백 년의 관찰자', desc: '한 세계를 500년 동안 지켜본다.', check: years(500) },
  // 신화
  { id: 'sky', tier: 5, name: '하늘의 왕좌', desc: '마왕이 천상을 짓밟고 하늘을 지배한다.', secret: true, check: st('skyThrone') },
  { id: 'elopeself', tier: 5, name: '운명보다 사랑', desc: '용사 혹은 마왕이 되어 사랑의 도피를 떠난다.', secret: true, check: pf('elope') },
  { id: 'allseals', tier: 5, name: '종말의 끝자락', desc: '봉인 여섯이 동시에 무너진 것을 목격한다.', check: st('maxBroken', 6) },
  { id: 'miner', tier: 5, name: '너무 열심히 판 광부', desc: '광부로서 고대 용을 깨운다.', secret: true, check: pf('minerDragon') },
  { id: 'doomself', tier: 5, name: '세상을 끝낸 자', desc: '마왕이나 군주인 채로 세계의 멸망을 맞는다.', check: (w, _P, c) => w.doom.ended && !!c && c.died < 0 && (w.demonLord === c.id || w.factions[c.faction]?.leader === c.id) },
  // ── 커먼 추가 (22)
  { id: 'u_track', tier: 0, name: '그림자처럼', desc: '인물 한 명을 추적한다.', ui: true, check: ui },
  { id: 'u_dragon', tier: 0, name: '용을 보았다', desc: '살펴보기로 용을 들여다본다.', ui: true, check: ui },
  { id: 'u_under', tier: 0, name: '지하 탐방', desc: '지하 층을 내려다본다.', ui: true, check: ui },
  { id: 'u_demon', tier: 0, name: '마계 엿보기', desc: '마계 층을 내려다본다.', ui: true, check: ui },
  { id: 'u_heaven', tier: 0, name: '구름 위의 산책', desc: '천상 층을 올려다본다.', ui: true, check: ui },
  { id: 'u_chronicle', tier: 0, name: '연대기 독자', desc: '연대기를 펼쳐 본다.', ui: true, check: ui },
  { id: 'u_seed', tier: 0, name: '씨앗 나눔', desc: '세계의 시드를 복사한다.', ui: true, check: ui },
  { id: 'u_save', tier: 0, name: '기록 보관인', desc: '세계를 저장한다.', ui: true, check: ui },
  { id: 'e_word', tier: 0, name: '옹알이 졸업', desc: '첫마디를 뗀다.', check: lived('c_firstword') },
  { id: 'e_stray', tier: 0, name: '댕댕이 집사', desc: '떠돌이 강아지를 몰래 키운다.', check: ach('stray') },
  { id: 'e_barn', tier: 0, name: '불장난 금지', desc: '불장난으로 헛간을 태워 먹는다.', check: ach('barnfire') },
  { id: 'e_bully', tier: 0, name: '골목대장 격파', desc: '골목대장과 싸워 이긴다.', check: ach('bully') },
  { id: 'e_nap', tier: 0, name: '꿀잠 전문가', desc: '백수 시절 늘어지게 낮잠을 잔다.', check: ach('nap') },
  { id: 'e_flowers', tier: 0, name: '꽃다발 화해', desc: '부부싸움을 꽃 한 다발로 푼다.', check: ach('flowers') },
  { id: 'e_cat', tier: 0, name: '고양이였구나', desc: '두려움을 이기고 돌아본다.', check: ach('cat') },
  { id: 'e_fortune', tier: 0, name: '왕관의 예언', desc: '축제의 점쟁이에게 운명을 듣는다.', check: ach('fortune') },
  { id: 'e_runaway', tier: 0, name: '사흘간의 가출', desc: '가출했다가 배고파 돌아온다.', check: ach('runaway') },
  { id: 'e_harvest', tier: 0, name: '풍년의 미덕', desc: '풍년의 수확을 이웃과 나눈다.', check: ach('harvest') },
  { id: 's_kid', tier: 0, name: '첫 아이', desc: '자녀를 얻는다.', check: (_w, _P, c) => !!c && c.children.length >= 1 },
  { id: 's_w100', tier: 0, name: '묵직한 주머니', desc: '금화 100닢을 모은다.', check: (_w, _P, c) => !!c && c.wealth >= 100 },
  { id: 's_f30', tier: 0, name: '동네 유명인', desc: '명성 30을 쌓는다.', check: (_w, _P, c) => !!c && c.fame >= 30 },
  { id: 's_a30', tier: 0, name: '서른 즈음에', desc: '서른 살이 된다.', check: age(30) },
  // ── 언커먼 추가 (22)
  { id: 'e_lost', tier: 1, name: '꼬마 탐험가', desc: '길 잃은 아이가 스스로 집을 찾는다. (지력 판정)', check: ach('lostkid') },
  { id: 'e_ling', tier: 1, name: '어린 언어학자', desc: '다락방의 고서를 해독한다. (지력 판정)', check: ach('linguist') },
  { id: 'e_mkid', tier: 1, name: '기적의 아이', desc: '열병을 기도로 이겨 낸다. (신앙 판정)', check: ach('miraclekid') },
  { id: 'e_spark', tier: 1, name: '첫 불꽃', desc: '어린 나이에 첫 주문을 성공시킨다. (마력 판정)', check: ach('firstspark') },
  { id: 'e_hunt', tier: 1, name: '명사수', desc: '첫 사냥에 성공한다. (무력 판정)', check: ach('firsthunt') },
  { id: 'e_alpha', tier: 1, name: '서열 일등', desc: '부족 아이들의 힘겨루기에서 이긴다.', check: ach('alpha') },
  { id: 'e_monster', tier: 1, name: '괴물 사냥꾼', desc: '홀로 괴물을 사냥한다. (무력 판정)', check: ach('monster') },
  { id: 'e_caught', tier: 1, name: '현행범', desc: '주운 지갑을 챙기다 붙잡힌다.', check: ach('caught') },
  { id: 'e_bigwin', tier: 1, name: '한 판 승부', desc: '도박판에 전 재산을 걸고 이긴다. (35%)', check: ach('bigwin') },
  { id: 'e_broke', tier: 1, name: '빈털터리', desc: '도박판에 전 재산을 걸고 잃는다.', check: ach('broke') },
  { id: 'e_scam', tier: 1, name: '사기의 희생양', desc: '수상한 일자리에 속아 돈을 몽땅 잃는다.', check: ach('scammed') },
  { id: 'e_minehero', tier: 1, name: '갱도의 영웅', desc: '무너지는 갱도에서 동료들을 구한다.', check: ach('minehero') },
  { id: 'e_tourney', tier: 1, name: '무술 대회 우승', desc: '무술 대회에서 우승한다.', check: ach('tourney') },
  { id: 'e_storm', tier: 1, name: '폭풍을 견딘 자', desc: '폭풍 속에서 배를 지킨다.', check: ach('storm') },
  { id: 'e_jester', tier: 1, name: '광대의 혀', desc: '군주를 풍자하고도 무사하다. (매력 판정)', check: ach('jester') },
  { id: 'e_caravan', tier: 1, name: '대박 상단', desc: '전 재산을 실은 상단이 세 배로 돌아온다.', check: ach('caravan') },
  { id: 'e_propose', tier: 1, name: '청혼 성공', desc: '청혼을 받아들이게 한다. (매력 판정)', check: ach('proposal') },
  { id: 'e_reject', tier: 1, name: '쓰라린 거절', desc: '청혼했다가 거절당한다.', check: ach('rejected') },
  { id: 'e_saint', tier: 1, name: '역병 속의 성자', desc: '역병이 도는 마을에 남아 병자를 돌보고도 무사하다.', check: ach('plaguesaint') },
  { id: 's_jobs3', tier: 1, name: '이직의 달인', desc: '한 인물로 직업을 세 가지 거친다.', check: (_w, P) => (P?.jobsHad?.length ?? 0) >= 3 },
  { id: 's_h100', tier: 1, name: '명예로운 자', desc: '명예 100을 쌓는다.', check: (_w, _P, c) => !!c && c.honor >= 100 },
  { id: 'y50', tier: 1, name: '반세기의 관찰자', desc: '한 세계를 50년 동안 지켜본다.', check: years(50) },
  // ── 레어 추가 (11)
  { id: 'r_bean', tier: 2, name: '잭과 콩나무', desc: '수상한 콩을 심어 하늘섬의 금 열매를 딴다. (15%)', check: ach('beanstalk') },
  { id: 'r_gold', tier: 2, name: '황금 연성', desc: '납을 금으로 바꾼다. (지력 판정, 매우 어려움)', check: ach('gold') },
  { id: 'r_lich', tier: 2, name: '불멸의 사령', desc: '늙은 마법사가 리치가 되는 길을 택한다.', check: ach('lich') },
  { id: 'r_heist', tier: 2, name: '세기의 도둑', desc: '영주의 금고를 털어 낸다.', check: ach('heist') },
  { id: 'r_island', tier: 2, name: '보물섬', desc: '지도에 없는 섬에서 고대 왕국의 보물을 찾는다.', check: ach('island') },
  { id: 'r_muse', tier: 2, name: '백 년의 노래', desc: '꿈속 선율로 백 년 동안 불릴 노래를 짓는다.', check: ach('muse') },
  { id: 'r_vault', tier: 2, name: '고대인의 창고', desc: '숲속 바위의 문을 주문으로 연다. (마력 판정)', check: ach('ancientvault') },
  { id: 'r_talk', tier: 2, name: '용과의 담판', desc: '용을 죽이는 대신 말로 설득한다. (매력 판정)', check: ach('dragontalk') },
  { id: 'r_deer', tier: 2, name: '숲의 축복', desc: '전설의 흰 사슴을 살려 보낸다.', check: ach('whitedeer') },
  { id: 'r_mercy', tier: 2, name: '자비로운 용사', desc: '용사가 되어 마족 아이를 살려 준다.', check: ach('mercy') },
  { id: 'r_elixir', tier: 2, name: '불로의 영약', desc: '전 재산을 털어 불로의 영약을 완성한다.', check: ach('elixir') },
  // ── 에픽 추가 (11)
  { id: 'p_miracle', tier: 3, name: '기적을 행한 자', desc: '죽어 가는 아이를 기도로 살린다. (신앙 판정)', check: ach('miracle') },
  { id: 'p_plaguedoc', tier: 3, name: '역병의 의사', desc: '모두가 도망친 역병의 땅으로 가 생명을 구한다.', check: ach('plaguedoc') },
  { id: 'p_star', tier: 3, name: '별을 벼린 자', desc: '떨어진 별의 쇠로 전설의 검을 만든다. (무력 판정, 어려움)', check: ach('starblade') },
  { id: 'p_rune', tier: 3, name: '룬 도끼', desc: '드워프로서 전설의 룬 도끼를 벼린다.', check: ach('runeaxe') },
  { id: 'p_dvault', tier: 3, name: '용의 금고털이', desc: '잠든 용의 둥지에서 보물을 훔쳐 나온다.', check: ach('dragonvault') },
  { id: 'p_abyss', tier: 3, name: '심연의 보물', desc: '금지된 심연을 파헤치고도 용을 깨우지 않고 보물만 얻는다.', check: ach('abyssgold') },
  { id: 'p_rift', tier: 3, name: '차원을 찢은 자', desc: '차원 실험으로 마계의 균열을 연다.', check: ach('riftmaker') },
  { id: 'p_pandora', tier: 3, name: '판도라', desc: '배양한 역병을 실수로 퍼뜨린다.', check: ach('pandora') },
  { id: 'p_tears', tier: 3, name: '마왕의 눈물', desc: '마왕이 되어 어린 시절의 따뜻한 손을 떠올린다.', check: ach('dltears') },
  { id: 'p_dfriend', tier: 3, name: '용의 친구', desc: '용으로 태어나 길 잃은 인간 아이를 집에 데려다준다.', check: ach('dragonfriend') },
  { id: 'p_knight', tier: 3, name: '평민 기사', desc: '평민 출신 전사가 기사 서임을 받는다. (30%)', check: ach('commonknight') },
  // ── 바다 · 심연 · 새 시대 (v1.1)
  { id: 'v_sail', tier: 0, name: '첫 항해', desc: '탄생 모드로 먼 바다로 떠나는 배에 오른다.', check: pf('sailed') },
  { id: 'v_ponder', tier: 0, name: '고민 많은 청춘', desc: '일자리를 고르고 고르다 결국 백수가 된다.', check: pf('ponderJobless') },
  { id: 'v_artfade', tier: 0, name: '세월 앞의 명품', desc: '명품 하나가 명맥이 다해 스러지는 것을 목격한다.', check: w => w.artifacts.some(x => x.lost !== undefined) },
  { id: 'v_house', tier: 0, name: '가문의 탄생', desc: '명예를 중시하는 나라에서 가문이 세워지는 것을 목격한다.', check: w => w.houses.length > 0 },
  { id: 'v_home', tier: 1, name: '귀향', desc: '긴 항해를 마치고 살아서 항구로 돌아온다.', check: pf('voyageHome') },
  { id: 'v_castaway', tier: 1, name: '널빤지 한 장', desc: '배가 가라앉았으나 살아남아 낯선 해안에 떠밀려 온다.', check: pf('castaway') },
  { id: 'v_fleet', tier: 1, name: '뭍으로', desc: '바다를 떠돌던 유랑 선단이 뭍에 올라 새 나라를 세우는 것을 목격한다.', check: st('fleetsLanded') },
  { id: 'v_beast', tier: 1, name: '바다 괴수의 최후', desc: '바다 괴수가 쓰러지는 것을 목격한다.', check: st('beastsSlain') },
  { id: 'v_founder', tier: 1, name: '가문의 시조', desc: '조종하는 인물이 가문을 세운다.', check: (w, _P, c) => !!c && c.house !== undefined && w.houses[c.house]?.founder === c.id },
  { id: 'v_surge', tier: 2, name: '차원의 합', desc: '마계와 이 세계가 겹치는 때를 목격한다.', check: st('riftSurges') },
  { id: 'v_plague', tier: 2, name: '반백 년의 역병', desc: '대역병이 면역이 퍼져 사라질 때까지 지켜본다.', check: st('greatPlagueEnded') },
  { id: 'v_march', tier: 2, name: '마계의 군세', desc: '마왕군이 차원문을 넘어 진군하는 것을 목격한다.', check: st('dlMarches') },
  { id: 'v_seagold', tier: 2, name: '바다 밑의 보물', desc: '항해 중 해저 유적에서 보물을 건져 올린다.', check: pf('seaTreasure') },
  { id: 'v_seals4', tier: 3, name: '봉인의 이름', desc: '봉인 넷의 이름을 알게 된다. (무너지는 것을 보아야 이름이 드러난다)', check: w => (w.doom.seen ?? []).filter(Boolean).length >= 4 },
  { id: 'v_move', tier: 3, name: '마왕의 천도', desc: '마왕이 하늘에 더 가까운 곳으로 본거지를 옮기는 것을 목격한다.', check: st('dlMoves') },
  { id: 'v_gate', tier: 3, name: '억지로 열린 하늘', desc: '마왕이 닫힌 하늘 계단을 억지로 여는 것을 목격한다.', check: st('heavenForced') },
  { id: 'v_leviathan', tier: 3, name: '심해의 분노', desc: '대륙만 한 심연의 군주가 깨어나는 것을 목격한다.', check: st('leviathan') },
  { id: 'v_repel', tier: 4, name: '심연을 돌려보내다', desc: '연맹이 촉수 절반을 베어 심연의 군주를 돌려보내는 것을 목격한다.', check: st('leviathanRepelled') },
  { id: 'v_seals7', tier: 4, name: '일곱 봉인의 이름', desc: '일곱 봉인의 이름을 모두 알게 된다.', check: w => (w.doom.seen ?? []).filter(Boolean).length >= 7 },
  { id: 'v_woke', tier: 5, name: '깨워선 안 될 것', desc: '바다 위에서 한 일로 심연의 군주를 직접 깨운다.', secret: true, check: ach('abysswoke') },
  { id: 'dragonemp', tier: 5, name: '용과 황제', desc: '용으로 태어나 제국의 수호룡이 된다.', check: (w, _P, c) => !!c && c.race === 'dragon' && c.patronOf !== undefined && w.factions[c.patronOf]?.tier === 3 },
];

export function evalAchievements(w: World, unlocked: Set<string>): string[] {
  const P = w.player;
  const c = P ? w.chars[P.charId] ?? null : null;
  const out: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id) || a.ui) continue;
    try { if (a.check(w, P, c)) out.push(a.id); } catch { /* 오래된 저장 데이터 등 */ }
  }
  return out;
}
