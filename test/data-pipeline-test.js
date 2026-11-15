const { runChecks } = require('./helpers');
const { runDocument, sourcesOf, readInputs } = require('../src/dataPipeline');

const umowy = `<Umowy>
  <Umowa><nr>U1</nr><klient>K1</klient><typ>LEASING</typ><od>2026-01-10</od><opiekun>Ala</opiekun></Umowa>
  <Umowa><nr>U2</nr><klient>K2</klient><typ>LEASING</typ><od>2026-03-05</od><opiekun></opiekun></Umowa>
  <Umowa><nr>U3</nr><klient>K3</klient><typ>KREDYT</typ><od>2026-02-01</od><opiekun>Ola</opiekun></Umowa>
  <Umowa><nr>U4</nr><klient>K4</klient><typ>LEASING</typ><od>2026-02-20</od><opiekun>Ela</opiekun></Umowa>
  <Umowa><nr>U1</nr><klient>K1</klient><typ>LEASING</typ><od>2026-01-10</od><opiekun>Ala</opiekun></Umowa>
</Umowy>`;
const splaty = 'umowa;klient;kwota\nU4;K4;100\nU1;K9;50\nU1;K1;70';
const doc = {
  inputs: [{ name: 'umowy', text: umowy }, { name: 'splaty', text: splaty }],
  pipelines: [
    { name: 'wybrane', source: 'umowy.Umowa', steps: [
      { kind: 'filter', conditions: [{ field: 'opiekun', op: 'isSet' }, { field: 'typ', op: 'eq', value: 'LEASING', valueKind: 'const' }, { field: 'od', op: 'between', value: '2026-01-01', value2: '2026-03-31', valueKind: 'const', value2Kind: 'const' }] },
      { kind: 'distinct', field: 'nr' },
      { kind: 'compare', mode: 'in', other: 'splaty', keys: [{ a: 'nr', b: 'umowa' }, { a: 'klient', b: 'klient' }] },
      { kind: 'sort', field: 'od', desc: true },
      { kind: 'columns', columns: [{ from: 'nr' }, { from: 'od', as: 'data' }] },
      { kind: 'change', field: 'data', how: { kind: 'formatDateAs', pattern: 'dd.MM.yyyy' } }
    ] },
    { name: 'ile', source: 'wybrane', steps: [{ kind: 'count' }] },
    { name: 'ostatnia', source: 'umowy.Umowa', steps: [{ kind: 'last' }] },
    { name: 'druga', source: 'umowy.Umowa', steps: [{ kind: 'nth', n: '2' }] },
    { name: 'bez', source: 'umowy.Umowa', steps: [{ kind: 'compare', mode: 'notIn', other: 'splaty', keys: [{ a: 'nr', b: 'umowa' }] }, { kind: 'distinct', field: 'nr' }, { kind: 'count' }] },
    { name: 'zKwota', source: 'umowy.Umowa', steps: [{ kind: 'compare', mode: 'join', other: 'splaty', as: 'splata', keys: [{ a: 'nr', b: 'umowa' }, { a: 'klient', b: 'klient' }] }, { kind: 'sum', field: 'splata.kwota' }] }
  ]
};
const r = runDocument(doc, {});
const p = (n) => r.pipelines.find((x) => x.name === n);
const steps = p('wybrane').steps;

runChecks([
  [r.inputs.umowy.ok && r.inputs.umowy.format === 'xml' && r.inputs.splaty.format === 'csv', 'inputs read: XML and CSV'],
  [(() => { const src = sourcesOf(readInputs(doc.inputs).values, [], 0); const k = (x) => (src.find((y) => y.path === x) || {}).kind; return k('umowy') === 'object' && k('umowy.Umowa') === 'list' && k('splaty') === 'list' && k('umowy.Umowa.nr') === undefined; })(), 'sources: an input as an object, its lists'],
  [p('wybrane').sourceView.count === 5 && JSON.stringify(p('wybrane').sourceColumns) === '["nr","klient","typ","od","opiekun"]', 'the source shown as a table with its columns'],
  [steps[0].view.count === 3 && steps[1].view.count === 2 && steps[2].view.count === 2, 'each step its own result: filtered 3, without repeats 2, with a match 2'],
  [JSON.stringify(Object.keys(steps[4].view.data[0])) === '["nr","data"]' && JSON.stringify(p('wybrane').result) === '[{"nr":"U4","data":"20.02.2026"},{"nr":"U1","data":"10.01.2026"}]', 'sorted, columns picked and renamed, a column changed'],
  [p('ile').result === 2 && p('ile').steps[0].view.kind === 'value', 'another pipeline from a result, count'],
  [p('ostatnia').result.nr === 'U1' && p('druga').result.nr === 'U2', 'last, the element at a position'],
  [p('bez').result === 2 && p('zKwota').result === 240, 'without a match, with its match attached and summed']
]);

