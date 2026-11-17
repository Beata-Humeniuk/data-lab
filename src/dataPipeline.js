const { parseSample } = require('./sampleFormats');
const { runStream, runHow, same, cmp } = require('./flowRun');
const { RunError, isPlainObject, textOf, evalExpr, serialize } = require('./mappingRun');

const LIST_STEPS = ['filter', 'sort', 'distinct', 'reverse', 'merge', 'compare', 'append', 'columns', 'drop', 'flatten', 'change', 'skip', 'limit'];
const VALUE_STEPS = ['first', 'last', 'nth', 'count', 'sum', 'min', 'max', 'avg', 'join'];
const STEP_KINDS = LIST_STEPS.concat(VALUE_STEPS, ['add', 'take', 'asList']);

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function readInputs(inputs) {
  const values = {};
  const states = {};
  for (const inp of inputs || []) {
    const name = String(inp.name || '').trim();
    if (!name) continue;
    if (!String(inp.text || '').trim()) { states[name] = { ok: false, error: 'empty' }; continue; }
    const p = parseSample(inp.text, inp.format && inp.format !== 'auto' ? inp.format : undefined);
    if (!p.ok) { states[name] = { ok: false, error: p.error }; continue; }
    let value = p.value;
    if (p.format === 'xml' && isPlainObject(value) && Object.keys(value).length === 1) value = value[Object.keys(value)[0]];
    values[name] = value;
    states[name] = { ok: true, format: p.format };
  }
  return { values, states };
}

function listsIn(value, base, out, depth) {
  out = out || [];
  if (depth > 8) return out;
  if (Array.isArray(value)) {
    out.push({ path: base, count: value.length });
    const first = value.find((x) => isPlainObject(x));
    if (first) {
      const keys = new Set();
      value.forEach((x) => { if (isPlainObject(x)) Object.keys(x).forEach((k) => keys.add(k)); });
      for (const k of keys) {
        const inner = value.map((x) => (isPlainObject(x) ? x[k] : undefined)).find((x) => Array.isArray(x));
        if (inner) listsIn(inner, base + '.' + k, out, depth + 1);
      }
    }
    return out;
  }
  if (isPlainObject(value)) for (const k of Object.keys(value)) listsIn(value[k], base ? base + '.' + k : k, out, depth + 1);
  return out;
}

function kindOf(v) { return Array.isArray(v) ? 'list' : isPlainObject(v) ? 'object' : 'value'; }

function sourcesOf(values, results) {
  const out = [];
  const seen = new Set();
  let fromResult = false;
  const add = (path, kind, count) => {
    if (!path || seen.has(path) || out.length >= 400) return;
    seen.add(path);
    out.push(fromResult ? { path, kind, count, result: true } : { path, kind, count });
  };
  const walk = (v, path, depth) => {
    if (depth > 8) return;
    if (Array.isArray(v)) {
      add(path, 'list', v.length);
      for (const l of listsIn(v, path, [], 0)) if (l.path !== path) add(l.path, 'list', l.count);
      return;
    }
    if (isPlainObject(v)) {
      add(path, 'object', Object.keys(v).length);
      for (const k of Object.keys(v)) {
        if (k === '#text') continue;
        walk(v[k], path + '.' + (k.charAt(0) === '@' ? k.slice(1) : k), depth + 1);
      }
      return;
    }
    add(path, 'value', null);
  };
  for (const name of Object.keys(values)) walk(values[name], name, 0);
  fromResult = true;
  for (const r of Array.isArray(results) ? results : []) if (r && r.name) walk(r.value, r.name, 0);
  return out;
}

const NAME_IN_EXPR = /[\p{L}_][\p{L}\p{N}_]*/gu;
function headOf(path) { return String(path || '').trim().split('.')[0]; }
function refsOf(p) {
  const out = new Set();
  const addPath = (x) => { const h = headOf(x); if (h) out.add(h); };
  addPath(p.source);
  for (const s of p.steps || []) {
    if (!s || typeof s !== 'object') continue;
    addPath(s.other);
    for (const x of [s].concat(s.kind === 'add' && Array.isArray(s.more) ? s.more : [])) {
      if (!x || typeof x !== 'object') continue;
      if (x.from === 'input') addPath(x.path);
      if (x.from === 'expr') for (const m of String(x.expr || '').match(NAME_IN_EXPR) || []) out.add(m);
    }
  }
  return out;
}
function resultNames(inputNames, pipelines) {
  const owner = new Map();
  const errors = [];
  pipelines.forEach((p, i) => {
    const n = String(p.name || '').trim();
    if (!n) return;
    if (inputNames.has(n) || owner.has(n)) { errors[i] = { code: 'nameTaken', params: { name: n } }; return; }
    owner.set(n, i);
  });
  return { owner, errors };
}
function dependsOn(deps, owner) {
  const memo = new Map();
  const reach = (i) => {
    if (memo.has(i)) return memo.get(i);
    const seen = new Set();
    memo.set(i, seen);
    for (const n of deps[i]) {
      const j = owner.get(n);
      if (j === undefined || j === i || seen.has(j)) continue;
      seen.add(j);
      for (const k of reach(j)) seen.add(k);
    }
    return seen;
  };
  return reach;
}
function runOrder(deps, owner) {
  const pending = deps.map((_, i) => i);
  const done = new Set();
  const order = [];
  while (pending.length) {
    let at = pending.findIndex((i) => Array.from(deps[i]).every((n) => { const j = owner.get(n); return j === undefined || j === i || done.has(j); }));
    if (at < 0) at = 0;
    const i = pending.splice(at, 1)[0];
    done.add(i);
    order.push(i);
  }
  return order;
}

