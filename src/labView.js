const { forLanguage } = require('./nls');
const { THEME_SCHEME_CSS } = require('./themeScheme');

// The lab's view (dataPipeline.js): inputs on the left, every list
// shown as a table; on the right the transformations — a list picked, then
// steps added with one button each, the result of every step right under
// it. Columns are always picked from a list made of the data.

function attrText(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function styles() {
  return String.raw`
:root{
  --bg: var(--vscode-editor-background, Canvas);
  --fg: var(--vscode-editor-foreground, CanvasText);
  --dim: var(--vscode-descriptionForeground, GrayText);
  --panel: var(--vscode-editorWidget-background, Canvas);
  --border: var(--vscode-panel-border, rgba(128,128,128,.35));
  --input: var(--vscode-input-background, Field);
  --input-fg: var(--vscode-input-foreground, FieldText);
  --focus: var(--vscode-focusBorder, #0078d4);
  --btn: var(--vscode-button-background, #0078d4);
  --btn-fg: var(--vscode-button-foreground, #ffffff);
  --btn2: var(--vscode-button-secondaryBackground, rgba(128,128,128,.18));
  --btn2-fg: var(--vscode-button-secondaryForeground, CanvasText);
  --hover: var(--vscode-list-hoverBackground, rgba(128,128,128,.12));
  --err: var(--vscode-editorError-foreground, #f14c4c);
  --ok: var(--vscode-charts-green, #89d185);
  --mono: var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace);
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:var(--vscode-font-family,system-ui,sans-serif);font-size:13px;line-height:1.45;color:var(--fg);background:var(--bg);display:flex;flex-direction:column;overflow:hidden}
.hidden{display:none !important}
.dim{color:var(--dim)}
input.mono{font-family:var(--mono)}
input,select,textarea{font-family:inherit;font-size:12.5px;background:var(--input);color:var(--input-fg);border:1px solid var(--border);border-radius:4px;padding:4px 7px;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--focus)}
textarea{font-family:var(--mono);font-size:12px;width:100%;min-height:120px;resize:vertical;display:block}
button{font-family:inherit;font-size:12.5px;cursor:pointer;border-radius:4px;padding:4px 10px;border:1px solid transparent}
.primary{background:var(--btn);color:var(--btn-fg)}
.secondary{background:var(--btn2);color:var(--btn2-fg)}
.link{background:transparent;color:var(--dim);border:1px solid var(--border)}
.link:hover{color:var(--fg);background:var(--hover)}
.x{background:transparent;color:var(--dim);border:none;font-size:14px;padding:2px 6px}
.x:hover{color:var(--err)}
header{flex:0 0 auto;border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
header .t{font-size:14px;font-weight:600}
header .grow{flex:1 1 auto}
#main{flex:1 1 auto;display:flex;min-height:0}
#inputs{flex:0 0 230px;border-right:1px solid var(--border);overflow-y:auto;padding:14px 10px 40px 14px}
.inrow{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:pointer;background:var(--panel)}
.inrow:hover{background:var(--hover)}
.inrow .nm{flex:1 1 auto;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.inrow .meta{font-size:11px;color:var(--dim);white-space:nowrap}
.inrow .meta.bad{color:var(--err)}
#ov{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:stretch;justify-content:center;padding:24px;z-index:10}
#ovPanel{background:var(--bg);border:1px solid var(--border);border-radius:8px;display:flex;flex-direction:column;width:100%;max-width:1500px;min-height:0;box-shadow:0 8px 30px rgba(0,0,0,.35)}
#ovHead{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap}
#ovBody{flex:1 1 auto;min-height:0;display:flex;gap:14px;padding:12px 14px;overflow:auto}
#ovBody .pane{flex:1 1 0;min-width:0;display:flex;flex-direction:column;min-height:0}
#ovBody textarea{flex:1 1 auto;min-height:300px}
#ovBody .tbl-wrap{max-height:none;flex:1 1 auto}
.crumbs{display:flex;gap:4px;align-items:center;flex-wrap:wrap;font-size:13px}
.crumbs button{background:transparent;border:none;color:var(--focus);padding:2px 4px}
.crumbs .cur{font-weight:600}
.open{background:transparent;border:1px solid var(--border);color:var(--focus);border-radius:4px;padding:0 6px;font-family:var(--mono);font-size:11px;cursor:pointer}
.open:hover{background:var(--hover)}
.checks{display:flex;gap:10px;flex-wrap:wrap}
.checks label{display:flex;gap:4px;align-items:center;font-size:12px}
#work{flex:1 1 auto;overflow-y:auto;padding:14px 18px 60px 18px;min-width:0}
@media (max-width: 900px){
  #main{flex-direction:column;overflow-y:auto}
  #inputs{flex:0 0 auto;border-right:none;border-bottom:1px solid var(--border);overflow:visible}
  #work{flex:0 0 auto;overflow:visible}
}
.cap{font-size:11px;letter-spacing:.06em;color:var(--dim);margin:2px 0 10px 0;text-transform:uppercase}
.card{border:1px solid var(--border);border-radius:7px;margin-bottom:14px;background:var(--panel)}
.card-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.card-body{padding:10px}
.state{font-size:11.5px;color:var(--dim)}
.state.bad{color:var(--err)}
.help{font-size:12.5px;color:var(--dim);line-height:1.7;border:1px dashed var(--border);border-radius:7px;padding:12px 14px;margin-bottom:14px}
.step{border-left:3px solid var(--focus);margin:12px 0 0 0;padding:8px 0 4px 12px}
.step-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.step-no{font-size:11px;color:var(--dim)}
.step-name{font-weight:600}
.row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0}
.lbl{font-size:12px;color:var(--dim)}
.tbl-wrap{overflow:auto;max-height:280px;border:1px solid var(--border);border-radius:5px;margin-top:6px}
table{border-collapse:collapse;font-size:12px;width:100%}
th{position:sticky;top:0;background:var(--panel);text-align:left;font-weight:600;padding:4px 8px;border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:3px 8px;border-bottom:1px solid var(--border);font-family:var(--mono);font-size:11.5px;white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis}
td.n,th.n{color:var(--dim);width:1%}
.count{font-size:11.5px;color:var(--dim);margin-top:4px}
.value{font-family:var(--mono);font-size:14px;padding:8px 10px;border:1px solid var(--border);border-radius:5px;margin-top:6px;display:inline-block;min-width:80px}
.err{color:var(--err);font-size:12px;margin-top:6px}
.adds{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:10px;border-top:1px dashed var(--border)}
.adds .lbl{margin-right:4px}
pre{font-family:var(--mono);font-size:12px;background:var(--input);border-radius:5px;padding:8px 10px;margin:6px 0 0 0;max-height:300px;overflow:auto}
`;
}

function bodyHtml(t) {
  return String.raw`
<header>
  <span class="t" id="title"></span>
  <span class="grow"></span>
  <button type="button" class="link" id="asFlow" title="${attrText(t('dv.asFlowTitle'))}">${t('dv.asFlow')}</button>
</header>
<div id="main">
  <section id="inputs"></section>
  <section id="work"></section>
</div>`;
}

function clientScript() {
  return String.raw`
const vscodeApi = acquireVsCodeApi();
function M(key, params) {
  let text = NLS[key] || key;
  if (params) for (const name in params) text = text.split('{' + name + '}').join(String(params[name]));
  return text;
}
const $ = (id) => document.getElementById(id);
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === 'text') n.textContent = attrs[k];
    else if (k === 'class') n.className = attrs[k];
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'value') n.value = attrs[k];
    else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(kids || [])) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}

let doc = { inputs: [], pipelines: [] };
let res = null;
let catalog = [];
let sendTimer = null;
function changed(now) {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => vscodeApi.postMessage({ type: 'doc', doc }), now ? 0 : 300);
}
function structural() { changed(true); render(); }

// A text field that keeps its focus across renders (data-key).
function text(key, value, onInput, ph, size) {
  const i = el('input', { type: 'text', 'data-key': key, placeholder: ph || '', value: value == null ? '' : String(value) });
  if (size) i.size = size;
  i.addEventListener('input', (e) => { onInput(e.target.value); changed(); });
  return i;
}
function pick(key, value, options, onChange, title) {
  const s = el('select', { 'data-key': key, title: title || null }, options.map((o) => el('option', { value: o[0], text: o[1] })));
  s.value = value == null ? '' : String(value);
  if (s.value !== String(value == null ? '' : value) && value) { s.appendChild(el('option', { value: value, text: value })); s.value = value; }
  s.addEventListener('change', (e) => onChange(e.target.value));
  return s;
}
// What can be picked as a source: lists, objects, fields — grouped.
function sourcePick(key, value, sources, onChange, only) {
  const s = el('select', { 'data-key': key });
  s.appendChild(el('option', { value: '', text: only === 'list' ? M('op.pickList') : M('dv.pickSource') }));
  for (const kind of ['list', 'object', 'value']) {
    if (only && (Array.isArray(only) ? only.indexOf(kind) < 0 : only !== kind)) continue;
    const items = sources.filter((x) => x.kind === kind);
    if (!items.length) continue;
    s.appendChild(el('optgroup', { label: M('dv.kind.' + kind) }, items.map((x) => el('option', { value: x.path,
      text: x.path.split('.').join(' › ') + (kind === 'list' && x.count !== null && x.count !== undefined ? ' (' + x.count + ')' : '') }))));
  }
  s.value = value || '';
  if (value && s.value !== value) { s.appendChild(el('option', { value, text: value })); s.value = value; }
  s.addEventListener('change', (e) => onChange(e.target.value));
  return s;
}
function columnPick(key, value, columns, onChange, emptyLabel) {
  const opts = [['', emptyLabel || M('dv.pickColumn')]].concat((columns || []).map((c) => [c, c === '' ? M('dv.wholeValue') : c]));
  return pick(key, value, opts, onChange);
}

// --- inputs: names; the input itself opened in full ----------------------
const FORMATS = [['auto', M('run.formatAuto')], ['json', 'JSON'], ['xml', 'XML'], ['yaml', 'YAML'], ['csv', 'CSV'], ['kv', 'key=value']];
let openInput = null;
let drill = null;
function sizeText(v) {
  if (!v) return '';
  if (v.kind === 'list') return M('dv.size.list', { count: v.count });
  if (v.kind === 'object') return M('dv.size.object', { count: v.count });
  return '';
}
function renderInputs() {
  const box = $('inputs');
  box.textContent = '';
  box.appendChild(el('div', { class: 'cap', text: M('dv.inputs') }));
  doc.inputs.forEach((inp, i) => {
    const st = res && res.inputs ? res.inputs[inp.name] : null;
    const data = res && res.inputData ? res.inputData[inp.name] : null;
    const meta = !st ? '' : st.ok ? FORMATS.find((f) => f[0] === st.format)[1] + (data ? ' · ' + sizeText(data) : '') : (st.error === 'empty' ? M('dv.empty') : M('run.sampleBad.' + st.error));
    box.appendChild(el('div', { class: 'inrow', title: M('dv.openInput'), onclick: () => { openInput = i; render(); } }, [
      el('span', { class: 'nm', text: inp.name || '?' }),
      el('span', { class: 'meta' + (st && !st.ok && st.error !== 'empty' ? ' bad' : ''), text: meta })
    ]));
  });
  box.appendChild(el('button', { class: 'secondary', text: M('dv.addInput'), onclick: () => {
    let n = doc.inputs.length + 1;
    while (doc.inputs.some((x) => x.name === 'dane' + n)) n++;
    doc.inputs.push({ name: 'dane' + n, text: '', format: 'auto' });
    openInput = doc.inputs.length - 1;
    structural();
  } }));
}
function overlay(head, body) {
  return el('div', { id: 'ov', onclick: (e) => { if (e.target.id === 'ov') closeOverlay(); } }, [
    el('div', { id: 'ovPanel' }, [el('div', { id: 'ovHead' }, head.concat([el('span', { style: 'flex:1 1 auto' }), el('button', { class: 'x', text: '✕', title: M('dv.close'), onclick: closeOverlay })])), el('div', { id: 'ovBody' }, body)])
  ]);
}
function closeOverlay() { openInput = null; drill = null; render(); }
function renderOverlay() {
  const old = $('ov');
  if (old) old.remove();
  if (drill && drill.length) {
    const crumbs = el('div', { class: 'crumbs' });
    drill.forEach((d, i) => {
      if (i) crumbs.appendChild(el('span', { class: 'dim', text: '›' }));
      crumbs.appendChild(i === drill.length - 1 ? el('span', { class: 'cur', text: d.label }) : el('button', { text: d.label, onclick: () => { drill = drill.slice(0, i + 1); render(); } }));
    });
    const last = drill[drill.length - 1];
    document.body.appendChild(overlay([crumbs], [el('div', { class: 'pane' }, [dataTable(last.value, drill)])]));
    return;
  }
  if (openInput === null || !doc.inputs[openInput]) return;
  const i = openInput;
  const inp = doc.inputs[i];
  const st = res && res.inputs ? res.inputs[inp.name] : null;
  const data = res && res.inputData ? res.inputData[inp.name] : null;
  const ta = el('textarea', { 'data-key': 'in' + i + '.text', spellcheck: 'false', placeholder: M('run.samplePh') });
  ta.value = inp.text || '';
  ta.addEventListener('input', (e) => { inp.text = e.target.value; changed(); });
  document.body.appendChild(overlay([
    text('in' + i + '.name', inp.name, (v) => { inp.name = v.replace(/[^\p{L}\p{N}_]/gu, ''); }, M('dv.inputName'), 16),
    pick('in' + i + '.fmt', inp.format || 'auto', FORMATS, (v) => { inp.format = v; structural(); }, M('fr.formatTitle')),
    el('span', { class: 'state' + (st && !st.ok && st.error !== 'empty' ? ' bad' : ''), text: !st ? '' : st.ok ? FORMATS.find((f) => f[0] === st.format)[1] : (st.error === 'empty' ? M('dv.empty') : M('run.sampleBad.' + st.error)) }),
    el('button', { class: 'link', text: M('run.load'), onclick: () => vscodeApi.postMessage({ type: 'pickFile', index: i }) }),
    el('button', { class: 'link', text: M('dv.removeInput'), onclick: () => { doc.inputs.splice(i, 1); openInput = null; structural(); } })
  ], [
    el('div', { class: 'pane' }, [el('div', { class: 'cap', text: M('dv.content') }), ta]),
    el('div', { class: 'pane' }, [el('div', { class: 'cap', text: M('dv.preview') }), data ? dataTable(data, [{ label: inp.name, value: data.kind === 'value' ? data.value : data.data }]) : el('div', { class: 'dim', text: M('dv.noPreview') })])
  ]));
}

// --- tables: the first level; what is nested opens on a click -------------
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function plain(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v);
}
// path: the crumbs to this table — [{label, value}]; a click on a nested
// value opens it as the next crumb.
function cellOf(v, path, label) {
  const td = el('td', {});
  const open = () => { drill = path.concat([{ label, value: v }]); render(); };
  if (Array.isArray(v)) {
    if (v.length && v.every((x) => !isObj(x) && !Array.isArray(x))) { td.textContent = v.map(plain).join(', '); td.title = td.textContent; return td; }
    td.appendChild(el('button', { class: 'open', text: '[' + v.length + ']', title: M('dv.openNested'), onclick: open }));
    return td;
  }
  if (isObj(v)) {
    td.appendChild(el('button', { class: 'open', text: '{…} ' + Object.keys(v).length, title: M('dv.openNested'), onclick: open }));
    return td;
  }
  td.textContent = plain(v);
  td.title = td.textContent;
  return td;
}
function keysOf(list) {
  const keys = [];
  for (const el2 of list.slice(0, 200)) if (isObj(el2)) for (const k of Object.keys(el2)) if (k !== '#text' && keys.indexOf(k) < 0) keys.push(k);
  return keys;
}
function dataTable(v, path) {
  path = path || [];
  if (!v) return null;
  const isView = v && typeof v === 'object' && (v.kind === 'list' || v.kind === 'object' || v.kind === 'value') && ('data' in v || 'text' in v);
  const value = isView ? (v.kind === 'value' ? v.value : v.data) : v;
  const count = isView ? v.count : (Array.isArray(value) ? value.length : null);
  if (!Array.isArray(value) && !isObj(value)) return el('div', { class: 'value', text: value === null || value === undefined || value === '' ? '—' : String(value) });
  let head, rows;
  if (Array.isArray(value)) {
    const keys = keysOf(value);
    const scalars = !keys.length;
    head = el('tr', {}, [el('th', { class: 'n', text: M('dv.col.index') })].concat(scalars ? [el('th', { text: M('dv.wholeValue') })] : keys.map((k) => el('th', { text: k.charAt(0) === '@' ? k.slice(1) : k }))));
    rows = value.map((x, n) => el('tr', {}, [el('td', { class: 'n', text: String(n) })].concat(
      scalars ? [cellOf(x, path, '[' + n + ']')] : keys.map((k) => cellOf(isObj(x) ? x[k] : undefined, path, (k.charAt(0) === '@' ? k.slice(1) : k) + ' [' + n + ']')))));
  } else {
    head = el('tr', {}, [el('th', { text: M('dv.col.field') }), el('th', { text: M('dv.col.value') })]);
    rows = Object.keys(value).filter((k) => k !== '#text').map((k) => el('tr', {}, [el('td', { text: k.charAt(0) === '@' ? k.slice(1) : k }), cellOf(value[k], path, k.charAt(0) === '@' ? k.slice(1) : k)]));
  }
  const shownRows = Array.isArray(value) ? value.length : null;
  return el('div', {}, [
    el('div', { class: 'tbl-wrap' }, [el('table', {}, [el('thead', {}, [head]), el('tbody', {}, rows)])]),
    el('div', { class: 'count', text: Array.isArray(value) ? M('dv.count', { count: count === null ? shownRows : count }) + (count > shownRows ? ' · ' + M('dv.shownFirst', { count: shownRows }) : '') : M('dv.size.object', { count: Object.keys(value).length }) })
  ]);
}
function table(v, label) { return dataTable(v, label ? [{ label, value: v.kind === 'value' ? v.value : v.data }] : []); }
function errorText(e) {
  if (!e) return '';
  if (e.code === 'afterValue') return M('dv.afterValue');
  if (e.code === 'afterError') return M('dv.afterError');
  if (e.code === 'stepNotFor') return M('dv.stepNotFor', { step: stepLabel(e.params.step, e.params.kind), kind: M('dv.kind.' + e.params.kind + '.one') });
  const k = 'fr.why.' + e.code;
  return NLS[k] ? M(k, e.params || {}) : M('run.err.' + e.code, e.params || {});
}

// --- steps --------------------------------------------------------------
const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'isSet', 'notSet', 'in', 'notIn', 'matches', 'lenMin', 'lenMax'];
const NO_VALUE = ['isSet', 'notSet'];
function stepForm(p, pi, s, si, cols, sources, colsOf, kindBefore) {
  const k = 'p' + pi + '.s' + si;
  const box = el('div', {});
  const row = (kids) => el('div', { class: 'row' }, kids);
  const lbl = (t) => el('span', { class: 'lbl', text: t });
  switch (s.kind) {
    case 'filter': {
      s.conditions = s.conditions || [];
      if (!s.conditions.length) s.conditions.push({ field: '', op: 'eq', value: '', valueKind: 'const' });
      s.conditions.forEach((c, ci) => {
        const kids = [
          ci === 0 ? lbl(M('dv.where')) : lbl(s.join === 'or' ? M('dv.or') : M('dv.and')),
          columnPick(k + '.c' + ci + '.f', c.field, cols, (v) => { c.field = v; structural(); }),
          pick(k + '.c' + ci + '.op', c.op || 'eq', OPS.map((o) => [o, M('cond.op.' + o)]), (v) => { c.op = v; structural(); })
        ];
        if (NO_VALUE.indexOf(c.op) < 0) kids.push(text(k + '.c' + ci + '.v', c.value, (v) => { c.value = v; c.valueKind = 'const'; }, c.op === 'in' || c.op === 'notIn' ? M('dv.valuesPh') : M('dv.valuePh'), 14));
        if (c.op === 'between') kids.push(lbl(M('dv.andValue')), text(k + '.c' + ci + '.v2', c.value2, (v) => { c.value2 = v; c.value2Kind = 'const'; }, M('dv.valuePh'), 14));
        if (s.conditions.length > 1) kids.push(el('button', { class: 'x', text: '✕', onclick: () => { s.conditions.splice(ci, 1); structural(); } }));
        box.appendChild(row(kids));
      });
      box.appendChild(row([
        el('button', { class: 'link', text: M('dv.addCondition'), onclick: () => { s.conditions.push({ field: '', op: 'eq', value: '', valueKind: 'const' }); structural(); } }),
        s.conditions.length > 1 ? pick(k + '.join', s.join === 'or' ? 'or' : 'and', [['and', M('dv.joinAnd')], ['or', M('dv.joinOr')]], (v) => { s.join = v; structural(); }) : null
      ]));
      break;
    }
    case 'sort':
      box.appendChild(row([lbl(M('dv.by')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); }),
        pick(k + '.o', s.desc ? 'desc' : 'asc', [['asc', M('how.o.asc')], ['desc', M('how.o.desc')]], (v) => { s.desc = v === 'desc'; structural(); })]));
      break;
    case 'distinct':
      box.appendChild(row([lbl(M('dv.by')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); }, M('dv.wholeElement'))]));
      break;
    case 'nth':
      if (s.index === undefined) s.index = String(Math.max(0, (parseInt(s.n, 10) || 1) - 1));
      box.appendChild(row([lbl(M('dv.col.index')), text(k + '.i', s.index, (v) => { s.index = v; }, '0', 4)]));
      break;
    case 'skip': case 'limit':
      box.appendChild(row([lbl(M('dv.n.' + s.kind)), text(k + '.n', s.n, (v) => { s.n = v; }, '1', 4)]));
      break;
    case 'sum': case 'min': case 'max': case 'avg':
      box.appendChild(row([lbl(M('dv.of')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); })]));
      break;
    case 'join':
      box.appendChild(row([lbl(M('dv.separator')), text(k + '.sep', s.sep === undefined ? ', ' : s.sep, (v) => { s.sep = v; }, ', ', 4)]));
      break;
    case 'append':
      box.appendChild(row([lbl(M('dv.appendFrom')), sourcePick(k + '.o', s.other || '', sources, (v) => { s.other = v; structural(); }, 'list')]));
      break;
    case 'merge': {
      s.keys = s.keys && s.keys.length ? s.keys : [{ a: '', b: '' }];
      const otherCols = colsOf(s.other);
      const otherSrc = sources.find((x) => x.path === s.other);
      const otherIsObject = !!otherSrc && otherSrc.kind === 'object';
      box.appendChild(row([
        lbl(M('dv.mergeWith')),
        sourcePick(k + '.o', s.other || '', sources, (v) => { s.other = v; s.fields = []; structural(); }, ['list', 'object']),
        kindBefore === 'list' && !otherIsObject ? pick(k + '.keep', s.keep === 'all' ? 'all' : 'matched', [['matched', M('dv.merge.matched')], ['all', M('dv.merge.all')]], (v) => { s.keep = v; structural(); }) : null
      ]));
      if (otherIsObject) box.appendChild(row([el('span', { class: 'dim', text: M(kindBefore === 'list' ? 'dv.merge.objectIntoEach' : 'dv.merge.objectInto') })]));
      if (!otherIsObject) s.keys.forEach((key, ki) => {
        box.appendChild(row([
          lbl(ki ? M('op.keyAnd') : M('op.keyWhere')),
          columnPick(k + '.k' + ki + '.a', key.a, cols, (v) => { key.a = v; structural(); }),
          lbl('='),
          columnPick(k + '.k' + ki + '.b', key.b, otherCols, (v) => { key.b = v; structural(); }, s.other ? M('dv.pickColumn') : M('dv.pickListFirst')),
          s.keys.length > 1 ? el('button', { class: 'x', text: '✕', onclick: () => { s.keys.splice(ki, 1); structural(); } }) : null
        ]));
      });
      if (!otherIsObject) box.appendChild(row([el('button', { class: 'link', text: M('op.keyAdd'), onclick: () => { s.keys.push({ a: '', b: '' }); structural(); } })]));
      const top = Array.from(new Set(otherCols.filter((c) => c).map((c) => c.split('.')[0]))).filter((c) => otherIsObject || !s.keys.some((x) => x.b === c));
      if (top.length) {
        s.fields = Array.isArray(s.fields) ? s.fields : [];
        const checks = el('div', { class: 'checks' }, top.map((c) => {
          const cb = el('input', { type: 'checkbox' });
          cb.checked = !s.fields.length || s.fields.indexOf(c) >= 0;
          cb.addEventListener('change', () => {
            const now = s.fields.length ? s.fields.slice() : top.slice();
            const at = now.indexOf(c);
            if (cb.checked && at < 0) now.push(c);
            if (!cb.checked && at >= 0) now.splice(at, 1);
            s.fields = now.length === top.length ? [] : now;
            structural();
          });
          return el('label', {}, [cb, c]);
        }));
        box.appendChild(row([lbl(M('dv.merge.fields')), checks]));
      }
      break;
    }
    case 'compare': {
      s.keys = s.keys && s.keys.length ? s.keys : [{ a: '', b: '' }];
      const otherCols = colsOf(s.other);
      box.appendChild(row([
        pick(k + '.m', s.mode || 'in', [['in', M('dv.cmp.in')], ['notIn', M('dv.cmp.notIn')], ['join', M('dv.cmp.join')]], (v) => { s.mode = v; structural(); }),
        sourcePick(k + '.o', s.other || '', sources, (v) => { s.other = v; structural(); }, 'list'),
        s.mode === 'join' ? lbl(M('op.joinAs')) : null,
        s.mode === 'join' ? text(k + '.as', s.as, (v) => { s.as = v; }, (s.other || '').split('.').pop() || M('op.joinAsPh'), 10) : null
      ]));
      s.keys.forEach((key, ki) => {
        box.appendChild(row([
          lbl(ki ? M('op.keyAnd') : M('op.keyWhere')),
          columnPick(k + '.k' + ki + '.a', key.a, cols, (v) => { key.a = v; structural(); }),
          lbl('='),
          columnPick(k + '.k' + ki + '.b', key.b, otherCols, (v) => { key.b = v; structural(); }, s.other ? M('dv.pickColumn') : M('dv.pickListFirst')),
          s.keys.length > 1 ? el('button', { class: 'x', text: '✕', onclick: () => { s.keys.splice(ki, 1); structural(); } }) : null
        ]));
      });
      box.appendChild(row([el('button', { class: 'link', text: M('op.keyAdd'), onclick: () => { s.keys.push({ a: '', b: '' }); structural(); } })]));
      break;
    }
    case 'columns': {
      s.columns = s.columns && s.columns.length ? s.columns : cols.filter((c) => c !== '').map((c) => ({ from: c, as: '' }));
      s.columns.forEach((c, ci) => {
        box.appendChild(row([
          columnPick(k + '.c' + ci, c.from, cols, (v) => { c.from = v; structural(); }),
          lbl(M('dv.as')), text(k + '.c' + ci + '.as', c.as, (v) => { c.as = v; }, (c.from || '').split('.').pop(), 12),
          el('button', { class: 'x', text: '✕', onclick: () => { s.columns.splice(ci, 1); structural(); } })
        ]));
      });
      box.appendChild(row([el('button', { class: 'link', text: M('dv.addColumn'), onclick: () => { s.columns.push({ from: '', as: '' }); structural(); } })]));
      break;
    }
    case 'drop': {
      s.fields = Array.isArray(s.fields) ? s.fields : [];
      const top = Array.from(new Set(cols.filter((c) => c).map((c) => c.split('.')[0])));
      const nested = s.fields.filter((f) => top.indexOf(f) < 0);
      const checks = el('div', { class: 'checks' }, top.concat(nested).map((c) => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = s.fields.indexOf(c) >= 0;
        cb.addEventListener('change', () => {
          const at = s.fields.indexOf(c);
          if (cb.checked && at < 0) s.fields.push(c);
          if (!cb.checked && at >= 0) s.fields.splice(at, 1);
          structural();
        });
        return el('label', {}, [cb, c]);
      }));
      box.appendChild(row([lbl(M('dv.drop.which')), checks]));
      const deep = cols.filter((c) => c.indexOf('.') > 0 && s.fields.indexOf(c) < 0);
      if (deep.length) box.appendChild(row([lbl(M('dv.drop.nested')), columnPick(k + '.deep', '', deep, (v) => { if (v) s.fields.push(v); structural(); }, M('dv.drop.pickNested'))]));
      break;
    }
    case 'change': {
      s.how = s.how || { kind: '' };
      const lead = kindBefore === 'value' ? [lbl(M('dv.value')), lbl('→')] : [lbl(M(kindBefore === 'object' ? 'dv.field' : 'dv.column')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); }), lbl('→')];
      howChain(box, k, s, cols, lead);
      if (kindBefore !== 'value') box.appendChild(row([lbl(M('dv.saveAs')), text(k + '.as', s.as, (v) => { s.as = v; }, s.field || M('dv.sameColumn'), 14)]));
      break;
    }
    case 'add': {
      const from = s.from || 'const';
      box.appendChild(row([lbl(M('dv.fieldName')), text(k + '.name', s.name, (v) => { s.name = v; }, M('dv.fieldNamePh'), 12), lbl('='),
        pick(k + '.from', from, [['const', M('dv.add.const')], ['column', M('dv.add.column')], ['calc', M('dv.add.calc')], ['parts', M('dv.add.parts')], ['input', M('dv.add.input')], ['expr', M('dv.add.expr')]], (v) => {
          s.from = v;
          if (v === 'parts' && !(s.parts && s.parts.length)) s.parts = [{ kind: 'field', value: '' }, { kind: 'text', value: ' ' }, { kind: 'field', value: '' }];
          if (v === 'calc') s.how = s.how || { kind: '' };
          structural();
        })]));
      if (from === 'const') box.appendChild(row([lbl(M('dv.valuePh')), text(k + '.v', s.value, (v) => { s.value = v; }, M('dv.valuePh'), 18)]));
      else if (from === 'column') box.appendChild(row([lbl(M(kindBefore === 'list' ? 'dv.column' : 'dv.field')), columnPick(k + '.c', s.column, cols, (v) => { s.column = v; structural(); })]));
      else if (from === 'input') box.appendChild(row([lbl(M('dv.add.from')), sourcePick(k + '.path', s.path, sources, (v) => { s.path = v; structural(); })]));
      else if (from === 'calc') {
        s.how = s.how || { kind: '' };
        howChain(box, k, s, cols, [lbl(M(kindBefore === 'list' ? 'dv.column' : 'dv.field')), columnPick(k + '.c', s.column, cols, (v) => { s.column = v; structural(); }), lbl('→')]);
      } else if (from === 'parts') {
        s.parts = s.parts || [];
        const line = el('div', { class: 'row' });
        s.parts.forEach((part, pi2) => {
          const pk = k + '.part' + pi2;
          line.appendChild(pick(pk + '.k', part.kind === 'field' ? 'field' : 'text', [['field', M('dv.part.field')], ['text', M('dv.part.text')]], (v) => { part.kind = v; part.value = ''; structural(); }));
          line.appendChild(part.kind === 'field' ? columnPick(pk + '.v', part.value, cols, (v) => { part.value = v; structural(); })
            : text(pk + '.v', part.value, (v) => { part.value = v; }, M('dv.part.textPh'), 6));
          line.appendChild(el('button', { class: 'x', text: '✕', onclick: () => { s.parts.splice(pi2, 1); structural(); } }));
          if (pi2 < s.parts.length - 1) line.appendChild(lbl('+'));
        });
        box.appendChild(line);
        box.appendChild(row([el('button', { class: 'link', text: M('dv.part.addField'), onclick: () => { s.parts.push({ kind: 'field', value: '' }); structural(); } }),
          el('button', { class: 'link', text: M('dv.part.addText'), onclick: () => { s.parts.push({ kind: 'text', value: '' }); structural(); } })]));
      } else {
        const t = text(k + '.expr', s.expr, (v) => { s.expr = v; }, 'cena * ilosc', 40);
        t.classList.add('mono');
        box.appendChild(row([lbl(M('dv.add.expr')), t]));
        box.appendChild(row([el('span', { class: 'dim', text: M('dv.exprHint') })]));
      }
      break;
    }
    case 'take':
      box.appendChild(row([lbl(M('dv.field')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); })]));
      break;
  }
  return box;
}

const LIST_STEPS = ['filter', 'sort', 'distinct', 'reverse', 'merge', 'compare', 'append', 'columns', 'drop', 'change', 'skip', 'limit'];
const OBJECT_STEPS = ['merge', 'columns', 'drop', 'change', 'add', 'take', 'asList'];
// The "+ ƒ" ways, one after another: each works on what the one before gave.
function howChain(box, k, s, cols, lead) {
  const row = (kids) => el('div', { class: 'row' }, kids);
  const lbl = (t) => el('span', { class: 'lbl', text: t });
  s.how = s.how || { kind: '' };
  const chain = [s.how].concat(Array.isArray(s.how.then) ? s.how.then : []);
  chain.forEach((h, hi) => {
    const hk = k + '.how' + (hi ? hi : '');
    const groups = {};
    catalog.forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
    const sel = el('select', { 'data-key': hk }, [el('option', { value: '', text: M('how.pick') })].concat(Object.keys(groups).map((g) =>
      el('optgroup', { label: g }, groups[g].map((c) => el('option', { value: c.kind, text: c.label }))))));
    sel.value = h.kind || '';
    sel.addEventListener('change', (e) => {
      const spec = catalog.find((c) => c.kind === e.target.value);
      const then = h.then;
      Object.keys(h).forEach((x) => { delete h[x]; });
      h.kind = e.target.value;
      if (hi === 0 && then) h.then = then;
      (spec ? spec.params : []).forEach((p) => { if (p.def !== undefined) h[p.key] = p.def; });
      structural();
    });
    const spec = catalog.find((c) => c.kind === h.kind);
    const params = spec ? [].concat(...spec.params.map((p) => [lbl(p.label),
      p.options ? pick(hk + '.p.' + p.key, h[p.key], p.options, (v) => { h[p.key] = v; structural(); })
        : p.type === 'column' ? columnPick(hk + '.p.' + p.key, h[p.key], cols, (v) => { h[p.key] = v; structural(); })
        : text(hk + '.p.' + p.key, h[p.key], (v) => { h[p.key] = v; }, p.def || '', p.size || 8)])) : [];
    const drop = hi ? [el('button', { class: 'x', text: '✕', onclick: () => { s.how.then.splice(hi - 1, 1); structural(); } })] : [];
    box.appendChild(row((hi ? [lbl(M('dv.thenHow'))] : lead).concat([sel], params, drop)));
  });
  if (s.how.kind) box.appendChild(row([el('button', { class: 'link', text: M('dv.addHow'), onclick: () => { (s.how.then = s.how.then || []).push({ kind: '' }); structural(); } })]));
}
// A step's name by what it works on: "Zmień kolumnę" on a list, "Zmień
// pole" on an object, "Zmień wartość" on one value.
function stepLabel(kind, on) {
  const k = 'dv.step.' + kind + '.' + on;
  return NLS[k] ? M(k) : M('dv.step.' + kind);
}
const VALUE_STEPS = ['first', 'last', 'nth', 'count', 'sum', 'min', 'max', 'avg', 'join'];
function newStep(kind) {
  if (kind === 'filter') return { kind, conditions: [{ field: '', op: 'eq', value: '', valueKind: 'const' }] };
  if (kind === 'compare') return { kind, mode: 'in', other: '', keys: [{ a: '', b: '' }] };
  if (kind === 'nth') return { kind, index: '0' };
  if (kind === 'limit' || kind === 'skip') return { kind, n: '1' };
  if (kind === 'add') return { kind, name: '', from: 'const', value: '' };
  if (kind === 'merge') return { kind, other: '', keep: 'matched', keys: [{ a: '', b: '' }], fields: [] };
  if (kind === 'append') return { kind, other: '' };
  if (kind === 'drop') return { kind, fields: [] };
  return { kind };
}

function renderWork() {
  const box = $('work');
  box.textContent = '';
  box.appendChild(el('div', { class: 'cap', text: M('dv.transforms') }));
  if (!doc.inputs.length || !doc.pipelines.length) box.appendChild(el('div', { class: 'help', text: M('dv.help') }));
  doc.pipelines.forEach((p, pi) => {
    const r = res && res.pipelines ? res.pipelines[pi] : null;
    const sources = r ? r.sources : [];
    const colsOf = (path) => (res && res.columnsOf ? res.columnsOf[path] || [] : []);
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('span', { class: 'lbl', text: M('dv.from') }),
      sourcePick('p' + pi + '.src', p.source || '', sources, (v) => { p.source = v; structural(); }),
      el('span', { class: 'lbl', text: M('dv.resultName') }),
      text('p' + pi + '.name', p.name, (v) => { p.name = v.replace(/[^\p{L}\p{N}_]/gu, ''); }, 'wynik' + (pi + 1), 12),
      el('span', { style: 'flex:1 1 auto' }),
      el('button', { class: 'x', text: '✕', title: M('dv.removeTransform'), onclick: () => { doc.pipelines.splice(pi, 1); structural(); } })
    ]));
    const body = el('div', { class: 'card-body' });
    if (!p.source) body.appendChild(el('div', { class: 'dim', text: sources.length ? M('dv.pickSource') : M('dv.noLists') }));
    else if (r && r.sourceView) body.appendChild(table(r.sourceView));
    let cols = r && r.sourceColumns ? r.sourceColumns : [];
    let kindNow = r && r.sourceKind ? r.sourceKind : 'list';
    (p.steps || []).forEach((s, si) => {
      const sr = r && r.steps ? r.steps[si] : null;
      if (sr && sr.columns) cols = sr.columns;
      if (sr && sr.kindBefore) kindNow = sr.kindBefore;
      const st = el('div', { class: 'step' });
      st.appendChild(el('div', { class: 'step-head' }, [
        el('span', { class: 'step-no', text: (si + 1) + '.' }),
        el('span', { class: 'step-name', text: stepLabel(s.kind, kindNow) }),
        el('span', { style: 'flex:1 1 auto' }),
        el('button', { class: 'x', text: '✕', title: M('dv.removeStep'), onclick: () => { p.steps.splice(si, 1); structural(); } })
      ]));
      st.appendChild(stepForm(p, pi, s, si, cols, sources, colsOf, kindNow));
      if (sr && sr.error) st.appendChild(el('div', { class: 'err', text: errorText(sr.error) }));
      else if (sr && sr.view) st.appendChild(table(sr.view));
      body.appendChild(st);
    });
    // The steps what is held now takes: a list, an object, one value.
    const endKind = r && r.endKind ? r.endKind : kindNow;
    const broken = r && r.steps && r.steps.some((x) => x.error);
    if (p.source && r && r.sourceView && !broken) {
      const adds = el('div', { class: 'adds' }, [el('span', { class: 'lbl', text: M('dv.addStep') + ' (' + M('dv.kind.' + endKind + '.one') + ')' })]);
      const button = (kind) => adds.appendChild(el('button', { class: 'secondary', text: stepLabel(kind, endKind), onclick: () => { (p.steps = p.steps || []).push(newStep(kind)); structural(); } }));
      if (endKind === 'list') {
        LIST_STEPS.concat(['add']).forEach(button);
        adds.appendChild(el('span', { class: 'lbl', text: '  ' + M('dv.takeOne') }));
        VALUE_STEPS.forEach(button);
      } else if (endKind === 'object') OBJECT_STEPS.forEach(button);
      else button('change');
      body.appendChild(adds);
    }
    if (r && r.text !== undefined && (p.steps || []).length) {
      body.appendChild(el('div', { class: 'row', style: 'margin-top:12px' }, [
        el('span', { class: 'lbl', text: M('dv.result') }),
        pick('p' + pi + '.fmt', doc.format || 'json', [['json', 'JSON'], ['xml', 'XML'], ['yaml', 'YAML'], ['properties', 'properties']], (v) => { doc.format = v; structural(); }),
        el('button', { class: 'link', text: M('run.openEditor'), onclick: () => vscodeApi.postMessage({ type: 'openOutput', text: r.text, format: doc.format || 'json' }) })
      ]));
      body.appendChild(el('pre', { text: r.text }));
    }
    card.appendChild(body);
    box.appendChild(card);
  });
  if (doc.inputs.length) box.appendChild(el('button', { class: 'primary', text: M('dv.addTransform'), onclick: () => { doc.pipelines.push({ name: '', source: '', steps: [] }); structural(); } }));
}

function render() {
  // Keep the field being typed in: its key, the caret.
  const a = document.activeElement;
  const key = a && a.getAttribute ? a.getAttribute('data-key') : null;
  const sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  const scrolls = [$('inputs').scrollTop, $('work').scrollTop];
  const ovBody = document.querySelector('#ovBody .tbl-wrap');
  const ovScroll = ovBody ? ovBody.scrollTop : 0;
  renderInputs();
  renderWork();
  renderOverlay();
  $('inputs').scrollTop = scrolls[0];
  $('work').scrollTop = scrolls[1];
  const ovAgain = document.querySelector('#ovBody .tbl-wrap');
  if (ovAgain) ovAgain.scrollTop = ovScroll;
  if (key) {
    const again = document.querySelector('[data-key="' + key.replace(/"/g, '\\"') + '"]');
    if (again) { again.focus(); if (sel && typeof again.setSelectionRange === 'function') try { again.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } }
  }
}

$('asFlow').addEventListener('click', () => vscodeApi.postMessage({ type: 'openAsFlow' }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (openInput !== null || drill)) { e.preventDefault(); closeOverlay(); } });
window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.type === 'load') { doc = m.doc || doc; catalog = m.catalog || []; $('title').textContent = m.title || ''; res = m.result || null; render(); }
  if (m.type === 'result') { res = m.result; render(); }
  if (m.type === 'fileLoaded') { if (doc.inputs[m.index]) { doc.inputs[m.index].text = m.text; structural(); } }
});
vscodeApi.postMessage({ type: 'ready' });
`;
}

function buildLabHtml(languageTag) {
  const catalog = forLanguage(languageTag);
  return [
    '<!DOCTYPE html><html lang="' + catalog.lang + '"><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">',
    '<style>', THEME_SCHEME_CSS, styles(), '</style></head><body>',
    bodyHtml(catalog.t),
    '<script>',
    'const NLS = ' + JSON.stringify(catalog.stringsTable()) + ';',
    clientScript(),
    '</script>',
    '</body></html>'
  ].join('\n');
}

module.exports = { buildLabHtml };
