// 인생 이벤트 데이터 9: 혼인과 후계.
// 혼자인 이에게는 인연이 찾아오고, 왕좌나 가문을 짊어진 이에게는 국혼과 후궁, 후사의 무게가 따른다.
import type { Character } from './state';
import { ageOf } from './state';
import { addNews, charLog } from './news';
import { addRel, isAdult } from './helpers';
import { createCharacter, fertile, kin, makeSuitor } from './characters';
import type { Ctx, LifeEv } from './life';
import { FX_HOOKS, adult, all, single } from './life';
import { o } from './lifeData1';

const ruler = (x: Ctx) => x.isLeader;
const great = (x: Ctx) => x.isLeader || x.isGov || (x.c.house !== undefined && x.w.houses[x.c.house]?.head === x.c.id);
const canWed = (x: Ctx) => x.c.race !== 'undead' && x.c.race !== 'dragon' && x.c.role !== '노예';
const kids = (x: Ctx) => x.c.children.filter(id => x.w.chars[id]?.died < 0).length;

/** 짝이 될 만한 이: 같은 종족, 혼자인 성인, 핏줄이 아닌 이 */
function suitor(x: Ctx, c: Character, extra: (o: Character) => boolean): boolean {
  return c.died < 0 && c.id !== x.c.id && !c.isPlayer && c.spouse < 0 && c.sex !== x.c.sex && c.race === x.c.race && isAdult(x.w, c) && !kin(x.c, c)
    && c.role !== '노예' && Math.abs(ageOf(x.w, c) - x.age) < 18 && fertile(x.w, c) && extra(c);
}

export const ROYAL: LifeEv[] = [
  // 국혼: 이웃 나라 군주의 자식이나 이름난 가문의 사람과
  { id: 'rl_match', t: '국혼', cd: 24, w: 6, c: all(adult, single, canWed, great),
    data: x => {
      const fromRoyals = x.w.factions.filter(f => f.alive && f.id !== x.c.faction && (f.relations[x.c.faction] ?? 0) > -10)
        .flatMap(f => { const ld = x.w.chars[f.leader]; return ld ? ld.children.map(id => x.w.chars[id]) : []; })
        .filter(k => k && suitor(x, k, () => true));
      const nobles = x.w.chars.filter(k => suitor(x, k, o2 => o2.faction === x.c.faction && (o2.house !== undefined || o2.fame >= 30)));
      const pick = [...fromRoyals, ...nobles].sort((a, b) => b.fame + b.honor - a.fame - a.honor)[0];
      const k = pick ?? makeSuitor(x.w, x.c, true);
      return k ? { oId: k.id } : null;
    },
    x: x => `${x.isLeader ? '대신들이 국혼을 서두른다' : '집안 어른들이 혼사를 서두른다'}. "${x.isLeader ? '왕좌에는 후사가 필요합니다' : '가문에는 이을 사람이 필요합니다'}." {o}의 이름이 물망에 올랐다.`,
    o: [o('{o}과(와) 혼인한다', { r: '{o}과(와)의 혼례가 성대히 치러졌다.', fx: 'marry', honor: 10 }),
      o('다른 상대를 찾아보라 이른다', { r: '대신들이 한숨을 쉬며 물러났다.' }),
      o('혼인은 하지 않겠다', { r: '평생 혼자 살겠다고 선언하였다. 궁정이 술렁였다.', flag: 'noMarry', honor: -5 })] },
  // 후궁 (여성 군주는 부군)
  { id: 'rl_consort', t: '후궁', cd: 60, w: 3, c: all(adult, ruler, canWed, x => x.c.race !== 'elf' && x.c.race !== 'angel' && fertile(x.w, x.c) && !x.P.flags?.consort),
    data: x => {
      const k = x.w.chars.filter(c => suitor(x, c, o2 => o2.home === x.c.home && o2.id !== x.c.spouse)).sort((a, b) => b.stats.charisma - a.stats.charisma)[0];
      const k2 = k ?? makeSuitor(x.w, x.c);
      return k2 ? { oId: k2.id } : null;
    },
    x: x => `궁정의 ${x.c.sex === 'M' ? '여인' : '사내'} {o}이(가) 자꾸 눈에 밟힌다. ${x.c.spouse >= 0 ? '{sp}의 눈치가 보이지만, ' : ''}${x.c.sex === 'M' ? '후궁으로 들일' : '부군으로 맞을'} 수도 있다.`,
    o: [o(`{o}을(를) 곁에 들인다`, { r: '{o}이(가) 궁에 들어왔다.', fx: 'take_consort', mood: 10 }),
      o('마음을 접는다', { r: '왕의 자리는 무겁다.', honor: 3 })] },
  // 후사가 없다
  { id: 'rl_heir', t: '후사', cd: 48, w: 6, c: all(adult, great, canWed, x => kids(x) === 0 && x.age > (x.c.race === 'human' ? 30 : 50)),
    x: x => `${x.isLeader ? '왕좌' : '가문'}를 이을 핏줄이 없다. 사람들이 수군거리기 시작하였다.`,
    o: x => [
      ...(x.c.spouse >= 0 ? [o('신전에 후사를 빈다', { r: '', fx: 'pray_heir' })] : [o('혼인을 서두른다', { r: '중매쟁이들이 바빠졌다.', unflag: 'noMarry', fx: 'hurry_match' })]),
      o('가까운 이의 아이를 양자로 들인다', { r: '', fx: 'adopt_heir' }),
      o('하늘에 맡긴다', { r: '될 일은 되리라.', mood: -5 }),
    ] },
];

