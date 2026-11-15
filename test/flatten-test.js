const { runChecks } = require('./helpers');
const { runDocument, outputText, deepFields } = require('../src/dataPipeline');

const orders = `<Orders>
  <Order no="1"><customer>C1</customer><address><city>Gdansk</city><geo><lat>54.3</lat></geo></address><amount currency="PLN">10</amount><lines><line><sku>A</sku><qty>1</qty></line><line><sku>B</sku><qty>2</qty></line></lines></Order>
  <Order no="2"><customer>C2</customer><address><city>Warsaw</city><geo><lat>52.2</lat></geo></address><amount currency="EUR">5</amount><lines><line><sku>C</sku><qty>3</qty></line></lines></Order>
  <Order no="3"><customer>C3</customer><address><city>Lodz</city></address><amount>7</amount><lines/></Order>
</Orders>`;
const run = (steps, format) => {
  const r = runDocument({ inputs: [{ name: 'o', text: orders }], pipelines: [{ name: 'out', source: 'o.Order', steps }] }, {});
  const p = r.pipelines[0];
  return { p, result: p.result, error: p.steps.map((s) => s.error).find(Boolean), text: format ? outputText(p.result, format, 'out') : '' };
};

{
  const all = run([{ kind: 'flatten', field: '', names: 'parent' }]);
  const own = run([{ kind: 'flatten', field: '', names: 'own' }]);
  const a = all.result[0];
  runChecks([
    [!all.error && a.address_city === 'Gdansk' && a.address_geo_lat === '54.3' && a.amount === '10' && a.amount_currency === 'PLN' && a.no === '1', 'all nested objects flattened, names with the parent: ' + JSON.stringify(a)],
    [own.result[0].city === 'Gdansk' && own.result[0].lat === '54.3' && own.result[0].currency === 'PLN', 'own names: ' + JSON.stringify(own.result[0])],
    [all.result[2].amount === '7' && all.result[2].address_city === 'Lodz', 'an element without some nested fields is no error'],
    [Array.isArray(a.lines_line) && a.lines_line.length === 2, 'a list stays a list under "all nested objects"']
  ]);
}

{
  const one = run([{ kind: 'flatten', field: 'address', names: 'own' }]);
  runChecks([
    [one.result[0].city === 'Gdansk' && one.result[0].lat === '54.3' && !('address' in one.result[0]) && one.result[0].amount['#text'] === '10', 'one object flattened (with what is nested in it), the others kept'],
  ]);
}

{
  const rows = run([{ kind: 'flatten', field: 'lines.line', names: 'own' }]);
  const keep = run([{ kind: 'flatten', field: 'lines.line', names: 'own', keepEmpty: false }]);
  runChecks([
    [!rows.error && rows.result.length === 4, 'a list: one element per item (2 + 1), the element with an empty list kept: ' + rows.result.length],
    [rows.result[0].sku === 'A' && rows.result[1].sku === 'B' && rows.result[0].customer === 'C1' && rows.result[1].customer === 'C1' && rows.result[2].sku === 'C', 'each row carries the parent fields'],
    [rows.result[2].qty === '3' && !(rows.result[3].sku), 'the item fields, nothing for the empty list'],
    [keep.result.length === 3, 'without the elements whose list is empty']
  ]);
}

{
  const flatFirst = run([{ kind: 'flatten', field: 'lines.line', names: 'own' }, { kind: 'drop', fields: ['qty', 'address.geo'] }]);
  const nested = run([{ kind: 'drop', fields: ['lines.line.qty', 'address.geo.lat', 'amount.currency'] }]);
  const n0 = nested.result[0];
  runChecks([
    [!('qty' in flatFirst.result[0]) && flatFirst.result[0].address && !('geo' in flatFirst.result[0].address), 'columns removed after flattening'],
    [n0.lines.line.every((l) => !('qty' in l) && l.sku), 'a field removed from every element of a nested list'],
    [!('geo' in n0.address) && n0.address.city === 'Gdansk' && !('@currency' in n0.amount), 'a nested field and a nested attribute removed, the emptied object with them']
  ]);
}

