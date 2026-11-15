const { runChecks } = require('./helpers');
const fs = require('fs');
const path = require('path');

// The lab's view: inputs, transformations, a step's result under it.
const d = require('../src/labView').buildLabHtml('pl-PL');
const e = require('../src/labView').buildLabHtml();
runChecks([
  [d.includes("default-src 'none'") && !d.includes('https://') && !d.includes('${'), 'lab view: CSP, no external URLs, no leftovers'],
  [d.includes('Wejścia') && d.includes('Przekształcenia') && d.includes('+ Dodaj przekształcenie') && e.includes('+ Add a transformation'), 'lab view in both languages'],
  [d.includes('Filtruj') && d.includes('Porównaj z listą') && d.includes('Bez powtórzeń') && d.includes('Element o indeksie') && d.includes('Ostatni') && d.includes('Zmień kolumnę'), 'every step offered'],
  [d.includes('Połącz z listą') && d.includes('Dołącz elementy listy') && d.includes('tylko pasujące elementy') && d.includes('pola brane z drugich danych'), 'merge and append offered'],
  [d.includes('Połącz z obiektem / listą') && d.includes('Usuń pola') && d.includes('pole przekształcone') && d.includes('pola i teksty połączone') && d.includes('wyrażenie') && d.includes('+ kolejne przekształcenie'), 'objects merged, fields removed, a new field worked out'],
  [d.includes("class: 'inrow'") && d.includes('function renderOverlay()') && d.includes("class: 'open'") && d.includes("class: 'crumbs'"), 'inputs as names, opened in full; nested values opened as the next table'],
  [d.includes("type: 'doc'") && d.includes("type: 'pickFile'") && d.includes("type: 'openOutput'") && d.includes("type: 'openAsFlow'") && d.includes("type: 'ready'"), 'lab view host protocol']
]);

// The host: the command, the flow design handed to Logic Spec by id.
const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.js'), 'utf8');
const pkg = require('../package.json');
runChecks([
  [pkg.contributes.commands.some((c) => c.command === 'dataLab.open') && host.includes("registerCommand('dataLab.open'"), 'the command is contributed and registered'],
  [host.includes("executeCommand('logicSpec.openLabFlow'") && host.includes('getExtension(LOGIC_SPEC)'), 'the flow design opens in Logic Spec, when it is installed'],
  [host.includes("'scratch'") && host.includes("'dataLab.imported'"), 'Logic Spec scratchpads come over once'],
  [!/writeFile\([^)]*workspace/i.test(host) && !host.includes('workspaceFolders[0].uri, '), 'nothing written into the project']
]);