FX_HOOKS.push((x, fx, data) => {
  const { w, c } = x;
  switch (fx) {
    case 'take_consort': {
      const k = w.chars[+data.oId];
      if (!k || k.died >= 0) return '';
      x.P.flags ??= {};
      x.P.flags.consort = k.id;
      k.home = c.home; k.faction = c.faction;
      addRel(w, c, k, 40);
      const sp = w.chars[c.spouse];
      if (sp && sp.died < 0) { addRel(w, sp, c, -25); charLog(w, sp, `${c.name}이(가) ${k.name}을(를) 곁에 들이자 마음이 식었다.`, 2); }
      charLog(w, k, `${c.name}의 ${c.sex === 'M' ? '후궁' : '부군'}이 되었다.`, 3);
      return;
    }
    case 'hurry_match': {
      x.P.flags ??= {};
      delete x.P.lastEvents.rl_match;
      x.P.flags.hurryMatch = w.t;
      return;
    }
    case 'pray_heir': {
      x.P.flags ??= {};
      x.P.flags.prayHeir = w.t;
      return '향을 피우고 오래 기도하였다. 기도가 닿을지는 하늘만이 안다.';
    }
    case 'adopt_heir': {
      const k = w.chars.filter(o2 => o2.died < 0 && !o2.isPlayer && o2.faction === c.faction && !isAdult(w, o2) && o2.race === c.race
        && (o2.house === c.house || kin(o2, w.chars[c.father] ?? o2) || o2.home === c.home)).sort((a, b) => b.stats.intellect + b.stats.might - a.stats.intellect - a.stats.might)[0];
      if (!k) return '양자로 들일 만한 아이가 없었다.';
      if (!c.children.includes(k.id)) c.children.push(k.id);
      if (c.sex === 'F') k.mother = c.id; else k.father = c.id;
      if (c.house !== undefined) k.house = c.house;
      addRel(w, c, k, 50);
      addNews(w, `${c.name}이(가) ${k.name}을(를) 양자로 들여 후계로 삼았다.`, 2, 'politics', { chars: [c.id, k.id], facs: [c.faction] });
      return `${k.name}을(를) 양자로 들였다. 아이는 낯선 궁정을 두리번거렸다.`;
    }
  }
  return null;
});

/** 매달: 후궁이나 기도가 낳는 아이 (탄생 모드의 군주) */
export function royalBirths(w: import('./state').World, c: Character): void {
  const P = w.player;
  if (!P || c.died >= 0 || !fertile(w, c)) return;
  const rng = w.rngSim;
  const birth = (other: Character, how: string) => {
    const mom = c.sex === 'F' ? c : other, dad = c.sex === 'F' ? other : c;
    const kid = createCharacter(w, { race: c.race, faction: c.faction, home: c.home, pos: c, born: w.t, father: dad.id, mother: mom.id });
    kid.title = 'child';
    if (c.house !== undefined) kid.house = c.house;
    charLog(w, c, `${how} ${kid.name}이(가) 태어났다.`, 3);
    addNews(w, `${c.name}에게서 ${how} ${kid.name}이(가) 태어났다.`, 2, 'player', { chars: [c.id, kid.id] });
  };
  const k = w.chars[P.flags?.consort ?? -1];
  if (k && k.died < 0 && fertile(w, k) && k.l === c.l && Math.hypot(k.x - c.x, k.y - c.y) < 8 && c.children.length < 9 && rng.chance(0.02)) birth(k, `${c.sex === 'M' ? '후궁' : '부군'} ${k.name}과(와)의 사이에서`);
  // 후사를 빌고 나면 부부 사이에 아이가 들어서기 쉽다
  const sp = w.chars[c.spouse];
  if (P.flags?.prayHeir !== undefined && w.t - P.flags.prayHeir < 36 && sp && sp.died < 0 && fertile(w, sp) && rng.chance(0.04)) {
    delete P.flags.prayHeir;
    birth(sp, '기도 끝에');
  }
}