{
  const fields = deepFields(run([]).result);
  const kind = (p) => (fields.find((f) => f.path === p) || {}).kind;
  const via = (p) => (fields.find((f) => f.path === p) || {}).viaList;
  runChecks([
    [kind('address') === 'object' && kind('lines.line') === 'list' && kind('lines.line.sku') === 'value' && kind('no') === 'value', 'every field, nested and in lists: ' + fields.map((f) => f.path).join(',')],
    [via('lines.line.sku') === true && via('address.city') === false, 'fields inside a list are marked']
  ]);
}

{
  const plain = run([]);
  const json = JSON.parse(plain.text || outputText(plain.result, 'json', 'out'));
  const csv = outputText(plain.result, 'csv', 'out').split('\n');
  const flat = run([{ kind: 'flatten', field: '', names: 'parent' }], 'csv');
  runChecks([
    [json[0].no === '1' && json[0].amount.currency === 'PLN' && json[0].amount.value === '10' && !('@no' in json[0]), 'JSON names as in the table: no "@", text of an element with attributes as value'],
    [csv[0] === 'no,customer,address.city,address.geo.lat,amount,amount.currency,lines.line' && csv[1].startsWith('1,C1,Gdansk,54.3,10,PLN,'), 'CSV: the table, nested objects as columns: ' + csv.slice(0, 2).join(' | ')],
    [flat.text.split('\n')[0].indexOf('address_city') >= 0, 'CSV after flattening'],
    [outputText(plain.result, 'xml', 'out').indexOf('no="1"') > 0, 'XML keeps attributes']
  ]);
}

{
  const r = runDocument({ inputs: [{ name: 'c', text: '{"customer":{"id":"C1","address":{"city":"Gdansk"},"tags":[{"t":"a"},{"t":"b"}]}}' }], pipelines: [
    { name: 'o', source: 'c.customer', steps: [{ kind: 'flatten', field: '', names: 'parent' }] },
    { name: 'l', source: 'c.customer', steps: [{ kind: 'flatten', field: 'tags', names: 'own' }] }
  ] }, {});
  const o = r.pipelines[0].result;
  const l = r.pipelines[1].result;
  runChecks([
    [o.address_city === 'Gdansk' && o.id === 'C1', 'an object flattened'],
    [Array.isArray(l) && l.length === 2 && l[1].t === 'b' && l[1].id === 'C1', 'an object with a list flattened into a list']
  ]);
}

{
  const json = '{"orders":[{"no":1,"customer":{"id":"C1","address":{"city":"Gdansk","geo":{"lat":54.3}}},"tags":["a","b"],"lines":[{"sku":"A","qty":1},{"sku":"B","qty":2}]},{"no":2,"customer":{"id":"C2","address":null},"tags":[],"lines":[]},{"no":3,"customer":{"id":"C3"},"lines":[{"sku":"C","qty":3,"extra":{"note":"x"}}]}]}';
  const go = (steps, format) => {
    const r = runDocument({ inputs: [{ name: 'd', text: json }], pipelines: [{ name: 'out', source: 'd.orders', steps }] }, {});
    const p = r.pipelines[0];
    return { result: p.result, error: p.steps.map((s) => s.error).find(Boolean), text: format ? outputText(p.result, format, 'out') : '' };
  };
  const all = go([{ kind: 'flatten', field: '', names: 'parent' }]);
  const lines = go([{ kind: 'flatten', field: 'lines', names: 'own' }]);
  const tags = go([{ kind: 'flatten', field: 'tags', names: 'own' }]);
  const drop = go([{ kind: 'drop', fields: ['lines.qty', 'customer.address.city', 'customer.address.geo'] }]);
  const csv = go([], 'csv').text.split('\n');
  runChecks([
    [!all.error && all.result[0].customer_address_geo_lat === 54.3 && all.result[0].no === 1, 'JSON: nested objects flattened, numbers kept'],
    [!('customer_address' in all.result[1]) && all.result[1].customer_id === 'C2', 'JSON: a null where other elements have an object leaves no column'],
    [lines.result.length === 4 && lines.result[1].sku === 'B' && lines.result[1].qty === 2 && lines.result[3].note === 'x' && !('lines' in lines.result[0]), 'JSON: an array of objects, one element per item'],
    [tags.result.length === 4 && tags.result[0].tags === 'a' && tags.result[1].tags === 'b', 'JSON: an array of values, one element per value (the empty one kept)'],
    [drop.result[0].lines.every((l) => !('qty' in l)) && !('address' in drop.result[0].customer) && drop.result[0].customer.id === 'C1', 'JSON: fields removed in an array and an object emptied by the removal is gone'],
    [csv[0] === 'no,customer.id,customer.address.city,customer.address.geo.lat,tags,lines' && csv[1].startsWith('1,C1,Gdansk,54.3,"a, b",') && csv[2] === '2,C2,,,,', 'JSON: CSV as the table: ' + csv.slice(0, 3).join(' | ')]
  ]);
}

