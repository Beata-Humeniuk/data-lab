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
let algorithms = [];
let sendTimer = null;
let selected = 0;
let dirty = false;
let savedSnapshot = '';
const UNDO_LIMIT = 100;
const UNDO_GROUP_MS = 1500;
const history = { undo: [], redo: [], current: '', group: '', at: 0 };
function snapshot() { return JSON.stringify(doc); }
function resetHistory(saved) {
  history.undo = []; history.redo = []; history.current = snapshot(); history.group = ''; history.at = 0;
  savedSnapshot = saved === undefined ? history.current : saved;
}
function undoGroup() {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') ? String(a.getAttribute('data-key') || '') : '';
}
function record() {
  const next = snapshot();
  if (next === history.current) return;
  const g = undoGroup();
  const now = Date.now();
  const top = history.undo.length ? history.undo[history.undo.length - 1] : null;
  if (top === next) history.undo.pop();
  else if (!(g && g === history.group && now - history.at < UNDO_GROUP_MS && history.undo.length)) {
    history.undo.push(history.current);
    if (history.undo.length > UNDO_LIMIT) history.undo.shift();
  }
  history.current = next; history.redo = []; history.group = g; history.at = now;
}
function showDirty() {
  dirty = history.current !== savedSnapshot;
  $('dirty').classList.toggle('on', dirty);
  $('saveBtn').disabled = !dirty;
  $('undoBtn').disabled = !history.undo.length;
  $('redoBtn').disabled = !history.redo.length;
}
function preview(now) {
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => vscodeApi.postMessage({ type: 'preview', doc }), now ? 0 : 300);
}
function changed(now) { record(); showDirty(); preview(now); }
function structural() { changed(true); render(); }
function travel(from, to) {
  if (!from.length) return;
  to.push(history.current);
  history.current = from.pop();
  history.group = '';
  doc = JSON.parse(history.current);
  selected = Math.min(selected, Math.max(0, doc.pipelines.length - 1));
  if (openInput !== null && !doc.inputs[openInput]) openInput = null;
  showDirty(); preview(true); render();
}
function undo() { travel(history.undo, history.redo); }
function redo() { travel(history.redo, history.undo); }
let pendingSave = null;
function save() { clearTimeout(sendTimer); pendingSave = history.current; vscodeApi.postMessage({ type: 'save', doc }); }

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
// Several columns at once: the ones picked as chips, and a list to add one more.
function columnsPick(key, values, columns, onChange, emptyLabel) {
  values = (values || []).filter((v) => v !== undefined && v !== null && String(v).trim());
  const box = el('span', { class: 'multi' });
  values.forEach((v, vi) => box.appendChild(el('span', { class: 'chip' }, [
    el('span', { text: v }),
    el('button', { type: 'button', class: 'chip-x', text: '✕', title: M('dv.multi.remove'), 'aria-label': M('dv.multi.remove') + ': ' + v,
      onclick: () => { const next = values.slice(); next.splice(vi, 1); onChange(next); } })
  ])));
  const rest = (columns || []).filter((c) => c !== '' && values.indexOf(c) < 0);
  if (rest.length) {
    const add = pick(key, '', [['', values.length ? M('dv.multi.add') : (emptyLabel || M('dv.pickColumn'))]].concat(rest.map((c) => [c, c])), (v) => { if (v) onChange(values.concat([v])); });
    add.classList.add('multi-add');
    box.appendChild(add);
  }
  if (rest.length > 1) box.appendChild(el('button', { type: 'button', class: 'link small', text: M('dv.multi.all'), title: M('dv.multi.allTitle'), onclick: () => onChange(values.concat(rest)) }));
  return box;
}
// The fields of the data as a tree of checkboxes: one row per level, a field with
// fields inside opens below its row. Ticking a field removes it with everything in it.
const dropOpen = {};
function dropTree(key, s, fields) {
  const known = {};
  fields.forEach((f) => { known[f.path] = f; });
  const kids = {};
  fields.forEach((f) => {
    const at = f.path.lastIndexOf('.');
    const parent = at < 0 ? '' : f.path.slice(0, at);
    (kids[parent] = kids[parent] || []).push(f.path);
  });
  // Ticked paths no longer in the data stay visible on the top row, so they can be unticked.
  s.fields.forEach((p) => { if (!known[p]) (kids[''] = kids[''] || []).push(p); });
  const name = (p) => p.slice(p.lastIndexOf('.') + 1);
  const under = (p, q) => q.indexOf(p + '.') === 0;
  const coveredBy = (p) => s.fields.find((q) => under(q, p));
  const chosenInside = (p) => s.fields.filter((q) => under(p, q)).length;
  const toggle = (p, on) => {
    if (on) { s.fields = s.fields.filter((q) => !under(p, q)); if (s.fields.indexOf(p) < 0) s.fields.push(p); }
    else s.fields = s.fields.filter((q) => q !== p);
    structural();
  };
  const level = (parent) => {
    const wrap = el('div', { class: 'drop-level' });
    const checks = el('div', { class: 'checks' });
    const opened = [];
    (kids[parent] || []).forEach((p) => {
      const cb = el('input', { type: 'checkbox' });
      const cover = coveredBy(p);
      cb.checked = !!cover || s.fields.indexOf(p) >= 0;
      if (cover) { cb.disabled = true; cb.title = M('dv.drop.coveredBy', { path: cover }); }
      cb.addEventListener('change', () => toggle(p, cb.checked));
      const item = el('span', { class: 'drop-item' }, [el('label', { title: p }, [cb, parent ? name(p) : p])]);
      if (kids[p]) {
        const open = !!dropOpen[key + '|' + p];
        const n = chosenInside(p);
        item.appendChild(el('button', { type: 'button', class: 'drop-open' + (open ? ' on' : ''), 'aria-expanded': String(open),
          title: M(open ? 'dv.drop.close' : 'dv.drop.open', { path: p }),
          onclick: () => { dropOpen[key + '|' + p] = !open; render(); } },
          [(open ? '▾ ' : '▸ ') + kids[p].length + (n ? ' · ' + M('dv.drop.chosen', { count: n }) : '')]));
        if (open) opened.push(p);
      }
      checks.appendChild(item);
    });
    wrap.appendChild(checks);
    opened.forEach((p) => wrap.appendChild(el('div', { class: 'drop-sub' }, [el('div', { class: 'drop-path', text: p.split('.').join(' › ') }), level(p)])));
    return wrap;
  };
  return level('');
}
function fieldsIn(x) {
  if (Array.isArray(x.fields) && x.fields.length) return x.fields.slice();
  return x.field !== undefined && x.field !== null && String(x.field).trim() ? [x.field] : [];
}
function setFields(x, list) {
  x.fields = list.slice();
  x.field = list[0] || '';
  if (list.length <= 1) delete x.fields;
}

