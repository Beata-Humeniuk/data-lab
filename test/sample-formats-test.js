const { runChecks } = require('./helpers');
const { parseSample, valueFields } = require('../src/sampleFormats');

const json = parseSample('{"order":{"id":"O-1"}}');
const xml = parseSample('<Order id="7"><Line><Sku>A</Sku></Line><Line><Sku>B</Sku></Line></Order>');
const soap = parseSample('<s:Envelope xmlns:s="x"><s:Body><GetResp><Name>Ala</Name></GetResp></s:Body></s:Envelope>');
const yaml = parseSample('order:\n  id: O-1\n  placed: 2026-11-05\n  items:\n    - sku: A\n      qty: 2\n    - sku: B\n      qty: 1\n');
const csv = parseSample('sku;qty;price.net\nA;2;10,50\n"B; extra";1;4');
const tsv = parseSample('id\tname\n1\tAla\n2\tOla');
const props = parseSample('# account\naccount.id=77\naccount.channel=WWW\nlimit = 500');
const query = parseSample('?customerId=77&channel=WWW&note=two+words');
const flowYaml = parseSample('{a: 1, b: [x, y]}');
const bad = parseSample('{"a": 1,,}');
const words = parseSample('just some words');
const forced = parseSample('a,b\n1,2', 'kv');

runChecks([
  [json.ok && json.format === 'json' && json.value.order.id === 'O-1', 'JSON'],
  [xml.ok && xml.format === 'xml' && xml.value.Order['@id'] === '7' && xml.value.Order.Line.length === 2, 'XML: attributes, repeated elements'],
  [soap.ok && soap.value.GetResp.Name === 'Ala', 'SOAP envelope read from its message'],
  [yaml.ok && yaml.format === 'yaml' && yaml.value.order.items[1].sku === 'B' && yaml.value.order.placed === '2026-11-05', 'YAML: nesting, lists, a date kept as written'],
  [csv.ok && csv.format === 'csv' && csv.value.length === 2 && csv.value[1].sku === 'B; extra' && csv.value[0].price.net === '10,50', 'CSV: header, quotes, dotted column nested'],
  [tsv.ok && tsv.format === 'csv' && tsv.value[1].name === 'Ola', 'TSV'],
  [props.ok && props.format === 'kv' && props.value.account.id === '77' && props.value.limit === '500', 'key=value lines (.properties): comments skipped, dotted keys nested'],
  [query.ok && query.format === 'kv' && query.value.note === 'two words' && query.value.channel === 'WWW', 'query string'],
  [flowYaml.ok && flowYaml.format === 'yaml' && flowYaml.value.b[1] === 'y', 'a YAML flow mapping that is no JSON'],
  [!bad.ok && bad.error === 'json', 'broken JSON is said as JSON'],
  [!words.ok && words.error === 'unknown', 'plain words are no sample'],
  [!forced.ok && forced.error === 'kv', 'a chosen format is not second-guessed'],
  [JSON.stringify(valueFields(yaml.value).map((f) => f.path + ':' + f.max)) === '["order.id:1","order.placed:1","order.items.sku:*","order.items.qty:*"]', 'fields of a sample, lists marked']
]);
