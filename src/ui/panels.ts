import { RACES, POP_RACES } from '../data/races';
import { storySummary } from '../sim/lifeData7';
import { STYLE_DESC, expandStyle } from '../sim/territory';
import { RES_COLORS, RES_NAMES, TERRAIN } from '../data/terrain';
import { APT_NAMES, STAT_NAMES, TRAIT_NAMES, describeTraits } from '../data/traits';
import { fixJosa, fmtNum, josa, pct } from '../data/text';
import type { Character, Faction, NewsItem, Settlement, World } from '../sim/state';
import { LAYER_INFO, SEASON_NAMES, ageOf, dateStr, seasonOf } from '../sim/state';
import { charLabel, isHero, leaderOf, settlementsOf, titleOf } from '../sim/helpers';
import { SEAL_NAMES, brokenCount, omen, sealTotal, sealVisible } from '../sim/doom';
import { seaThingsAt } from '../sim/sea';
import { eraName } from '../sim/news';
import { currentStories, storyIcon, storyYears } from '../sim/stories';
import { knows } from '../sim/contact';
import { TENET_DESC, TENET_NAME, clergyTitle, faithOf } from '../sim/religion';
import { MOTIVE_NAME, paragonDoing } from '../sim/paragon';
import type { Caravan } from '../sim/caravan';
import type { Camp } from '../sim/camps';
import { capacity } from '../sim/settlements';
import { ACHIEVEMENTS, TIER_COLORS, TIER_NAMES } from '../sim/achievements';
import { artLabel, vigor, vigorWord } from '../sim/artifacts';
import { membersOf, type House } from '../sim/houses';

export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const CAT_NAME: Record<string, string> = {
  war: '전쟁', politics: '정치', hero: '영웅', dark: '어둠', nature: '자연', growth: '번영', life: '인생', trade: '교역', doom: '종말', player: '나',
};

export function charLink(w: World, c: Character | undefined, label?: string): string {
  if (!c) return '<span class="dim">없음</span>';
  const dead = c.died >= 0 ? ' <small>†</small>' : '';
  return `<span class="link" data-char="${c.id}">${esc(label ?? charLabel(w, c))}</span>${dead}`;
}
export function facLink(f: Faction | undefined): string {
  if (!f) return '<span class="dim">무소속</span>';
  return `<span class="link" data-fac="${f.id}"><span class="swatch" style="background:${f.color}"></span>${esc(f.name)}</span>${f.alive ? '' : ' <small>(멸망)</small>'}`;
}
export function setLink(s: Settlement | undefined): string {
  if (!s) return '<span class="dim">없음</span>';
  return `<span class="link" data-set="${s.id}">${esc(s.name)}</span>`;
}

function bar(v: number, max = 100, color = 'var(--gold)'): string {
  return `<div class="bar"><i style="width:${Math.max(0, Math.min(100, (v / max) * 100))}%;background:${color}"></i></div>`;
}

let nameCache: { t: number; n: number; re: RegExp | null; map: Map<string, string> } | null = null;

