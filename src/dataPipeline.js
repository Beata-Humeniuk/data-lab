// Transforming data step by step, with the result of every step shown
// (owner, 2026-11-15: „mam dwie listy i od czterech godzin nie mogę ich
// przekształcić … to ma być proste w obsłudze"). The lab's own model:
//
//   doc = {
//     inputs: [{ name, text, format }],
//     pipelines: [{ name, source, steps: [step…] }]
//   }
//
// An input is a sample in any format sampleFormats reads; a pipeline takes a
// list (a path in an input, or another pipeline's result) and runs its
// steps in turn. A step that keeps a list (filter, sort, distinct, reverse,
// compare, columns, change) hands a list on; a step that makes one value
// (first, last, nth, count, sum, min, max, avg) ends the pipeline.
//
// The list steps are the flow run's own (flowRun.runStream) — the same
// results as in a flow — and a column is changed by the ways of the "+ ƒ"
// list (flowRun.runHow).

const { parseSample } = require('./sampleFormats');
const { runStream, runHow, same } = require('./flowRun');
const { RunError, isPlainObject, textOf, evalExpr } = require('./mappingRun');

const LIST_STEPS = ['filter', 'sort', 'distinct', 'reverse', 'merge', 'compare', 'append', 'columns', 'drop', 'change', 'skip', 'limit'];
const VALUE_STEPS = ['first', 'last', 'nth', 'count', 'sum', 'min', 'max', 'avg', 'join'];
const STEP_KINDS = LIST_STEPS.concat(VALUE_STEPS, ['add', 'take', 'asList']);

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

// The inputs read: { name → value }, and what each read as.
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
    // An XML document is its root element's content.
    if (p.format === 'xml' && isPlainObject(value) && Object.keys(value).length === 1) value = value[Object.keys(value)[0]];
    values[name] = value;
    states[name] = { ok: true, format: p.format };
  }
  return { values, states };
}

// Every list in a value, by its path: an array, or an element repeated in
// an XML document (read as an array) — and its size.
function listsIn(value, base, out, depth) {
  out = out || [];
  if (depth > 8) return out;
  if (Array.isArray(value)) {
    out.push({ path: base, count: value.length });
    const first = value.find((x) => isPlainObject(x));
    if (first) {
      // Lists inside the elements: by their path under the element.
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

// What a value is: a list, an object, one value.
function kindOf(v) { return Array.isArray(v) ? 'list' : isPlainObject(v) ? 'object' : 'value'; }

// What a transformation can start from (owner, 2026-11-15: „dlaczego tylko
// listę mogę wybrać? Przecież nie tylko na listach się operuje"): every
// input as a whole, every object and list in it, every field — and the
// results of the transformations before. { path, kind, count }.
function sourcesOf(values, pipelines, upTo, resultKinds) {
  const out = [];
  const seen = new Set();
  const add = (path, kind, count) => { if (path && !seen.has(path) && out.length < 400) { seen.add(path); out.push({ path, kind, count }); } };
  const walk = (v, path, depth) => {
    if (depth > 8) return;
    if (Array.isArray(v)) {
      add(path, 'list', v.length);
      // Lists inside its elements, by their path under the element.
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
  (pipelines || []).slice(0, upTo === undefined ? undefined : upTo).forEach((pl, i) => {
    const n = String(pl.name || '').trim();
    if (n) add(n, (resultKinds || {})[n] || 'list', null);
  });
  return out;
}

// A path read from the inputs and the pipelines' results.
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

// The columns of a list: the element's fields, nested ones by a dotted
// path (lists inside are one column each); a list of plain values has one
// column, "" — the value itself.
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
// What a step gives, for the table: a list (columns and rows, the first
// 200), an object (one row), a value.
// The page draws the data itself — the first level as a table, what is
// nested opened on a click — so a view carries the value (a list's first
// 200 elements).
function view(v) {
  if (Array.isArray(v)) return { kind: 'list', count: v.length, data: v.slice(0, 200) };
  if (isPlainObject(v)) return { kind: 'object', count: Object.keys(v).length, data: v };
  return { kind: 'value', value: v === undefined ? null : v, text: shown(v) };
}

// The steps each kind of value takes.
const OBJECT_STEPS = ['merge', 'columns', 'drop', 'change', 'add', 'take', 'asList'];
const VALUE_ONLY_STEPS = ['change'];
function stepsFor(kind) {
  if (kind === 'list') return LIST_STEPS.concat(['add'], VALUE_STEPS);
  if (kind === 'object') return OBJECT_STEPS;
  return VALUE_ONLY_STEPS;
}

function setPath(obj, path, value) {
  const segs = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) { if (!isPlainObject(cur[segs[i]])) cur[segs[i]] = {}; cur = cur[segs[i]]; }
  cur[segs[segs.length - 1]] = value === undefined ? null : value;
  return obj;
}
function removePath(obj, path) {
  const segs = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) { if (!isPlainObject(cur)) return obj; cur = cur[segs[i]]; }
  if (isPlainObject(cur)) { delete cur[segs[segs.length - 1]]; delete cur['@' + segs[segs.length - 1]]; }
  return obj;
}
function dropped(el, step) {
  if (!isPlainObject(el)) return el;
  const out = clone(el);
  for (const f of (step.fields || []).map((x) => String(x || '').trim()).filter(Boolean)) removePath(out, f);
  return out;
}
// A field added (owner, 2026-11-15: „nowe pole, które będzie jakimś
// przekształceniem innych pól lub stałą lub wzięte z jeszcze innego
// miejsca"): a constant, another field, a value of any input or result, a
// field worked out by the "+ ƒ" ways (chained), fields and texts put
// together, or an expression over the fields. `known` — the fields the
// list's elements have: one an element lacks is empty there, a name no
// element has is an unknown name.
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
  // The row's own fields first: a parameter may name one („kwota").
  const r = runHow(step.how, col ? '__el.' + col : '__el', [{ value: isPlainObject(el) ? el : {}, self: '' }, { value: { __el: el } }].concat(scope), ctx);
  if (!isPlainObject(el)) return r.value === undefined ? null : r.value;
  const to = String(step.as || '').trim() || col;
  return setPath(clone(el), to, r.value);
}
function picked(el, step) {
  const out = {};
  for (const c of (step.columns || []).filter((x) => String(x.from || '').trim())) {
    const v = cell(el, c.from);
    out[String(c.as || '').trim() || c.from.split('.').pop()] = v === undefined ? null : clone(v);
  }
  return out;
}

// Two lists merged by pairs of fields (owner, 2026-11-15: „chcę obie listy
// zmergować po różnych parametrach"): each element of this list with the
// fields of its match in the other; `keep` 'all' keeps the elements without
// a match too (their other fields empty), 'matched' only those with one.
// A field both have keeps this list's value; the other's comes in as
// "<field>_<other list>". `fields`: the other's fields to take ([] — all).
// An object merges the same way — with another object (its fields come
// in, no pairs needed) or with the element of a list its pairs match; a
// list merged with an object gets the object's fields in every element.
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
  // The other's fields: those picked, or every first-level field but the
  // ones matched on (they equal this list's).
  const otherCols = take.length ? take : Array.from(new Set([].concat(...others.filter(isPlainObject).map((o) => Object.keys(o)))))
    .filter((c) => c !== '#text' && !keys.some((k) => k.b === c));
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
      const to = Object.prototype.hasOwnProperty.call(row, name) ? name + '_' + label : name;
      row[to] = v === undefined ? null : clone(v);
    }
    out.push(row);
  }
  return single ? out[0] : out;
}