const FORMATS = [['auto', M('run.formatAuto')], ['json', 'JSON'], ['xml', 'XML'], ['yaml', 'YAML'], ['csv', 'CSV'], ['kv', 'key=value']];
let openInput = null;
let drill = null;
const stepsOpen = {};
const tableOpen = {};
let addMenu = false;
let dragFrom = null;
let flashStep = null;
let flashTimer = null;
function flash(si) {
  flashStep = { si, until: Date.now() + 1200 };
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashStep = null; document.querySelectorAll('.step.flash').forEach((x) => x.classList.remove('flash')); }, 1250);
}
const CATS = {
  rows: ['filter', 'sort', 'distinct', 'reverse', 'skip', 'limit'],
  fields: ['columns', 'drop', 'flatten', 'change', 'add', 'take', 'asList'],
  combine: ['merge', 'compare', 'append'],
  value: ['first', 'last', 'nth', 'count', 'sum', 'min', 'max', 'avg', 'join']
};
function catOf(kind) {
  for (const c in CATS) if (CATS[c].indexOf(kind) >= 0) return c;
  return 'fields';
}
function resetFolds(pi) {
  for (const k of Object.keys(tableOpen)) if (k.indexOf('p' + pi + '.') === 0) delete tableOpen[k];
}
function sizeText(v) {
  if (!v) return '';
  if (v.kind === 'list') return M('dv.size.list', { count: v.count });
  if (v.kind === 'object') return M('dv.size.object', { count: v.count });
  return '';
}
function renderInputs() {
  const box = $('inputs');
  box.textContent = '';
  box.appendChild(el('div', { class: 'cap cap-in', text: M('dv.inputs') }));
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
  } }));
  renderTransformList(box);
}
function transformTitle(p, pi) {
  return String(p.title || '').trim() || String(p.name || '').trim() || M('dv.transformN', { n: pi + 1 });
}
function resultMeta(r) {
  if (!r) return '';
  if (r.error || (r.steps || []).some((x) => x.error)) return M('dv.hasError');
  const last = (r.steps || []).length ? r.steps[r.steps.length - 1].view : r.sourceView;
  if (!last) return '';
  return last.kind === 'value' ? M('dv.kind.value.one') : sizeText(last);
}
function addTransform(p) {
  doc.pipelines.push(p);
  selected = doc.pipelines.length - 1;
  openInput = null;
  structural();
}
function renderTransformList(box) {
  box.appendChild(el('div', { class: 'cap section-cap cap-tr', text: M('dv.transforms') }));
  doc.pipelines.forEach((p, pi) => {
    const r = res && res.pipelines ? res.pipelines[pi] : null;
    const a = p.algorithm ? algorithms.find((x) => x.id === p.algorithm) : null;
    const meta = resultMeta(r);
    const open = stepsOpen[pi] !== undefined ? stepsOpen[pi] : pi === selected;
    box.appendChild(el('div', { class: 'trow' + (pi === selected ? ' on' : '') }, [
      el('button', { type: 'button', class: 'chev' + (open ? ' open' : ''), title: M('dv.stepsToggle'), 'aria-label': M('dv.stepsToggle'), 'aria-expanded': open ? 'true' : 'false',
        onclick: () => { stepsOpen[pi] = !open; render(); } }, ['▸']),
      el('button', { type: 'button', class: 'inrow tr' + (pi === selected ? ' on' : ''), title: M('dv.openTransform'), 'aria-current': pi === selected ? 'true' : null,
        onclick: () => { selected = pi; stepsOpen[pi] = true; addMenu = false; render(); $('work').scrollTop = 0; } }, [
        el('span', { class: 'nm', text: transformTitle(p, pi) }),
        a ? el('span', { class: 'algo small-algo', text: a.name }) : null,
        el('span', { class: 'meta' + (meta === M('dv.hasError') ? ' bad' : ''), text: meta })
      ])
    ]));
    if (open) box.appendChild(stepList(p, pi, r));
  });
  box.appendChild(el('button', { class: 'secondary', text: M('dv.addTransform'), onclick: () => addTransform({ name: '', source: '', steps: [] }) }));
  if (algorithms.length) box.appendChild(el('div', { class: 'row' }, [fromAlgorithm()]));
}
function stepList(p, pi, r) {
  const steps = p.steps || [];
  const list = el('ol', { class: 'steplist', 'aria-label': M('dv.steps') });
  if (!steps.length) list.appendChild(el('li', { class: 'nostep', text: M('dv.noSteps') }));
  let kindNow = r && r.sourceKind ? r.sourceKind : 'list';
  const clearMarks = () => list.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
  steps.forEach((s, si) => {
    const sr = r && r.steps ? r.steps[si] : null;
    if (sr && sr.kindBefore) kindNow = sr.kindBefore;
    const bad = sr && sr.error && sr.error.code !== 'afterError';
    const li = el('li', { class: 'sitem cat-' + catOf(s.kind) + (bad ? ' bad' : ''), draggable: 'true', title: M('dv.dragStep') }, [
      el('span', { class: 'grip', 'aria-hidden': 'true', text: '⋮⋮' }),
      el('button', { type: 'button', class: 'sgo', title: M('dv.goToStep'),
        onclick: () => { selected = pi; tableOpen['p' + pi + '.s' + si] = true; flash(si); addMenu = false; render(); goToStep(si); } }, [
        el('span', { class: 'sno', text: String(si + 1) }),
        el('span', { class: 'snm', text: stepLabel(s.kind, kindNow) }),
        el('span', { class: 'sdet', text: stepDetail(s) })
      ]),
      el('button', { type: 'button', class: 'mv', text: '↑', title: M('dv.stepUp'), 'aria-label': M('dv.stepUp'), disabled: si === 0, onclick: () => moveStep(p, si, -1, pi) }),
      el('button', { type: 'button', class: 'mv', text: '↓', title: M('dv.stepDown'), 'aria-label': M('dv.stepDown'), disabled: si === steps.length - 1, onclick: () => moveStep(p, si, 1, pi) })
    ]);
    li.addEventListener('dragstart', (e) => { dragFrom = { pi, si }; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(si)); } catch (x) { /* no data */ } });
    li.addEventListener('dragend', () => { dragFrom = null; li.classList.remove('dragging'); clearMarks(); });
    li.addEventListener('dragover', (e) => {
      if (!dragFrom || dragFrom.pi !== pi) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const box = li.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      clearMarks();
      li.classList.add(after ? 'drop-after' : 'drop-before');
    });
    li.addEventListener('drop', (e) => {
      if (!dragFrom || dragFrom.pi !== pi) return;
      e.preventDefault();
      const box = li.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      const from = dragFrom.si;
      let to = si + (after ? 1 : 0);
      if (from < to) to--;
      dragFrom = null;
      clearMarks();
      moveStepTo(p, from, to, pi);
    });
    list.appendChild(li);
  });
  return list;
}
function stepDetail(s) {
  const cols = (xs) => xs.filter(Boolean).join(', ');
  const fieldsOf = (x) => (Array.isArray(x.fields) && x.fields.length ? x.fields : [x.field]).filter((f) => f !== undefined && f !== null && String(f).trim());
  switch (s.kind) {
    case 'filter': return cols([].concat(...(s.conditions || []).map(fieldsOf)));
    case 'sort': return cols((Array.isArray(s.keys) && s.keys.length ? s.keys : [{ field: s.field }]).map((k) => k.field));
    case 'distinct': case 'change': return cols(fieldsOf(s));
    case 'drop': return cols(s.fields || []);
    case 'add': return cols([s].concat(s.more || []).map((x) => x.name));
    case 'merge': case 'compare': case 'append': return s.other || '';
    case 'columns': return cols((s.columns || []).map((c) => c.as || c.from));
    case 'flatten': case 'take': case 'sum': case 'min': case 'max': case 'avg': return s.field || '';
    case 'skip': case 'limit': return String(s.n || '');
  }
  return '';
}
function goToStep(si) {
  const t = document.getElementById('step-' + si);
  if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
        const fs = fieldsIn(c);
        const kids = [
          ci === 0 ? lbl(M('dv.where')) : lbl(s.join === 'or' ? M('dv.or') : M('dv.and')),
          fs.length > 1 ? pick(k + '.c' + ci + '.m', c.match === 'all' ? 'all' : 'any', [['any', M('dv.match.any')], ['all', M('dv.match.all')]], (v) => { c.match = v; structural(); }, M('dv.match.title')) : null,
          columnsPick(k + '.c' + ci + '.f', fs, cols, (v) => { setFields(c, v); structural(); }),
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
    case 'sort': {
      const keys = Array.isArray(s.keys) && s.keys.length ? s.keys : [{ field: s.field === undefined ? null : s.field, desc: !!s.desc }];
      const sync = () => {
        s.keys = keys;
        s.field = keys[0].field === null ? undefined : keys[0].field;
        s.desc = !!keys[0].desc;
        if (keys.length === 1) delete s.keys;
        structural();
      };
      keys.forEach((key, ki) => {
        const opts = ki ? cols.filter((c) => c !== '') : cols;
        box.appendChild(row([
          lbl(ki ? M('dv.sort.then') : M('dv.by')),
          columnPick(k + '.k' + ki + '.f', key.field === null ? '' : key.field, opts, (v) => { key.field = v === '' && ki ? null : v; sync(); }),
          pick(k + '.k' + ki + '.o', key.desc ? 'desc' : 'asc', [['asc', M('how.o.asc')], ['desc', M('how.o.desc')]], (v) => { key.desc = v === 'desc'; sync(); }),
          keys.length > 1 ? el('button', { class: 'x', text: '✕', onclick: () => { keys.splice(ki, 1); sync(); } }) : null
        ]));
      });
      box.appendChild(row([el('button', { class: 'link', text: M('dv.sort.addKey'), onclick: () => { keys.push({ field: null, desc: false }); sync(); } })]));
      break;
    }
    case 'distinct':
      box.appendChild(row([lbl(M('dv.by')), columnsPick(k + '.f', fieldsIn(s), cols, (v) => { setFields(s, v); structural(); }, M('dv.wholeElement'))]));
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
      s.columns = Array.isArray(s.columns) ? s.columns : [];
      const grid = el('div', { class: 'outmap' }, [el('span', { class: 'lbl', text: M('dv.out.field') }), el('span'), el('span', { class: 'lbl', text: M('dv.out.from') }), el('span')]);
      s.columns.forEach((c, ci) => {
        const name = text(k + '.c' + ci + '.as', c.as, (v) => { c.as = v; }, (c.from || '').split('.').pop(), 16);
        name.setAttribute('aria-label', M('dv.out.field'));
        grid.appendChild(name);
        grid.appendChild(el('span', { class: 'lbl', text: '←' }));
        grid.appendChild(columnPick(k + '.c' + ci, c.from, cols, (v) => { c.from = v; structural(); }));
        grid.appendChild(el('button', { class: 'x', text: '✕', onclick: () => { s.columns.splice(ci, 1); structural(); } }));
      });
      box.appendChild(grid);
      const missing = cols.filter((c) => c !== '' && !s.columns.some((x) => x.from === c));
      box.appendChild(row([
        el('button', { class: 'link', text: M('dv.addColumn'), onclick: () => { s.columns.push({ from: '', as: '' }); structural(); } }),
        missing.length ? columnPick(k + '.more', '', missing, (v) => { if (v) s.columns.push({ from: v, as: '' }); structural(); }, M('dv.out.addFrom')) : null,
        missing.length > 1 ? el('button', { class: 'link', text: M('dv.out.addAll'), onclick: () => { missing.forEach((c) => s.columns.push({ from: c, as: '' })); structural(); } }) : null
      ]));
      box.appendChild(el('div', { class: 'dim small', text: M('dv.out.hint') }));
      break;
    }
    case 'drop': {
      s.fields = Array.isArray(s.fields) ? s.fields : [];
      const top = fields.filter((f) => f.path.indexOf('.') < 0).map((f) => f.path);
      box.appendChild(row([lbl(M('dv.drop.which')), dropTree(k, s, fields)]));
      box.appendChild(row([
        el('button', { class: 'link small', text: M('dv.drop.all'), onclick: () => { s.fields = top.slice(); structural(); } }),
        s.fields.length ? el('button', { class: 'link small', text: M('dv.drop.none'), onclick: () => { s.fields = []; structural(); } }) : null
      ]));
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
      const fs = fieldsIn(s);
      if (kindBefore !== 'value') box.appendChild(row([lbl(M(kindBefore === 'object' ? 'dv.fields' : 'dv.columns')), columnsPick(k + '.f', fs, cols, (v) => { setFields(s, v); if (v.length > 1) delete s.as; structural(); })]));
      howChain(box, k, s, cols, kindBefore === 'value' ? [lbl(M('dv.value')), lbl('→')] : [lbl('→')]);
      if (kindBefore !== 'value' && fs.length > 1) box.appendChild(el('div', { class: 'dim small', text: M('dv.change.manyHint') }));
      else if (kindBefore !== 'value') {
        box.appendChild(row([lbl(M('dv.saveAs')), text(k + '.as', s.as, (v) => { s.as = v; }, s.field || M('dv.sameColumn'), 14)]));
        box.appendChild(el('div', { class: 'dim small', text: M(s.how && s.how.kind ? 'dv.saveAsHint' : 'dv.renameHint') }));
      }
      break;
    }
    case 'add': {
      const items = [s].concat(Array.isArray(s.more) ? s.more : []);
      const ITEM_KEYS = ['name', 'from', 'value', 'column', 'path', 'how', 'parts', 'expr'];
      const removeItem = (ii) => {
        if (ii > 0) s.more.splice(ii - 1, 1);
        else {
          const next = s.more.shift();
          ITEM_KEYS.forEach((x) => { delete s[x]; });
          ITEM_KEYS.forEach((x) => { if (next[x] !== undefined) s[x] = next[x]; });
        }
        if (!s.more.length) delete s.more;
        structural();
      };
      items.forEach((it, ii) => {
        const part = el('div', { class: items.length > 1 ? 'additem' : '' });
        const seen = cols.concat(items.slice(0, ii).map((x) => String(x.name || '').trim()).filter((x) => x && cols.indexOf(x) < 0));
        addItemForm(part, ii ? k + '.m' + ii : k, it, seen, sources, kindBefore,
          items.length > 1 ? [el('button', { class: 'x', text: '✕', title: M('dv.add.removeField'), onclick: () => removeItem(ii) })] : []);
        box.appendChild(part);
      });
      box.appendChild(row([el('button', { class: 'link', text: M('dv.add.more'), onclick: () => { (s.more = s.more || []).push({ name: '', from: 'const', value: '' }); structural(); } })]));
      break;
    }
    case 'take':
      box.appendChild(row([lbl(M('dv.field')), columnPick(k + '.f', s.field, cols, (v) => { s.field = v; structural(); })]));
      break;
  }
  return box;
}