/** 문장 속 세력·정착지·인물 이름을 눌러서 갈 수 있는 링크로 바꾼다 */
export function linkify(w: World, text: string, charIds: number[] = []): string {
  if (!nameCache || nameCache.t !== w.t || nameCache.n !== w.settlements.length + w.factions.length) {
    const map = new Map<string, string>();
    for (const f of w.factions) if (f.name.length >= 2) map.set(f.name, `data-fac="${f.id}"`);
    for (const s of w.settlements) if (s.alive && s.name.length >= 2 && !map.has(s.name)) map.set(s.name, `data-set="${s.id}"`);
    const names = [...map.keys()].sort((a, b) => b.length - a.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    nameCache = { t: w.t, n: w.settlements.length + w.factions.length, re: names.length ? new RegExp(names.join('|'), 'g') : null, map };
  }
  const local = new Map(nameCache.map);
  for (const id of charIds) {
    const c = w.chars[id];
    if (c && c.name.length >= 2) local.set(c.name, `data-char="${c.id}"`);
  }
  let re = nameCache.re;
  if (charIds.length) {
    const names = [...local.keys()].sort((a, b) => b.length - a.length).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    re = new RegExp(names.join('|'), 'g');
  }
  const safe = esc(text);
  return re ? safe.replace(re, m => `<span class="link" ${local.get(m)}>${m}</span>`) : safe;
}

export function newsItemHTML(w: World, n: NewsItem, showCat = true): string {
  return `<div class="news imp${n.imp}${/^【(봉인 붕괴|세계 멸망)】/.test(n.text) ? ' sealbreak' : ''}" data-news="${n.id}"><span class="when">${dateStr(w, n.t)}</span>${showCat ? `<span class="cat cat-${n.cat}">${CAT_NAME[n.cat]}</span>` : ''}${linkify(w, n.text, n.chars ?? [])}</div>`;
}

export function newsHTML(w: World, range: number): string {
  const since = w.t - range + 1;
  const minImp = range <= 3 ? 3 : range <= 12 ? 3 : 4;
  const out: NewsItem[] = [];
  for (let i = w.news.length - 1; i >= 0; i--) {
    const n = w.news[i];
    if (n.t < since) break;
    if (n.imp >= minImp) out.push(n);
    if (out.length > 150) break;
  }
  if (!out.length) return '<p class="dim">이 기간에는 큰 소식이 없었다.</p>';
  out.sort((a, b) => b.t - a.t || b.imp - a.imp);
  return out.map(n => newsItemHTML(w, n)).join('');
}

export function prophecyHTML(w: World): string {
  const items = w.prophecy;
  if (!items.length) return '<p class="dim">예언자들은 침묵하고 있다.</p>';
  return items.map(p => {
    const doom = p.cat === 'doom';
    return `<div class="proph ${doom ? 'doom' : ''}"><span class="imp${p.imp}">${esc(p.text)}</span><span class="p">${pct(p.p)}</span></div>`;
  }).join('');
}

// ───────────── 살펴보기

export function inspectChar(w: World, c: Character, secret: boolean): string {
  const R = RACES[c.race];
  const f = w.factions[c.faction];
  const home = w.settlements[c.home];
  const age = ageOf(w, c);
  const adj = describeTraits(c.traits).join(', ');
  const tags: string[] = [];
  if (w.demonLord === c.id) tags.push('<span class="chip red">마왕</span>');
  if (isHero(c)) tags.push('<span class="chip gold">용사</span>');
  if (c.awakened.includes('sage')) tags.push('<span class="chip blue">현자</span>');
  if (c.awakened.includes('merchant')) tags.push('<span class="chip gold">거상</span>');
  if (c.awakened.includes('king')) tags.push('<span class="chip gold">왕의 그릇</span>');
  if (c.paragon && c.died < 0) tags.push(`<span class="chip gold" title="${esc(paragonDoing(w, c))}">열강 · ${MOTIVE_NAME[c.paragon.motive]}</span>`);
  { const fr = faithOf(w, c.faith); if (fr) tags.push(`<span class="chip" title="${esc(fr.tenets.map(t => TENET_NAME[t]).join('·'))}">${esc(fr.name)}${clergyTitle(w, c) ? ` ${clergyTitle(w, c)}` : ''}</span>`); }
  if (c.awakened.includes('seed') && (secret || w.demonLord === c.id)) tags.push('<span class="chip red">마왕의 씨앗</span>');
  if (c.awakened.includes('traitor')) tags.push('<span class="chip red">배신자</span>');
  if (c.isPlayer) tags.push('<span class="chip blue">당신</span>');
  if (c.act.kind === 'voyage') { const v = w.sea.voyages[c.act.target ?? -1]; if (v) tags.push(`<span class="chip blue">⛵ ${esc(v.name)} 항해 중</span>`); }
  if (c.act.kind === 'fleet') { const f = w.sea.fleets[c.act.target ?? -1]; if (f) tags.push(`<span class="chip">⛵ ${esc(f.name)}</span>`); }
  if (c.officer) tags.push(`<span class="chip red">마왕군 간부 · ${esc(c.officer)}</span>`);
  if (c.act.kind === 'party') { const pt = w.parties.find(x => !x.done && x.members.includes(c.id)); if (pt) tags.push(`<span class="chip gold">${esc(pt.name)}</span>`); }
  if (c.act.kind === 'caravan') { const k = w.caravans?.[c.act.target ?? -1]; if (k) tags.push(`<span class="chip gold">${esc(fixJosa(`상단을 이끌고 ${w.settlements[k.to]?.name ?? ''}(으)로`))}</span>`); }
  if (c.race === 'dragon') {
    const k = c.ancient ? '<span class="chip red">분노한 고대 용</span>' : c.dragonKind === 'raider' ? '<span class="chip red">습격형</span>'
      : c.dragonKind === 'patron' ? `<span class="chip gold">${esc(w.factions[c.patronOf ?? -1]?.name ?? '')}의 수호룡</span>` : '<span class="chip">은둔</span>';
    tags.push(k);
    if (c.ancient && c.wrathUntil !== undefined) tags.push(`<span class="chip">분노 ${Math.max(0, Math.ceil((c.wrathUntil - w.t) / 12))}년 남음</span>`);
  }
  for (const it of c.items) tags.push(`<span class="chip">${esc(it)}</span>`);
  const where = c.act.kind === 'travel' ? `여행 중 (${{ adventure: '모험', trade: '교역', visit: '방문', hunt: '토벌', return: '귀환', pilgrim: '순례', duel: '결전', flee: '피난', clear: '개간지로', muster: '괴수 토벌 집결지로', quest: '열강의 길' }[c.act.purpose ?? 'visit']})`
    : c.act.kind === 'clear' ? `${esc(w.settlements[c.act.target ?? -1]?.name ?? '')} 바깥의 땅을 개간하는 중` : c.act.kind === 'army' ? '출정 중' : c.act.kind === 'colonize' ? '이주 행렬 인솔 중' : c.paragon && c.died < 0 ? esc(paragonDoing(w, c)) : c.act.kind === 'caravan' ? '교역 중 (상단 인솔)' : c.act.kind === 'camp' ? '주둔지 지휘' : (c.sleep ?? 0) > 0 ? `잠듦 (${c.sleep}개월)` : '머무는 중';
  const fam: string[] = [];
  if (c.father >= 0) fam.push(`부: ${charLink(w, w.chars[c.father], w.chars[c.father].name)}`);
  if (c.mother >= 0) fam.push(`모: ${charLink(w, w.chars[c.mother], w.chars[c.mother].name)}`);
  if (c.spouse >= 0) fam.push(`배우자: ${charLink(w, w.chars[c.spouse], w.chars[c.spouse].name)}`);
  if (c.children.length) fam.push(`자녀: ${c.children.map(id => charLink(w, w.chars[id], w.chars[id].name)).join(', ')}`);
  const rels = Object.entries(c.relations).map(([id, v]) => [w.chars[+id], v] as const).filter(([o]) => o)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
  const apts = c.apt.map((v, i) => {
    const known = secret || (i === 1 && isHero(c)) || (i === 2 && w.demonLord === c.id) || (i === 3 && c.awakened.includes('sage'))
      || (i === 0 && c.awakened.includes('king')) || (i === 4 && c.awakened.includes('merchant')) || (i === 5 && c.awakened.includes('traitor'));
    return `<div class="trait"><span>${APT_NAMES[i].replace(/의 (자질|기질)/, '')}</span>${known ? bar(v, 100, i === 2 || i === 5 ? 'var(--red)' : 'var(--violet)') : '<span class="dim">???</span>'}<span>${known ? v : ''}</span></div>`;
  }).join('');
  return `
    <div class="ins-h">${esc(c.epithet ? c.epithet + ' ' : '')}${esc(c.name)}${c.died >= 0 ? ' †' : ''}</div>
    <div class="ins-sub">${esc(titleOf(w, c))} · ${R.name} ${c.sex === 'M' ? '남' : '여'} · ${age}세${c.died >= 0 ? ` (${dateStr(w, c.died)} ${esc(c.cause)})` : ''}</div>
    <div class="chips">${tags.join('')}</div>
    <div class="kv" style="margin-top:6px">
      <span>소속</span><span>${facLink(f)}</span>
      <span>거처</span><span>${setLink(home)} · ${where}</span>
      <span>성격</span><span>${esc(adj || '평범한')}</span>
      <span>직업</span><span>${(() => {
        // 다스리는 자의 직업은 그 자리다. 본래의 직업은 곁에 적는다
        const f = w.factions[c.faction];
        const seat = w.settlements.find(s => s.alive && s.governor === c.id);
        const rank = c.died >= 0 ? '' : w.demonLord === c.id ? '마왕' : f && f.leader === c.id ? RACES[f.race].titles[f.tier] : seat ? `${seat.name}의 영주` : '';
        return rank ? `<b>${esc(rank)}</b> <small class="dim">(본업: ${esc(c.role)})</small>` : esc(c.role);
      })()}</span>
      ${c.house !== undefined && w.houses[c.house] ? `<span>가문</span><span>${houseLink(w.houses[c.house])}${w.houses[c.house].head === c.id ? ' <small>(가주)</small>' : ''}</span>` : ''}
      <span>재산</span><span>금화 ${fmtNum(c.wealth)}</span>
      <span>명성 / 명예</span><span>${fmtNum(c.fame)} / ${fmtNum(c.honor)}</span>
    </div>
    <div class="sec">능력</div>
    ${(Object.keys(STAT_NAMES) as (keyof Character['stats'])[]).map(k => `<div class="trait"><span>${STAT_NAMES[k]}</span>${bar(c.stats[k], 100, k === 'health' ? 'var(--green)' : 'var(--gold)')}<span>${Math.round(c.stats[k])}</span></div>`).join('')}
    <div class="sec">성격</div>
    ${c.traits.map((v, i) => `<div class="trait"><span>${TRAIT_NAMES[i]}</span>${bar(v, 100, '#b39860')}<span>${v}</span></div>`).join('')}
    <div class="sec">자질</div>${apts}
    ${fam.length ? `<div class="sec">가족</div><div>${fam.join('<br>')}</div>` : ''}
    ${rels.length ? `<div class="sec">관계</div><div>${rels.map(([o, v]) => `${charLink(w, o, o.name)} <small style="color:${v >= 0 ? 'var(--green)' : 'var(--red)'}">${v > 0 ? '+' : ''}${Math.round(v)}</small>`).join(' · ')}</div>` : ''}
    ${artsOf(w, c)}
    <div class="sec">일대기</div>
    <div class="log">${c.bio.slice().reverse().slice(0, 30).map(b => `<div><span class="when">${dateStr(w, b.t)}</span>${linkify(w, b.text)}</div>`).join('') || '<span class="dim">아직 기록이 없다.</span>'}</div>
    <div class="sec">최근 행적 (매달)</div>
    <div class="log">${c.log.slice().reverse().slice(0, 40).map(b => `<div><span class="when">${dateStr(w, b.t)}</span>${linkify(w, b.text)}</div>`).join('')}</div>
  `;
}

export function inspectSettlement(w: World, s: Settlement): string {
  const f = w.factions[s.faction];
  const R = RACES[s.race];
  const gov = w.chars[s.governor];
  const people = w.chars.filter(c => c.died < 0 && c.home === s.id).sort((a, b) => b.fame - a.fame);
  const cap = capacity(w, s);
  const T = w.worldTree && w.worldTree.sid === s.id && w.worldTree.alive ? w.worldTree : null;
  const treeHtml = T ? `<div class="sec">세계수</div>
    <div class="trait"><span>생명력</span>${bar(T.hp, 100, T.hp < 30 ? 'var(--red)' : 'var(--green)')}<span>${Math.ceil(T.hp)}</span></div>
    <div class="trait"><span>성장</span>${bar(T.growth, 100, '#7dff8a')}<span>${Math.floor(T.growth)}</span></div>
    <div class="dim">매달 마나 3·식량 3·목재 1을 바쳐야 한다. 못 바치면 시들고, 쓰러지면 봉인이 깨지지만 이 땅의 주인은 막대한 보상을 얻는다.${T.felling ? ' <b style="color:var(--red)">벌목 중!</b>' : ''}</div>` : '';
  return `
    <div class="ins-h">${esc(s.name)}</div>
    <div class="ins-sub">${R.settlementTiers[s.tier]} · ${R.name} · ${LAYER_INFO[s.l].name} (${s.x}, ${s.y})${f && f.capital === s.id ? ' · <b style="color:var(--gold)">수도</b>' : ''}</div>
    <div class="chips">${s.plague > 0 ? `<span class="chip red">${esc(w.diseases[s.disease ?? -1]?.name ?? '역병')}</span>` : ''}${s.hunger > 0 ? '<span class="chip red">기근</span>' : ''}${s.flags.includes('worldtree') ? '<span class="chip gold">세계수</span>' : ''}${s.flags.includes('sanctum') ? '<span class="chip gold">천상 성역</span>' : ''}${s.flags.includes('cult') ? '<span class="chip red">사교 소문</span>' : ''}</div>
    <div class="kv" style="margin-top:6px">
      <span>소속</span><span>${facLink(f)}</span>
      <span>영주</span><span>${charLink(w, gov && gov.died < 0 ? gov : undefined)}</span>
      <span>인구</span><span>${fmtNum(s.pop)} <small>/ 부양 한계 ${fmtNum(cap)}</small></span>
      <span>신앙</span><span>${faithOf(w, s.faith) ? esc(faithOf(w, s.faith)!.name) : '<span class="dim">없음</span>'}</span>
      ${(s.slaves ?? 0) >= 1 ? `<span>노예</span><span>${fmtNum(s.slaves ?? 0)} <small>(${RACES[s.slaveRace ?? s.race].name})</small></span>` : ''}
      <span>건립</span><span>${dateStr(w, s.founded)}</span>
    </div>
    <div class="trait" style="margin-top:4px"><span>발전도</span>${bar(s.dev, 100, 'var(--blue)')}<span>${Math.round(s.dev)}</span></div>
    <div class="trait"><span>안정도</span>${bar(s.stability, 100, 'var(--green)')}<span>${Math.round(s.stability)}</span></div>
    ${treeHtml}
    <div class="sec">물자 (재고 / 월 생산-소비)</div>
    <table class="t">${RES_NAMES.map((n, r) => {
      const net = s.prod[r] - s.cons[r];
      return `<tr><td><span class="swatch" style="background:${RES_COLORS[r]}"></span>${n}</td><td>${fmtNum(s.stock[r])}</td><td style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">${net >= 0 ? '+' : ''}${net.toFixed(1)}</td></tr>`;
    }).join('')}</table>
    <div class="sec">이곳의 인물 (${people.length})</div>
    <div>${people.slice(0, 30).map(c => charLink(w, c)).join('<br>') || '<span class="dim">없음</span>'}</div>
  `;
}

export function inspectFaction(w: World, f: Faction): string {
  const R = RACES[f.race];
  const ld = leaderOf(w, f);
  const ss = settlementsOf(w, f).sort((a, b) => b.pop - a.pop);
  const wars = Object.keys(f.wars).map(id => w.factions[+id]).filter(Boolean);
  // 알고 있는 세력만 (아직 만나지 못한 세력은 이름도 모른다)
  const unknown = w.factions.filter(o => o.alive && o !== f && !knows(w, f, o)).length;
  const rels = Object.entries(f.relations).map(([id, v]) => [w.factions[+id], v] as const).filter(([o]) => o && o.alive && knows(w, f, o))
    .sort((a, b) => a[1] - b[1]);
  const rulers = f.rulers.slice().reverse().slice(0, 12);
  return `
    <div class="ins-h"><span class="swatch" style="background:${f.color}"></span>${esc(f.name)}</div>
    <div class="ins-sub">${R.name} · ${['부족', '공국', '왕국', '제국'][f.tier]} · ${dateStr(w, f.founded)} 건국${f.alive ? '' : ` · ${dateStr(w, f.fell)} 멸망`}</div>
    <div class="kv">
      <span>군주</span><span>${charLink(w, ld ?? undefined)}</span>
      <span>왕조</span><span>${esc(f.dynasty)} 가문</span>
      <span>인구</span><span>${fmtNum(f.pop)}</span>
      <span>국교</span><span>${faithOf(w, f.faith) ? `${esc(faithOf(w, f.faith)!.name)} <small>(${faithOf(w, f.faith)!.tenets.map(t => TENET_NAME[t]).join('·')})</small>` : '<span class="dim">없음</span>'}</span>
      <span>군사력</span><span>${fmtNum(f.military)}</span>
      <span>평균 발전</span><span>${Math.round(f.avgDev)}</span>
      ${f.treaties.length || w.stats[`caravanOk${f.id}`] ? `<span title="뭍길 교역은 반년마다 상단이 실제로 걸어서 짐을 나른다. 전쟁 중인 땅을 지나면 털릴 수 있다">상단 ⓘ</span><span>무사히 오간 ${w.stats[`caravanOk${f.id}`] ?? 0}번 · 지금 길 위 ${(w.caravans ?? []).filter(k => k.alive && k.fac === f.id).length}</span>` : ''}
      <span title="땅은 사람이 있어야 지켜진다. 고을마다 12칸 + 인구 3명당 1칸을 지킬 수 있고, 넘치는 땅은 매달 조금씩 손을 놓는다">영토 ⓘ</span><span>${ss.reduce((a, s) => a + s.tiles.length, 0)}칸 / 지킬 수 있는 땅 ${Math.round(ss.reduce((a, s) => a + 12 + s.pop / 3, 0))}칸</span>
      <span>정통성</span><span>${Math.round(f.legitimacy)}</span>
      <span>확장 성향</span><span>${(() => { const st = expandStyle(w, f); return `${st} <small class="dim">— ${STYLE_DESC[st]}</small>`; })()}</span>
      <span>동맹</span><span>${(() => { const al = w.alliances.find(a => a.alive && a.members.includes(f.id)); return al ? `${esc(al.name)}${al.leader === f.id ? ' <b style="color:var(--gold)">(수장)</b>' : ''} · 적: ${charLink(w, w.chars[al.enemy])}` : f.flags.includes('dlvassal') ? '<b style="color:var(--red)">마왕군 가신</b>' : '<span class="dim">없음</span>'; })()}</span>
      <span>전쟁 중</span><span>${wars.map(e => facLink(e)).join(', ') || '<span class="dim">평화</span>'}</span>
      <span>국경 태세</span><span>${Object.entries(f.posture ?? {}).map(([id, v]) => `${facLink(w.factions[+id])} <small style="color:${v === 'guard' ? 'var(--red)' : 'var(--green)'}">${v === 'guard' ? '경계 강화' : '화친'}</small>`).join('<br>') || '<span class="dim">평상시</span>'}</span>
      <span>영토</span><span>${ss.reduce((a, s) => a + s.tiles.length, 0)}칸</span>
      <span>교역</span><span>${f.treaties.map(t => `${facLink(w.factions[t.with])} <small>(${RES_NAMES[t.give]}→${RES_NAMES[t.get]})</small>`).join('<br>') || '<span class="dim">없음</span>'}</span>
    </div>
    ${f.flags.length ? `<div class="chips" style="margin-top:4px">${f.flags.filter(x => !x.includes(':') && x !== 'food_crisis').map(x => `<span class="chip">${esc(FLAG_NAMES[x] ?? x)}</span>`).join('')}${f.flags.includes('food_crisis') ? '<span class="chip red">식량 위기</span>' : ''}</div>` : ''}
    <div class="sec">영토 (${ss.length})</div>
    <div>${ss.map(s => `${setLink(s)} <small>${RACES[s.race].settlementTiers[s.tier]} · ${fmtNum(s.pop)}</small>`).join('<br>')}</div>
    ${f.realms ? `<div class="dim" style="margin-top:4px">아는 세계: ${f.realms.slice().sort().map(l => LAYER_INFO[l].name).join(', ')}</div>` : ''}
    <div class="sec">대외 관계${unknown ? ` <small class="dim">· 아직 만나지 못한 세력 ${unknown}곳</small>` : ''}</div>
    <div>${rels.slice(0, 4).map(([o, v]) => `${facLink(o)} <small style="color:var(--red)">${Math.round(v)}</small>`).join('<br>')}</div>
    <div>${rels.slice(-3).reverse().filter(([, v]) => v > 0).map(([o, v]) => `${facLink(o)} <small style="color:var(--green)">+${Math.round(v)}</small>`).join('<br>')}</div>
    ${(() => {
      const hs = w.houses.filter(h => h.faction === f.id).sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || (b.royal ? 1 : 0) - (a.royal ? 1 : 0) || b.prestige - a.prestige);
      if (!hs.length) return '';
      return `<div class="sec">가문 (${hs.filter(h => h.alive).length})</div>${hs.slice(0, 14).map(h => `<div>${houseLink(h)} <small>${h.alive ? `가주 ${esc(w.chars[h.head]?.name ?? '-')} · ${w.settlements[h.seat] ? esc(w.settlements[h.seat].name) : '영지 없음'} · 명망 ${h.prestige}` : '단절'}</small></div>`).join('')}`;
    })()}
    <div class="sec">세력의 일대기</div>
    <div class="log">
      <div><span class="when">${dateStr(w, f.founded)}</span><b>${esc(fixJosa(`${f.name.replace(/ (왕국|제국|공국|대왕국)$/, '')}이(가) 일어섰다.`))}</b></div>
      ${(f.history ?? w.news.filter(n => n.facs?.includes(f.id) && n.imp >= 4).map(n => ({ t: n.t, text: n.text, imp: n.imp })))
        .map(h => `<div class="imp${h.imp}"><span class="when">${dateStr(w, h.t)}</span>${linkify(w, h.text)}</div>`).join('')}
      ${f.alive ? '' : `<div><span class="when">${dateStr(w, f.fell)}</span><b style="color:var(--red)">멸망하였다.</b></div>`}
    </div>
    <div class="sec">역대 군주</div>
    <div class="log">${rulers.map(r => `<div><span class="when">${dateStr(w, r.from)}~${r.to >= 0 ? dateStr(w, r.to) : ''}</span>${charLink(w, w.chars[r.id], w.chars[r.id].name)} <small>(${esc(r.how)})</small></div>`).join('')}</div>
  `;
}

const FLAG_NAMES: Record<string, string> = {
  knights: '기사단', academy: '마법 학교', cathedral: '대성당', runeforge: '룬 단조', worldtree_bloom: '세계수 개화', ancient_magic: '고대 마법',
  spirit_pact: '정령 계약', dark_castle: '마성', spider_oracle: '거미 신탁', guild: '상인 길드', deep_dig: '심층 굴착', mithril: '미스릴', waaagh: '대침공',
  golden_age: '황금기',
};

export function inspectTile(w: World, l: number, x: number, y: number): string {
  const L = w.layers[l];
  const k = y * L.w + x;
  const T = TERRAIN[L.terrain[k]];
  const owner = w.factions[L.owner[k]];
  const claim = w.settlements[L.claim[k]];
  const chars = w.chars.filter(c => c.died < 0 && c.l === l && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1);
  const sites = w.sites.filter(s => s.l === l && s.x === x && s.y === y);
  const portals = w.portals.filter(p => (p.a.l === l && p.a.x === x && p.a.y === y) || (p.b.l === l && p.b.x === x && p.b.y === y));
  const armies = w.armies.filter(a => a.alive && a.l === l && Math.abs(a.x - x) <= 1 && Math.abs(a.y - y) <= 1);
  const towers = w.towers.filter(t => t.l === l && Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1);
  const yields = T.yields.map((v, r) => (v > 0 ? `<span class="chip" style="border-color:${RES_COLORS[r]}">${RES_NAMES[r]} ${v}</span>` : '')).join('');
  return `
    <div class="ins-h">${esc(T.name)}</div>
    <div class="ins-sub">${LAYER_INFO[l].name} (${x}, ${y}) · ${T.move > 0 ? `이동 비용 ${T.move}` : '걸어서 지날 수 없음'}</div>
    <div class="chips">${yields || '<span class="dim">산출 없음</span>'}</div>
    <div class="kv" style="margin-top:6px">
      <span>영유</span><span>${owner ? facLink(owner) : '<span class="dim">주인 없는 땅</span>'}</span>
      <span>관할</span><span>${setLink(claim)}</span>
    </div>
    ${sites.map(s => `<div class="sec">${esc(s.name)}</div><div>위험도 ${'★'.repeat(s.level)} · 남은 보물 ${fmtNum(s.loot)}${s.relic ? ' · <b style="color:var(--gold)">무언가 강한 기운이 느껴진다</b>' : ''}</div>`).join('')}
    ${towers.map(t => `<div class="sec">♜ ${esc(t.name)}</div><div>${t.alive ? `높이 ${Math.round(t.progress)}/200 (${t.progress >= 200 ? '천상에 닿음' : t.progress >= 100 ? '하늘에 닿음' : '건설 중'}) · 체력 ${Math.round(Math.max(0, t.hp))}/100${t.warnedAt >= 0 ? ' · <b style="color:var(--red)">천사의 경고를 받음</b>' : ''}` : '무너진 폐허'}<br><small>쌓은 이: ${facLink(w.factions[t.builder])}</small></div>`).join('')}
    ${portals.map(p => `<div class="sec">${esc(p.name)}</div><div>${LAYER_INFO[p.a.l].name} ↔ ${LAYER_INFO[p.b.l].name} · ${p.open ? '<b style="color:var(--violet)">열림</b>' : '봉인됨'} <span class="link" data-portal="${p.id}">반대편 보기</span></div>`).join('')}
    ${armies.length ? `<div class="sec">군대</div>${armies.map(a => `<div>${facLink(w.factions[a.faction])} ${{ raid: '약탈대', conquer: '원정군', colonize: '이주민', holywar: '성전군', return: '귀환 중', clear: '개간대' }[a.goal]} ${fmtNum(a.soldiers)}명 ${a.commander >= 0 ? '· 지휘 ' + charLink(w, w.chars[a.commander]) : ''}${w.settlements[a.target] ? ' → ' + setLink(w.settlements[a.target]) : ''}</div>`).join('')}` : ''}
    ${(() => {
      const S = seaThingsAt(w, l, x, y);
      return S.sites.map(s => `<div class="sec">≈ ${esc(s.name)}</div><div>바닷속 유적 · 위험도 ${'★'.repeat(s.level)} · 남은 보물 ${fmtNum(s.loot)}${s.relic ? ' · <b style="color:var(--gold)">깊은 곳에서 무언가 빛난다</b>' : ''}<br><small>배를 타고 가야 닿을 수 있다.</small></div>`).join('')
        + S.voyages.map(v => `<div class="sec">⛵ ${esc(v.name)}</div><div>선장 ${charLink(w, w.chars[v.captain])} · 선원 ${v.crew.length}명 · ${{ treasure: '보물 탐사', explore: '미지의 바다 탐험', hunt: '괴수 사냥' }[v.goal]} · 출항 ${dateStr(w, v.t)} (예정 ${Math.round(v.months / 12)}년)<br><small>${v.crew.map(id => charLink(w, w.chars[id])).join(', ')}</small></div>`).join('')
        + S.fleets.map(f => `<div class="sec">⛵ ${esc(f.name)}</div><div>${esc(RACES[f.race].name)} ${Math.round(f.pop)}명 · ${f.pirate ? '해적질로 연명한다' : '바다에서 고기를 잡으며 떠돈다'} · ${Math.floor((w.t - f.t) / 12)}년째${w.chars[f.leader] && w.chars[f.leader].died < 0 ? ` · 이끄는 이 ${charLink(w, w.chars[f.leader])}` : ''}<br><small>바다는 자원이 모자라 큰 무리가 될 수 없다.</small></div>`).join('')
        + S.beasts.map(b => `<div class="sec">🐙 ${esc(b.name)}</div><div>체력 ${Math.max(0, Math.round(b.hp))}/${b.maxHp} · 힘 ${b.power} · ${b.ashore ? `<b style="color:var(--red)">${esc(w.settlements[b.target]?.name ?? '')}의 해안을 덮치고 있다</b>` : `${esc(w.settlements[b.target]?.name ?? '')} 쪽으로 다가온다`}${b.allies.length > 1 ? `<br>연맹: ${b.allies.map(id => facLink(w.factions[id])).join(', ')}` : ''}</div>`).join('')
        + (S.tentacles.length ? `<div class="sec">♆ ${esc(w.sea.leviathan!.name)}의 촉수</div><div>${S.tentacles.map(t => `체력 ${Math.max(0, Math.round(t.hp))}/250`).join(' · ')}${w.sea.leviathan!.cause ? `<br><i>${esc(w.sea.leviathan!.cause)}</i>` : ''}<br><small>주변 10칸을 괴롭힌다. 연맹: ${w.sea.leviathan!.alliance.map(id => facLink(w.factions[id])).join(', ') || '없음'}</small></div>` : '');
    })()}
    ${chars.length ? `<div class="sec">근처의 인물</div>${chars.slice(0, 20).map(c => charLink(w, c)).join('<br>')}` : ''}
  `;
}

// ───────────── 하단 탭

export function logTab(w: World, cat: string): string {
  const since = w.t - 2;
  const items: NewsItem[] = [];
  for (let i = w.news.length - 1; i >= 0; i--) {
    const n = w.news[i];
    if (n.t < since) break;
    if (cat === 'all' || n.cat === cat) items.push(n);
  }
  const chips = ['all', 'war', 'politics', 'hero', 'dark', 'growth', 'trade', 'nature', 'life', 'doom', 'player']
    .map(c => `<button class="mini ${c === cat ? 'on' : ''}" data-logcat="${c}">${c === 'all' ? '전체' : CAT_NAME[c]}</button>`).join(' ');
  return `<div style="margin-bottom:4px">${chips} <small>최근 3개월 · ${items.length}건</small></div>${items.map(n => newsItemHTML(w, n)).join('') || '<p class="dim">조용한 나날이었다.</p>'}`;
}

export function chronicleTab(w: World): string {
  const byId = new Map(w.news.map(n => [n.id, n]));
  return w.eras.slice().reverse().map((e, ri) => {
    const idx = w.eras.length - 1 - ri;
    const name = e.end < 0 ? `${eraName(w, e, idx)} <small>(진행 중)</small>` : esc(e.name);
    const hl = e.highlights.map(id => byId.get(id)).filter((n): n is NewsItem => !!n).slice(-14).reverse();
    const chapter = e.chapter?.length ? `<div class="chapter">${e.chapter.map(l => `<p>${linkify(w, l)}</p>`).join('')}</div>` : '';
    return `<div class="era"><h4>${name} <small>${dateStr(w, e.start)} ~ ${e.end >= 0 ? dateStr(w, e.end) : ''}</small></h4>${chapter}
      ${hl.length ? (chapter ? `<details><summary class="dim">그 시대의 소식 ${hl.length}건</summary>${hl.map(n => newsItemHTML(w, n)).join('')}</details>` : hl.map(n => newsItemHTML(w, n)).join('')) : chapter ? '' : '<div class="dim">기록할 만한 일이 아직 없다.</div>'}</div>`;
  }).join('');
}

export function factionsTab(w: World): string {
  const alive = w.factions.filter(f => f.alive).sort((a, b) => b.pop - a.pop);
  const dead = w.factions.filter(f => !f.alive).sort((a, b) => b.fell - a.fell);
  const row = (f: Faction) => {
    const ld = leaderOf(w, f);
    return `<tr data-fac="${f.id}"><td><span class="swatch" style="background:${f.color}"></span>${esc(f.name)}</td><td>${RACES[f.race].name}</td><td>${['부족', '공국', '왕국', '제국'][f.tier]}</td>
      <td>${fmtNum(f.pop)}</td><td>${f.settlements.length}</td><td>${fmtNum(f.military)}</td><td>${Math.round(f.avgDev)}</td>
      <td>${ld ? esc(ld.name) : '-'}</td><td>${Object.keys(f.wars).map(id => esc(w.factions[+id].name)).join(', ')}</td></tr>`;
  };
  return `<table class="t"><tr><th>세력</th><th>종족</th><th>격</th><th>인구</th><th>정착지</th><th>군사</th><th>발전</th><th>군주</th><th>전쟁</th></tr>
    ${alive.map(row).join('')}</table>
    ${dead.length ? `<div class="sec">멸망한 세력 (${dead.length})</div><div>${dead.slice(0, 40).map(f => `<span class="link" data-fac="${f.id}">${esc(f.name)}</span> <small>${dateStr(w, f.founded)}~${dateStr(w, f.fell)}</small>`).join(' · ')}</div>` : ''}`;
}

export function peopleTab(w: World, q: string, filter: string): string {
  let list = w.chars.filter(c => c.died < 0);
  if (filter === 'rulers') list = list.filter(c => w.factions[c.faction]?.leader === c.id);
  if (filter === 'heroes') list = list.filter(c => isHero(c) || w.demonLord === c.id || c.awakened.length > 0);
  if (filter === 'dragons') list = list.filter(c => c.race === 'dragon');
  if (filter === 'dead') list = w.chars.filter(c => c.died >= 0 && c.fame >= 30).sort((a, b) => b.died - a.died);
  if (q) list = list.filter(c => (c.name + c.epithet).includes(q));
  if (filter !== 'dead') list.sort((a, b) => b.fame - a.fame);
  const btn = (k: string, n: string) => `<button class="mini ${filter === k ? 'on' : ''}" data-pfilter="${k}">${n}</button>`;
  return `<div style="margin-bottom:4px;display:flex;gap:4px;align-items:center">
      <input id="people-q" placeholder="이름 검색" value="${esc(q)}" style="width:140px">
      ${btn('all', '명망순')}${btn('rulers', '군주')}${btn('heroes', '각성자')}${btn('dragons', '용')}${btn('dead', '고인')}
      <small>${list.length}명</small></div>
    <table class="t"><tr><th>이름</th><th>직함</th><th>종족</th><th>나이</th><th>소속</th><th>명성</th><th>성격</th></tr>
    ${list.slice(0, 120).map(c => `<tr data-char="${c.id}"><td>${esc(c.epithet ? c.epithet + ' ' : '')}${esc(c.name)}</td><td>${esc(titleOf(w, c))}</td><td>${RACES[c.race].name}</td><td>${ageOf(w, c)}</td>
      <td>${esc(w.factions[c.faction]?.name ?? '-')}</td><td>${fmtNum(c.fame)}</td><td>${esc(describeTraits(c.traits).join(', '))}</td></tr>`).join('')}</table>`;
}

const SEAL_ICON = ['♛', '♆', '✚', '♣', 'Ð', '☣', '◉'];
export function sealsTab(w: World): string {
  const n = brokenCount(w);
  const total = sealTotal(w);
  return `<p>세계를 지탱하는 일곱 개의 봉인. 봉인의 이름은 한 번 무너지는 것을 본 뒤에야 알 수 있다. 넷 이상이 동시에 무너지면 세계가 멸망할 수 있다. <b>현재 ${n}/${total} 붕괴</b>${omen(w) ? ` — <i>${esc(omen(w))}</i>` : ''}</p>
    <div>${SEAL_NAMES.map((s, i) => !sealVisible(w, i) ? `<div class="seal"><span class="ic">?</span><b>${['첫', '두', '세', '네', '다섯', '여섯', '일곱'][i]} 번째 봉인</b><small>${w.doom.seals[i] ? '붕괴' : '이름 모를 봉인'}</small></div>` : `<div class="seal ${w.doom.seals[i] ? 'broken' : ''}"${w.doom.seals[i] ? ` data-seal="${i}" title="눌러서 재앙이 벌어지는 곳으로"` : ''}><span class="ic">${SEAL_ICON[i]}</span><b>${s}</b><small>${w.doom.seals[i] ? '붕괴 · 눌러서 보기 ▸' : '유지'}</small></div>`).join('')}</div>
    <p class="dim">용의 원한: ${w.doom.dragonGrievance} / 3${sealVisible(w, 4) ? ' (셋이 쌓이면 고대 용이 분노한다)' : ''} · 세계수: ${w.worldTree ? (w.worldTree.alive ? `생명력 ${Math.ceil(w.worldTree.hp)} · 성장 ${Math.floor(w.worldTree.growth)}%` : '쓰러짐') : '없음'}</p>
    <p class="dim">열린 차원의 균열: ${w.portals.filter(p => p.kind === 'rift' && p.open).length}개${(w.doom.riftSurge ?? -1) > w.t ? ' <b style="color:var(--violet)">(차원의 합)</b>' : ''} · 앓고 있는 고을: ${w.settlements.filter(s => s.alive && s.plague > 0).length}곳</p>
    <p class="dim">${w.diseases.filter(d => d.alive).map(d => `'${esc(d.name)}' ${w.settlements.filter(s => s.alive && s.plague > 0 && s.disease === d.id).length}곳${d.great ? ` <b style="color:var(--red)">대역병</b> (면역이 퍼지기까지 약 ${Math.max(0, Math.ceil(((d.until ?? w.t) - w.t) / 12))}년)` : ''}`).join(' · ') || '도는 병이 없다.'}</p>
    ${(() => {
      const S = w.sea, V = S.leviathan;
      const beasts = S.beasts.filter(b => b.alive);
      return `<p class="dim">바다: 항해 중인 배 ${S.voyages.filter(v => !v.done).length}척 · 유랑 선단 ${S.fleets.filter(f => f.alive).length}무리${beasts.length ? ` · 바다 괴수 ${beasts.map(b => esc(b.name)).join(', ')}` : ''}${V && V.active ? ` · <b style="color:#2affc8">${esc(V.name)} — 촉수 ${V.tentacles.filter(t => t.alive).length}/${V.tentacles.length} (절반 넘게 베면 심연으로 돌아간다)</b>` : ''}</p>`;
    })()}`;
}

export function statsTab(w: World): string {
  const byRace = POP_RACES.map(r => ({ r, pop: w.settlements.filter(s => s.alive && s.race === r).reduce((a, s) => a + s.pop, 0) }))
    .sort((a, b) => b.pop - a.pop);
  const max = Math.max(1, ...byRace.map(x => x.pop));
  const total = byRace.reduce((a, x) => a + x.pop, 0);
  const alive = w.chars.filter(c => c.died < 0);
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div><div class="sec">종족별 인구 (총 ${fmtNum(total)})</div>
    ${byRace.map(x => `<div class="trait" style="grid-template-columns:60px 1fr 60px"><span>${RACES[x.r].name}</span>${bar(x.pop, max, RACES[x.r].color)}<span>${fmtNum(x.pop)}</span></div>`).join('')}</div>
    <div><div class="sec">세계</div><div class="kv">
      <span>경과</span><span>${Math.floor(w.t / 12)}년 ${w.t % 12}개월</span>
      <span>현 계절</span><span>${SEASON_NAMES[seasonOf(w.t)]}</span>
      <span>세력</span><span>${w.factions.filter(f => f.alive).length} (멸망 ${w.factions.filter(f => !f.alive).length})</span>
      <span>정착지</span><span>${w.settlements.filter(s => s.alive).length}</span>
      <span>이름난 인물</span><span>${alive.length} (고인 ${w.chars.length - alive.length})</span>
      <span>용</span><span>${alive.filter(c => c.race === 'dragon').length}</span>
      <span>용사</span><span>${alive.filter(isHero).length}</span>
      <span>마왕</span><span>${w.demonLord >= 0 ? charLink(w, w.chars[w.demonLord]) : '없음'}</span>
      <span>진군 중 군대</span><span>${w.armies.filter(a => a.alive).length}</span>
      <span>전장의 망자</span><span>${fmtNum(w.corpses)}</span>
    </div></div></div>`;
}