// One step over what the transformation holds now: a list (the flow run's
// list steps), an object or one value.
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
      case 'change': return String(step.field || '').trim() && step.how && step.how.kind ? changed(cur, step, scope, ctx) : cur;
      case 'add': return String(step.name || '').trim() ? setPath(clone(cur), step.name.trim(), addedValue(step, cur, root, scope, ctx, columnsOf([cur]))) : cur;
      case 'take': { if (!String(step.field || '').trim()) return cur; const v = cell(cur, step.field); return v === undefined ? null : v; }
      case 'asList': return [cur];
    }
  }
  if (kind === 'value') {
    return step.how && step.how.kind ? changed(cur, Object.assign({}, step, { field: '' }), scope, ctx) : cur;
  }
  switch (step.kind) {
    case 'filter': {
      const conds = (step.conditions || []).filter((c) => String(c.field || '').trim());
      if (!conds.length) return list;
      return stream({ op: 'filter', conditions: conds, join: step.join });
    }
    case 'sort': return String(step.field || '').trim() || step.field === '' ? stream({ op: step.desc ? 'sortDesc' : 'sort', arg: step.field || '' }) : list;
    case 'distinct': return stream({ op: 'distinct', arg: step.field || '' });
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
    case 'change': return String(step.field || '').trim() && step.how && step.how.kind ? list.map((el) => changed(el, step, scope, ctx)) : list;
    case 'drop': return list.map((el) => dropped(el, step));
    case 'add': {
      if (!String(step.name || '').trim()) return list;
      const known = columnsOf(list);
      return list.map((el) => setPath(isPlainObject(el) ? clone(el) : { value: el }, step.name.trim(), addedValue(step, el, root, scope, ctx, known)));
    }
    case 'first': return stream(null, { op: 'first' });
    case 'last': return stream(null, { op: 'last' });
    // The lab counts from 0, like an index (owner, 2026-11-15:
    // „numerujemy od 0, żeby wiadomo było, który element ma który indeks");
    // a step saved before has its position from 1 in `n`.
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

// The whole document run: the inputs read, every pipeline step by step.
// → { inputs: { name: state }, sources: [...], pipelines: [{ name, source,
//     sourceView, steps: [{ view, columns, error }], result }] }
function runDocument(doc, options) {
  const ctx = { opts: options || {} };
  const { values, states } = readInputs(doc.inputs);
  const root = Object.assign({}, values);
  const out = { inputs: states, pipelines: [], inputData: {} };
  for (const n of Object.keys(values)) out.inputData[n] = view(values[n]);
  const resultKinds = {};
  const colsOf = (v) => (Array.isArray(v) ? columnsOf(v) : isPlainObject(v) ? columnsOf([v]) : []);
  (doc.pipelines || []).forEach((p, pi) => {
    const res = { name: p.name || '', source: p.source || '', steps: [], sources: sourcesOf(values, doc.pipelines, pi, resultKinds) };
    out.pipelines.push(res);
    let cur = String(p.source || '').trim() ? valueAt(root, p.source) : undefined;
    if (cur === undefined) { res.sourceView = null; return; }
    res.sourceView = view(cur);
    res.sourceKind = kindOf(cur);
    res.sourceColumns = colsOf(cur);
    let broken = false;
    for (const step of p.steps || []) {
      const st = { kindBefore: kindOf(cur), columns: colsOf(cur) };
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
    if (String(p.name || '').trim()) { root[p.name.trim()] = cur; resultKinds[p.name.trim()] = kindOf(cur); }
  });
  out.root = root;
  return out;
}

// The ways a column can be changed, for the view: the "+ ƒ" kinds that work
// on one value, with their parameters labelled. t — the catalog's t.
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

module.exports = { STEP_KINDS, LIST_STEPS, VALUE_STEPS, OBJECT_STEPS, stepsFor, kindOf, readInputs, listsIn, sourcesOf, columnsOf, runDocument, view, valueAt, asList, changeCatalog };