{
  const yaml = 'orders:\n  - no: 1\n    customer:\n      id: C1\n      address:\n        city: Gdansk\n    lines:\n      - sku: A\n        qty: 1\n      - sku: B\n        qty: 2\n  - no: 2\n    customer:\n      id: C2\n    lines: []\n';
  const r = runDocument({ inputs: [{ name: 'y', text: yaml }], pipelines: [
    { name: 'a', source: 'y.orders', steps: [{ kind: 'flatten', field: 'lines', names: 'own' }] },
    { name: 'b', source: 'y.orders', steps: [{ kind: 'drop', fields: ['customer.address.city'] }] }
  ] }, {});
  const [a, b] = r.pipelines.map((p) => p.result);
  runChecks([
    [r.inputs.y.format === 'yaml' && a.length === 3 && a[1].sku === 'B' && a[2].no === 2, 'YAML: a nested list flattened'],
    [!('address' in b[0].customer), 'YAML: an object emptied by the removal is gone']
  ]);
}

{
  const csvIn = 'no;customer.id;customer.address.city;qty\n1;C1;Gdansk;1\n2;C2;;2\n';
  const r = runDocument({ inputs: [{ name: 'c', text: csvIn }], pipelines: [
    { name: 'a', source: 'c', steps: [{ kind: 'flatten', field: '', names: 'own' }] },
    { name: 'b', source: 'c', steps: [] }
  ] }, {});
  const [a, b] = r.pipelines.map((p) => p.result);
  runChecks([
    [r.inputs.c.format === 'csv' && a[0].city === 'Gdansk' && a[0].id === 'C1' && a[1].qty === '2', 'CSV: dotted columns are nested fields, flattened back'],
    [outputText(b, 'csv', 'b').split('\n')[0] === 'no,customer.id,customer.address.city,qty', 'CSV in, CSV out: the same columns']
  ]);
}

{
  const kv = 'orders[0].no=1\norders[0].customer.id=C1\norders[0].lines[0].sku=A\norders[0].lines[1].sku=B\norders[1].no=2\norders[1].customer.id=C2\n';
  const r = runDocument({ inputs: [{ name: 'k', text: kv, format: 'kv' }], pipelines: [{ name: 'a', source: 'k.orders', steps: [{ kind: 'flatten', field: 'lines', names: 'own' }, { kind: 'flatten', field: '', names: 'parent' }] }] }, {});
  const a = r.pipelines[0].result;
  runChecks([
    [a.length === 3 && a[0].sku === 'A' && a[0].customer_id === 'C1' && a[2].customer_id === 'C2', 'key=value: lists by index flattened, then the objects']
  ]);
}