{
  const json = '{"klient":{"imie":"ala","nazwisko":"Nowak","urodzony":"1990-02-28","adres":{"miasto":"Gdańsk"}},"pozycje":[{"sku":"A","ilosc":"2"},{"sku":"B","ilosc":"3"}],"kanal":"www"}';
  const d = { inputs: [{ name: 'zam', text: json }, { name: 'stawki', text: 'vat=23' }], pipelines: [
    { name: 'osoba', source: 'zam.klient', steps: [
      { kind: 'change', field: 'imie', how: { kind: 'capitalize' } },
      { kind: 'add', name: 'pelne', from: 'column', column: 'nazwisko' },
      { kind: 'add', name: 'vat', from: 'input', path: 'stawki.vat' },
      { kind: 'add', name: 'zrodlo', from: 'const', value: 'CRM' },
      { kind: 'columns', columns: [{ from: 'imie' }, { from: 'pelne', as: 'nazwisko' }, { from: 'adres.miasto', as: 'miasto' }, { from: 'vat' }, { from: 'zrodlo' }] }
    ] },
    { name: 'kanal', source: 'zam.kanal', steps: [{ kind: 'change', how: { kind: 'upper' } }] },
    { name: 'sztuk', source: 'zam', steps: [{ kind: 'take', field: 'pozycje' }, { kind: 'change', field: 'ilosc', how: { kind: 'asNumber' } }, { kind: 'sum', field: 'ilosc' }] },
    { name: 'pierwsza', source: 'zam.pozycje', steps: [{ kind: 'first' }, { kind: 'columns', columns: [{ from: 'sku' }] }] },
    { name: 'zle', source: 'zam.klient', steps: [{ kind: 'sort', field: 'imie' }] }
  ] };
  const r2 = runDocument(d, {});
  const q = (n) => r2.pipelines.find((x) => x.name === n);
  const src = sourcesOf(readInputs(d.inputs).values, [], 0);
  runChecks([
    [src.some((x) => x.path === 'zam.klient' && x.kind === 'object') && src.some((x) => x.path === 'zam.klient.imie' && x.kind === 'value') && src.some((x) => x.path === 'zam.pozycje' && x.kind === 'list'), 'sources: objects, fields and lists'],
    [q('osoba').sourceKind === 'object' && JSON.stringify(q('osoba').result) === '{"imie":"Ala","nazwisko":"Nowak","miasto":"Gdańsk","vat":"23","zrodlo":"CRM"}', 'an object: field changed, fields added (from a field, another input, a constant), fields picked and renamed'],
    [q('kanal').result === 'WWW' && q('kanal').endKind === 'value', 'a single value changed'],
    [q('sztuk').result === 5, 'a list taken out of an object, a column changed, summed'],
    [JSON.stringify(q('pierwsza').result) === '{"sku":"A"}' && q('pierwsza').steps[1].kindBefore === 'object', 'after taking one element the object steps go on'],
    [q('zle').steps[0].error && q('zle').steps[0].error.code === 'stepNotFor', 'a list step on an object is said, not guessed']
  ]);
}

