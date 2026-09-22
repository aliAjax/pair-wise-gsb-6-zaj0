import {validatePack} from '../src/merge/validation';
import {applyPlan, buildPlan, hasPendingChanges, withResolution} from '../src/merge/merge';
import type {Pair} from '../src/merge/types';

declare const process: {exit(code?: number): void};

const local: Pair[] = [
  {id: 1, title: 'Same', heading: 'Local H', body: 'Local B', category: 'X', favorite: false, headingFont: 'Fraunces', bodyFont: 'DM Sans', size: 46, weight: 600, leading: 1.25, tracking: 0},
  {id: 2, title: 'Twin', heading: 'H', body: 'B', category: 'X', favorite: true, headingFont: 'Fraunces', bodyFont: 'DM Sans', size: 46, weight: 600, leading: 1.25, tracking: 0},
];

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);};

// 1. 坏 JSON
check('invalid json rejected', validatePack('{bad').ok === false);
// 2. 缺 body
const bad = validatePack(JSON.stringify({items: [{title: 'a', heading: 'h'}]}));
check('missing body is error', !bad.ok && bad.rows[0].issues.some(i => i.level === 'error'));
// 3. 缺字体给警告但通过
const warned = validatePack(JSON.stringify({items: [{title: 'a', heading: 'h', body: 'b', favorite: 1}]}));
check('missing font warns but ok', warned.ok && warned.rows[0].issues.some(i => i.level === 'warning' && i.message.includes('字体')));
check('favorite non-boolean warns', warned.rows[0].issues.some(i => i.message.includes('收藏')));
// 4. 空数组拒绝
check('empty pack rejected', !validatePack([]).ok);

const pack = [
  {title: 'Same', heading: 'Local H', body: 'Different body', favorite: false, headingFont: 'Newsreader', bodyFont: 'DM Sans'},
  {title: 'Twin', heading: 'H', body: 'B', favorite: true, headingFont: 'Fraunces', bodyFont: 'DM Sans'},
  {title: 'New Kid', heading: 'Hi', body: 'There', favorite: true, headingFont: 'Fraunces', bodyFont: 'DM Sans'},
];
const rep = validatePack(JSON.stringify({typePairerPack: 1, items: pack}));
check('valid pack ok', rep.ok && rep.items.length === 3);

const plan = buildPlan(local, rep.items);
check('plan counts 1 add / 1 conflict / 1 identical', plan.adds === 1 && plan.conflicts === 1 && plan.identical === 1);
check('conflict defaults to local', plan.rows.find(r => r.kind === 'conflict')!.resolution === 'local');
check('diffs flag body+headingFont only', JSON.stringify(plan.rows.find(r => r.kind === 'conflict')!.diffs) === JSON.stringify({heading: false, headingFont: true, bodyFont: false, body: true, favorite: false}));

// 默认全 local：冲突不动本地
let res = applyPlan(local, plan, 100);
check('default keeps local record intact', res.result.added === 1 && res.result.updated === 0 && res.result.unchanged === 2);
check('favorite count adds the new favorite', res.result.favoritesAfter === 2);
check('new item appended with imported category', res.pairs.find(p => p.title === 'New Kid')!.category === 'Imported');
check('local conflict record untouched', res.pairs.find(p => p.title === 'Same')!.body === 'Local B');
check('next id advanced', res.nextId === 101);

// 切 incoming 后覆盖
const plan2 = withResolution(plan, plan.rows.find(r => r.kind === 'conflict')!.key, 'incoming');
res = applyPlan(local, plan2, 100);
check('incoming overwrites body & font but keeps local typo size', (() => {
  const p = res.pairs.find(x => x.title === 'Same')!;
  return p.body === 'Different body' && p.headingFont === 'Newsreader' && p.size === 46;
})());
check('id preserved on overwrite', res.pairs.find(x => x.title === 'Same')!.id === 1);
check('snapshot is deep-separated input', JSON.stringify(local) === JSON.stringify([
  {id: 1, title: 'Same', heading: 'Local H', body: 'Local B', category: 'X', favorite: false, headingFont: 'Fraunces', bodyFont: 'DM Sans', size: 46, weight: 600, leading: 1.25, tracking: 0},
  {id: 2, title: 'Twin', heading: 'H', body: 'B', category: 'X', favorite: true, headingFont: 'Fraunces', bodyFont: 'DM Sans', size: 46, weight: 600, leading: 1.25, tracking: 0},
]));

// 包内同标题去重
const dup = validatePack(JSON.stringify({items: [
  {title: 'Dup', heading: 'a', body: 'b', favorite: false, headingFont: 'Fraunces', bodyFont: 'DM Sans'},
  {title: 'Dup', heading: 'c', body: 'd', favorite: false, headingFont: 'Fraunces', bodyFont: 'DM Sans'},
]}));
check('duplicate title warns', dup.ok && dup.rows[1].issues.some(i => i.message.includes('标题相同')));
const dupPlan = buildPlan(local, dup.items);
check('duplicate collapses to one add (last wins)', dupPlan.rows.filter(r => r.title === 'Dup').length === 1);

// 脏守卫
check('pending blocks merge', hasPendingChanges({typo: true}) === true && hasPendingChanges({typo: false}) === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