function valueAt(root, path) {
  let cur = root;
  for (const seg of String(path || '').split('.').filter(Boolean)) {
    if (Array.isArray(cur)) cur = cur.map((x) => (isPlainObject(x) ? x[seg] : undefined)).filter((x) => x !== undefined).flat();
    else if (isPlainObject(cur)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}
function asList(v) {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function columnsOf(list) {
  const cols = [];
  const add = (c) => { if (cols.indexOf(c) < 0) cols.push(c); };
  const walk = (v, prefix, depth) => {
    if (isPlainObject(v) && depth < 3) {
      for (const k of Object.keys(v)) {
        if (k === '#text') continue;
        const name = k.charAt(0) === '@' ? k.slice(1) : k;
        walk(v[k], prefix ? prefix + '.' + name : name, depth + 1);
      }
      return;
    }
    add(prefix);
  };
  for (const el of list.slice(0, 200)) walk(el, '', 0);
  return cols;
}
function cell(el, col) {
  if (!col) return el;
  let cur = el;
  for (const seg of col.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = Object.prototype.hasOwnProperty.call(cur, seg) ? cur[seg] : cur['@' + seg];
  }
  return cur;
}
function shown(v) {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length && v.every((x) => !isPlainObject(x)) ? v.map(textOf).join(', ') : '[' + v.length + ']';
  if (isPlainObject(v)) return '{…}';
  return textOf(v);
}
function view(v) {
  if (Array.isArray(v)) return { kind: 'list', count: v.length, data: v.slice(0, 200) };
  if (isPlainObject(v)) return { kind: 'object', count: Object.keys(v).length, data: v };
  return { kind: 'value', value: v === undefined ? null : v, text: shown(v) };
}

const OBJECT_STEPS = ['merge', 'columns', 'drop', 'flatten', 'change', 'add', 'take', 'asList'];
const VALUE_ONLY_STEPS = ['change'];
function stepsFor(kind) {
  if (kind === 'list') return LIST_STEPS.concat(['add'], VALUE_STEPS);
  if (kind === 'object') return OBJECT_STEPS;
  return VALUE_ONLY_STEPS;
}

// A field an XML attribute holds (@Name) is written where it is, not next to it.
function keyIn(node, seg) {
  return !Object.prototype.hasOwnProperty.call(node, seg) && Object.prototype.hasOwnProperty.call(node, '@' + seg) ? '@' + seg : seg;
}
function setPath(obj, path, value) {
  const segs = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const k = keyIn(cur, segs[i]);
    if (!isPlainObject(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keyIn(cur, segs[segs.length - 1])] = value === undefined ? null : value;
  return obj;
}
function removeAt(node, segs) {
  if (Array.isArray(node)) { node.forEach((x) => removeAt(x, segs)); return; }
  if (!isPlainObject(node) || !segs.length) return;
  const [seg, ...rest] = segs;
  if (!rest.length) { delete node[seg]; delete node['@' + seg]; return; }
  const key = Object.prototype.hasOwnProperty.call(node, seg) ? seg : '@' + seg;
  const child = node[key];
  const wasFilled = isPlainObject(child) && Object.keys(child).length > 0;
  removeAt(child, rest);
  if (wasFilled && !Object.keys(child).length) delete node[key];
}
function removePath(obj, path) {
  removeAt(obj, String(path).split('.').filter(Boolean));
  return obj;
}

function plainKey(k) { return k.charAt(0) === '@' ? k.slice(1) : k; }

function deepFields(v) {
  const out = [];
  const seen = new Map();
  const add = (path, kind, viaList) => {
    if (!path) return;
    const was = seen.get(path);
    if (was) { if (kind === 'list') was.kind = 'list'; else if (was.kind === 'value' && kind === 'object') was.kind = 'object'; was.viaList = was.viaList || viaList; return; }
    if (out.length >= 400) return;
    const f = { path, kind, viaList };
    seen.set(path, f);
    out.push(f);
  };
  const walk = (node, prefix, depth, viaList) => {
    if (depth > 6) return;
    if (Array.isArray(node)) { node.slice(0, 200).forEach((x) => walk(x, prefix, depth, viaList)); return; }
    if (!isPlainObject(node)) return;
    for (const k of Object.keys(node)) {
      if (k === '#text') continue;
      const path = prefix ? prefix + '.' + plainKey(k) : plainKey(k);
      const val = node[k];
      if (Array.isArray(val)) { add(path, 'list', viaList); walk(val, path, depth + 1, true); }
      else if (isPlainObject(val)) { add(path, 'object', viaList); walk(val, path, depth + 1, viaList); }
      else add(path, 'value', viaList);
    }
  };
  walk(v, '', 0, false);
  return out;
}

function namedInto(row, name, value, parent, keepParent) {
  let to = keepParent && parent ? parent + '_' + name : name;
  if (Object.prototype.hasOwnProperty.call(row, to)) to = parent ? parent + '_' + name : to;
  let n = 2;
  const base = to;
  while (Object.prototype.hasOwnProperty.call(row, to)) to = base + '_' + n++;
  row[to] = value;
}
function objectPaths(list) {
  const out = new Set();
  const walk = (node, prefix, depth) => {
    if (depth > 8 || !isPlainObject(node)) return;
    for (const k of Object.keys(node)) {
      const path = prefix ? prefix + '.' + plainKey(k) : plainKey(k);
      if (isPlainObject(node[k])) { out.add(path); walk(node[k], path, depth + 1); }
    }
  };
  list.forEach((el) => walk(el, '', 0));
  return out;
}
function spreadObject(obj, parent, keepParent, row, path, objects) {
  for (const k of Object.keys(obj)) {
    const name = k === '#text' ? (parent || 'value') : plainKey(k);
    const val = obj[k];
    const at = path ? path + '.' + plainKey(k) : plainKey(k);
    if (isPlainObject(val)) spreadObject(val, k === '#text' ? parent : (keepParent && parent ? parent + '_' + name : name), keepParent, row, at, objects);
    else if (objects && k !== '#text' && objects.has(at) && (val === null || val === undefined || val === '')) continue;
    else namedInto(row, name, clone(val), k === '#text' ? '' : parent, keepParent);
  }
}
function flatAll(el, keepParent, objects) {
  if (!isPlainObject(el)) return el;
  const row = {};
  for (const k of Object.keys(el)) {
    const name = plainKey(k);
    const val = el[k];
    if (isPlainObject(val)) spreadObject(val, name, keepParent, row, name, objects);
    else if (objects.has(name) && (val === null || val === undefined || val === '')) continue;
    else namedInto(row, k === '#text' ? 'value' : name, clone(val), '', false);
  }
  return row;
}
function pruneEmpty(obj, segs) {
  for (let n = segs.length; n > 0; n--) {
    const parent = n > 1 ? cell(obj, segs.slice(0, n - 1).join('.')) : obj;
    if (!isPlainObject(parent)) return;
    const key = Object.prototype.hasOwnProperty.call(parent, segs[n - 1]) ? segs[n - 1] : '@' + segs[n - 1];
    const v = parent[key];
    if ((isPlainObject(v) && !Object.keys(v).length) || v === '' || v === null) delete parent[key];
    else return;
  }
}
function fieldIsList(list, field) {
  return list.some((el) => Array.isArray(cell(el, field)));
}
function flattened(list, step) {
  const field = String(step.field || '').trim();
  const keepParent = step.names !== 'own';
  if (!field) {
    const objects = objectPaths(list);
    return list.map((el) => flatAll(el, keepParent, objects));
  }
  const segs = field.split('.');
  const leaf = segs[segs.length - 1];
  const holderPath = segs.slice(0, -1).join('.');
  const asList = fieldIsList(list, field);
  const itemObjects = objectPaths(list.flatMap((el) => { const v = cell(el, field); return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]; }));
  const out = [];
  for (const el of list) {
    if (!isPlainObject(el)) { out.push(el); continue; }
    const value = cell(el, field);
    const base = clone(el);
    const holder = holderPath ? cell(base, holderPath) : base;
    if (!isPlainObject(holder)) { if (asList) pruneEmpty(base, segs.slice(0, -1)); if (!asList || step.keepEmpty !== false) out.push(base); continue; }
    delete holder[leaf];
    delete holder['@' + leaf];
    const into = (target, item) => {
      if (isPlainObject(item)) spreadObject(item, leaf, keepParent, target, '', itemObjects);
      else namedInto(target, leaf, clone(item === undefined ? null : item), '', false);
    };
    if (!asList) {
      if (value !== undefined && value !== null) into(holder, value);
      out.push(base);
      continue;
    }
    pruneEmpty(base, segs.slice(0, -1));
    const items = value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value];
    if (!items.length) { if (step.keepEmpty !== false) out.push(base); continue; }
    for (const item of items) {
      const copy = clone(base);
      into(copy, item);
      out.push(copy);
    }
  }
  return out;
}

function unmarked(v) {
  if (Array.isArray(v)) return v.map(unmarked);
  if (!isPlainObject(v)) return v;
  const out = {};
  for (const k of Object.keys(v)) {
    let name = k === '#text' ? 'value' : plainKey(k);
    if (Object.prototype.hasOwnProperty.call(out, name)) name = k;
    out[name] = unmarked(v[k]);
  }
  return out;
}
function textFirst(node) {
  return Object.keys(node).sort((a, b) => (b === '#text') - (a === '#text'));
}
function tableColumns(rows) {
  const lists = new Set();
  const objects = new Set();
  const labelOf = (k, prefix) => (k === '#text' ? prefix || 'value' : prefix ? prefix + '.' + plainKey(k) : plainKey(k));
  const scan = (node, prefix, depth) => {
    for (const k of Object.keys(node)) {
      const name = labelOf(k, prefix);
      const val = node[k];
      if (Array.isArray(val)) lists.add(name);
      else if (isPlainObject(val) && depth < 6) { objects.add(name); scan(val, name, depth + 1); }
    }
  };
  const sample = rows.slice(0, 1000).filter(isPlainObject);
  sample.forEach((r) => scan(r, '', 0));
  const cols = [];
  const add = (name) => { if (cols.indexOf(name) < 0) cols.push(name); };
  const walk = (node, prefix, depth) => {
    for (const k of textFirst(node)) {
      const name = labelOf(k, prefix);
      const val = node[k];
      if (lists.has(name)) add(name);
      else if (isPlainObject(val) && depth < 6) walk(val, name, depth + 1);
      else if (objects.has(name) && k !== '#text' && (val === '' || val === null || val === undefined)) continue;
      else add(name);
    }
  };
  sample.forEach((r) => walk(r, '', 0));
  return cols;
}
function tableCell(row, col) {
  const segs = col.split('.');
  let cur = row;
  for (const seg of segs) {
    if (!isPlainObject(cur)) return undefined;
    cur = Object.prototype.hasOwnProperty.call(cur, seg) ? cur[seg] : Object.prototype.hasOwnProperty.call(cur, '@' + seg) ? cur['@' + seg] : undefined;
  }
  if (isPlainObject(cur) && Object.prototype.hasOwnProperty.call(cur, '#text')) return cur['#text'];
  if (cur === undefined && col === 'value' && isPlainObject(row)) return row['#text'];
  return cur;
}
function csvText(v) {
  const rows = Array.isArray(v) ? v : [v];
  const quote = (x) => {
    if (x === undefined || x === null) return '';
    const t = Array.isArray(x) ? (x.every((y) => !isPlainObject(y) && !Array.isArray(y)) ? x.map((y) => (y === null || y === undefined ? '' : String(y))).join(', ') : JSON.stringify(unmarked(x))) : isPlainObject(x) ? JSON.stringify(unmarked(x)) : String(x);
    return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  if (!rows.some(isPlainObject)) return ['value'].concat(rows.map(quote)).join('\n') + '\n';
  const cols = tableColumns(rows);
  return [cols.map(quote).join(',')].concat(rows.map((r) => cols.map((c) => quote(isPlainObject(r) ? tableCell(r, c) : (c === 'value' ? r : undefined))).join(','))).join('\n') + '\n';
}
const RESULT_FORMATS = ['json', 'xml', 'yaml', 'properties', 'csv'];
function plainOutput(v, format, name) {
  if (format === 'csv') return csvText(v);
  if (format === 'xml') return serialize(v, 'xml', name);
  return serialize(unmarked(v), RESULT_FORMATS.indexOf(format) >= 0 ? format : 'json', name);
}
// A comment before each element of a list (before an object: one), its text
// the value of one of the element's fields. CSV has no comments.
const COMMENT_FORMATS = ['json', 'xml', 'yaml', 'properties'];
function commentLine(text, format, indent) {
  const t = String(text).replace(/\s*[\r\n]+\s*/g, ' ').trim();
  if (format === 'xml') return indent + '<!-- ' + t.replace(/--/g, '- -').replace(/-$/, '- ') + ' -->';
  if (format === 'json') return indent + '// ' + t;
  return indent + '# ' + t;
}
function outputText(v, format, name, opts) {
  const field = String((opts && opts.commentField) || '').trim();
  if (!field || COMMENT_FORMATS.indexOf(format) < 0 || (!Array.isArray(v) && !isPlainObject(v))) return plainOutput(v, format, name);
  const list = Array.isArray(v) ? v : [v];
  const texts = list.map((el) => { const c = isPlainObject(el) ? cell(el, field) : undefined; return c === undefined || c === null || typeof c === 'object' ? '' : textOf(c); });
  const data = opts.keepField === false ? list.map((el) => (isPlainObject(el) ? removePath(clone(el), field) : el)) : list;
  const value = Array.isArray(v) ? data : data[0];
  if (format === 'json' && !Array.isArray(v)) return (texts[0] ? commentLine(texts[0], 'json', '') + '\n' : '') + plainOutput(value, format, name);
  if (format === 'json') {
    const parts = data.map((el, i) => (texts[i] ? commentLine(texts[i], 'json', '  ') + '\n' : '') + JSON.stringify(unmarked(el), null, 2).replace(/^/gm, '  '));
    return parts.length ? '[\n' + parts.join(',\n') + '\n]\n' : '[]\n';
  }
  const lines = plainOutput(value, format, name).split('\n');
  const out = [];
  let i = 0;
  const starts = format === 'yaml' ? (l) => /^- /.test(l) || (!Array.isArray(v) && out.length === 0 && l !== '')
    : format === 'properties' ? (l) => (Array.isArray(v) ? l.indexOf(name + '[' + i + ']') === 0 : out.length === 0)
    : (l) => /^  <[^/!?]/.test(l);
  for (const l of lines) {
    if (i < texts.length && starts(l)) {
      if (texts[i]) out.push(commentLine(texts[i], format, format === 'xml' ? '  ' : ''));
      i++;
    }
    out.push(l);
  }
  return out.join('\n');
}
function dropped(el, step) {
  if (!isPlainObject(el)) return el;
  const out = clone(el);
  for (const f of (step.fields || []).map((x) => String(x || '').trim()).filter(Boolean)) removePath(out, f);
  return out;
}
function addedValue(step, el, root, scope, ctx, known) {
  const own = isPlainObject(el) ? el : {};
  if (step.from === 'column') { const v = cell(el, step.column || ''); return v === undefined ? null : clone(v); }
  if (step.from === 'input') { const v = valueAt(root, step.path || ''); return v === undefined ? null : clone(v); }
  if (step.from === 'calc') {
    const col = String(step.column || '').trim();
    if (!step.how || !step.how.kind) { const v = col ? cell(el, col) : el; return v === undefined ? null : clone(v); }
    const r = runHow(step.how, col ? '__el.' + col : '__el', [{ value: own, self: '' }, { value: { __el: el } }].concat(scope), ctx);
    return r.value === undefined ? null : r.value;
  }
  if (step.from === 'parts') {
    return (step.parts || []).map((p) => {
      if (p.kind !== 'field') return p.value === undefined || p.value === null ? '' : String(p.value);
      const v = cell(el, p.value || '');
      return v === undefined || v === null || typeof v === 'object' ? '' : textOf(v);
    }).join('');
  }
  if (step.from === 'expr') {
    const text = String(step.expr || '').trim();
    if (!text) return null;
    const lookup = (name) => {
      const v = cell(own, name);
      if (v === '') return null;
      if (v !== undefined) return v;
      const first = String(name).split('.')[0];
      if (Object.prototype.hasOwnProperty.call(root, first)) { const r = valueAt(root, name); return r === undefined ? null : r; }
      if (known.some((c) => c === name || c.indexOf(name + '.') === 0 || String(name).indexOf(c + '.') === 0)) return null;
      throw new RunError('unknownName', { name });
    };
    return evalExpr(text, lookup, ctx.opts).value;
  }
  return step.value === undefined ? '' : step.value;
}
function changed(el, step, scope, ctx) {
  const col = String(step.field || '').trim();
  const r = runHow(step.how, col ? '__el.' + col : '__el', [{ value: isPlainObject(el) ? el : {}, self: '' }, { value: { __el: el } }].concat(scope), ctx);
  if (!isPlainObject(el)) return r.value === undefined ? null : r.value;
  const to = String(step.as || '').trim() || col;
  return setPath(clone(el), to, r.value);
}
// Change column with no transformation and another name: the column renamed,
// in its place when it is a field of the element itself.
function renamed(el, step) {
  const from = String(step.field || '').trim();
  const to = String(step.as || '').trim();
  if (!from || !to || to === from || !isPlainObject(el)) return el;
  const v = cell(el, from);
  if (v === undefined) return el;
  if (from.indexOf('.') < 0 && to.indexOf('.') < 0) {
    const key = Object.prototype.hasOwnProperty.call(el, from) ? from : '@' + from;
    const out = {};
    for (const k of Object.keys(el)) { if (k === key) out[to] = clone(v); else if (k !== to) out[k] = clone(el[k]); }
    return out;
  }
  const out = clone(el);
  removePath(out, from);
  return setPath(out, to, clone(v));
}
function picked(el, step) {
  const out = {};
  for (const c of (step.columns || []).filter((x) => String(x.from || '').trim())) {
    const v = cell(el, c.from);
    setPath(out, String(c.as || '').trim() || c.from.split('.').pop(), v === undefined ? null : clone(v));
  }
  return out;
}

function merged(cur, step, root) {
  const single = !Array.isArray(cur);
  const list = single ? [cur] : cur;
  const otherPath = String(step.other || '').trim();
  if (!otherPath) throw new RunError('noList');
  const otherValue = valueAt(root, otherPath);
  const keys = isPlainObject(otherValue) ? [] : (step.keys || []).filter((k) => String(k.a || '').trim() && String(k.b || '').trim());
  if (!keys.length && !isPlainObject(otherValue)) throw new RunError('noKeys');
  const others = asList(otherValue).filter((x) => x !== null && x !== undefined);
  const label = otherPath.split('.').pop();
  const take = (step.fields || []).map((f) => String(f || '').trim()).filter(Boolean);
  const otherCols = take.length ? take : Array.from(new Set([].concat(...others.filter(isPlainObject).map((o) => Object.keys(o).filter((k) => k !== '#text').map(plainKey)))))
    .filter((c) => !keys.some((k) => k.b === c));
  const taken = (row, name) => Object.prototype.hasOwnProperty.call(row, name) || Object.prototype.hasOwnProperty.call(row, '@' + name);
  const out = [];
  for (const el of list) {
    const match = !keys.length ? others[0] : others.find((o) => keys.every((k) => {
      const a = cell(el, k.a), b = cell(o, k.b);
      return a !== undefined && a !== null && b !== undefined && b !== null && same(a, b);
    }));
    if (match === undefined && step.keep !== 'all' && !single) continue;
    const row = isPlainObject(el) ? clone(el) : { value: el };
    for (const c of otherCols) {
      const v = match === undefined ? null : cell(match, c);
      const name = c.split('.').pop();
      const to = taken(row, name) ? name + '_' + label : name;
      row[to] = v === undefined ? null : clone(v);
    }
    out.push(row);
  }
  return single ? out[0] : out;
}

// Several columns in one step. A step keeps its first column in `field` too,
// so a lab written before still reads the same.
function fieldsOf(x) {
  const many = Array.isArray(x.fields) ? x.fields.map((f) => String(f || '').trim()).filter(Boolean) : [];
  if (many.length) return Array.from(new Set(many));
  const one = String(x.field || '').trim();
  return one ? [one] : [];
}
function sortKeys(step) {
  if (Array.isArray(step.keys) && step.keys.length) return step.keys.filter((k) => k && typeof k.field === 'string' && (k.field.trim() || k.field === ''));
  return String(step.field || '').trim() || step.field === '' ? [{ field: step.field || '', desc: !!step.desc }] : [];
}
function sortedBy(list, keys) {
  const keyed = list.map((el, i) => ({ el, i, k: keys.map((k) => { const v = cell(el, String(k.field || '').trim()); return v === undefined ? null : v; }) }));
  const missing = (v) => v === null || v === undefined;
  keyed.sort((a, b) => {
    for (let n = 0; n < keys.length; n++) {
      const x = a.k[n], y = b.k[n];
      let c;
      if (missing(x) || missing(y)) c = missing(x) && missing(y) ? 0 : missing(x) ? -1 : 1;
      else c = cmp(x, y);
      if (c) return keys[n].desc ? -c : c;
    }
    return a.i - b.i;
  });
  return keyed.map((x) => x.el);
}
function filteredBy(list, step, root, ctx) {
  const conds = (step.conditions || []).filter((c) => fieldsOf(c).length);
  if (!conds.length) return list;
  if (conds.every((c) => fieldsOf(c).length === 1)) {
    const scope = [{ value: Object.assign({}, root, { __in: list }) }];
    return runStream({ list: '__in', chain: [{ op: 'filter', conditions: conds.map((c) => Object.assign({}, c, { field: fieldsOf(c)[0] })), join: step.join }], end: { op: 'toList' } }, scope, ctx);
  }
  const box = Object.assign({}, root);
  const scope = [{ value: box }];
  const test = (el, c, f) => {
    box.__one = [el];
    return runStream({ list: '__one', chain: [{ op: 'filter', conditions: [Object.assign({}, c, { field: f })] }], end: { op: 'toList' } }, scope, ctx).length > 0;
  };
  return list.filter((el) => {
    const hits = conds.map((c) => {
      const fs = fieldsOf(c);
      return c.match === 'all' ? fs.every((f) => test(el, c, f)) : fs.some((f) => test(el, c, f));
    });
    return step.join === 'or' ? hits.some(Boolean) : hits.every(Boolean);
  });
}
function distinctBy(list, fields) {
  const seen = new Set();
  return list.filter((el) => {
    const k = JSON.stringify(fields.map((f) => { const v = cell(el, f); return v === undefined ? null : v; }));
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function changedAll(el, step, scope, ctx) {
  const fs = fieldsOf(step);
  if (!(step.how && step.how.kind) || !fs.length) return fs.length === 1 ? renamed(el, Object.assign({}, step, { field: fs[0] })) : el;
  if (fs.length === 1) return changed(el, Object.assign({}, step, { field: fs[0] }), scope, ctx);
  let out = el;
  for (const f of fs) if (cell(out, f) !== undefined) out = changed(out, Object.assign({}, step, { field: f, as: '' }), scope, ctx);
  return out;
}
// Add field: the step is the first field, `more` the next ones, in order;
// a field added sees the fields added before it.
function addItems(step) {
  return [step].concat(Array.isArray(step.more) ? step.more : []).filter((x) => x && String(x.name || '').trim());
}
function addedAll(el, items, root, scope, ctx, known) {
  let out = isPlainObject(el) ? clone(el) : { value: el };
  for (const it of items) out = setPath(out, String(it.name).trim(), addedValue(it, isPlainObject(el) ? out : el, root, scope, ctx, known.concat(items.map((x) => String(x.name).trim()))));
  return out;
}

function stepOn(cur, step, root, ctx) {
  const kind = kindOf(cur);
  if (stepsFor(kind).indexOf(step.kind) < 0) throw new RunError('stepNotFor', { step: step.kind, kind });
  const list = Array.isArray(cur) ? cur : [cur];
  const scope = [{ value: Object.assign({}, root, { __in: list }) }];
  const stream = (part, end) => runStream({ list: '__in', chain: part ? [part] : [], end: end || { op: 'toList' } }, scope, ctx);
  if (kind === 'object') {
    switch (step.kind) {
      case 'merge': return merged(cur, step, root);
      case 'columns': return (step.columns || []).some((x) => String(x.from || '').trim()) ? picked(cur, step) : cur;
      case 'drop': return dropped(cur, step);
      case 'flatten': { const r = flattened([cur], step); return r.length === 1 ? r[0] : r; }
      case 'change': return changedAll(cur, step, scope, ctx);
      case 'add': { const items = addItems(step); return items.length ? addedAll(cur, items, root, scope, ctx, columnsOf([cur])) : cur; }
      case 'take': { if (!String(step.field || '').trim()) return cur; const v = cell(cur, step.field); return v === undefined ? null : v; }
      case 'asList': return [cur];
    }
  }
  if (kind === 'value') {
    return step.how && step.how.kind ? changed(cur, Object.assign({}, step, { field: '' }), scope, ctx) : cur;
  }
  switch (step.kind) {
    case 'filter': return filteredBy(list, step, root, ctx);
    case 'sort': {
      const keys = sortKeys(step);
      if (!keys.length) return list;
      if (keys.length === 1) return stream({ op: keys[0].desc ? 'sortDesc' : 'sort', arg: keys[0].field || '' });
      return sortedBy(list, keys);
    }
    case 'distinct': { const fs = fieldsOf(step); return fs.length > 1 ? distinctBy(list, fs) : stream({ op: 'distinct', arg: fs[0] || '' }); }
    case 'reverse': return list.slice().reverse();
    case 'skip': return stream({ op: 'skip', arg: String(step.n || '0') });
    case 'limit': return stream({ op: 'limit', arg: String(step.n || '0') });
    case 'compare': {
      if (!String(step.other || '').trim()) throw new RunError('noList');
      const op = step.mode === 'notIn' ? 'notInOther' : step.mode === 'join' ? 'joinOther' : 'inOther';
      return stream({ op, arg: step.other, arg2: step.as || '', keys: step.keys || [] });
    }
    case 'merge': return merged(list, step, root);
    case 'append': {
      if (!String(step.other || '').trim()) throw new RunError('noList');
      return list.concat(asList(valueAt(root, step.other)).map(clone));
    }
    case 'columns': return (step.columns || []).some((x) => String(x.from || '').trim()) ? list.map((el) => picked(el, step)) : list;
    case 'change': return list.map((el) => changedAll(el, step, scope, ctx));
    case 'drop': return list.map((el) => dropped(el, step));
    case 'flatten': return flattened(list, step);
    case 'add': {
      const items = addItems(step);
      if (!items.length) return list;
      const known = columnsOf(list);
      return list.map((el) => addedAll(el, items, root, scope, ctx, known));
    }
    case 'first': return stream(null, { op: 'first' });
    case 'last': return stream(null, { op: 'last' });
    case 'nth': {
      if (step.index === undefined) return stream(null, { op: 'nth', arg: String(step.n || '1') });
      const i = parseInt(String(step.index).trim(), 10);
      if (!(i >= 0)) throw new RunError('notInteger', { value: String(step.index) });
      return i < list.length ? clone(list[i]) : null;
    }
    case 'count': return list.length;
    case 'sum': case 'min': case 'max': case 'avg': return stream(null, { op: step.kind, arg: step.field || '' });
    case 'join': return stream(null, { op: 'join', arg: step.sep === undefined ? ', ' : step.sep });
  }
  throw new RunError('unknownHow', { name: step.kind });
}

function runDocument(doc, options) {
  const ctx = { opts: options || {} };
  const { values, states } = readInputs(doc.inputs);
  const root = Object.assign({}, values);
  const out = { inputs: states, pipelines: [], inputData: {} };
  for (const n of Object.keys(values)) out.inputData[n] = view(values[n]);
  const pipelines = doc.pipelines || [];
  const inputNames = new Set((doc.inputs || []).map((x) => String(x.name || '').trim()).filter(Boolean));
  const { owner, errors } = resultNames(inputNames, pipelines);
  const deps = pipelines.map(refsOf);
  const reach = dependsOn(deps, owner);
  const computed = new Set();
  const colsOf = (v) => (Array.isArray(v) ? columnsOf(v) : isPlainObject(v) ? columnsOf([v]) : []);
  pipelines.forEach((p) => out.pipelines.push({ name: p.name || '', source: p.source || '', steps: [] }));
  for (const pi of runOrder(deps, owner)) {
    const p = pipelines[pi];
    const res = out.pipelines[pi];
    if (errors[pi]) res.nameError = errors[pi];
    const from = owner.get(headOf(p.source));
    if (from !== undefined && from !== pi && !computed.has(from)) { res.sourceView = null; res.error = { code: 'cycle', params: { name: headOf(p.source) } }; continue; }
    let cur = String(p.source || '').trim() ? valueAt(root, p.source) : undefined;
    if (cur === undefined) { res.sourceView = null; continue; }
    res.sourceView = view(cur);
    res.sourceKind = kindOf(cur);
    res.sourceColumns = colsOf(cur);
    let broken = false;
    for (const step of p.steps || []) {
      const st = { kindBefore: kindOf(cur), columns: colsOf(cur), fields: deepFields(cur) };
      res.steps.push(st);
      if (broken) { st.error = { code: 'afterError' }; continue; }
      try {
        cur = stepOn(cur, step, root, ctx);
        st.view = view(cur);
      } catch (e) {
        if (!(e instanceof RunError)) throw e;
        st.error = { code: e.code, params: e.params };
        broken = true;
      }
    }
    res.endKind = kindOf(cur);
    res.endColumns = colsOf(cur);
    res.result = cur;
    if (owner.get(String(p.name || '').trim()) === pi) {
      root[p.name.trim()] = cur;
      res.resultView = view(cur);
      computed.add(pi);
    }
  }
  const results = [];
  owner.forEach((i, name) => { if (computed.has(i)) results.push({ name, index: i, value: root[name] }); });
  results.sort((a, b) => a.index - b.index);
  out.pipelines.forEach((res, pi) => {
    res.sources = sourcesOf(values, results.filter((r) => r.index !== pi && !reach(r.index).has(pi)));
  });
  out.root = root;
  return out;
}

function changeCatalog(t) {
  const { HOW_EXTRA } = require('./howKinds');
  const out = [
    { kind: 'asText', group: 'how.g.common', params: [] },
    { kind: 'asNumber', group: 'how.g.common', params: [] },
    { kind: 'asDate', group: 'how.g.common', params: [{ key: 'format', labelKey: 'how.format', options: ['RRRR-MM-DD', 'DD.MM.RRRR', 'RRRR-MM-DD gg:mm:ss', 'DD.MM.RRRR gg:mm'].map((f) => [f, f]), def: 'RRRR-MM-DD' }] },
    { kind: 'trim', group: 'how.g.text', params: [] },
    { kind: 'upper', group: 'how.g.text', params: [] },
    { kind: 'lower', group: 'how.g.text', params: [] },
    { kind: 'round', group: 'how.g.number', params: [{ key: 'n', labelKey: 'how.p.decimals', def: '2', size: 3 }] }
  ].concat(HOW_EXTRA.filter((k) => k.group !== 'how.g.list').map((k) => ({
    kind: k.kind, group: k.group,
    params: k.params.map((p) => ({ key: p.key, labelKey: p.labelKey || (p.type === 'field' ? 'how.p.fieldOrValue' : 'how.p.' + p.key), def: p.def, size: p.size,
      options: p.options ? p.options.map((o) => [o[0], t(o[1])]) : undefined }))
  })));
  return out.map((k) => ({ kind: k.kind, group: t(k.group), label: t('how.k.' + k.kind),
    params: k.params.map((p) => ({ key: p.key, label: p.labelKey ? t(p.labelKey) : p.key, def: p.def, size: p.size, options: p.options })) }));
}

module.exports = { RESULT_FORMATS, COMMENT_FORMATS, outputText, csvText, deepFields, STEP_KINDS, LIST_STEPS, VALUE_STEPS, OBJECT_STEPS, stepsFor, kindOf, readInputs, listsIn, sourcesOf, columnsOf, runDocument, view, valueAt, asList, changeCatalog };