function addItemForm(box, k, s, cols, sources, kindBefore, tail) {
  const row = (kids) => el('div', { class: 'row' }, kids);
  const lbl = (t) => el('span', { class: 'lbl', text: t });
  const from = s.from || 'const';
  box.appendChild(row([lbl(M('dv.fieldName')), text(k + '.name', s.name, (v) => { s.name = v; }, '', 12), lbl('='),
    pick(k + '.from', from, [['const', M('dv.add.const')], ['column', M('dv.add.column')], ['calc', M('dv.add.calc')], ['parts', M('dv.add.parts')], ['input', M('dv.add.input')], ['expr', M('dv.add.expr')]], (v) => {
      s.from = v;
      if (v === 'parts' && !(s.parts && s.parts.length)) s.parts = [{ kind: 'field', value: '' }, { kind: 'text', value: ' ' }, { kind: 'field', value: '' }];
      if (v === 'calc') s.how = s.how || { kind: '' };
      structural();
    })].concat(tail || [])));
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
function newStep(kind, cols) {
  if (kind === 'columns') return { kind, columns: (cols || []).filter((c) => c !== '').map((c) => ({ from: c, as: '' })) };
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

function algorithmControls(p, pi) {
  if (!p.algorithm) {
    if (!(p.steps || []).length) return [];
    return [el('button', { class: 'link', text: M('dv.saveAlgorithm'), title: M('dv.saveAlgorithmTitle'),
      onclick: () => { clearTimeout(sendTimer); vscodeApi.postMessage({ type: 'saveAlgorithm', index: pi, doc }); } })];
  }
  const a = algorithms.find((x) => x.id === p.algorithm);
  return [
    el('span', { class: 'algo' + (a ? '' : ' bad'), title: a ? M('dv.algorithmTitle') : null, text: a ? M('dv.algorithm', { name: a.name }) : M('dv.algorithmMissing') }),
    el('button', { class: 'link', text: M('dv.unlinkAlgorithm'), title: M('dv.unlinkAlgorithmTitle'), onclick: () => { delete p.algorithm; structural(); } })
  ];
}
function fromAlgorithm() {
  const s = el('select', { 'data-key': 'fromAlgorithm', 'aria-label': M('dv.fromAlgorithm') }, [el('option', { value: '', text: M('dv.fromAlgorithm') })]
    .concat(algorithms.map((a) => el('option', { value: a.id, text: a.name }))));
  s.addEventListener('change', (e) => {
    const a = algorithms.find((x) => x.id === e.target.value);
    if (!a) return;
    addTransform({ name: '', source: '', algorithm: a.id, steps: JSON.parse(JSON.stringify(a.steps || [])) });
  });
  return s;
}
function titleField(pi, p) {
  const t = text('p' + pi + '.title', p.title, (v) => { p.title = v; }, M('dv.transformN', { n: pi + 1 }), 24);
  t.classList.add('title-in');
  t.title = M('dv.transformNameTitle');
  t.setAttribute('aria-label', M('dv.transformName'));
  return t;
}
const NAME_CHARS = /[^\p{L}\p{N}_]/gu;
function renameResult(from, to) {
  const head = (path) => String(path || '').split('.')[0];
  const moved = (path) => (head(path) === from ? to + String(path).slice(from.length) : path);
  const word = new RegExp('(^|[^\\p{L}\\p{N}_.])' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'gu');
  for (const q of doc.pipelines) {
    q.source = moved(q.source);
    for (const s of q.steps || []) {
      if (s.other) s.other = moved(s.other);
      for (const x of [s].concat(s.kind === 'add' && Array.isArray(s.more) ? s.more : [])) {
        if (x.from === 'input' && x.path) x.path = moved(x.path);
        if (x.from === 'expr' && x.expr) x.expr = String(x.expr).replace(word, (m, pre) => pre + to);
      }
    }
  }
}
function nameField(pi, p) {
  let before = String(p.name || '');
  const t = text('p' + pi + '.name', p.name, (v) => {
    const clean = v.replace(NAME_CHARS, '_');
    if (clean !== v) { const at = t.selectionStart; t.value = clean; try { t.setSelectionRange(at, at); } catch (e) { /* not a text field */ } }
    p.name = clean;
  }, '', 14);
  t.title = M('dv.resultNameTitle');
  t.setAttribute('aria-label', M('dv.resultName'));
  t.addEventListener('focus', () => { before = String(p.name || ''); });
  t.addEventListener('change', () => {
    const now = String(p.name || '').trim();
    const taken = doc.inputs.some((x) => x.name === now) || doc.pipelines.some((x) => x !== p && String(x.name || '').trim() === now);
    if (before && now && before !== now && !taken) renameResult(before, now);
    before = now;
    structural();
  });
  return t;
}
function commentRow(p, pi, r) {
  const c = p.comment && typeof p.comment === 'object' ? p.comment : {};
  const cols = (r.endColumns || []).filter((x) => x !== '');
  const kids = [
    el('span', { class: 'lbl', text: M('dv.comment') }),
    columnPick('p' + pi + '.comment', c.field || '', cols, (v) => { if (v) p.comment = { field: v, keep: c.keep !== false }; else delete p.comment; structural(); }, M('dv.commentNone'))
  ];
  if (c.field) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = c.keep !== false;
    cb.addEventListener('change', () => { p.comment = { field: c.field, keep: cb.checked }; structural(); });
    kids.push(el('label', { class: 'check' }, [cb, M('dv.commentKeep')]));
    if ((doc.format || 'json') === 'csv') kids.push(el('span', { class: 'dim small', text: M('dv.commentNoCsv') }));
  }
  return el('div', { class: 'row' }, kids);
}
function moveStepTo(p, from, to, pi) {
  if (to < 0 || to >= p.steps.length || from === to) return;
  const [step] = p.steps.splice(from, 1);
  p.steps.splice(to, 0, step);
  if (pi !== undefined) resetFolds(pi);
  flash(to);
  structural();
}
function moveStep(p, si, by, pi) { moveStepTo(p, si, si + by, pi); }
// A table folded under a line; the last one of a transformation open.
function fold(key, label, v, open, cat) {
  const d = el('details', { class: 'fold fold-' + cat });
  d.open = tableOpen[key] !== undefined ? tableOpen[key] : open;
  const info = v.kind === 'value' ? (v.text === '' || v.text === undefined ? '—' : String(v.text)) : sizeText(v);
  d.appendChild(el('summary', {}, [el('span', { class: 'fold-l', text: label }), el('span', { class: 'fold-n', text: info })]));
  d.addEventListener('toggle', () => {
    tableOpen[key] = d.open;
    if (d.open && !d.querySelector('.tbl-wrap,.value')) d.appendChild(table(v));
  });
  if (d.open) d.appendChild(table(v));
  return d;
}
const STEP_GROUPS = {
  list: [['rows', ['filter', 'sort', 'distinct', 'reverse', 'skip', 'limit']], ['fields', ['columns', 'drop', 'flatten', 'change', 'add']],
    ['combine', ['merge', 'compare', 'append']], ['value', ['first', 'last', 'nth', 'count', 'sum', 'min', 'max', 'avg', 'join']]],
  object: [['fields', ['columns', 'drop', 'flatten', 'change', 'add', 'take', 'asList']], ['combine', ['merge']]],
  value: [['fields', ['change']]]
};
function addStepMenu(p, pi, r, endKind, cols) {
  const wrap = el('div', { class: 'addwrap' });
  wrap.appendChild(el('button', { type: 'button', class: 'primary addbtn', 'aria-haspopup': 'true', 'aria-expanded': addMenu ? 'true' : 'false',
    onclick: () => { addMenu = !addMenu; render(); } }, [M('dv.addStepMenu'), el('span', { class: 'caret', text: addMenu ? '▴' : '▾' })]));
  wrap.appendChild(el('span', { class: 'lbl', text: M('dv.addStepOn', { kind: M('dv.kind.' + endKind + '.one') }) }));
  if (addMenu) {
    const menu = el('div', { class: 'menu', role: 'menu' });
    for (const [cat, kinds] of STEP_GROUPS[endKind] || STEP_GROUPS.value) {
      menu.appendChild(el('div', { class: 'mgroup cat-' + cat }, [
        el('div', { class: 'mcap', text: M('dv.group.' + cat) }),
        el('div', { class: 'mitems' }, kinds.map((kind) => el('button', { type: 'button', class: 'mitem', role: 'menuitem',
          onclick: () => {
            (p.steps = p.steps || []).push(newStep(kind, r.endColumns || cols));
            addMenu = false;
            resetFolds(pi);
            flash(p.steps.length - 1);
            structural();
            goToStep(p.steps.length - 1);
          } }, [stepLabel(kind, endKind)])))
      ]));
    }
    wrap.appendChild(menu);
  }
  return wrap;
}
function renderWork() {
  const box = $('work');
  box.textContent = '';
  if (selected >= doc.pipelines.length) selected = Math.max(0, doc.pipelines.length - 1);
  if (!doc.pipelines[selected]) box.appendChild(el('div', { class: 'cap', text: M('dv.transforms') }));
  if (!doc.inputs.length || !doc.pipelines.length) box.appendChild(el('div', { class: 'help', text: M('dv.help') }));
  if (selected >= doc.pipelines.length) selected = Math.max(0, doc.pipelines.length - 1);
  doc.pipelines.forEach((p, pi) => {
    if (pi !== selected) return;
    const r = res && res.pipelines ? res.pipelines[pi] : null;
    const sources = r ? r.sources : [];
    const colsOf = (path) => (res && res.columnsOf ? res.columnsOf[path] || [] : []);
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head title-row' }, [
      titleField(pi, p),
      el('span', { class: 'grow' })
    ].concat(algorithmControls(p, pi), [
      el('button', { class: 'link', text: M('dv.exportMd'), title: M('dv.exportMdTitle'), onclick: () => { clearTimeout(sendTimer); vscodeApi.postMessage({ type: 'exportMd', index: pi, doc }); } }),
      el('button', { class: 'x', text: '✕', title: M('dv.removeTransform'), onclick: () => { doc.pipelines.splice(pi, 1); selected = Math.max(0, pi - 1); structural(); } })
    ])));
    card.appendChild(el('div', { class: 'card-head' }, [
      el('span', { class: 'lbl', text: M('dv.from') }),
      sourcePick('p' + pi + '.src', p.source || '', sources, (v) => { p.source = v; structural(); }),
      el('span', { class: 'lbl', text: M('dv.resultName') }),
      nameField(pi, p)
    ]));
    const body = el('div', { class: 'card-body' });
    const steps = p.steps || [];
    if (r && r.nameError) body.appendChild(el('div', { class: 'err', text: errorText(r.nameError) }));
    if (!p.source && !sources.length) body.appendChild(el('div', { class: 'dim', text: M('dv.noLists') }));
    else if (r && r.error) body.appendChild(el('div', { class: 'err', text: errorText(r.error) }));
    else if (r && r.sourceView) body.appendChild(fold('p' + pi + '.src', M('dv.sourceData'), r.sourceView, !steps.length, 'src'));
    let cols = r && r.sourceColumns ? r.sourceColumns : [];
    let kindNow = r && r.sourceKind ? r.sourceKind : 'list';
    steps.forEach((s, si) => {
      const sr = r && r.steps ? r.steps[si] : null;
      if (sr && sr.columns) cols = sr.columns;
      else if (!sr && r && r.endColumns) cols = r.endColumns;
      if (sr && sr.kindBefore) kindNow = sr.kindBefore;
      const st = el('div', { class: 'step cat-' + catOf(s.kind) + (flashStep && flashStep.si === si && Date.now() < flashStep.until ? ' flash' : ''), id: 'step-' + si });
      st.appendChild(el('div', { class: 'step-head' }, [
        el('span', { class: 'step-no', text: String(si + 1) }),
        el('span', { class: 'step-name', text: stepLabel(s.kind, kindNow) }),
        el('span', { class: 'grow' }),
        el('button', { class: 'mv', text: '↑', title: M('dv.stepUp'), 'aria-label': M('dv.stepUp'), disabled: si === 0, onclick: () => moveStep(p, si, -1, pi) }),
        el('button', { class: 'mv', text: '↓', title: M('dv.stepDown'), 'aria-label': M('dv.stepDown'), disabled: si === steps.length - 1, onclick: () => moveStep(p, si, 1, pi) }),
        el('button', { class: 'x', text: '✕', title: M('dv.removeStep'), onclick: () => { p.steps.splice(si, 1); resetFolds(pi); structural(); } })
      ]));
      st.appendChild(stepForm(p, pi, s, si, cols, sources, colsOf, kindNow, sr && sr.fields ? sr.fields : []));
      if (sr && sr.error) st.appendChild(el('div', { class: 'err', text: errorText(sr.error) }));
      else if (sr && sr.view) st.appendChild(fold('p' + pi + '.s' + si, M('dv.stepResult'), sr.view, si === steps.length - 1, catOf(s.kind)));
      body.appendChild(st);
    });
    const endKind = r && r.endKind ? r.endKind : kindNow;
    const broken = r && r.steps && r.steps.some((x) => x.error);
    if (p.source && r && r.sourceView && !broken) body.appendChild(addStepMenu(p, pi, r, endKind, cols));
    if (r && r.text !== undefined) {
      body.appendChild(el('div', { class: 'row result-row' }, [
        el('span', { class: 'lbl', text: M('dv.result') }),
        pick('p' + pi + '.fmt', doc.format || 'json', [['json', 'JSON'], ['xml', 'XML'], ['yaml', 'YAML'], ['csv', 'CSV'], ['properties', 'properties']], (v) => { doc.format = v; structural(); }),
        el('button', { class: 'link', text: M('run.openEditor'), onclick: () => vscodeApi.postMessage({ type: 'openOutput', text: r.text, format: doc.format || 'json', comments: !!(p.comment && p.comment.field) }) }),
        el('button', { class: 'link', 'data-key': 'p' + pi + '.copy', text: M('dv.copy'), title: M('dv.copyTitle'), onclick: (e) => {
          vscodeApi.postMessage({ type: 'copyOutput', text: r.text });
          const b = e.currentTarget;
          b.textContent = M('dv.copied');
          setTimeout(() => { if (b.isConnected) b.textContent = M('dv.copy'); }, 1500);
        } })
      ]));
      body.appendChild(commentRow(p, pi, r));
      body.appendChild(el('div', { class: 'codebox' }, [
        el('pre', { text: r.text }),
        el('button', { type: 'button', class: 'codecopy', title: M('dv.copyTitle'), 'aria-label': M('dv.copyTitle'), onclick: (e) => {
          vscodeApi.postMessage({ type: 'copyOutput', text: r.text });
          const b = e.currentTarget;
          b.textContent = '✓ ' + M('dv.copied');
          b.classList.add('done');
          setTimeout(() => { if (b.isConnected) { b.textContent = M('dv.copy'); b.classList.remove('done'); } }, 1500);
        } }, [M('dv.copy')])
      ]));
    }
    card.appendChild(body);
    box.appendChild(card);
  });
}

