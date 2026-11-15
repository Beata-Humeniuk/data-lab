// A flow run on sample data (owner, 2026-11-15: „chcę mieć możliwość na
// szybko sobie coś sprawdzić … wymyślić jakie przekształcenia porobić i
// jakie kroki na konkretnych przykładach"). The flow's steps are executed in
// order over the samples of its inputs — the request (model zero, its
// fields bare) and the context objects (by name) — and what each step
// produced is kept under its output model, as later steps reference it
// (`model.pole`).
//
// Executed: mapping rows (with every conversion of the compatibility
// popup, value tables, missing-data rules, constants, lists, whole objects,
// list streams), validations built from conditions (all RULE_OPS), built
// transformations (set, calc, if, forEach, stream with every chain step and
// end, decide, return, respond, note), branches of alt/opt fragments.
// A step that takes data from outside (a call, a database, a cache, a
// library) gives what its sample result says — the call's response sample,
// or a result pasted for the run.
//
// What the run cannot decide — a rule in words, an unknown function, an
// operator that needs outside data (existsIn, format) — it says, and it
// never guesses a value or an outcome.
//
// Pure: no vscode.

const run = require('./mappingRun');
const { RunError, evalExpr, walk, textOf, numberOf, truthy, isPlainObject, isDate, splitPath, plainPath, writeAt, parseSample, readWhenNull } = run;
const { pathOf } = require('./fragments');

const DATA_STEPS = ['externalCall', 'dbRead', 'cacheRead', 'libraryCall', 'methodCall', 'componentCall', 'libraryStep'];

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function literal(text) {
  const t = String(text == null ? '' : text).trim();
  const q = t.match(/^(['"])([\s\S]*)\1$/);
  return q ? q[2] : t;
}
function listOf(text) {
  return String(text || '').split(/\s*[,;]\s*/).map(literal).filter((x) => x !== '');
}

// --- names ------------------------------------------------------------------

// Scopes are searched innermost first: an element of a list (its fields
// relative to it), then the flow's data.
function hitsIn(scopes, name) {
  const segs = splitPath(name);
  if (!segs.length) return { known: false, hits: [] };
  // An element of a list (a scope with `self`): a field other elements
  // have and this one lacks is no value here, not an unknown name.
  let inElement = false;
  for (const sc of scopes) {
    if (sc.self !== undefined && isPlainObject(sc.value)) inElement = true;
    if (sc.missing && sc.missing.has(segs[0].name)) throw new RunError('noData', { name: segs[0].name, step: sc.missing.get(segs[0].name) });
    if (sc.value === undefined) continue;
    if (sc.self && segs.length === 1 && segs[0].name === sc.self) return { known: true, hits: [{ value: sc.value, idx: [] }] };
    if (!isPlainObject(sc.value) && !Array.isArray(sc.value)) continue;
    const first = sc.value[segs[0].name];
    if (first === undefined && !(isPlainObject(sc.value) && Object.prototype.hasOwnProperty.call(sc.value, '@' + segs[0].name))) continue;
    const out = [];
    walk(sc.value, segs, 0, [], out);
    return { known: true, hits: out };
  }
  return { known: inElement, hits: [], absent: inElement };
}
function valueIn(scopes, name) {
  const r = hitsIn(scopes, name);
  if (!r.known) throw new RunError('unknownName', { name });
  if (!r.hits.length) return null;
  return r.hits.length === 1 ? r.hits[0].value : r.hits.map((h) => h.value);
}
// The elements a list field holds: every value the path reaches.
function elementsIn(scopes, name) {
  const r = hitsIn(scopes, name);
  if (!r.known) throw new RunError('unknownName', { name });
  return r.hits.map((h) => h.value).filter((v) => v !== null && v !== undefined);
}

// A statement's operand: an expression over the data. A bare word or a
// phrase that is no expression and names nothing is taken as the text
// itself — and said (`asText`).
function operand(text, scopes, ctx) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return { value: null };
  try {
    // A name no element has stays a name nobody has: the word is text.
    const r = evalExpr(t, (name) => { const h = hitsIn(scopes, name); if (h.absent) throw new RunError('unknownName', { name }); return valueIn(scopes, name); }, ctx.opts);
    return { value: r.value, volatile: r.volatile };
  } catch (e) {
    if (!(e instanceof RunError)) throw e;
    const plain = !/[()+*/%<>=!?:&|]/.test(t);
    if (plain && (e.code === 'unknownName' || e.code === 'syntax')) return { value: literal(t), asText: true };
    throw e;
  }
}

// --- conditions ---------------------------------------------------------------
// Three answers: true, false, or null — the run cannot tell (and why).

function cmp(a, b) {
  const an = numberOf(a), bn = numberOf(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn) && a !== '' && b !== '') return an < bn ? -1 : an > bn ? 1 : 0;
  const at = isDate(a) ? textOf(a) : String(textOf(a)), bt = isDate(b) ? textOf(b) : String(textOf(b));
  return at < bt ? -1 : at > bt ? 1 : 0;
}
function same(a, b) {
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b);
  return cmp(a, b) === 0;
}
function present(v) { return v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && !v.length); }

function itemMatches(el, c, ctx) {
  const parts = [c.item].concat(c.itemAnd || []);
  return joinResults(parts.map((p) => evalCondition(p, [{ value: el, self: '' }], ctx)), 'and');
}

function joinResults(list, join) {
  const vals = list.map((r) => r.value);
  if (join === 'or') {
    if (vals.some((v) => v === true)) return { value: true };
    if (vals.some((v) => v === null)) return { value: null, why: (list.find((r) => r.value === null) || {}).why };
    return { value: false };
  }
  if (vals.some((v) => v === false)) return { value: false };
  if (vals.some((v) => v === null)) return { value: null, why: (list.find((r) => r.value === null) || {}).why };
  return { value: true };
}

function evalConditions(conds, join, scopes, ctx) {
  const list = (conds || []).filter((c) => c && String(c.field || '').trim());
  if (!list.length) return { value: null, why: { code: 'noCondition' } };
  return joinResults(list.map((c) => evalCondition(c, scopes, ctx)), join);
}

function evalCondition(c, scopes, ctx) {
  try {
    return { value: conditionValue(c, scopes, ctx) };
  } catch (e) {
    if (!(e instanceof RunError)) throw e;
    return { value: null, why: { code: e.code, params: e.params } };
  }
}