export function myLifeTab(w: World, all = false): string {
  const P = w.player;
  if (!P) return '';
  const c = w.chars[P.charId];
  const sum = storySummary(w, c);
  // 계절 문구 같은 사소한 줄은 기본으로 접어 둔다
  const lines = c.bio.filter(b => all || (b.imp ?? 2) >= 2);
  const hidden = c.bio.length - lines.length;
  const toggle = `<div class="tabs" style="margin:4px 0"><button class="mini ${all ? '' : 'on'}" data-lifeall="0">중요한 일만</button><button class="mini ${all ? 'on' : ''}" data-lifeall="1">전부${hidden ? ` (+${hidden})` : ''}</button></div>`;
  return `<div class="story-sum"><b>${esc(c.epithet ? `${c.epithet} ${c.name}` : c.name)}의 이야기</b>${sum.map(l => `<div>${esc(l)}</div>`).join('')}</div>${toggle}<div class="log">${lines.slice().reverse().map(b => `<div${(b.imp ?? 2) <= 1 ? ' class="dim"' : ''}><span class="when">${dateStr(w, b.t)}</span>${linkify(w, b.text)}</div>`).join('')}</div>`;
}

/** 이야기 탭: 지금 이어지는 큰 이야기와, 최근에 끝난 이야기 */
export function storiesTab(w: World): string {
  const now = currentStories(w);
  const ended = (w.storyBook?.ended ?? []).slice().reverse().slice(0, 15);
  const jump = (p?: { l: number; x: number; y: number }) => p ? ` data-jump="${p.l},${Math.round(p.x)},${Math.round(p.y)}" title="눌러서 그곳으로"` : '';
  return `<p class="dim" style="margin:0 0 6px">지금 세상을 움직이는 큰 이야기들. 무게가 큰 것부터 보인다. 카드를 누르면 그곳으로 간다.</p>
    <div class="stories">${now.map(s => `<div class="story story-${s.kind}"${jump(s.pos)}><b>${storyIcon(s.kind)} ${esc(s.title)}</b><small>${dateStr(w, s.since)}부터</small>${s.lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>`).join('') || '<div class="dim">세상이 고요하다. 큰 이야기가 없다.</div>'}</div>
    ${ended.length ? `<div class="sec">최근에 끝난 이야기</div><div class="log">${ended.map(e => `<div><span class="when">${storyYears(w, e.t0, e.t1)}</span>${storyIcon(e.kind)} <b>${esc(e.title)}</b> — ${esc(e.end)}</div>`).join('')}</div>` : ''}`;
}

export function legendHTML(): string {
  const rows: [string, string, string][] = [
    ['·○◎▣♛', '#e8dcc0', '정착지 (야영지→수도)'],
    ['H', RACES.human.color, '인물 (종족 머리글자)'],
    ['Ð', RACES.dragon.color, '용'],
    ['Ψ', '#ff2a2a', '마왕'],
    ['♛', '#ffd24a', '세력의 군주'],
    ['♜', '#ffcf7a', '바벨탑 (붉으면 마왕탑)'],
    ['⇑', '#ffb060', '탑의 하늘 문'],
    ['⚔', '#ff5a4a', '군대'],
    ['⚑', '#9ad06a', '이주민'],
    ['▣', '#e8c060', '상단 (교역 짐수레)'],
    ['▲', '#e05040', '주둔지 (붉은 점선: 전선)'],
    ['⌂', '#ffd24a', '열강의 거처'],
    ['Ω', '#f0dca0', '유적'],
    ['▼', '#f0dca0', '던전'],
    ['†', '#8a8070', '무너진 신전 터'],
    ['✝', '#ffd24a', '다시 세운 신전'],
    ['∩', '#c9a070', '동굴 입구'],
    ['⇡', '#e8f0ff', '구름 계단'],
    ['✧', '#ffe680', '천상의 계단'],
    ['◉', '#ff4fd8', '차원의 균열'],
    ['☣', '#b6ff3a', '역병'],
    ['♣', '#7dff8a', '세계수'],
  ];
  return rows.map(([g, c, n]) => `<div><span class="g" style="color:${c}">${g.length > 2 ? g[0] : g}</span>${n}</div>`).join('');
}

const STAT_KEYS: (keyof Character['stats'])[] = ['might', 'intellect', 'magic', 'command', 'charisma'];
export function playerHudHTML(w: World, prev: Record<string, number>, skipping = false): { html: string; snap: Record<string, number> } {
  const P = w.player!;
  const c = w.chars[P.charId];
  const snap: Record<string, number> = {
    wealth: Math.round(c.wealth), honor: Math.round(c.honor), fame: Math.round(c.fame), health: Math.round(c.stats.health), mood: Math.round(c.mood),
  };
  for (const k of STAT_KEYS) snap[k] = Math.round(c.stats[k]);
  const d = (k: string) => {
    if (prev[k] === undefined || prev[k] === snap[k]) return '';
    const v = snap[k] - prev[k];
    return `<span class="delta ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : ''}${v}</span>`;
  };
  const home = w.settlements[c.home];
  const last = P.results[P.results.length - 1];
  const html = `
    <div class="hud-top">
      <div class="name">${esc(c.epithet ? c.epithet + ' ' : '')}${esc(c.name)}</div>
      <div class="hud-actions">
        <button id="btn-skip" class="accent ${skipping ? 'on' : ''}" ${P.dead ? 'disabled' : ''} title="다음 선택지나 큰 사건이 생길 때까지 시간을 빠르게 흘려보낸다">${skipping ? '⏸ 멈추기' : '⏩ 다음 순간까지'}</button>
        <button id="btn-track-me" title="지도가 이 인물을 따라간다">◎ 따라가기</button>
      </div>
    </div>
    <div class="hud-sub">${esc(titleOf(w, c))} · ${RACES[c.race].name} · ${ageOf(w, c)}세 · ${home ? esc(home.name) : '떠돌이'} · ${esc(w.factions[c.faction]?.name ?? '무소속')}${P.dead ? ' · <b style="color:var(--red)">사망</b>' : ''}</div>
    <div class="hud-bars">
      <span>건강</span>${bar(c.stats.health, 100, 'var(--green)')}
      <span>행복</span>${bar(c.mood, 100, 'var(--blue)')}
    </div>
    <div class="hud-grid">
      <span>재산</span><span class="v">${snap.wealth}${d('wealth')}</span>
      <span>명예</span><span class="v">${snap.honor}${d('honor')}</span>
      <span>인지도</span><span class="v">${snap.fame}${d('fame')}</span>
      ${STAT_KEYS.filter(k => k !== 'health').map(k => `<span>${STAT_NAMES[k]}</span><span class="v">${snap[k]}${d(k)}</span>`).join('')}
    </div>
    ${last ? `<div class="hud-last" title="${esc(last.text)}">${esc(last.text)}</div>` : ''}`;
  return { html, snap };
}

export function achievementsTab(unlocked: Set<string>): string {
  const total = ACHIEVEMENTS.length;
  const got = ACHIEVEMENTS.filter(a => unlocked.has(a.id)).length;
  return `<p>달성 <b>${got}</b> / ${total} <small class="dim">— 업적은 이 브라우저에 저장되어 세계가 바뀌어도 남는다.</small></p>` +
    TIER_NAMES.map((tn, t) => {
      const list = ACHIEVEMENTS.filter(a => a.tier === t);
      const n = list.filter(a => unlocked.has(a.id)).length;
      return `<div class="achv-tier"><h4 style="color:${TIER_COLORS[t]}">${tn} <small>${n}/${list.length}</small></h4><div class="achv-grid">${list.map(a => {
        const ok = unlocked.has(a.id);
        const hide = !ok && a.secret;
        return `<div class="achv ${ok ? 'ok' : ''}" style="--tc:${TIER_COLORS[t]}"><b>${ok ? '🏆' : '🔒'} ${hide ? '???' : esc(a.name)}</b><small>${hide ? '숨겨진 업적' : esc(a.desc)}</small></div>`;
      }).join('')}</div></div>`;
    }).join('');
}

function artsOf(w: World, c: Character): string {
  const held = w.artifacts.filter(a => a.tangible && a.holder === c.id);
  const made = w.artifacts.filter(a => a.maker === c.id && !(a.tangible && a.holder === c.id));
  const tag = (a: typeof made[number]) => (a.lost !== undefined ? ' · 스러짐' : '');
  if (!held.length && !made.length) return '';
  return `<div class="sec">명품</div>${held.map(a => `<div>🗡 <span class="link" data-art="${a.id}">${esc(artLabel(a))}</span> <small>(지님 · 힘 +${a.power})</small></div>`).join('')}${made.map(a => `<div>✎ <span class="link" data-art="${a.id}">${esc(artLabel(a))}</span> <small>(지은 작품${tag(a)})</small></div>`).join('')}`;
}

export function artifactsTab(w: World, sel: number): string {
  if (!w.artifacts.length) return '<p class="dim">아직 세상에 이름을 남긴 작품이 없다.</p>';
  const live = w.artifacts.filter(x => x.lost === undefined).sort((a, b) => b.fame - a.fame);
  const gone = w.artifacts.filter(x => x.lost !== undefined).sort((a, b) => b.lost! - a.lost!);
  const list = [...live, ...gone];
  const a = w.artifacts[sel] ?? list[0];
  const h = w.chars[a.holder];
  const bar = (x: typeof a) => { const v = vigor(x); const n = Math.ceil(v * 5); return `<span title="${vigorWord(x)}" style="color:${v > 0.45 ? 'var(--gold)' : v > 0.2 ? '#c8a060' : '#a06050'}">${'●'.repeat(n)}${'○'.repeat(5 - n)}</span>`; };
  const where = a.lost !== undefined ? `<span class="dim">${dateStr(w, a.lost)}에 스러졌다 — ${esc(a.fate ?? '')}</span>` : !a.tangible ? '온 세상에 퍼져 있다' : h ? `${charLink(w, h)}${josa(h.name, '이').slice(h.name.length)} 지니고 있다` : a.site >= 0 ? `${esc(w.sites[a.site]?.name ?? '')}에 묻혀 있다` : '행방불명';
  return `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px">
    <div><p class="dim" style="margin:0 0 4px">남아 있는 명품 ${live.length} · 스러진 명품 ${gone.length} — 명품에는 저마다 명맥이 있어, 세월이 다하면 부서지거나 잊힌다. 이름이 높을수록 사람들이 아껴 오래 남는다.</p>
    <table class="t"><tr><th>명품</th><th>종류</th><th>명성</th><th>명맥</th><th>소재</th></tr>${list.slice(0, 100).map(x => {
      const hh = w.chars[x.holder];
      return `<tr data-art="${x.id}"${x.lost !== undefined ? ' style="opacity:.45"' : ''}><td>${esc(x.makerName)}의 「${esc(x.name)}」</td><td>${x.kind}</td><td>${Math.round(x.fame)}</td><td>${bar(x)}</td><td>${x.lost !== undefined ? '스러짐' : !x.tangible ? '세상' : hh ? esc(hh.name) : x.site >= 0 ? '유적' : '?'}</td></tr>`;
    }).join('')}</table></div>
    <div><div class="ins-h">${esc(artLabel(a))}</div><div class="ins-sub">${dateStr(w, a.t)} 제작 · ${a.tangible ? `힘 +${a.power}` : '작품'} · 명성 ${Math.round(a.fame)} · 명맥 ${bar(a)} ${vigorWord(a)}</div>
    <div>${where}</div><div class="sec">내력</div><div class="log">${a.story.map(s2 => `<div><span class="when">${dateStr(w, s2.t)}</span>${esc(s2.text)}</div>`).join('')}</div></div></div>`;
}

/** 주둔지 정보창 */
export function inspectCamp(w: World, k: Camp): string {
  const f = w.factions[k.faction], e = w.factions[k.enemy], home = w.settlements[k.home], front = w.settlements[k.front];
  const out = w.armies.filter(a => a.alive && a.camp === k.id && !a.toCamp);
  const coming = w.armies.filter(a => a.alive && a.camp === k.id && a.toCamp);
  return `<div class="ins-h"><span class="swatch" style="background:${f?.color ?? '#888'}"></span>${esc(k.name)}</div>
    <div class="ins-sub">${esc(f?.name ?? '')}의 주둔지 · ${dateStr(w, k.t)}에 세움${k.alive ? '' : ' · 거둠'}</div>
    <div class="kv">
      <span>맞서는 적</span><span>${facLink(e)}</span>
      <span>전선</span><span>${front ? setLink(front) : '-'}</span>
      <span>병력</span><span>${Math.round(k.soldiers)}명${coming.length ? ` · 오는 중 ${coming.reduce((a, x) => a + x.soldiers, 0)}명` : ''}${out.length ? ` · 출격 중 ${out.reduce((a, x) => a + Math.round(x.soldiers), 0)}명` : ''}</span>
      <span>지휘관</span><span>${w.chars[k.commander]?.died < 0 ? charLink(w, w.chars[k.commander]) : '<span class="dim">없음</span>'}</span>
      <span>보급</span><span>${setLink(home)} <small>(병사 100명당 한 달 양식 2)</small></span>
    </div>
    <p class="dim">먼 적국을 칠 때는 길목에 주둔지를 세우고 병력을 모아 출격한다. 양식이 끊기면 병사가 흩어지고, 적에게 짓밟히면 무너진다. 전쟁이 끝나면 거둔다.</p>`;
}

/** 상단 정보창 */
export function inspectCaravan(w: World, k: Caravan): string {
  const f = w.factions[k.fac], from = w.settlements[k.from], to = w.settlements[k.to];
  const months = w.t - k.t;
  const left = Math.max(1, Math.ceil(k.path.length / 3));
  return `<div class="ins-h"><span class="swatch" style="background:${f?.color ?? '#888'}"></span>${esc(f?.name ?? '')}의 상단</div>
    <div class="ins-sub">교역 짐수레 · ${k.alive ? '길 위' : '여정을 마침'}</div>
    <div class="kv">
      <span>출발</span><span>${setLink(from)}</span>
      <span>목적지</span><span>${setLink(to)} (${facLink(w.factions[k.partner])})</span>
      <span>이끄는 이</span><span>${(k.crew ?? []).map(id => charLink(w, w.chars[id])).join(', ') || '없음'}</span>
      <span>짐</span><span>${RES_NAMES[k.res]} ${Math.round(k.amt)}</span>
      <span>길 위에서</span><span>${months}개월째${k.alive ? ` · 남은 길 약 ${left}개월` : ''}</span>
    </div>
    <p class="dim">교역 협정을 맺은 나라 사이를 반년마다 오가는 짐 행렬이다. 싸우는 나라의 땅을 지나면 약탈당할 수 있고, 외진 길에서는 도적을 만나기도 한다.</p>`;
}

/** 신앙 탭: 세상의 신앙들 */
export function faithTab(w: World): string {
  const rs = (w.religions ?? []).slice().sort((a, b) => Number(b.alive) - Number(a.alive) || a.t - b.t);
  if (!rs.length) return '<p class="dim">아직 세상에 신앙이 없다. 천사를 만나거나, 무너진 신전을 다시 세운 땅에서 가르침이 열린다.</p>';
  return `<p class="dim" style="margin:0 0 6px">신앙은 고을에서 고을로 번지고, 백성 절반 이상이 믿으면 나라의 국교가 된다. 빛과 어둠의 종족은 서로의 신앙을 받아들이지 않는다.</p>
    <div class="stories">${rs.map(r => {
      const sets = w.settlements.filter(s => s.alive && s.faith === r.id);
      const pop = sets.reduce((a, s) => a + s.pop, 0);
      const states = w.factions.filter(f => f.alive && f.faith === r.id);
      const holy = w.sites[r.holy];
      const temples = w.sites.filter(s => s.temple?.faith === r.id);
      return `<div class="story story-party"${holy ? ` data-jump="${holy.l},${holy.x},${holy.y}" title="눌러서 성지로"` : ''}${r.alive ? '' : ' style="opacity:.5"'}>
        <b>✝ ${esc(r.name)}${r.alive ? '' : ' (잊힘)'}</b><small>${dateStr(w, r.t)} · ${esc(fixJosa(`${r.founderName}이(가) 열었다`))} · 섬기는 신: '${esc(r.deity)}'</small>
        <div>교리: ${r.tenets.map(t => `<span title="${esc(TENET_DESC[t])}">${TENET_NAME[t]}</span>`).join(' · ')}</div>
        <div>대신관: ${w.chars[r.head]?.died < 0 ? charLink(w, w.chars[r.head]) : '<span class="dim">비어 있음</span>'}</div>
        <div>성지: ${holy ? esc(holy.name) : '<span class="dim">없음</span>'}${temples.length > 1 ? ` 외 신전 ${temples.length - 1}곳` : ''}</div>
        <div>믿는 고을 ${sets.length}곳 · 신도 약 ${fmtNum(pop)} · 국교로 삼은 나라 ${states.map(f => facLink(f)).join(', ') || '없음'}</div>
      </div>`;
    }).join('')}</div>`;
}

export function houseLink(h: House): string {
  return `<span class="link" data-house="${h.id}">${h.royal ? '♛ ' : ''}${esc(h.name)}</span>${h.alive ? '' : ' <small>(단절)</small>'}`;
}

export function inspectHouse(w: World, h: House): string {
  const f = w.factions[h.faction];
  const head = w.chars[h.head];
  const seat = w.settlements[h.seat];
  const shrine = w.sites[h.shrine];
  const members = membersOf(w, h);
  const alive = members.filter(m => m.died < 0);
  return `
    <div class="ins-h">${h.royal ? '♛ ' : ''}${esc(h.name)}${h.alive ? '' : ' (단절)'}</div>
    <div class="ins-sub">${h.royal ? '왕가 · ' : ''}${dateStr(w, h.t)} 창건 · 명망 ${h.prestige}</div>
    <div class="kv">
      <span>섬기는 나라</span><span>${facLink(f)}</span>
      <span>가주</span><span>${h.alive ? charLink(w, head) : '<span class="dim">없음</span>'}</span>
      <span>시조</span><span>${charLink(w, w.chars[h.founder], w.chars[h.founder]?.name)}</span>
      <span>영지</span><span>${seat ? setLink(seat) : '<span class="dim">잃었거나 없음</span>'}</span>
      <span>지키는 성지</span><span>${shrine ? esc(shrine.name) : '<span class="dim">없음</span>'}</span>
      <span>식구</span><span>${alive.length}명 (역대 ${members.length}명)</span>
    </div>
    <div class="sec">가문의 일대기</div>
    <div class="log">${h.history.map(x => `<div><span class="when">${dateStr(w, x.t)}</span>${linkify(w, x.text)}</div>`).join('')}</div>
    <div class="sec">식구</div>
    <div>${members.slice(0, 40).map(m => `${charLink(w, m, m.name)} <small>${m.died >= 0 ? '' : esc(titleOf(w, m))}${h.head === m.id ? ' · 가주' : ''}</small>`).join('<br>')}</div>`;
}
