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
  if (n.className === 'x' && !n.getAttribute('aria-label')) n.setAttribute('aria-label', n.title || M('dv.remove'));
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
function sourcePick(key, value, sources, onChange, only) {
  const s = el('select', { 'data-key': key });
  s.appendChild(el('option', { value: '', text: only === 'list' ? M('op.pickList') : M('dv.pickSource') }));
  const allowed = (kind) => !only || (Array.isArray(only) ? only.indexOf(kind) >= 0 : only === kind);
  const option = (x) => el('option', { value: x.path,
    text: x.path.split('.').join(' › ') + (x.kind === 'list' && x.count !== null && x.count !== undefined ? ' (' + x.count + ')' : '') });
  for (const kind of ['list', 'object', 'value']) {
    if (!allowed(kind)) continue;
    const items = sources.filter((x) => x.kind === kind && !x.result);
    if (items.length) s.appendChild(el('optgroup', { label: M('dv.kind.' + kind) }, items.map(option)));
  }
  const results = sources.filter((x) => x.result && allowed(x.kind));
  if (results.length) s.appendChild(el('optgroup', { label: M('dv.results') }, results.map(option)));
  s.value = value || '';
  if (value && s.value !== value) { s.appendChild(el('option', { value, text: value })); s.value = value; }
  s.addEventListener('change', (e) => onChange(e.target.value));
  return s;
}
function columnPick(key, value, columns, onChange, emptyLabel) {
  const opts = [['', emptyLabel || M('dv.pickColumn')]].concat((columns || []).map((c) => [c, c === '' ? M('dv.wholeValue') : c]));
  return pick(key, value, opts, onChange);
}

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
    box.appendChild(el('button', { type: 'button', class: 'inrow', title: M('dv.openInput'), onclick: () => { openInput = i; render(); } }, [
      el('span', { class: 'nm', text: inp.name || '?' }),
      el('span', { class: 'meta' + (st && !st.ok && st.error !== 'empty' ? ' bad' : ''), text: meta })
    ]));
  });
  box.appendChild(el('button', { class: 'secondary', text: M('dv.addInput'), onclick: () => {
    let n = doc.inputs.length + 1;
    while (doc.inputs.some((x) => x.name === 'input' + n)) n++;
    doc.inputs.push({ name: 'input' + n, text: '', format: 'auto' });
    openInput = doc.inputs.length - 1;
    structural();
  } }));  renderResults(box);
}
function renderResults(box) {
  if (!doc.pipelines.length) return;
  box.appendChild(el('div', { class: 'cap results-cap', text: M('dv.results') }));
  const named = (res && res.pipelines ? res.pipelines : []).filter((r) => r.resultView && String(r.name || '').trim());
  if (!named.length) { box.appendChild(el('div', { class: 'dim small', text: M('dv.noResults') })); return; }
  named.forEach((r) => {
    const v = r.resultView;
    const name = String(r.name).trim();
    box.appendChild(el('button', { type: 'button', class: 'inrow', title: M('dv.openResult'), onclick: () => { drill = [{ label: name, value: v.kind === 'value' ? v.value : v.data }]; render(); } }, [
      el('span', { class: 'nm', text: name }),
      el('span', { class: 'meta', text: v.kind === 'value' ? M('dv.kind.value.one') : sizeText(v) })
    ]));
  });
}
function overlay(head, body) {
  return el('div', { id: 'ov', onclick: (e) => { if (e.target.id === 'ov') closeOverlay(); } }, [
    el('div', { id: 'ovPanel', role: 'dialog', 'aria-modal': 'true' }, [el('div', { id: 'ovHead' }, head.concat([el('span', { class: 'grow' }), el('button', { class: 'x', text: '✕', title: M('dv.close'), 'aria-label': M('dv.close'), onclick: closeOverlay })])), el('div', { id: 'ovBody' }, body)])
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
  const ta = el('textarea', { 'data-key': 'in' + i + '.text', spellcheck: 'false', 'aria-label': M('dv.content') });
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
    el('div', { class: 'pane' }, [el('div', { class: 'cap', text: M('dv.preview') }), data ? dataTable(data, [{ label: inp.name, value: data.kind === 'value' ? data.value : data.data }]) : null])
  ]));
}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function plain(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  return String(v);
}
function cellOf(v, path, label) {
  const td = el('td', {});
  const open = () => { drill = path.concat([{ label, value: v }]); render(); };
  if (Array.isArray(v)) {
    if (!v.length) return td;
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
function plainKey(k) { return k.charAt(0) === '@' ? k.slice(1) : k; }
function flatCols(rows) {
  const lists = {};
  const objects = {};
  const labelOf = (k, label) => (k === '#text' ? (label || 'value') : (label ? label + '.' : '') + plainKey(k));
  const scan = (node, label, depth) => {
    for (const k of Object.keys(node)) {
      const name = labelOf(k, label);
      const val = node[k];
      if (Array.isArray(val)) lists[name] = true;
      else if (isObj(val) && depth < 6) { objects[name] = true; scan(val, name, depth + 1); }
    }
  };
  const sample = rows.slice(0, 200).filter(isObj);
  sample.forEach((r) => scan(r, '', 0));
  const cols = [];
  const seen = {};
  const add = (name, segs) => { if (!seen[name]) { seen[name] = true; cols.push({ label: name, segs }); } };
  const walk = (node, segs, label, depth) => {
    const keys = Object.keys(node).sort((a, b) => (b === '#text') - (a === '#text'));
    for (const k of keys) {
      const name = labelOf(k, label);
      const val = node[k];
      const next = segs.concat([k]);
      if (lists[name]) add(name, next);
      else if (isObj(val) && depth < 6) walk(val, next, name, depth + 1);
      else if (objects[name] && k !== '#text' && (val === '' || val === null || val === undefined)) continue;
      else add(name, next);
    }
  };
  sample.forEach((r) => walk(r, [], '', 0));
  return cols;
}
function at(row, segs) {
  let cur = row;
  for (const seg of segs) {
    if (!isObj(cur)) return seg === '#text' ? cur : undefined;
    cur = cur[seg];
  }
  if (isObj(cur) && Object.prototype.hasOwnProperty.call(cur, '#text')) return cur['#text'];
  return cur;
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
    const cols = flatCols(value);
    const scalars = !cols.length;
    head = el('tr', {}, [el('th', { class: 'n', text: M('dv.col.index') })].concat(scalars ? [el('th', { text: M('dv.wholeValue') })] : cols.map((c) => el('th', { text: c.label }))));
    rows = value.map((x, n) => el('tr', {}, [el('td', { class: 'n', text: String(n) })].concat(
      scalars ? [cellOf(x, path, '[' + n + ']')] : cols.map((c) => cellOf(isObj(x) ? at(x, c.segs) : (c.label === 'value' ? x : undefined), path, c.label + ' [' + n + ']')))));
  } else {
    head = el('tr', {}, [el('th', { text: M('dv.col.field') }), el('th', { text: M('dv.col.value') })]);
    rows = flatCols([value]).map((c) => el('tr', {}, [el('td', { text: c.label }), cellOf(at(value, c.segs), path, c.label)]));
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

const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'isSet', 'notSet', 'in', 'notIn', 'matches', 'lenMin', 'lenMax'];
const NO_VALUE = ['isSet', 'notSet'];
function stepForm(p, pi, s, si, cols, sources, colsOf, kindBefore, fields) {
  fields = fields || [];
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
        if (NO_VALUE.indexOf(c.op) < 0) kids.push(text(k + '.c' + ci + '.v', c.value, (v) => { c.value = v; c.valueKind = 'const'; }, '', 14));
        if (c.op === 'between') kids.push(lbl(M('dv.andValue')), text(k + '.c' + ci + '.v2', c.value2, (v) => { c.value2 = v; c.value2Kind = 'const'; }, '', 14));
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
        s.mode === 'join' ? text(k + '.as', s.as, (v) => { s.as = v; }, (s.other || '').split('.').pop(), 10) : null
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
      const top = fields.filter((f) => f.path.indexOf('.') < 0).map((f) => f.path);
      const shown = top.concat(s.fields.filter((f) => top.indexOf(f) < 0));
      const checks = el('div', { class: 'checks' }, shown.map((c) => {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = s.fields.indexOf(c) >= 0;
        cb.addEventListener('change', () => {
          const at2 = s.fields.indexOf(c);
          if (cb.checked && at2 < 0) s.fields.push(c);
          if (!cb.checked && at2 >= 0) s.fields.splice(at2, 1);
          structural();
        });
        return el('label', {}, [cb, c]);
      }));
      box.appendChild(row([lbl(M('dv.drop.which')), checks]));
      const deep = fields.filter((f) => f.path.indexOf('.') > 0 && s.fields.indexOf(f.path) < 0).map((f) => f.path);
      if (deep.length) box.appendChild(row([lbl(M('dv.drop.nested')), columnPick(k + '.deep', '', deep, (v) => { if (v) s.fields.push(v); structural(); }, M('dv.drop.pickNested'))]));
      break;
    }
    case 'flatten': {
      const opts = [['', M('dv.flatten.all')]].concat(fields.filter((f) => !f.viaList && (f.kind === 'object' || f.kind === 'list'))
        .map((f) => [f.path, M(f.kind === 'list' ? 'dv.flatten.list' : 'dv.flatten.object', { path: f.path })]));
      const chosen = fields.find((f) => f.path === s.field);
      box.appendChild(row([lbl(M('dv.flatten.what')), pick(k + '.f', s.field || '', opts, (v) => { s.field = v; structural(); }),
        pick(k + '.names', s.names === 'own' ? 'own' : 'parent', [['parent', M('dv.flatten.names.parent')], ['own', M('dv.flatten.names.own')]], (v) => { s.names = v; structural(); })]));
      if (chosen && chosen.kind === 'list') {
        const cb = el('input', { type: 'checkbox' });
        cb.checked = s.keepEmpty !== false;
        cb.addEventListener('change', () => { s.keepEmpty = cb.checked; structural(); });
        box.appendChild(row([el('label', { class: 'check' }, [cb, M('dv.flatten.keepEmpty')])]));
      }
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
      box.appendChild(row([lbl(M('dv.fieldName')), text(k + '.name', s.name, (v) => { s.name = v; }, '', 12), lbl('='),
        pick(k + '.from', from, [['const', M('dv.add.const')], ['column', M('dv.add.column')], ['calc', M('dv.add.calc')], ['parts', M('dv.add.parts')], ['input', M('dv.add.input')], ['expr', M('dv.add.expr')]], (v) => {
          s.from = v;
          if (v === 'parts' && !(s.parts && s.parts.length)) s.parts = [{ kind: 'field', value: '' }, { kind: 'text', value: ' ' }, { kind: 'field', value: '' }];
          if (v === 'calc') s.how = s.how || { kind: '' };
          structural();
        })]));
      if (from === 'const') box.appendChild(row([lbl(M('dv.valuePh')), text(k + '.v', s.value, (v) => { s.value = v; }, '', 18)]));
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
            : text(pk + '.v', part.value, (v) => { part.value = v; }, '', 6));
          line.appendChild(el('button', { class: 'x', text: '✕', onclick: () => { s.parts.splice(pi2, 1); structural(); } }));
          if (pi2 < s.parts.length - 1) line.appendChild(lbl('+'));
        });
        box.appendChild(line);
        box.appendChild(row([el('button', { class: 'link', text: M('dv.part.addField'), onclick: () => { s.parts.push({ kind: 'field', value: '' }); structural(); } }),
          el('button', { class: 'link', text: M('dv.part.addText'), onclick: () => { s.parts.push({ kind: 'text', value: '' }); structural(); } })]));
      } else {
        const t = text(k + '.expr', s.expr, (v) => { s.expr = v; }, '', 40);
        t.classList.add('mono');
        box.appendChild(row([lbl(M('dv.add.expr')), t]));
      }
      break;
    }
    case 'take':
      box.appendChild(row([lbl(M('dv.field')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); })]));
      break;
  }
  return box;
}