function render() {
  const a = document.activeElement;
  const key = a && a.getAttribute ? a.getAttribute('data-key') : null;
  const caret = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
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
    if (again) { again.focus(); if (caret && typeof again.setSelectionRange === 'function') try { again.setSelectionRange(caret[0], caret[1]); } catch (e) {                        } }
  }
}

$('asFlow').addEventListener('click', () => vscodeApi.postMessage({ type: 'openAsFlow' }));
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('saveBtn').addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && addMenu) { e.preventDefault(); addMenu = false; render(); return; }
  if (e.key === 'Escape' && (openInput !== null || drill)) { e.preventDefault(); closeOverlay(); }
});
document.addEventListener('click', (e) => {
  if (addMenu && !(e.target.closest && e.target.closest('.addwrap'))) { addMenu = false; render(); }
});
window.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.algorithms) algorithms = m.algorithms;
  if (m.type === 'load') {
    doc = m.doc || doc; catalog = m.catalog || catalog; $('title').textContent = m.title || ''; res = m.result || null;
    resetHistory(typeof m.saved === 'string' ? m.saved : undefined);
    showDirty(); render();
  }
  if (m.type === 'result') { res = m.result; render(); }
  if (m.type === 'saved') { if (pendingSave !== null) savedSnapshot = pendingSave; pendingSave = null; if (m.result) res = m.result; showDirty(); render(); }
  if (m.type === 'linked') { doc = m.doc; history.current = snapshot(); if (typeof m.saved === 'string') savedSnapshot = m.saved; res = m.result || res; showDirty(); render(); }
  if (m.type === 'algorithmSaved') { const p = doc.pipelines[m.index]; if (p) { p.algorithm = m.id; structural(); } }
  if (m.type === 'undo') undo();
  if (m.type === 'redo') redo();
  if (m.type === 'save') save();
  if (m.type === 'fileLoaded') { if (doc.inputs[m.index]) { doc.inputs[m.index].text = m.text; structural(); } }
});
vscodeApi.postMessage({ type: 'ready' });