// What a condition compares with (its valueKind): a constant as typed, a
// value no field holds (today, now …), or a field of the data — read from
// it; a value written before kinds existed reads as a field when it names
// one, as the text otherwise.
function comparedValue(c, key, scopes, ctx) {
  const kind = c[key + 'Kind'];
  const raw = c[key];
  if (kind === 'const') return literal(raw);
  if (kind === 'other') {
    const how = c[key + 'How'];
    if (how === 'null') return null;
    if (how === 'today') return textOf(run.mkDate('date', Object.assign(run.nowParts(ctx.opts && ctx.opts.clock), { H: 0, m: 0, s: 0 })));
    if (how === 'now') return textOf(run.mkDate('datetime', run.nowParts(ctx.opts && ctx.opts.clock)));
    if (how === 'nowTime') { const p = run.nowParts(ctx.opts && ctx.opts.clock); return textOf(run.mkDate('time', { H: p.H, m: p.m, s: p.s })); }
    throw new RunError('conditionInWords', { text: String(raw || '') });
  }
  const t = String(raw == null ? '' : raw).trim();
  if (t && !/^(['"]).*\1$/.test(t)) {
    const r = hitsIn(scopes, t);
    // Said to be a field: its value, none when absent. Not said: a field
    // only when one holds a value by that name — the text otherwise.
    if (kind === 'field') {
      if (!r.known) throw new RunError('unknownName', { name: t });
      return r.hits.length ? r.hits[0].value : null;
    }
    if (r.known && r.hits.length) return r.hits[0].value;
  }
  return literal(raw);
}

function conditionValue(c, scopes, ctx) {
  const op = c.op || 'eq';
  const field = String(c.field || '').trim();
  const v = comparedValue(c, 'value', scopes, ctx), v2 = comparedValue(c, 'value2', scopes, ctx);
  if (op === 'format' || op === 'existsIn' || op === 'notExistsIn') throw new RunError('needsOutside', { op, field, value: v });
  const ITEM = ['anyMatch', 'allMatch', 'noneMatch', 'missingAnyOf'];
  const LIST = ['countGte', 'countLte', 'countEq', 'listEmpty', 'listNotEmpty', 'unique', 'contains', 'containsAny', 'containsAll', 'containsOnly', 'containsExactly', 'containsNone'];
  if (ITEM.indexOf(op) >= 0 || LIST.indexOf(op) >= 0) {
    const els = elementsIn(scopes, field);
    if (ITEM.indexOf(op) >= 0) {
      if (!c.item || !String(c.item.field || '').trim()) throw new RunError('conditionInWords', { text: v });
      if (op === 'missingAnyOf') {
        return listOf(c.value2).some((want) => !els.some((el) => {
          const r = joinResults([evalCondition({ field: c.item.field, op: 'eq', value: want }, [{ value: el, self: '' }], ctx)]
            .concat((c.itemAnd || []).map((p) => evalCondition(p, [{ value: el, self: '' }], ctx))), 'and');
          if (r.value === null) throw new RunError(r.why.code, r.why.params);
          return r.value;
        }));
      }
      const results = els.map((el) => {
        const r = itemMatches(el, c, ctx);
        if (r.value === null) throw new RunError(r.why.code, r.why.params);
        return r.value;
      });
      if (op === 'anyMatch') return results.some(Boolean);
      if (op === 'allMatch') return results.every(Boolean);
      return !results.some(Boolean);
    }
    const texts = els.map(textOf);
    switch (op) {
      case 'countGte': return els.length >= numberOf(v, true);
      case 'countLte': return els.length <= numberOf(v, true);
      case 'countEq': return els.length === numberOf(v, true);
      case 'listEmpty': return els.length === 0;
      case 'listNotEmpty': return els.length > 0;
      case 'unique': {
        const keys = els.map((el) => (v ? textOf(valueIn([{ value: el, self: '' }], v)) : JSON.stringify(el)));
        return new Set(keys).size === keys.length;
      }
      case 'contains': return texts.indexOf(v) >= 0;
      case 'containsAny': return listOf(c.value).some((x) => texts.indexOf(x) >= 0);
      case 'containsAll': return listOf(c.value).every((x) => texts.indexOf(x) >= 0);
      case 'containsOnly': { const allowed = listOf(c.value); return texts.every((x) => allowed.indexOf(x) >= 0); }
      case 'containsNone': return !listOf(c.value).some((x) => texts.indexOf(x) >= 0);
      case 'containsExactly': { const wanted = listOf(c.value); return wanted.every((x) => texts.indexOf(x) >= 0) && texts.every((x) => wanted.indexOf(x) >= 0); }
    }
  }
  const r = hitsIn(scopes, field);
  if (!r.known) throw new RunError('unknownName', { name: field });
  const val = r.hits.length ? r.hits[0].value : null;
  // „inne → null": the field has no value.
  if ((op === 'eq' || op === 'ne') && c.valueKind === 'other' && c.valueHow === 'null') {
    const none = val === null || val === undefined;
    return op === 'eq' ? none : !none;
  }
  switch (op) {
    case 'isSet': return present(val);
    case 'notSet': return !present(val);
    // „= null" / „≠ null": no value / a value, not the text "null".
    case 'eq': if (v === null || /^null$/i.test(String(v).trim())) return !present(val); return present(val) || v === '' ? same(val, v) : false;
    case 'ne': if (v === null || /^null$/i.test(String(v).trim())) return present(val); return !(present(val) || v === '' ? same(val, v) : false);
    case 'in': return present(val) && listOf(c.value).some((x) => same(val, x));
    case 'notIn': return !(present(val) && listOf(c.value).some((x) => same(val, x)));
    case 'gt': return present(val) && cmp(val, v) > 0;
    case 'gte': return present(val) && cmp(val, v) >= 0;
    case 'lt': return present(val) && cmp(val, v) < 0;
    case 'lte': return present(val) && cmp(val, v) <= 0;
    case 'between': return present(val) && cmp(val, v) >= 0 && cmp(val, v2) <= 0;
    case 'matches': {
      let re;
      try { re = new RegExp(String(c.value || '').replace(/^\/(.*)\/$/, '$1')); } catch (e) { throw new RunError('badRegex', { value: c.value }); }
      return present(val) && re.test(textOf(val));
    }
    case 'lenMin': return textOf(val).length >= numberOf(v, true);
    case 'lenMax': return textOf(val).length <= numberOf(v, true);
  }
  throw new RunError('conditionInWords', { text: field + ' ' + op });
}

// --- list streams ------------------------------------------------------------

function relTo(list, f) {
  const p = String(f || '').trim();
  const l = String(list || '').trim();
  return l && p.indexOf(l + '.') === 0 ? p.slice(l.length + 1) : p;
}
function elementScopes(el, list, outer) {
  return [{ value: el, self: (String(list || '').split('.').pop() || '') }].concat(outer);
}
function partTest(part, list, el, outer, ctx) {
  const conds = (part.conditions || []).filter((x) => String(x.field || '').trim())
    .map((x) => Object.assign({}, x, { field: relTo(list, x.field) }));
  if (conds.length) {
    const r = evalConditions(conds, part.join, elementScopes(el, list, outer), ctx);
    if (r.value === null) throw new RunError(r.why.code, r.why.params);
    return r.value;
  }
  const arg = String(part.arg || '').trim();
  if (!arg) throw new RunError('noCondition');
  const r = evalExpr(relTo(list, arg), (name) => valueIn(elementScopes(el, list, outer), name), ctx.opts);
  return truthy(r.value);
}
function partField(part, list, el, outer, key) {
  const f = relTo(list, part[key || 'arg']);
  if (!f) return el;
  return valueIn(elementScopes(el, list, outer), f);
}
// Missing values (an element without the field, an empty text) count for
// nothing, as a stream over present values does.
function filled(values) { return values.filter((x) => x !== null && x !== undefined && !(typeof x === 'string' && x.trim() === '')); }
function sum(values) { return filled(values).reduce((a, x) => a + numberOf(x, true), 0); }

function runStream(st, scopes, ctx) {
  const list = String(st.list || '').trim();
  if (!list) throw new RunError('noList');
  let els = elementsIn(scopes, list);
  for (const part of st.chain || []) {
    switch (part.op) {
      case 'filter': els = els.filter((el) => partTest(part, list, el, scopes, ctx)); break;
      case 'map': els = els.map((el) => partField(part, list, el, scopes)); break;
      case 'flatMap': els = [].concat(...els.map((el) => { const x = partField(part, list, el, scopes); return Array.isArray(x) ? x : (x == null ? [] : [x]); })); break;
      case 'sort': case 'sortDesc': {
        const keyed = els.map((el) => ({ el, k: partField(part, list, el, scopes) }));
        keyed.sort((a, b) => cmp(a.k, b.k));
        if (part.op === 'sortDesc') keyed.reverse();
        els = keyed.map((x) => x.el);
        break;
      }
      case 'distinct': {
        const seen = new Set();
        els = els.filter((el) => { const k = JSON.stringify(String(part.arg || '').trim() ? partField(part, list, el, scopes) : el); if (seen.has(k)) return false; seen.add(k); return true; });
        break;
      }
      case 'limit': els = els.slice(0, numberOf(part.arg, true)); break;
      case 'reverse': els = els.slice().reverse(); break;
      case 'skip': els = els.slice(numberOf(part.arg, true)); break;
      case 'takeWhile': { const i = els.findIndex((el) => !partTest(part, list, el, scopes, ctx)); els = i < 0 ? els : els.slice(0, i); break; }
      case 'dropWhile': { const i = els.findIndex((el) => !partTest(part, list, el, scopes, ctx)); els = i < 0 ? [] : els.slice(i); break; }
      // Another list: the elements with (or without) a match in it, by the
      // pairs of fields; or each element with its match attached.
      case 'inOther': case 'notInOther': case 'joinOther': {
        const otherList = String(part.arg || '').trim();
        if (!otherList) throw new RunError('noList');
        const keys = (part.keys || []).filter((k) => String(k.a || '').trim() && String(k.b || '').trim());
        if (!keys.length) throw new RunError('noKeys');
        const others = elementsIn(scopes, otherList);
        const matchOf = (el) => others.find((o) => keys.every((k) => {
          const a = partField({ arg: k.a }, list, el, scopes);
          const b = partField({ arg: k.b }, otherList, o, scopes);
          return a !== null && a !== undefined && b !== null && b !== undefined && same(a, b);
        }));
        if (part.op === 'inOther') els = els.filter((el) => matchOf(el) !== undefined);
        else if (part.op === 'notInOther') els = els.filter((el) => matchOf(el) === undefined);
        else {
          const as = String(part.arg2 || '').trim() || (otherList.split('.').pop() || 'match');
          els = els.map((el) => Object.assign({}, isPlainObject(el) ? el : { value: el }, { [as]: matchOf(el) === undefined ? null : matchOf(el) }));
        }
        break;
      }
    }
  }
  const end = st.end || { op: 'toList' };
  const hasTest = (end.conditions || []).some((x) => String(x.field || '').trim()) || String(end.arg || '').trim();
  switch (end.op) {
    case 'toList': return els;
    case 'toSet': { const seen = new Set(); return els.filter((el) => { const k = JSON.stringify(el); if (seen.has(k)) return false; seen.add(k); return true; }); }
    case 'first': { const hit = hasTest && (end.conditions || []).length ? els.find((el) => partTest(end, list, el, scopes, ctx)) : els[0]; return hit === undefined ? null : hit; }
    case 'last': { const hits = hasTest && (end.conditions || []).length ? els.filter((el) => partTest(end, list, el, scopes, ctx)) : els; return hits.length ? hits[hits.length - 1] : null; }
    // The element at a position, counted from 1.
    case 'nth': { const i = numberOf(end.arg || '1', true) - 1; return i >= 0 && i < els.length ? els[i] : null; }
    case 'any': return els.some((el) => partTest(end, list, el, scopes, ctx));
    case 'all': return els.every((el) => partTest(end, list, el, scopes, ctx));
    case 'none': return !els.some((el) => partTest(end, list, el, scopes, ctx));
    case 'count': return hasTest ? els.filter((el) => partTest(end, list, el, scopes, ctx)).length : els.length;
    case 'sum': return sum(els.map((el) => partField(end, list, el, scopes)));
    case 'avg': { const vals = filled(els.map((el) => partField(end, list, el, scopes))); return vals.length ? sum(vals) / vals.length : null; }
    case 'min': case 'max': {
      const keyed = els.map((el) => ({ el, k: partField(end, list, el, scopes) })).filter((x) => filled([x.k]).length);
      if (!keyed.length) return null;
      keyed.sort((a, b) => cmp(a.k, b.k));
      return (end.op === 'min' ? keyed[0] : keyed[keyed.length - 1]).k;
    }
    case 'group': {
      const out = {};
      els.forEach((el) => { const k = textOf(partField(end, list, el, scopes)); (out[k] = out[k] || []).push(el); });
      return out;
    }
    case 'partition': return { true: els.filter((el) => partTest(end, list, el, scopes, ctx)), false: els.filter((el) => !partTest(end, list, el, scopes, ctx)) };
    case 'toMap': {
      const out = {};
      els.forEach((el) => { out[textOf(partField(end, list, el, scopes))] = String(end.arg2 || '').trim() ? partField(end, list, el, scopes, 'arg2') : el; });
      return out;
    }
    case 'join': return els.map(textOf).join(String(end.arg == null ? '' : end.arg).replace(/^(['"])(.*)\1$/, '$2'));
  }
  throw new RunError('syntax', { text: end.op });
}

// --- ways picked from the "+ ƒ" list -------------------------------------------
// entry.how: { kind, …parameters, then: [ next steps ] } — each step works on
// what the one before gave. A step over a list works on the list; any other
// step on each value of it.

const { HOW_LIST_KINDS } = require('./howKinds');
const DATE_FORMATS = { 'RRRR-MM-DD': 'yyyy-MM-dd', 'DD.MM.RRRR': 'dd.MM.yyyy', 'RRRR-MM-DD gg:mm:ss': 'yyyy-MM-dd HH:mm:ss', 'DD.MM.RRRR gg:mm': 'dd.MM.yyyy HH:mm' };
const READ_PATTERNS = ['dd.MM.yyyy HH:mm:ss', 'dd.MM.yyyy HH:mm', 'dd.MM.yyyy', 'dd-MM-yyyy', 'yyyy/MM/dd', 'dd/MM/yyyy', 'yyyyMMdd'];

function toDateAny(v) {
  if (isDate(v)) return v;
  if (typeof v === 'number') return run.fromEpoch(v);
  const t = textOf(v).trim();
  try { return run.parseIso(t); } catch (e) { /* not ISO */ }
  for (const p of READ_PATTERNS) {
    try { return run.parseWithPattern(t, p, /H/.test(p) ? 'datetime' : 'date'); } catch (e) { /* the next one */ }
  }
  throw new RunError('badDate', { value: t, pattern: 'ISO / dd.MM.yyyy' });
}
function daysIn(y, M) { return new Date(Date.UTC(y, M, 0)).getUTCDate(); }
function shiftDate(d, amount, unit) {
  const n = Math.trunc(amount);
  if (unit === 'months' || unit === 'years') {
    const months = d.M - 1 + (unit === 'years' ? n * 12 : n);
    const y = d.y + Math.floor(months / 12);
    const M = ((months % 12) + 12) % 12 + 1;
    return Object.assign({}, d, { y, M, d: Math.min(d.d, daysIn(y, M)) });
  }
  const ms = { days: 86400000, weeks: 604800000, hours: 3600000, minutes: 60000 }[unit] || 86400000;
  const t = new Date(run.epochOf(d) + n * ms);
  const out = run.mkDate(d.__t === 'date' && (unit === 'hours' || unit === 'minutes') ? 'datetime' : d.__t,
    { y: t.getUTCFullYear(), M: t.getUTCMonth() + 1, d: t.getUTCDate(), H: t.getUTCHours(), m: t.getUTCMinutes(), s: t.getUTCSeconds(), S: t.getUTCMilliseconds() });
  return out;
}
function monthsBetween(a, b) {
  let m = (b.y - a.y) * 12 + (b.M - a.M);
  if (m > 0 && b.d < a.d) m--;
  if (m < 0 && b.d > a.d) m++;
  return m;
}
function groupDigits(intText, sep) {
  return sep ? intText.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : intText;
}

function runHow(how, fromPath, scopes, ctx) {
  const steps = [how].concat(Array.isArray(how.then) ? how.then : []).filter((s) => s && s.kind);
  const env = { volatile: false };
  let base = String(fromPath || '').trim();
  let cur = null;
  const inputs = [];
  if (base) {
    const found = hitsIn(scopes, base);
    if (!found.known) throw new RunError('unknownName', { name: base });
    const values = found.hits.map((h) => h.value).filter((v) => v !== undefined);
    values.forEach((v) => inputs.push(isPlainObject(v) ? '{…}' : textOf(v)));
    cur = values.length === 0 ? null : values.length === 1 ? values[0] : values;
  }
  for (const st of steps) {
    cur = howStep(st, cur, base, scopes, ctx, env);
    const f = String(st.field || '').trim();
    if (['listField', 'listFirst', 'listHead', 'listPrefer'].indexOf(st.kind) >= 0 && f && !(Array.isArray(st.more) && st.more.length)) base = base ? base + '.' + relTo(base, f) : f;
  }
  return { value: cur, inputs, volatile: env.volatile };
}

function howStep(h, cur, base, scopes, ctx, env) {
  const kind = h.kind;
  const listOfCur = () => (cur === null || cur === undefined ? [] : Array.isArray(cur) ? cur : [cur]);
  const elemVal = (el, f) => {
    const rel = relTo(base, f);
    if (!rel) return el;
    return valueIn([{ value: el, self: '' }], rel);
  };
  // The field (or fields joined) taken from an element.
  const taken = (el) => {
    if (el === null || el === undefined) return null;
    const more = (Array.isArray(h.more) ? h.more : []).map((m) => String(m || '').trim()).filter(Boolean);
    const f = String(h.field || '').trim();
    if (!f) return el;
    if (!more.length) return elemVal(el, f);
    const sep = h.joinSep === undefined ? ' ' : String(h.joinSep).replace(/\\n/g, '\n');
    return [f].concat(more).map((x) => elemVal(el, x)).filter((x) => x !== null && x !== undefined && textOf(x) !== '').map(textOf).join(sep);
  };
  const matches = (el) => {
    const conds = (h.conditions || []).filter((c) => String(c.field || '').trim())
      .map((c) => Object.assign({}, c, { field: relTo(base, c.field) }));
    const r = evalConditions(conds, h.join, [{ value: el, self: '' }].concat(scopes), ctx);
    if (r.value === null) throw new RunError(r.why.code, r.why.params);
    return r.value;
  };
  const opnd = (v) => operand(v, scopes, ctx).value;
  if (HOW_LIST_KINDS.indexOf(kind) >= 0) {
    const els = listOfCur();
    switch (kind) {
      case 'listField': return els.map(taken);
      case 'listFilter': return els.filter(matches);
      case 'listHead': return els.length ? taken(els[0]) : null;
      case 'listFirst': { const hit = els.find(matches); return hit === undefined ? null : taken(hit); }
      case 'listPrefer': {
        for (const want of listOf(h.values)) {
          const hit = els.find((el) => same(elemVal(el, h.by), want));
          if (hit !== undefined) return taken(hit);
        }
        return null;
      }
      case 'listHas': return els.some(matches);
      case 'listCount': return els.length;
      case 'listJoin': return els.map(textOf).join(h.sep === undefined ? ', ' : String(h.sep).replace(/\\n/g, '\n'));
      case 'listSum': return sum(els.map((el) => elemVal(el, h.field)));
      case 'listAvg': return els.length ? sum(els.map((el) => elemVal(el, h.field))) / els.length : null;
      case 'listMin': case 'listMax': {
        if (!els.length) return null;
        const vals = els.map((el) => elemVal(el, h.field)).sort(cmp);
        return kind === 'listMin' ? vals[0] : vals[vals.length - 1];
      }
      case 'listSort': {
        const keyed = els.map((el) => ({ el, k: elemVal(el, h.field) })).sort((a, b) => cmp(a.k, b.k));
        if (h.order === 'desc') keyed.reverse();
        return keyed.map((x) => x.el);
      }
      case 'listDistinct': {
        const seen = new Set();
        return els.filter((el) => { const k = JSON.stringify(elemVal(el, h.field)); if (seen.has(k)) return false; seen.add(k); return true; });
      }
      case 'listLast': return els.length ? taken(els[els.length - 1]) : null;
      case 'listAt': { const i = numberOf(h.position || '1', true) - 1; return i >= 0 && i < els.length ? taken(els[i]) : null; }
      case 'listReverse': return els.slice().reverse();
    }
  }
  // Values made, not read.
  switch (kind) {
    case 'today': env.volatile = true; return run.mkDate('date', Object.assign(run.nowParts(ctx.opts.clock), { H: 0, m: 0, s: 0 }));
    case 'now': env.volatile = true; return run.mkDate('datetime', run.nowParts(ctx.opts.clock));
    case 'nowTime': { env.volatile = true; const p = run.nowParts(ctx.opts.clock); return run.mkDate('time', { H: p.H, m: p.m, s: p.s }); }
    case 'newId': env.volatile = true; return ctx.opts.uuid ? ctx.opts.uuid() : require('crypto').randomUUID();
    case 'null': return null;
    case 'constant': return literal(h.value);
    case 'text': throw new RunError('howInWords');
    case 'asList': return Array.isArray(cur) ? cur : (cur === null || cur === undefined ? [] : [cur]);
    case 'when': {
      for (const r of h.rows || []) {
        const res = evalConditions(r.conditions, r.join, scopes, ctx);
        if (res.value === null) throw new RunError(res.why.code, res.why.params);
        if (res.value) return opnd(r.value);
      }
      return String(h.otherwise || '').trim() ? opnd(h.otherwise) : null;
    }
    case 'ifEmpty': return present(cur) ? cur : opnd(h.value);
    case 'isEmpty': return !present(cur);
    case 'concat': {
      const sep = h.sep === undefined ? ' ' : String(h.sep).replace(/\\n/g, '\n');
      return [cur].concat((h.parts || []).map(opnd)).filter((x) => x !== null && x !== undefined && textOf(x) !== '').map(textOf).join(sep);
    }
  }
  // Each value on its own.
  const one = (v) => {
    if (v === null || v === undefined) return v;
    const t = () => textOf(v);
    switch (kind) {
      case 'asText': return t();
      case 'asNumber': return numberOf(v, true);
      case 'asBool': {
        if (typeof v === 'boolean') return v;
        if (/^(true|t|1|y|yes|tak)$/i.test(t().trim())) return true;
        if (/^(false|f|0|n|no|nie|)$/i.test(t().trim())) return false;
        throw new RunError('notBool', { value: t() });
      }
      case 'asDate': return run.formatWithPattern(toDateAny(v), DATE_FORMATS[h.format] || 'yyyy-MM-dd');
      case 'valueMap': {
        const pair = (h.pairs || []).find((p) => String(p[0]).trim() === t().trim());
        if (!pair) throw new RunError('notInTable', { value: t() });
        return pair[1];
      }
      case 'cut': { const n = numberOf(h.n || '0', true); return h.which === 'last' ? t().slice(-n) : t().slice(0, n); }
      case 'trim': return t().trim();
      case 'upper': return t().toUpperCase();
      case 'lower': return t().toLowerCase();
      case 'round': { const f = Math.pow(10, numberOf(h.n || '0', true)); const x = numberOf(v, true); return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f; }
      case 'replace': return t().split(String(h.find || '')).join(String(h.with || ''));
      case 'replaceRegex': try { return t().replace(new RegExp(String(h.pattern || ''), 'g'), String(h.with || '')); } catch (e) { throw new RunError('badRegex', { value: h.pattern }); }
      case 'extract': {
        let re;
        try { re = new RegExp(String(h.pattern || '')); } catch (e) { throw new RunError('badRegex', { value: h.pattern }); }
        const m = t().match(re);
        return m ? (m[1] !== undefined ? m[1] : m[0]) : null;
      }
      case 'substring': { const from = Math.max(1, numberOf(h.from || '1', true)) - 1; const len = String(h.length || '').trim() ? numberOf(h.length, true) : undefined; return len === undefined ? t().slice(from) : t().substr(from, len); }
      case 'padLeft': return t().padStart(numberOf(h.length || '0', true), String(h.char || ' ').charAt(0) || ' ');
      case 'padRight': return t().padEnd(numberOf(h.length || '0', true), String(h.char || ' ').charAt(0) || ' ');
      case 'prefix': return String(h.text || '') + t();
      case 'suffix': return t() + String(h.text || '');
      case 'capitalize': return t().charAt(0).toUpperCase() + t().slice(1);
      case 'removeDiacritics': return t().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
      case 'normalizeSpaces': return t().replace(/\s+/g, ' ').trim();
      case 'mask': { const keep = numberOf(h.keep || '0', true); const s = t(); const c = String(h.char || '*').charAt(0) || '*'; return s.length <= keep ? s : c.repeat(s.length - keep) + s.slice(s.length - keep); }
      case 'split': return t().split(String(h.sep === undefined ? ',' : h.sep)).map((x) => x.trim()).filter((x) => x !== '');
      case 'length': return t().length;
      case 'calc': {
        const a = numberOf(v, true), b = numberOf(opnd(h.value), true);
        switch (h.op) {
          case '-': return a - b;
          case '*': return a * b;
          case '/': if (b === 0) throw new RunError('divZero'); return a / b;
          case '%': if (b === 0) throw new RunError('divZero'); return a % b;
          default: return a + b;
        }
      }
      case 'percent': return numberOf(v, true) * numberOf(h.value || '0', true) / 100;
      case 'abs': return Math.abs(numberOf(v, true));
      case 'floor': return Math.floor(numberOf(v, true));
      case 'ceil': return Math.ceil(numberOf(v, true));
      case 'truncate': return Math.trunc(numberOf(v, true));
      case 'atLeast': return Math.max(numberOf(v, true), numberOf(opnd(h.value), true));
      case 'atMost': return Math.min(numberOf(v, true), numberOf(opnd(h.value), true));
      case 'formatNumber': {
        const dec = numberOf(h.decimals === undefined ? '2' : h.decimals, true);
        const fixed = Math.abs(numberOf(v, true)).toFixed(dec);
        const parts = fixed.split('.');
        const sign = numberOf(v, true) < 0 ? '-' : '';
        return sign + groupDigits(parts[0], h.groupSep || '') + (parts[1] !== undefined ? (h.decSep === undefined ? ',' : h.decSep) + parts[1] : '');
      }
      case 'addTime': return shiftDate(toDateAny(v), numberOf(h.amount || '0', true), h.unit || 'days');
      case 'dateDiff': {
        const a = toDateAny(v), b = toDateAny(opnd(h.other));
        if (h.unit === 'months') return monthsBetween(a, b);
        if (h.unit === 'years') return Math.trunc(monthsBetween(a, b) / 12);
        return Math.round((Date.UTC(b.y, b.M - 1, b.d) - Date.UTC(a.y, a.M - 1, a.d)) / 86400000);
      }
      case 'age': {
        env.volatile = true;
        const a = toDateAny(v);
        const today = run.mkDate('date', run.nowParts(ctx.opts.clock));
        return Math.trunc(monthsBetween(a, today) / 12);
      }
      case 'startOfMonth': { const d = toDateAny(v); return run.mkDate('date', { y: d.y, M: d.M, d: 1 }); }
      case 'endOfMonth': { const d = toDateAny(v); return run.mkDate('date', { y: d.y, M: d.M, d: daysIn(d.y, d.M) }); }
      case 'dayOfWeek': { const d = toDateAny(v); return (new Date(Date.UTC(d.y, d.M - 1, d.d)).getUTCDay() + 6) % 7 + 1; }
      case 'datePart': { const d = toDateAny(v); return { year: d.y, month: d.M, day: d.d, hour: d.H, minute: d.m }[h.part || 'year']; }
      case 'formatDateAs': return run.formatWithPattern(toDateAny(v), String(h.pattern || 'yyyy-MM-dd'));
      case 'parseDateAs': { const p = String(h.pattern || 'yyyy-MM-dd'); return run.parseWithPattern(t(), p, /[Hhms]/.test(p.replace(/'[^']*'/g, '')) ? 'datetime' : 'date'); }
      case 'equalsTo': return same(v, opnd(h.value));
      case 'inValues': return listOf(h.values).some((x) => same(v, x));
      case 'negate': return !truthy(v);
      case 'base64Encode': return Buffer.from(t(), 'utf8').toString('base64');
      case 'base64Decode': {
        const s = t().trim();
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) throw new RunError('badBase64', { value: s });
        return Buffer.from(s, 'base64').toString('utf8');
      }
      case 'urlEncode': return encodeURIComponent(t());
      case 'urlDecode': try { return decodeURIComponent(t().replace(/\+/g, ' ')); } catch (e) { throw new RunError('badUrl', { value: t() }); }
      case 'sha256': return require('crypto').createHash('sha256').update(t(), 'utf8').digest('hex');
      case 'md5': return require('crypto').createHash('md5').update(t(), 'utf8').digest('hex');
    }
    throw new RunError('unknownHow', { name: kind });
  };
  return Array.isArray(cur) ? cur.map(one) : one(cur);
}

// --- mapping rows ---------------------------------------------------------------

// Rows of a mapping block evaluated over the data: { doc, rows }. `to`
// paths lose the target's own name (as mappingTargetOutput reads them).
function runRows(entries, scopes, ctx, roots, listFields) {
  const doc = {};
  const rows = [];
  const rel = (p) => {
    let out = String(p || '').trim();
    if (out.indexOf('Document.') === 0) out = out.slice('Document.'.length);
    for (const r of roots || []) if (r && out.indexOf(r + '.') === 0) { out = out.slice(r.length + 1); break; }
    return out;
  };
  const lists = run.targetLists({ fields: (listFields || []).map((f) => Object.assign({}, f, { path: rel(f.path), listAt: f.listAt ? rel(f.listAt) : f.listAt })) });
  const whole = new Set(ctx.wholeTexts || []);
  const sorted = (entries || []).filter((e) => e && String(e.to || '').trim()).slice()
    .sort((a, b) => splitPath(a.to).length - splitPath(b.to).length);
  const put = (to, value, idx, row) => {
    let target = to;
    // A list the target does not say it has: the row's own parent repeats.
    if (idx.length && !splitPath(to).some((s, j, all) => s.index !== null || lists.has(all.slice(0, j + 1).map((x) => x.name).join('.')))) {
      const segs = to.split('.');
      target = segs.length > 1 ? segs.slice(0, -2).concat(segs[segs.length - 2] + '[]', segs[segs.length - 1]).join('.') : to + '[]';
      lists.add(plainPath(target.split('[]')[0]));
    }
    if (writeAt(doc, target.replace(/\[\]/g, ''), clone(value), idx, lists)) row.outputs.push(textOf(value));
  };
  // A row's own condition and those of the objects and list elements it
  // sits in (entry.when): one not met leaves the field unset, the object
  // unbuilt, the element out of its list; one not computable is said.
  const gates = sorted.filter((g) => g.when && (g.when.conditions || []).some((c) => c && String(c.field || '').trim()));
  const gateResults = new Map();
  const gateOf = (to) => {
    for (const g of gates) {
      const t = String(g.to).trim();
      if (to !== t && to.indexOf(t + '.') !== 0 && to.indexOf(t + '[') !== 0) continue;
      if (!gateResults.has(g)) gateResults.set(g, evalConditions(g.when.conditions, g.when.join, scopes, ctx));
      const r = gateResults.get(g);
      if (r.value !== true) return r;
    }
    return null;
  };
  for (const e of sorted) {
    const to = rel(e.to);
    const transform = whole.has(String(e.transform || '').trim()) ? '' : String(e.transform || '').trim();
    const row = { to, from: String(e.from || '').trim(), transform, status: 'ok', inputs: [], outputs: [] };
    rows.push(row);
    const shut = gateOf(String(e.to).trim());
    if (shut) {
      if (shut.value === false) row.status = 'conditionOff';
      else { row.status = 'unsupported'; row.code = (shut.why && shut.why.code) || 'noCondition'; row.params = (shut.why && shut.why.params) || {}; }
      continue;
    }
    // Only a condition said for an object or element: nothing to put.
    if (e.when && !row.from && !transform && !e.how && !e.stream && typeof e.value !== 'string') { row.status = 'conditionMet'; continue; }
    try {
      if (e.stream) {
        const v = runStream(e.stream, scopes, ctx);
        row.status = 'transformed';
        if (v === null || v === undefined) { missing(row, e, to, [], put); continue; }
        put(to, v, [], row);
        continue;
      }
      // A way picked from the "+ ƒ" list (howKinds.js): its steps in turn.
      if (e.how && e.how.kind) {
        const r = runHow(e.how, row.from, scopes, ctx);
        row.status = 'transformed';
        if (r.volatile) row.volatile = true;
        row.inputs = r.inputs;
        if (r.value === null || r.value === undefined) { missing(row, e, to, [], put); continue; }
        put(to, r.value, [], row);
        continue;
      }
      if (typeof e.value === 'string') {
        row.status = 'constant';
        if (Array.isArray(e.values)) e.values.forEach((x, i) => put(to, x, [i], row));
        else put(to, e.value, [], row);
        continue;
      }
      if (!row.from) {
        if (!transform) { row.status = 'missing'; continue; }
        const r = evalExpr(transform, (name) => valueIn(scopes, name), ctx.opts);
        row.status = 'transformed';
        if (r.volatile) row.volatile = true;
        if (r.value === null || r.value === undefined) { missing(row, e, to, [], put); continue; }
        put(to, r.value, [], row);
        continue;
      }
      const found = hitsIn(scopes, row.from);
      if (!found.known) throw new RunError('unknownName', { name: row.from });
      const hits = found.hits.filter((h) => h.value !== null && h.value !== undefined);
      if (!hits.length) { missing(row, e, to, [], put); continue; }
      for (const h of hits) {
        row.inputs.push(isPlainObject(h.value) ? '{…}' : textOf(h.value));
        let out = h.value;
        if (transform) {
          const leaf = splitPath(row.from).slice(-1)[0].name;
          const r = evalExpr(transform, (name) => (name === 'x' || name === 'value' || name === leaf || name === row.from ? h.value : valueIn(scopes, name)), ctx.opts);
          out = r.value;
          if (r.volatile) row.volatile = true;
          row.status = 'transformed';
        } else if (isPlainObject(h.value)) row.status = 'whole';
        if (out === null || out === undefined) { missing(row, e, to, h.idx, put); continue; }
        put(to, out, h.idx, row);
      }
    } catch (err) {
      if (!(err instanceof RunError)) throw err;
      row.status = ['unknownFunction', 'syntax', 'unknownName', 'conditionInWords', 'needsOutside'].indexOf(err.code) >= 0 ? 'unsupported' : (err.code === 'noData' ? 'noData' : 'error');
      row.code = err.code;
      row.params = err.params;
    }
  }
  return { doc: run.compact(doc), rows };
}

function missing(row, e, to, idx, put) {
  const rule = readWhenNull(e.whenNull);
  if (rule.kind === 'none') { row.status = 'missing'; return; }
  if (rule.kind === 'skip') { row.status = 'skipped'; return; }
  if (rule.kind === 'reject') { row.status = 'rejected'; return; }
  if (rule.kind === 'unknown') { row.status = 'unsupported'; row.code = 'whenNullUnknown'; row.params = { text: e.whenNull }; return; }
  const v = rule.kind === 'value' ? rule.value : literal(rule.text);
  row.status = 'defaulted';
  put(to, v, idx, row);
}

// --- the flow -------------------------------------------------------------------

function parsedInput(text, fields, format) {
  const p = parseSample(text, format);
  if (!p.ok) return p;
  let value = p.value;
  // An XML document is its root element; a context object described by its
  // fields is the object under that root unless its fields name the root.
  const keys = isPlainObject(value) ? Object.keys(value) : [];
  if (keys.length === 1 && isPlainObject(value[keys[0]]) && (p.format === 'xml' || fields)) {
    const root = keys[0];
    const named = (fields || []).some((f) => splitPath(f.path)[0] && splitPath(f.path)[0].name === root);
    if (!named && fields) value = value[root];
  }
  return { ok: true, format: p.format, value };
}

function outputName(step) {
  const o = step.output && String(step.output.name || '').trim();
  if (o) return o;
  if (step.type === 'mapping' || step.type === 'cacheWrite') return String(step.targetName || '').trim() || (step.targetContract && String(step.targetContract.name || '').trim()) || '';
  if (step.type === 'externalCall') {
    const rm = step.responseMapping || {};
    const service = String(step.serviceName || '').trim();
    return String(rm.sourceName || '').trim() || (service ? lowerFirst(service) + 'Response' : 'response');
  }
  return '';
}

// flow: the normalized design. data: { inputs: { request, [contextName] },
// results: { [stepId]: text }, formats, resultFormats }. options: { clock, uuid, wholeTexts }.
function runFlow(flow, data, options) {
  const ctx = { opts: options || {}, wholeTexts: (options && options.wholeTexts) || [] };
  const inputs = (data && data.inputs) || {};
  const results = (data && data.results) || {};
  // The format of each sample when it is not left to recognize: { [input]: f }, { [stepId]: f }.
  const formats = (data && data.formats) || {};
  const resultFormats = (data && data.resultFormats) || {};
  const vars = {};
  const missingModels = new Map();
  const scopes = [{ value: vars, missing: missingModels }];
  const inputErrors = {};
  const report = { steps: [], ended: null, inputErrors, vars };

  const reqText = inputs.request !== undefined ? inputs.request : (flow.request && flow.request.sample && flow.request.sample.format !== 'binary' ? flow.request.sample.body : '');
  if (String(reqText || '').trim()) {
    const p = parseSample(reqText, formats.request);
    if (p.ok && isPlainObject(p.value)) Object.assign(vars, clone(p.value));
    else if (!p.ok) inputErrors.request = p.error;
  }
  for (const c of flow.context || []) {
    const name = String(c.name || '').trim();
    if (!name) continue;
    const text = inputs[name];
    if (!String(text || '').trim()) { missingModels.set(name, ''); continue; }
    const p = parsedInput(text, c.fields || [], formats[name]);
    if (p.ok) vars[name] = p.value;
    else { inputErrors[name] = p.error; missingModels.set(name, ''); }
  }

  const fragments = flow.fragments || [];
  const decided = new Map();
  function branchActive(entry) {
    const frag = entry.fragment;
    const key = frag.id;
    if (!decided.has(key)) decided.set(key, decideFragment(frag));
    const d = decided.get(key);
    if (d.unknown) return { active: null, why: d.why, frag };
    return { active: d.branches.has(entry.branch.id), frag };
  }
  function decideFragment(frag) {
    if (frag.kind === 'par' || frag.kind === 'group') return { branches: new Set(frag.branches.map((b) => b.id)) };
    if (frag.kind === 'loop') return { unknown: true, why: { code: 'loop', params: { over: frag.over || frag.label || '' } } };
    const active = new Set();
    try {
      const on = String(frag.on || '').trim();
      let matched = false;
      for (const b of frag.branches) {
        if (b.otherwise) continue;
        const when = String(b.when || '').trim();
        if (!when) {
          if (frag.kind === 'alt') continue;
          return { unknown: true, why: { code: 'branchInWords', params: { text: frag.label || '' } } };
        }
        let hit;
        if (on) {
          const val = valueIn(scopes, on);
          hit = listOf(when).some((x) => same(val, x));
        } else {
          const r = evalExpr(when, (name) => valueIn(scopes, name), ctx.opts);
          hit = truthy(r.value);
        }
        if (hit && !(frag.kind === 'alt' && matched)) { active.add(b.id); matched = true; }
      }
      if (frag.kind === 'alt' && !matched) {
        const other = frag.branches.find((b) => b.otherwise || !String(b.when || '').trim());
        if (other) active.add(other.id);
      }
      return { branches: active };
    } catch (e) {
      if (!(e instanceof RunError)) throw e;
      const words = e.code === 'syntax' || e.code === 'unknownName';
      return { unknown: true, why: words ? { code: 'branchInWords', params: { text: frag.branches.map((b) => b.when).filter(Boolean).join(' | ') || frag.label || '' } } : { code: e.code, params: e.params } };
    }
  }

  for (let i = 0; i < (flow.steps || []).length; i++) {
    const step = flow.steps[i];
    const out = { id: step.id, index: i, type: step.type, title: String(step.title || step.serviceName || '').trim(), status: 'done', lines: [] };
    report.steps.push(out);
    if (report.ended) { out.status = 'notReached'; continue; }
    // Its branches, outermost first.
    const path = step.in ? pathOf(step.in, fragments) : [];
    let skip = null;
    for (const entry of path) {
      const b = branchActive(entry);
      if (b.active === false) { skip = { code: 'branchOff', params: { when: entry.branch.when || '' } }; break; }
      if (b.active === null) { skip = b.why; out.undecided = true; break; }
    }
    if (skip) {
      out.status = out.undecided ? 'undecided' : 'skipped';
      out.code = skip.code;
      out.params = skip.params;
      const name = outputName(step);
      if (name && !Object.prototype.hasOwnProperty.call(vars, name)) missingModels.set(name, out.title);
      continue;
    }
    try {
      runStep(step, out);
    } catch (e) {
      if (!(e instanceof RunError)) throw e;
      out.status = e.code === 'noData' ? 'noData' : 'error';
      out.code = e.code;
      out.params = e.params;
    }
  }

  function setOutput(step, out, value) {
    const name = outputName(step);
    if (!name) { out.output = { name: '', value }; return; }
    vars[name] = value;
    missingModels.delete(name);
    out.output = { name, value: clone(value) };
  }

  function writeVar(target, value, step) {
    const t = String(target || '').trim();
    if (!t) throw new RunError('noTarget');
    const first = splitPath(t)[0].name;
    const outName = outputName(step);
    let full = t;
    // A step whose result is one value (a text, a number) keeps the names
    // its statements use on the way as they are: a single value has no
    // fields to put them under.
    const single = step && step.output && !(step.output.fields || []).length && String(step.output.type || '').trim();
    if (!Object.prototype.hasOwnProperty.call(vars, first) && outName && first !== outName && !single) full = outName + '.' + t;
    writeAt(vars, full, clone(value), [], new Set());
    missingModels.delete(splitPath(full)[0].name);
    return full;
  }

  function runOps(ops, step, out, local, depth) {
    for (const o of ops || []) {
      if (report.ended || out.returned) return;
      const sc = local.concat(scopes);
      if (o.kind === 'note') { if (String(o.text || '').trim()) out.lines.push({ kind: 'note', text: o.text.trim(), depth }); continue; }
      if (o.kind === 'set') {
        let r = operand(o.expr, sc, ctx);
        let value = r.value;
        if (String(o.tf || '').trim()) {
          const base = value;
          value = evalExpr(o.tf, (name) => (name === 'x' || name === 'value' ? base : valueIn(sc, name)), ctx.opts).value;
        }
        const where = writeVar(o.target, value, step);
        out.lines.push({ kind: 'set', target: where, value: clone(value), asText: r.asText, volatile: r.volatile, depth });
        continue;
      }
      if (o.kind === 'calc') {
        const a = operand(o.a, sc, ctx).value, b = operand(o.b, sc, ctx).value;
        const an = numberOf(a, true), bn = numberOf(b, true);
        let value;
        if (o.op === '+') value = an + bn; else if (o.op === '-') value = an - bn; else if (o.op === '*') value = an * bn;
        else if (o.op === '/') { if (bn === 0) throw new RunError('divZero'); value = an / bn; }
        else if (o.op === 'min') value = Math.min(an, bn); else value = Math.max(an, bn);
        const where = writeVar(o.target, value, step);
        out.lines.push({ kind: 'set', target: where, value, depth });
        continue;
      }
      if (o.kind === 'add') {
        const name = String(o.list || '').trim() || outputName(step);
        const element = runRows(o.entries, sc, ctx, [], []);
        const bad = element.rows.find((x) => x.code);
        if (bad) throw new RunError(bad.code, bad.params);
        // The list as kept so far — read where writeVar puts it (a list of
        // one element must not read as that element).
        const outName = outputName(step);
        const single = step.output && !(step.output.fields || []).length && String(step.output.type || '').trim();
        const first = splitPath(name)[0].name;
        const full = !Object.prototype.hasOwnProperty.call(vars, first) && outName && first !== outName && !single ? outName + '.' + name : name;
        let now = vars;
        for (const seg of splitPath(full)) now = now && typeof now === 'object' ? now[seg.name] : undefined;
        const list = Array.isArray(now) ? now.slice() : [];
        list.push(element.doc);
        const where = writeVar(name, list, step);
        out.lines.push({ kind: 'set', target: where, value: clone(list), depth });
        continue;
      }
      if (o.kind === 'return') {
        const r = operand(o.expr, sc, ctx);
        out.returned = true;
        out.lines.push({ kind: 'return', value: clone(r.value), asText: r.asText, depth });
        setOutput(step, out, r.value);
        return;
      }
      if (o.kind === 'respond') {
        report.ended = { stepId: step.id, response: o.response || null, code: o.code || '' };
        out.lines.push({ kind: 'respond', response: o.response || null, code: o.code || '', depth });
        out.status = 'ended';
        return;
      }
      if (o.kind === 'if') {
        const r = evalConditions(o.conditions, o.join, sc, ctx);
        if (r.value === null) throw new RunError(r.why.code, r.why.params);
        out.lines.push({ kind: 'if', value: r.value, depth });
        runOps(r.value ? o.then : o.else, step, out, local, depth + 1);
        continue;
      }
      if (o.kind === 'decide') {
        // A result picked as a mapping row's value is worked out as one.
        const decided = (result, text) => {
          if (result && (String(result.from || '').trim() || typeof result.value === 'string' || String(result.transform || '').trim())) {
            const got = runRows([Object.assign({}, result, { to: 'v' })], sc, ctx, [], []);
            const bad = got.rows.find((x) => x.code);
            if (bad) throw new RunError(bad.code, bad.params);
            return got.doc.v === undefined ? null : got.doc.v;
          }
          return String(text || '').trim() ? operand(text, sc, ctx).value : null;
        };
        let value = null, row = -1;
        for (let k = 0; k < (o.rows || []).length; k++) {
          const r = evalConditions(o.rows[k].conditions, o.rows[k].join, sc, ctx);
          if (r.value === null) throw new RunError(r.why.code, r.why.params);
          if (r.value) { row = k; value = decided(o.rows[k].result, o.rows[k].value); break; }
        }
        if (row < 0) value = decided(o.otherwiseResult, o.otherwise);
        const where = writeVar(o.target, value, step);
        out.lines.push({ kind: 'decide', target: where, row: row + 1, value: clone(value), depth });
        continue;
      }
      if (o.kind === 'forEach') {
        const els = elementsIn(sc, o.list);
        const item = String(o.item || '').trim() || 'element';
        out.lines.push({ kind: 'forEach', list: o.list, count: els.length, depth });
        els.forEach((el) => {
          const holder = {};
          holder[item] = el;
          runOps(o.body, step, out, [{ value: holder }].concat(local), depth + 1);
        });
        continue;
      }
      if (o.kind === 'stream') {
        const value = runStream(o, sc, ctx);
        const where = writeVar(o.target || o.list, value, step);
        out.lines.push({ kind: 'set', target: where, value: clone(value), depth });
        continue;
      }
    }
  }

  function runStep(step, out) {
    const type = step.type;
    if (type === 'validation') {
      out.rules = [];
      for (const rule of step.rules || []) {
        const conds = (rule.conditions || []).filter((c) => String(c.field || '').trim());
        const r = conds.length ? evalConditions(conds, rule.join, scopes, ctx) : { value: null, why: { code: 'ruleInWords', params: { text: rule.check } } };
        const breaks = rule.kind === 'breaks';
        const failed = r.value === null ? null : (breaks ? r.value === true : r.value === false);
        out.rules.push({ check: rule.check, breaks, holds: r.value, failed, why: r.why, response: rule.response || null, code: rule.code || '', onFail: rule.onFail || '' });
        if (failed === true && !report.ended) {
          report.ended = { stepId: step.id, response: rule.response || null, code: rule.code || '', onFail: rule.onFail || '', check: rule.check };
          out.status = 'ended';
        }
      }
      if (out.rules.some((x) => x.failed === null) && out.status !== 'ended') out.status = 'partial';
      return;
    }
    if (type === 'transformation') {
      if (!(step.ops || []).length) {
        out.status = 'inWords';
        const name = outputName(step);
        if (name) missingModels.set(name, out.title);
        return;
      }
      runOps(step.ops, step, out, [], 0);
      if (!out.returned && outputName(step) && Object.prototype.hasOwnProperty.call(vars, outputName(step))) out.output = { name: outputName(step), value: clone(vars[outputName(step)]) };
      return;
    }
    if (type === 'mapping' || type === 'cacheWrite' || type === 'kafkaEvent') {
      const roots = [String(step.targetName || '').trim(), step.targetContract && step.targetContract.name, outputName(step)].filter(Boolean);
      const m = runRows(step.entries, scopes, ctx, roots, (step.output && step.output.fields) || []);
      out.rows = m.rows;
      if (m.rows.some((r) => r.status === 'unsupported' || r.status === 'error' || r.status === 'noData')) out.status = 'partial';
      if (type === 'mapping') setOutput(step, out, m.doc);
      else out.output = { name: type === 'kafkaEvent' ? String(step.topic || '').trim() : outputName(step), value: m.doc };
      return;
    }
    if (type === 'dbWrite') { out.status = 'noEffect'; return; }
    if (DATA_STEPS.indexOf(type) >= 0) {
      if (type === 'externalCall') {
        const rq = step.requestMapping || {};
        if ((rq.entries || []).length) {
          const m = runRows(rq.entries, scopes, ctx, [String(rq.targetName || '').trim(), rq.targetContract && rq.targetContract.name].filter(Boolean), []);
          out.request = m.doc;
          out.rows = m.rows;
        }
      }
      let text = results[step.id];
      let from = 'pasted';
      if (!String(text || '').trim() && type === 'externalCall' && step.responseSample && step.responseSample.format !== 'binary') {
        text = step.responseSample.body;
        from = 'sample';
      }
      const name = outputName(step);
      if (!String(text || '').trim()) {
        out.status = name ? 'needsResult' : 'noEffect';
        if (name) missingModels.set(name, out.title);
        return;
      }
      const p = parsedInput(text, (step.output && step.output.fields) || [], from === 'pasted' ? resultFormats[step.id] : undefined);
      if (!p.ok) { out.status = 'error'; out.code = 'badResult'; out.params = { format: p.error }; if (name) missingModels.set(name, out.title); return; }
      let value = p.value;
      const keys = isPlainObject(value) ? Object.keys(value) : [];
      const fields = (step.output && step.output.fields) || [];
      if (keys.length === 1 && isPlainObject(value[keys[0]]) && !fields.some((f) => splitPath(f.path)[0] && splitPath(f.path)[0].name === keys[0])) value = value[keys[0]];
      out.resultFrom = from;
      setOutput(step, out, value);
      return;
    }
    out.status = 'inWords';
  }

  return report;
}

// The steps that take their result from outside and have none for the run:
// what to paste.
function stepsNeedingResults(flow) {
  return (flow.steps || []).filter((s) => DATA_STEPS.indexOf(s.type) >= 0)
    .map((s) => ({ id: s.id, title: String(s.title || s.serviceName || '').trim(), type: s.type, name: outputName(s),
      hasSample: s.type === 'externalCall' && !!(s.responseSample && String(s.responseSample.body || '').trim() && s.responseSample.format !== 'binary') }));
}

module.exports = { same, runHow, runFlow, runStream, evalCondition, evalConditions, stepsNeedingResults, outputName, DATA_STEPS };
