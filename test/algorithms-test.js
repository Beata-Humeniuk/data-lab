const { runChecks } = require('./helpers');
const { normalizeAlgorithm, linkedSteps, editedAlgorithms } = require('../src/algorithms');
const { runDocument } = require('../src/dataPipeline');

const steps = [{ kind: 'filter', conditions: [{ field: 'status', op: 'eq', value: 'paid', valueKind: 'const' }] }, { kind: 'count' }];
const algorithms = { paid: { name: 'Paid count', steps } };
const lab = { inputs: [
  { name: 'shopA', text: 'id;status\n1;paid\n2;new\n3;paid' },
  { name: 'shopB', text: '[{"id":7,"status":"paid"},{"id":8,"status":"new"}]' }
], pipelines: [
  { name: 'a', source: 'shopA', algorithm: 'paid', steps: [] },
  { name: 'b', source: 'shopB', algorithm: 'paid', steps: [{ kind: 'old' }] },
  { name: 'own', source: 'shopB', steps: [{ kind: 'count' }] }
] };
const changed = linkedSteps(lab, algorithms);
const r = runDocument(lab, {});
const q = (n) => r.pipelines.find((x) => x.name === n);

runChecks([
  [normalizeAlgorithm(null, 'x').name === 'x' && Array.isArray(normalizeAlgorithm({ steps: 'no' }).steps), 'an algorithm file read safely: a name and a list of steps'],
  [changed && JSON.stringify(lab.pipelines[0].steps) === JSON.stringify(steps) && JSON.stringify(lab.pipelines[1].steps) === JSON.stringify(steps), 'transformations that use an algorithm take its steps'],
  [lab.pipelines[0].steps !== steps && lab.pipelines[0].steps !== lab.pipelines[1].steps, 'each takes its own copy'],
  [JSON.stringify(lab.pipelines[2].steps) === '[{"kind":"count"}]', 'a transformation of its own is left as it is'],
  [q('a').result === 2 && q('b').result === 1, 'one algorithm, run on different data'],
  [!linkedSteps(lab, algorithms), 'nothing to change once in step'],
  [Object.keys(editedAlgorithms(lab, algorithms)).length === 0, 'no edit, nothing to save']
]);

lab.pipelines[1].steps[0].conditions[0].value = 'new';
const edited = editedAlgorithms(lab, algorithms);
runChecks([
  [Object.keys(edited).join() === 'paid' && edited.paid[0].conditions[0].value === 'new', 'a step changed in one transformation changes the algorithm'],
  [(() => { algorithms.paid.steps = edited.paid; return linkedSteps(lab, algorithms) && lab.pipelines[0].steps[0].conditions[0].value === 'new'; })(), 'and every other transformation that uses it'],
  [linkedSteps({ pipelines: [{ algorithm: 'gone', steps: [{ kind: 'count' }] }] }, algorithms) === false, 'an algorithm no longer there: the steps stay as a copy']
]);
