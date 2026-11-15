const { runChecks } = require('./helpers');
const fs = require('fs');
const path = require('path');

const d = require('../src/labView').buildLabHtml('en');
runChecks([
  [/default-src 'none'; connect-src 'none'; style-src 'nonce-[^']+'; script-src 'nonce-[^']+'/.test(d) && !d.includes('unsafe-inline') && !d.includes('https://'), 'lab view: strict CSP with a nonce, no unsafe-inline, no external URLs'],
  [!/ style="/.test(d) && !d.includes("style: '"), 'no inline style attributes, which a nonce CSP blocks'],
  [d.includes('Inputs') && d.includes('Transformations') && d.includes('+ Add a transformation'), 'lab view labels'],
  [['Filter', 'Sort', 'Remove duplicates', 'Reverse', 'Merge', 'Compare', 'Append', 'Select columns', 'Remove columns', 'Flatten', 'Change column', 'Add field', 'Skip', 'Take'].every((x) => d.includes('"' + x + '"')), 'list steps named as in the README'],
  [['First', 'Last', 'Element at index', 'Count', 'Sum', 'Minimum', 'Maximum', 'Average'].every((x) => d.includes('"' + x + '"')), 'list endings named as in the README'],
  [['Select fields', 'Remove fields', 'Change field', 'Get field', 'Convert to list'].every((x) => d.includes('"' + x + '"')), 'object steps named as in the README'],
  [d.includes("type: 'doc'") && d.includes("type: 'pickFile'") && d.includes("type: 'openOutput'") && d.includes("type: 'openAsFlow'") && d.includes("type: 'ready'"), 'lab view host protocol'],
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
  [!/writeFile\([^)]*workspace/i.test(host) && !host.includes('workspaceFolders[0].uri, '), 'nothing written outside the labs folder']
]);
