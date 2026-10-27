import { createWorld } from '../src/sim/world';
import { tick } from '../src/sim/tick';
import { dateStr } from '../src/sim/state';
const argv: string[] = (globalThis as any).process?.argv ?? [];
const w = createWorld(argv[2] ?? 'IRON-CROWN-1234');
let angelMin = 99, angelMax = 0;
for (let i = 0; i < +(argv[3] ?? 2400); i++) {
  tick(w);
  const a = w.chars.filter(c => c.died < 0 && c.race === 'angel').length;
  angelMin = Math.min(angelMin, a); angelMax = Math.max(angelMax, a);
}
console.log('천사 수 범위', angelMin, '~', angelMax, '잃은 자리', Object.keys(w.stats).filter(k => k.startsWith('angelLost')).length);
console.log('병', w.diseases.length, '대역병', w.diseases.filter(d => d.epidemic).length, w.diseases.slice(0, 6).map(d => `${d.name}(최대${d.peak}${d.epidemic ? ',대역병' : ''})`).join(' / '));
const slaves = w.settlements.reduce((a, s) => a + (s.slaves ?? 0), 0);
console.log('노예 총', Math.round(slaves), '노예 인물', w.chars.filter(c => c.died < 0 && c.role === '노예').length);
console.log('탑', w.towers.map(t => `${t.name} 높이${Math.round(t.progress)} 체력${Math.round(t.hp)} ${t.alive ? '' : '무너짐'}${t.demon ? ' 마왕탑' : ''}`).join(' / ') || '없음');
console.log('하늘 정착지', w.settlements.filter(s => s.alive && s.l === 1).length, '살아있는 인물', w.chars.filter(c => c.died < 0).length);
const pick = (re: RegExp, n = 6) => w.news.filter(x => re.test(x.text)).slice(-n).forEach(x => console.log(' ', dateStr(w, x.t), x.text));
console.log('-- 탑/노예/병/천사/고대용 소식');
pick(/탑|바벨/, 8); pick(/노예/, 5); pick(/대역병|잦아들|사라졌다/, 4); pick(/소임|자리를 이었|다시 오지 않는다/, 4); pick(/고대 용/, 5);
