const { runChecks } = require('./helpers');
const { algorithmMd } = require('../src/algorithmMd');
const { runDocument, changeCatalog } = require('../src/dataPipeline');
const { forLanguage } = require('../src/nls');

const doc = { inputs: [{ name: 'orders', text: '[{"nr":"A","status":"paid","cust":"K1","total":"10"},{"nr":"B","status":"new","cust":"K2","total":"5"}]' }, { name: 'clients', text: 'id;name\nK1;Ala\nK2;Ola' }],
  pipelines: [{ name: 'report', source: 'orders', steps: [
    { kind: 'filter', conditions: [{ field: 'status', op: 'eq', value: 'paid', valueKind: 'const' }, { field: 'total', op: 'gte', value: '5', valueKind: 'const' }] },
    { kind: 'merge', other: 'clients', keep: 'matched', keys: [{ a: 'cust', b: 'id' }], fields: ['name'] },
    { kind: 'change', field: 'name', how: { kind: 'upper' } },
    { kind: 'columns', columns: [{ from: 'nr', as: 'orderNumber' }, { from: 'name', as: 'client.name' }] }
  ] }] };
const run = runDocument(doc, {}).pipelines[0];
const md = algorithmMd({ title: 'Paid orders', pipeline: doc.pipelines[0], run, catalog: changeCatalog(forLanguage('en').t) });

runChecks([
  [md.startsWith('# Paid orders\n') && md.includes('## Input') && md.includes('- `orders`: a list') && md.includes('- `clients`'), 'the title, what it reads'],
  [md.includes('1. Keep the elements where `status` = `paid` and `total` ≥ `5`'), 'a filter in one line, comparisons as symbols'],
  [md.includes('2. Merge with `clients` where `cust` = `id`; only the matched elements; fields taken: `name`'), 'a merge'],
  [/3\. Change `name`: \S/.test(md), 'a change with its transformation'],
  [md.includes('| orderNumber | nr |') && md.includes('| client.name | name |'), 'output fields as a table: output name, from'],
  [md.includes('## Output') && md.includes('| orderNumber |') && md.includes('| client.name |'), 'the fields the result has'],
  [!/\b(we|our|us)\b/i.test(md) && !/[\u{1F300}-\u{1FAFF}✅❌]/u.test(md), 'impersonal, no icons'],
  [JSON.stringify(run.result) === '[{"orderNumber":"A","client":{"name":"ALA"}}]', 'a dot in an output field makes a nested field']
]);