{
  const xml = '<Lista><Poz><kod>A</kod><typ>1</typ></Poz><Poz><kod>B</kod></Poz><Poz><kod>C</kod><typ>3</typ></Poz><Poz><kod>D</kod><typ></typ></Poz></Lista>';
  const d = { inputs: [{ name: 'l', text: xml }], pipelines: [
    { name: 'zTypem', source: 'l.Poz', steps: [{ kind: 'filter', conditions: [{ field: 'typ', op: 'ne', value: 'null', valueKind: 'const' }] }] },
    { name: 'bezTypu', source: 'l.Poz', steps: [{ kind: 'filter', conditions: [{ field: 'typ', op: 'eq', value: 'null', valueKind: 'const' }] }] },
    { name: 'ustawiony', source: 'l.Poz', steps: [{ kind: 'filter', conditions: [{ field: 'typ', op: 'isSet' }] }, { kind: 'count' }] },
    { name: 'trzy', source: 'l.Poz', steps: [{ kind: 'filter', conditions: [{ field: 'typ', op: 'eq', value: '3', valueKind: 'const' }] }] },
    { name: 'sort', source: 'l.Poz', steps: [{ kind: 'sort', field: 'typ', desc: true }] }
  ] };
  const r3 = runDocument(d, {});
  const q = (n) => r3.pipelines.find((x) => x.name === n);
  const codes = (n) => (q(n).result || []).map((x) => x.kod).join(',');
  runChecks([
    [!q('zTypem').steps[0].error && codes('zTypem') === 'A,C', '≠ null: the elements with a value (a missing field and an empty one have none)'],
    [codes('bezTypu') === 'B,D' && q('ustawiony').result === 2, '= null and „has a value"'],
    [codes('trzy') === 'C', '= a value: elements without the field are simply not equal'],
    [!q('sort').steps[0].error && q('sort').result.length === 4, 'sorted by a field some elements lack']
  ]);
}

{
  const d = { inputs: [{ name: 'l', text: '[{"a":""},{"a":"x"}]' }], pipelines: [
    { name: 'w', source: 'l', steps: [{ kind: 'change', field: 'a', how: { kind: 'ifEmpty', value: 'brak' } }] }] };
  const r4 = runDocument(d, {});
  runChecks([[JSON.stringify(r4.pipelines[0].result) === '[{"a":"brak"},{"a":"x"}]', 'when empty → a word: the word']]);
}

{
  const d = { inputs: [
    { name: 'umowy', text: '<U><Umowa><nr>1</nr><kl>A</kl><typ>L</typ></Umowa><Umowa><nr>2</nr><kl>B</kl><typ>K</typ></Umowa><Umowa><nr>3</nr><kl>C</kl><typ>L</typ></Umowa></U>' },
    { name: 'splaty', text: 'umowa;klient;kwota;typ\n1;A;10;X\n2;Z;20;Y\n3;C;30;Z' },
    { name: 'nowe', text: '[{"nr":"9","kl":"N"}]' }], pipelines: [
    { name: 'pasujace', source: 'umowy.Umowa', steps: [{ kind: 'merge', other: 'splaty', keys: [{ a: 'nr', b: 'umowa' }, { a: 'kl', b: 'klient' }] }] },
    { name: 'wszystkie', source: 'umowy.Umowa', steps: [{ kind: 'merge', other: 'splaty', keep: 'all', fields: ['kwota'], keys: [{ a: 'nr', b: 'umowa' }, { a: 'kl', b: 'klient' }] }] },
    { name: 'razem', source: 'umowy.Umowa', steps: [{ kind: 'append', other: 'nowe' }, { kind: 'count' }] }
  ] };
  const r5 = runDocument(d, {});
  const q = (n) => r5.pipelines.find((x) => x.name === n).result;
  runChecks([
    [JSON.stringify(q('pasujace')) === '[{"nr":"1","kl":"A","typ":"L","kwota":"10","typ_splaty":"X"},{"nr":"3","kl":"C","typ":"L","kwota":"30","typ_splaty":"Z"}]', 'merged by two fields: the matched elements with the other\'s fields, a clash named after the other list'],
    [JSON.stringify(q('wszystkie').map((x) => x.nr + ':' + x.kwota)) === '["1:10","2:null","3:30"]', 'merged keeping all elements, picked fields only'],
    [q('razem') === 4, 'a list appended to another']
  ]);
}

