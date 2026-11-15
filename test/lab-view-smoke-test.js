const { runChecks } = require('./helpers');
const fs = require('fs');
const path = require('path');

const d = require('../src/labView').buildLabHtml('en');
runChecks([
  [/default-src 'none'; connect-src 'none'; style-src 'nonce-[^']+'; script-src 'nonce-[^']+'/.test(d) && !d.includes('unsafe-inline') && !d.includes('https://'), 'lab view: strict CSP with a nonce, no unsafe-inline, no external URLs'],
  [!/ style="/.test(d) && !d.includes("style: '"), 'no inline style attributes, which a nonce CSP blocks'],
  [d.includes('Inputs') && d.includes('Transformations') && d.includes('+ Add a transformation'), 'lab view labels'],
  [['Filter', 'Sort', 'Remove duplicates', 'Reverse', 'Merge', 'Compare', 'Append', 'Output fields', 'Remove columns', 'Flatten', 'Change column', 'Add field', 'Skip', 'Take'].every((x) => d.includes('"' + x + '"')), 'list steps named as in the README'],
  [['First', 'Last', 'Element at index', 'Count', 'Sum', 'Minimum', 'Maximum', 'Average'].every((x) => d.includes('"' + x + '"')), 'list endings named as in the README'],
  [['Output fields', 'Remove fields', 'Change field', 'Get field', 'Convert to list'].every((x) => d.includes('"' + x + '"')), 'object steps named as in the README'],
  [d.includes("type: 'preview'") && d.includes("type: 'save'") && d.includes("type: 'exportMd'") && d.includes("type: 'pickFile'") && d.includes("type: 'openOutput'") && d.includes("type: 'openAsFlow'") && d.includes("type: 'saveAlgorithm'") && d.includes("type: 'ready'"), 'lab view host protocol'],
  [['"cond.op.eq"', '"cond.op.isSet"', '"cond.op.lenMax"'].every((x) => d.includes(x)), 'filter conditions have labels, not keys'],
  [d.includes('id="undoBtn"') && d.includes('id="redoBtn"') && d.includes('id="saveBtn"') && d.includes('id="dirty"'), 'undo, redo, save and the unsaved mark in the header'],
  [buildTwice(), 'a fresh nonce for every page']
]);
function buildTwice() {
  const nonceOf = (h) => (h.match(/nonce-([^']+)'/) || [])[1];
  return nonceOf(d) !== nonceOf(require('../src/labView').buildLabHtml('en'));
}

const host = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.js'), 'utf8');
const pkg = require('../package.json');
runChecks([
  [pkg.contributes.commands.some((c) => c.command === 'dataLab.open') && host.includes("registerCommand('dataLab.open'"), 'the command is contributed and registered'],
  [host.includes("executeCommand('logicSpec.openLabFlow'") && host.includes('getExtension(LOGIC_SPEC)'), 'the flow design opens in Logic Spec, when it is installed'],
  [!host.includes('path.dirname(context.globalStorageUri'), 'nothing read from the storage of another extension'],
  [host.includes('localResourceRoots: []'), 'the webview reads no local files'],
  [host.includes("getConfiguration('dataLab'") && host.includes('LAB_SUFFIX'), 'labs saved in the configured folder, one file each'],
  [['save', 'undo', 'redo'].every((x) => pkg.contributes.keybindings.some((k) => k.command === 'dataLab.' + x && /activeWebviewPanelId == 'dataLab'/.test(k.when))) && host.includes("registerCommand('dataLab.' + type"), 'Ctrl+S, Ctrl+Z and Ctrl+Shift+Z work in the lab view'],
  [host.includes("m.type === 'preview'") && /m\.type === 'preview'[\s\S]{0,120}keepDraft/.test(host) && !/m\.type === 'preview'[\s\S]{0,200}writeJson\(file/.test(host), 'a change is previewed and kept as a draft; only Save writes the lab'],
  [!/writeFile\([^)]*workspace/i.test(host) && !host.includes('workspaceFolders[0].uri, '), 'nothing written outside the labs folder']
]);