const LIST_STEPS = ['filter', 'sort', 'distinct', 'reverse', 'merge', 'compare', 'append', 'columns', 'drop', 'flatten', 'change', 'skip', 'limit'];
const OBJECT_STEPS = ['merge', 'columns', 'drop', 'flatten', 'change', 'add', 'take', 'asList'];
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
  if (kind === 'flatten') return { kind, field: '', names: 'parent' };
  return { kind };
}

function nameField(pi, p) {
  const t = text('p' + pi + '.name', p.name, (v) => { p.name = v.replace(/[^\p{L}\p{N}_]/gu, ''); }, '', 12);
  t.title = M('dv.resultNameTitle');
  t.setAttribute('aria-label', M('dv.resultName'));
  return t;
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
      nameField(pi, p),
      el('span', { class: 'grow' }),
      el('button', { class: 'x', text: '✕', title: M('dv.removeTransform'), onclick: () => { doc.pipelines.splice(pi, 1); structural(); } })
    ]));
    const body = el('div', { class: 'card-body' });
    if (r && r.nameError) body.appendChild(el('div', { class: 'err', text: errorText(r.nameError) }));
    if (!p.source && !sources.length) body.appendChild(el('div', { class: 'dim', text: M('dv.noLists') }));
    else if (r && r.error) body.appendChild(el('div', { class: 'err', text: errorText(r.error) }));
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
        el('span', { class: 'grow' }),
        el('button', { class: 'x', text: '✕', title: M('dv.removeStep'), onclick: () => { p.steps.splice(si, 1); structural(); } })
      ]));
      st.appendChild(stepForm(p, pi, s, si, cols, sources, colsOf, kindNow, sr && sr.fields ? sr.fields : []));
      if (sr && sr.error) st.appendChild(el('div', { class: 'err', text: errorText(sr.error) }));
      else if (sr && sr.view) st.appendChild(table(sr.view));
      body.appendChild(st);
    });
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
    if (r && r.text !== undefined) {
      body.appendChild(el('div', { class: 'row result-row' }, [
        el('span', { class: 'lbl', text: M('dv.result') }),
        pick('p' + pi + '.fmt', doc.format || 'json', [['json', 'JSON'], ['xml', 'XML'], ['yaml', 'YAML'], ['csv', 'CSV'], ['properties', 'properties']], (v) => { doc.format = v; structural(); }),
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
    if (again) { again.focus(); if (sel && typeof again.setSelectionRange === 'function') try { again.setSelectionRange(sel[0], sel[1]); } catch (e) {                        } }
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