{
  const d = { inputs: [
    { name: 'kl', text: '{"klient":{"id":"K1","imie":"ala","nazwisko":"Nowak","adres":{"miasto":"Gdańsk"}},"kanal":"www"}' },
    { name: 'zgody', text: '{"marketing":true,"id":"Z9"}' },
    { name: 'oceny', text: 'klient;ocena\nK2;B\nK1;A' },
    { name: 'poz', text: 'nr;cena;ilosc;rabat\n1;10;3;\n2;5;2;1' }
  ], pipelines: [
    { name: 'zObiektem', source: 'kl.klient', steps: [{ kind: 'merge', other: 'zgody' }] },
    { name: 'zLista', source: 'kl.klient', steps: [{ kind: 'merge', other: 'oceny', keys: [{ a: 'id', b: 'klient' }] }] },
    { name: 'listaZObiektem', source: 'oceny', steps: [{ kind: 'merge', other: 'kl.klient.adres' }] },
    { name: 'bezPol', source: 'kl.klient', steps: [{ kind: 'drop', fields: ['nazwisko', 'adres.miasto'] }] },
    { name: 'listaBez', source: 'poz', steps: [{ kind: 'drop', fields: ['rabat'] }] },
    { name: 'nowe', source: 'kl.klient', steps: [
      { kind: 'add', name: 'pelne', from: 'parts', parts: [{ kind: 'field', value: 'imie' }, { kind: 'text', value: ' ' }, { kind: 'field', value: 'nazwisko' }] },
      { kind: 'add', name: 'duze', from: 'calc', column: 'imie', how: { kind: 'upper', then: [{ kind: 'prefix', text: '>' }] } },
      { kind: 'add', name: 'kanal', from: 'input', path: 'kl.kanal' },
      { kind: 'add', name: 'opis', from: 'expr', expr: 'nazwisko + " z " + adres.miasto + " / " + kl.kanal' }
    ] },
    { name: 'wartosc', source: 'poz', steps: [{ kind: 'add', name: 'razem', from: 'expr', expr: 'cena * ilosc - coalesce(rabat, 0)' }] },
    { name: 'pusty', source: 'poz', steps: [{ kind: 'add', name: 'razem', from: 'expr', expr: 'cena * ilosc - rabat' }] },
    { name: 'literowka', source: 'poz', steps: [{ kind: 'add', name: 'x', from: 'expr', expr: 'cenaa * 2' }] }
  ] };
  const r4 = runDocument(d, {});
  const q = (n) => r4.pipelines.find((x) => x.name === n);
  const res = (n) => q(n).result;
  runChecks([
    [res('zObiektem').marketing === true && res('zObiektem').id === 'K1' && res('zObiektem').id_zgody === 'Z9', 'an object merged with an object: its fields in, a clash as <field>_<other>'],
    [res('zLista').ocena === 'A' && !('klient' in res('zLista')), 'an object merged with the matching element of a list'],
    [res('listaZObiektem').length === 2 && res('listaZObiektem').every((x) => x.miasto === 'Gdańsk'), 'a list merged with an object: its fields in every element'],
    [!('nazwisko' in res('bezPol')) && !('adres' in res('bezPol')) && res('bezPol').imie === 'ala', 'fields removed from an object, nested too; the emptied object goes with them'],
    [res('listaBez').every((x) => !('rabat' in x) && 'cena' in x), 'a field removed from every element'],
    [res('nowe').pelne === 'ala Nowak' && res('nowe').duze === '>ALA' && res('nowe').kanal === 'www' && res('nowe').opis === 'Nowak z Gdańsk / www', 'a new field: put together, worked out (chained), from elsewhere, an expression'],
    [!q('wartosc').steps[0].error && String(res('wartosc')[1].razem) === '9', 'an expression over the fields of each element: ' + JSON.stringify(res('wartosc'))],
    [String(res('wartosc')[0].razem) === '30', 'an empty field is no value: coalesce gives the default'],
    [q('pusty').steps[0].error && q('pusty').steps[0].error.code === 'notNumber', 'an empty field in arithmetic is said, not taken as 0'],
    [q('literowka').steps[0].error && q('literowka').steps[0].error.code === 'unknownName', 'a name no element has is an error']
  ]);
}

{
  const d = { inputs: [{ name: 'l', text: 'k;v\nA;1\nB;2\nC;3' }], pipelines: [
    { name: 'i0', source: 'l', steps: [{ kind: 'nth', index: '0' }] },
    { name: 'i2', source: 'l', steps: [{ kind: 'nth', index: '2' }] },
    { name: 'i9', source: 'l', steps: [{ kind: 'nth', index: '9' }] },
    { name: 'zle', source: 'l', steps: [{ kind: 'nth', index: '-1' }] }
  ] };
  const r5 = runDocument(d, {});
  const q = (n) => r5.pipelines.find((x) => x.name === n);
  runChecks([
    [q('i0').result.k === 'A' && q('i2').result.k === 'C', 'index 0 = the first element, 2 = the third'],
    [q('i9').result === null && !q('i9').steps[0].error, 'an index past the end: no element'],
    [q('zle').steps[0].error && q('zle').steps[0].error.code === 'notInteger', 'a negative index is said']
  ]);
}
