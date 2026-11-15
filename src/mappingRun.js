const { typeInfo } = require('./mapCore');

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !v.__t; }

const { parseSample } = require('./sampleFormats');

function splitPath(p) {
  return String(p || '').split('.').filter((s) => s !== '').map((seg) => {
    const m = seg.match(/^(.*?)\[(\d*)\]$/);
    if (!m) return { name: seg, index: null };
    return { name: m[1], index: m[2] === '' ? null : Number(m[2]) };
  });
}
function plainPath(p) { return splitPath(p).map((s) => s.name).join('.'); }

function childOf(value, name) {
  if (!isPlainObject(value)) return undefined;
  if (Object.prototype.hasOwnProperty.call(value, name)) return value[name];
  if (Object.prototype.hasOwnProperty.call(value, '@' + name)) return value['@' + name];
  return undefined;
}

function walk(value, segs, i, idx, out) {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((v, k) => walk(v, segs, i, idx.concat(k), out));
    return;
  }
  if (i === segs.length) { out.push({ value, idx }); return; }
  const seg = segs[i];
  let next = childOf(value, seg.name);
  if (next === undefined) return;
  if (seg.index !== null) {
    next = Array.isArray(next) ? next[seg.index] : (seg.index === 0 ? next : undefined);
    if (next === undefined) return;
    if (i + 1 === segs.length && Array.isArray(next)) { out.push({ value: next, idx }); return; }
  }
  walk(next, segs, i + 1, idx, out);
}

function sharedRoot(fields) {
  let root = null;
  for (const f of fields || []) {
    const segs = splitPath(f.path);
    const first = segs[0];
    if (!first) continue;
    if (segs.length < 2) return null;
    if (root === null) root = first.name;
    else if (root !== first.name) return null;
  }
  return root;
}
function skipFor(sampleValue, root) {
  if (!root) return 0;
  const probe = Array.isArray(sampleValue) ? sampleValue.find((x) => x !== null && x !== undefined) : sampleValue;
  return childOf(probe, root) === undefined ? 1 : 0;
}

function resolveIn(sample, path, skip) {
  const segs = splitPath(path).slice(skip || 0);
  const out = [];
  if (!segs.length) { walk(sample, [], 0, [], out); return out; }
  walk(sample, segs, 0, [], out);
  return out;
}

function pad(n, w) { const s = String(Math.abs(n)); return (n < 0 ? '-' : '') + '0'.repeat(Math.max(0, w - s.length)) + s; }

function mkDate(kind, parts) {
  return Object.assign({ __t: kind, y: 1970, M: 1, d: 1, H: 0, m: 0, s: 0, S: 0 }, parts);
}
function isDate(v) { return v && typeof v === 'object' && (v.__t === 'date' || v.__t === 'datetime' || v.__t === 'time'); }
function isBytes(v) { return v && typeof v === 'object' && v.__t === 'bytes'; }

function isoOf(v) {
  const date = pad(v.y, 4) + '-' + pad(v.M, 2) + '-' + pad(v.d, 2);
  const time = pad(v.H, 2) + ':' + pad(v.m, 2) + ':' + pad(v.s, 2) + (v.S ? '.' + pad(v.S, 3) : '');
  if (v.__t === 'date') return date;
  if (v.__t === 'time') return time;
  return date + 'T' + time;
}

function textOf(v) {
  if (v === null || v === undefined) return '';
  if (isDate(v)) return isoOf(v);
  if (isBytes(v)) return Buffer.from(v.bytes).toString('base64');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

class RunError extends Error {
  constructor(code, params) { super(code); this.code = code; this.params = params || {}; }
}

function numberOf(v, strict) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = textOf(v).trim().replace(/\s/g, '');
  const norm = /^[+-]?\d+,\d+$/.test(s) ? s.replace(',', '.') : s;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(norm)) {
    if (strict) throw new RunError('notNumber', { value: textOf(v) });
    return NaN;
  }
  return Number(norm);
}

function truthy(v) {
  if (typeof v === 'string') return !/^(false|0|)$/i.test(v.trim());
  return !!v;
}

const PATTERN_TOKEN = /'[^']*'|yyyy|uuuu|yy|MM|M|dd|d|HH|H|mm|m|ss|s|SSS|./g;

function tokensOf(pattern) { return String(pattern).match(PATTERN_TOKEN) || []; }

function parseWithPattern(text, pattern, kind) {
  const s = textOf(text).trim();
  if (!pattern) return parseIso(s, kind);
  const fields = [];
  let re = '^';
  for (const tk of tokensOf(pattern)) {
    if (tk[0] === "'") { re += tk.length === 2 ? "'" : tk.slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    const map = { yyyy: ['y', '(\\d{4})'], uuuu: ['y', '(\\d{4})'], yy: ['yy', '(\\d{2})'], MM: ['M', '(\\d{2})'], M: ['M', '(\\d{1,2})'],
      dd: ['d', '(\\d{2})'], d: ['d', '(\\d{1,2})'], HH: ['H', '(\\d{2})'], H: ['H', '(\\d{1,2})'], mm: ['m', '(\\d{2})'], m: ['m', '(\\d{1,2})'],
      ss: ['s', '(\\d{2})'], s: ['s', '(\\d{1,2})'], SSS: ['S', '(\\d{3})'] };
    if (map[tk]) { fields.push(map[tk][0]); re += map[tk][1]; }
    else re += tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const m = s.match(new RegExp(re + '$'));
  if (!m) throw new RunError('badDate', { value: s, pattern });
  const parts = {};
  fields.forEach((f, i) => {
    const n = Number(m[i + 1]);
    if (f === 'yy') parts.y = 2000 + n; else parts[f] = n;
  });
  return checkDate(mkDate(kind, parts), s, pattern);
}

function checkDate(v, s, pattern) {
  const bad = v.M < 1 || v.M > 12 || v.d < 1 || v.d > new Date(Date.UTC(v.y, v.M, 0)).getUTCDate()
    || v.H > 23 || v.m > 59 || v.s > 59;
  if (bad) throw new RunError('badDate', { value: s, pattern: pattern || 'ISO' });
  return v;
}

function parseIso(s, kind) {
  if (isDate(s)) return s;
  const t = String(s).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (m && kind !== 'time') {
    return checkDate(mkDate(kind || (m[4] ? 'datetime' : 'date'), {
      y: +m[1], M: +m[2], d: +m[3], H: +(m[4] || 0), m: +(m[5] || 0), s: +(m[6] || 0), S: m[7] ? +String(m[7]).slice(0, 3).padEnd(3, '0') : 0
    }), t);
  }
  m = t.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m && (kind === 'time' || !kind)) return checkDate(mkDate('time', { H: +m[1], m: +m[2], s: +(m[3] || 0) }), t);
  throw new RunError('badDate', { value: t, pattern: 'ISO' });
}

function formatWithPattern(v, pattern) {
  const d = isDate(v) ? v : parseIso(textOf(v));
  let out = '';
  for (const tk of tokensOf(pattern)) {
    if (tk[0] === "'") { out += tk.length === 2 ? "'" : tk.slice(1, -1); continue; }
    switch (tk) {
      case 'yyyy': case 'uuuu': out += pad(d.y, 4); break;
      case 'yy': out += pad(d.y % 100, 2); break;
      case 'MM': out += pad(d.M, 2); break;
      case 'M': out += String(d.M); break;
      case 'dd': out += pad(d.d, 2); break;
      case 'd': out += String(d.d); break;
      case 'HH': out += pad(d.H, 2); break;
      case 'H': out += String(d.H); break;
      case 'mm': out += pad(d.m, 2); break;
      case 'm': out += String(d.m); break;
      case 'ss': out += pad(d.s, 2); break;
      case 's': out += String(d.s); break;
      case 'SSS': out += pad(d.S, 3); break;
      default: out += tk;
    }
  }
  return out;
}

function epochOf(v) {
  const d = isDate(v) ? v : parseIso(textOf(v));
  return Date.UTC(d.y, d.M - 1, d.d, d.H, d.m, d.s, d.S);
}
function fromEpoch(ms) {
  const t = new Date(numberOf(ms, true));
  return mkDate('datetime', { y: t.getUTCFullYear(), M: t.getUTCMonth() + 1, d: t.getUTCDate(), H: t.getUTCHours(), m: t.getUTCMinutes(), s: t.getUTCSeconds(), S: t.getUTCMilliseconds() });
}
function nowParts(clock) {
  const t = clock ? clock() : new Date();
  return { y: t.getFullYear(), M: t.getMonth() + 1, d: t.getDate(), H: t.getHours(), m: t.getMinutes(), s: t.getSeconds(), S: 0 };
}

function tokenize(src) {
  const out = [];
  src = String(src).replace(/'((?:[^']|'(?![\s]*(?:[,)}:?+\-*/%<>=!&|]|$)))*)'/g, (m, body) => "'" + body.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");
  const re = /\s+|(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([\p{L}_$@#][\p{L}\p{N}_$@#]*)|(==|!=|<=|>=|&&|\|\||->|→|[?:()+\-*/%<>!,.\[\]{}])/gu;
  let m;
  let last = 0;
  while ((m = re.exec(src)) !== null) {
    if (m.index !== last) throw new RunError('syntax', { text: src });
    last = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'str', v: m[2].replace(/\\(.)/g, '$1') });
    else if (m[3] !== undefined) out.push({ t: 'str', v: m[3].replace(/\\(.)/g, '$1') });
    else if (m[4] !== undefined) out.push({ t: 'id', v: m[4] });
    else if (m[5] !== undefined) out.push({ t: 'op', v: m[5] });
  }
  if (last !== src.length) throw new RunError('syntax', { text: src });
  return out;
}

function parseExpression(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
  const eat = (v) => { if (!peek(v)) throw new RunError('syntax', { text: src }); p++; };
  function ternary() {
    const c = or();
    if (peek('?')) { p++; const a = ternary(); eat(':'); const b = ternary(); return { k: 'if', c, a, b }; }
    return c;
  }
  function bin(next, ops) {
    return function () {
      let l = next();
      while (toks[p] && toks[p].t === 'op' && ops.indexOf(toks[p].v) >= 0) { const op = toks[p++].v; l = { k: 'bin', op, l, r: next() }; }
      return l;
    };
  }
  const mul = bin(unary, ['*', '/', '%']);
  const add = bin(mul, ['+', '-']);
  const cmp = bin(add, ['<', '>', '<=', '>=']);
  const eq = bin(cmp, ['==', '!=']);
  const and = bin(eq, ['&&']);
  const or = bin(and, ['||']);
  function unary() {
    if (peek('!')) { p++; return { k: 'not', e: unary() }; }
    if (peek('-')) { p++; return { k: 'neg', e: unary() }; }
    return postfix();
  }
  function args() {
    eat('(');
    const list = [];
    if (!peek(')')) { list.push(ternary()); while (peek(',')) { p++; list.push(ternary()); } }
    eat(')');
    return list;
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (peek('.') && toks[p + 1] && toks[p + 1].t === 'id' && toks[p + 2] && toks[p + 2].t === 'op' && toks[p + 2].v === '(') {
        p++;
        const name = toks[p++].v;
        e = { k: 'call', name, args: [e].concat(args()) };
        continue;
      }
      return e;
    }
  }
  function primary() {
    const tk = toks[p];
    if (!tk) throw new RunError('syntax', { text: src });
    if (tk.t === 'num') { p++; return { k: 'lit', v: tk.v }; }
    if (tk.t === 'str') { p++; return { k: 'lit', v: tk.v }; }
    if (tk.t === 'op' && tk.v === '(') { p++; const e = ternary(); eat(')'); return e; }
    if (tk.t === 'id') {
      p++;
      if (peek('(')) return { k: 'call', name: tk.v, args: args() };
      if (tk.v === 'true') return { k: 'lit', v: true };
      if (tk.v === 'false') return { k: 'lit', v: false };
      if (tk.v === 'null') return { k: 'lit', v: null };
      let name = tk.v;
      for (;;) {
        if (peek('[') && toks[p + 1] && toks[p + 1].t === 'num' && toks[p + 2] && toks[p + 2].t === 'op' && toks[p + 2].v === ']') {
          name += '[' + toks[p + 1].v + ']'; p += 3; continue;
        }
        if (peek('.') && toks[p + 1] && toks[p + 1].t === 'id' && !(toks[p + 2] && toks[p + 2].t === 'op' && toks[p + 2].v === '(')) {
          name += '.' + toks[p + 1].v; p += 2; continue;
        }
        break;
      }
      return { k: 'name', v: name };
    }
    throw new RunError('syntax', { text: src });
  }
  const tree = ternary();
  if (p !== toks.length) throw new RunError('syntax', { text: src });
  return tree;
}

function splitValueTable(transform) {
  const text = String(transform || '').trim();
  const m = text.match(/^([\s\S]*?valueMap\s*\([\s\S]*?\))\s*\{([\s\S]*)\}\s*$/);
  if (!m) return { expr: text, table: null };
  const table = {};
  m[2].split(',').forEach((pair) => {
    const kv = pair.split(/→|->/);
    if (kv.length < 2) return;
    const unq = (s) => String(s).trim().replace(/^(['"])(.*)\1$/, '$2');
    table[unq(kv[0])] = unq(kv.slice(1).join('→'));
  });
  return { expr: m[1], table };
}

const FUNCTIONS = {
  trim: (a) => textOf(a).trim(),
  toInteger: (a) => {
    const n = numberOf(a, true);
    if (!Number.isInteger(n)) throw new RunError('notInteger', { value: textOf(a) });
    return n;
  },
  toDecimal: (a, scale) => {
    const n = numberOf(a, true);
    return scale === undefined ? n : Number(n.toFixed(numberOf(scale, true)));
  },
  round: (a, scale) => {
    const n = numberOf(a, true), k = scale === undefined ? 0 : numberOf(scale, true);
    const f = Math.pow(10, k);
    return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
  },
  truncate: (a) => Math.trunc(numberOf(a, true)),
  floor: (a) => Math.floor(numberOf(a, true)),
  ceil: (a) => Math.ceil(numberOf(a, true)),
  abs: (a) => Math.abs(numberOf(a, true)),
  min: (...a) => Math.min(...a.map((x) => numberOf(x, true))),
  max: (...a) => Math.max(...a.map((x) => numberOf(x, true))),
  toString: (a) => textOf(a),
  toUpperCase: (a) => textOf(a).toUpperCase(),
  toLowerCase: (a) => textOf(a).toLowerCase(),
  upper: (a) => textOf(a).toUpperCase(),
  lower: (a) => textOf(a).toLowerCase(),
  length: (a) => (Array.isArray(a) ? a.length : textOf(a).length),
  substring: (a, from, to) => textOf(a).substring(numberOf(from, true), to === undefined ? undefined : numberOf(to, true)),
  replace: (a, b, c) => textOf(a).split(textOf(b)).join(textOf(c)),
  concat: (...a) => a.map(textOf).join(''),
  coalesce: (...a) => { for (const x of a) if (x !== null && x !== undefined && x !== '') return x; return null; },
  equalsIgnoreCase: (a, b) => textOf(a).toLowerCase() === textOf(b).toLowerCase(),
  enumOf: (a) => textOf(a),
  parseUuid: (a) => {
    const s = textOf(a).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new RunError('badUuid', { value: s });
    return s.toLowerCase();
  },
  parseDate: (a, pattern) => parseWithPattern(a, pattern === undefined ? '' : textOf(pattern), 'date'),
  parseDateTime: (a, pattern) => parseWithPattern(a, pattern === undefined ? '' : textOf(pattern), 'datetime'),
  parseTime: (a, pattern) => parseWithPattern(a, pattern === undefined ? '' : textOf(pattern), 'time'),
  formatDate: (a, pattern) => formatWithPattern(a, textOf(pattern)),
  toLocalDate: (a) => { const d = isDate(a) ? a : parseIso(textOf(a)); return mkDate('date', { y: d.y, M: d.M, d: d.d }); },
  toLocalTime: (a) => { const d = isDate(a) ? a : parseIso(textOf(a)); return mkDate('time', { H: d.H, m: d.m, s: d.s, S: d.S }); },
  atStartOfDay: (a) => { const d = isDate(a) ? a : parseIso(textOf(a), 'date'); return mkDate('datetime', { y: d.y, M: d.M, d: d.d }); },
  at: (day, time) => {
    const d = isDate(day) ? day : parseIso(textOf(day), 'date');
    const t = isDate(time) ? time : parseIso(textOf(time), 'time');
    return mkDate('datetime', { y: d.y, M: d.M, d: d.d, H: t.H, m: t.m, s: t.s, S: t.S });
  },
  fromEpochMillis: (a) => fromEpoch(a),
  epochMillis: (a) => epochOf(a),
  base64Encode: (a) => (isBytes(a) ? Buffer.from(a.bytes) : Buffer.from(textOf(a), 'utf8')).toString('base64'),
  base64Decode: (a) => {
    const s = textOf(a).trim();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 === 1) throw new RunError('badBase64', { value: s });
    return { __t: 'bytes', bytes: Array.from(Buffer.from(s, 'base64')) };
  },
  utf8Bytes: (a) => ({ __t: 'bytes', bytes: Array.from(Buffer.from(textOf(a), 'utf8')) })
};
const VOLATILE = { today: true, now: true, uuid: true, randomUUID: true };

function evalNode(node, env) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'name': return env.lookup(node.v);
    case 'not': return !truthy(evalNode(node.e, env));
    case 'neg': return -numberOf(evalNode(node.e, env), true);
    case 'if': return truthy(evalNode(node.c, env)) ? evalNode(node.a, env) : evalNode(node.b, env);
    case 'bin': {
      if (node.op === '&&') return truthy(evalNode(node.l, env)) && truthy(evalNode(node.r, env));
      if (node.op === '||') return truthy(evalNode(node.l, env)) || truthy(evalNode(node.r, env));
      const l = evalNode(node.l, env), r = evalNode(node.r, env);
      if (node.op === '==' || node.op === '!=') {
        const ln = numberOf(l), rn = numberOf(r);
        const same = (!Number.isNaN(ln) && !Number.isNaN(rn)) ? ln === rn
          : (typeof l === 'boolean' || typeof r === 'boolean') ? truthy(l) === truthy(r)
          : textOf(l) === textOf(r);
        return node.op === '==' ? same : !same;
      }
      if (node.op === '+' && (typeof l === 'string' || typeof r === 'string') && (Number.isNaN(numberOf(l)) || Number.isNaN(numberOf(r)))) {
        return textOf(l) + textOf(r);
      }
      const a = numberOf(l, true), b = numberOf(r, true);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0) throw new RunError('divZero'); return a / b;
        case '%': return a % b;
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
      }
      throw new RunError('syntax', { text: node.op });
    }
    case 'call': {
      const name = node.name;
      if (name === 'valueMap') {
        const v = textOf(evalNode(node.args[0], env));
        if (!env.table) throw new RunError('noTable');
        if (!Object.prototype.hasOwnProperty.call(env.table, v)) throw new RunError('notInTable', { value: v });
        return env.table[v];
      }
      if (Object.prototype.hasOwnProperty.call(VOLATILE, name)) {
        env.volatile = true;
        if (name === 'today') return mkDate('date', Object.assign(nowParts(env.clock), { H: 0, m: 0, s: 0 }));
        if (name === 'now') return mkDate('datetime', nowParts(env.clock));
        return env.uuid ? env.uuid() : require('crypto').randomUUID();
      }
      const fn = Object.prototype.hasOwnProperty.call(FUNCTIONS, name) ? FUNCTIONS[name] : null;
      if (!fn) throw new RunError('unknownFunction', { name });
      return fn(...node.args.map((a) => evalNode(a, env)));
    }
  }
  throw new RunError('syntax', { text: '' });
}

function readWhenNull(text) {
  const t = String(text || '').trim();
  if (!t) return { kind: 'none' };
  if (/^(pomi[nń]|skip|omit)/i.test(t)) return { kind: 'skip' };
  if (/^(odrzu[cć]|reject)/i.test(t)) return { kind: 'reject' };
  if (/^(null|nil)$/i.test(t)) return { kind: 'value', value: null };
  const m = t.match(/^(domy[sś]lnie|default|warto[sś][cć] domy[sś]lna)\s*[:=]?\s*([\s\S]*)$/i);
  if (m) return { kind: 'default', text: m[2].trim() };
  return { kind: 'unknown' };
}

function targetLists(target) {
  const lists = new Set();
  const fields = (target && target.fields) || [];
  for (const f of fields) {
    if (f.listAt) lists.add(plainPath(f.listAt));
  }
  if (target && target.sample) {
    const parsed = parseSample(target.sample);
    if (parsed.ok) collectArrays(parsed.value, '', lists, parsed.format === 'xml');
  }
  for (const f of fields) {
    if (f.max !== '*' || f.listAt) continue;
    const p = plainPath(f.path);
    const covered = Array.from(lists).some((l) => p === l || p.indexOf(l + '.') === 0);
    if (!covered) lists.add(p);
  }
  return lists;
}
function collectArrays(v, prefix, lists, xml) {
  if (Array.isArray(v)) {
    if (prefix) lists.add(prefix);
    v.forEach((x) => collectArrays(x, prefix, lists, xml));
    return;
  }
  if (!isPlainObject(v)) return;
  for (const k of Object.keys(v)) collectArrays(v[k], prefix ? prefix + '.' + k : k, lists, xml);
}

function writeAt(doc, path, value, idx, lists) {
  const segs = splitPath(path);
  const listLevels = [];
  let acc = '';
  segs.forEach((s, j) => { acc = acc ? acc + '.' + s.name : s.name; listLevels[j] = s.index !== null || lists.has(acc); });
  const freeLists = segs.filter((s, j) => listLevels[j] && s.index === null).length;
  if (idx.slice(freeLists).some((i) => i !== 0)) return false;
  let k = 0;
  let cur = doc;
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j];
    const last = j === segs.length - 1;
    if (listLevels[j]) {
      if (!Array.isArray(cur[s.name])) cur[s.name] = cur[s.name] === undefined ? [] : [cur[s.name]];
      const arr = cur[s.name];
      const i = s.index !== null ? s.index : (k < idx.length ? idx[k++] : 0);
      if (last) { arr[i] = value; return true; }
      if (!isPlainObject(arr[i])) arr[i] = {};
      cur = arr[i];
    } else {
      if (last) { cur[s.name] = value; return true; }
      if (!isPlainObject(cur[s.name])) cur[s.name] = {};
      cur = cur[s.name];
    }
  }
  return true;
}

function typed(value, type, format) {
  if (value === null || value === undefined) return null;
  if (isDate(value) || isBytes(value)) return textOf(value);
  if (format === 'xml') return isPlainObject(value) || Array.isArray(value) ? value : textOf(value);
  const fam = typeInfo(type || '').family;
  if ((fam === 'integer' || fam === 'decimal' || fam === 'timestamp') && typeof value === 'string') {
    const n = numberOf(value);
    return Number.isNaN(n) ? value : n;
  }
  if (fam === 'boolean' && typeof value === 'string' && /^(true|false)$/i.test(value.trim())) return /^true$/i.test(value.trim());
  if (fam === 'string' && (typeof value === 'number' || typeof value === 'boolean')) return String(value);
  return value;
}

function compact(v) {
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) out.push(v[i] === undefined ? null : compact(v[i]));
    return out;
  }
  if (isPlainObject(v)) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = compact(v[k]);
    return o;
  }
  return v;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function xmlName(s) {
  const n = String(s).replace(/[^\p{L}\p{N}_.-]/gu, '_');
  return /^[\p{L}_]/u.test(n) ? n : '_' + n;
}
function toXml(name, v, indent, out) {
  if (Array.isArray(v)) { v.forEach((x) => toXml(name, x, indent, out)); return; }
  const tag = xmlName(name);
  if (v === null || v === undefined) { out.push(indent + '<' + tag + ' xsi:nil="true" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>'); return; }
  if (!isPlainObject(v)) { out.push(indent + '<' + tag + '>' + xmlEscape(textOf(v)) + '</' + tag + '>'); return; }
  const keys = Object.keys(v);
  const attrs = keys.filter((k) => k[0] === '@').map((k) => ' ' + xmlName(k.slice(1)) + '="' + xmlEscape(textOf(v[k])) + '"').join('');
  const kids = keys.filter((k) => k[0] !== '@' && k !== '#text');
  const text = v['#text'] !== undefined ? xmlEscape(textOf(v['#text'])) : '';
  if (!kids.length) { out.push(indent + '<' + tag + attrs + (text ? '>' + text + '</' + tag + '>' : '/>')); return; }
  out.push(indent + '<' + tag + attrs + '>' + text);
  kids.forEach((k) => toXml(k, v[k], indent + '  ', out));
  out.push(indent + '</' + tag + '>');
}

const OUTPUT_FORMATS = ['json', 'xml', 'yaml', 'properties'];

function propEscapeKey(k) { return String(k).replace(/\\/g, '\\\\').replace(/([ :=#!])/g, '\\$1'); }
function propEscapeValue(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t').replace(/^ /, '\\ ');
}
function toProperties(doc, rootName) {
  const lines = [];
  const walkP = (v, key) => {
    if (Array.isArray(v)) {
      if (!v.length) { lines.push(propEscapeKey(key) + '='); return; }
      v.forEach((x, i) => walkP(x, key + '[' + i + ']'));
      return;
    }
    if (isPlainObject(v)) {
      const keys = Object.keys(v).filter((k) => k !== '#text');
      if (!keys.length) { lines.push(propEscapeKey(key) + '='); return; }
      for (const k of keys) walkP(v[k], (key ? key + '.' : '') + (k.charAt(0) === '@' ? k.slice(1) : k));
      return;
    }
    lines.push(propEscapeKey(key || rootName || 'value') + '=' + (v === null || v === undefined ? '' : propEscapeValue(textOf(v))));
  };
  walkP(doc, isPlainObject(doc) ? '' : (rootName || 'value'));
  return lines.join('\n') + (lines.length ? '\n' : '');
}

function serialize(doc, format, rootName) {
  if (format === 'xml') {
    const lines = ['<?xml version="1.0" encoding="UTF-8"?>'];
    const keys = isPlainObject(doc) ? Object.keys(doc) : [];
    if (keys.length === 1 && !Array.isArray(doc[keys[0]])) toXml(keys[0], doc[keys[0]], '', lines);
    else if (Array.isArray(doc)) {
      lines.push('<' + xmlName(rootName || 'root') + '>');
      doc.forEach((x) => toXml('item', x, '  ', lines));
      lines.push('</' + xmlName(rootName || 'root') + '>');
    } else toXml(rootName || 'root', doc, '', lines);
    return lines.join('\n') + '\n';
  }
  if (format === 'yaml') return require('js-yaml').dump(doc === undefined ? null : doc, { lineWidth: -1, noRefs: true });
  if (format === 'properties') return toProperties(doc, rootName);
  return JSON.stringify(doc === undefined ? null : doc, null, 2) + '\n';
}

function targetRootMode(target) {
  if (target && target.fromSample) return 'none';
  return /WSDL|XSD|SOAP/i.test(String(target && target.kind || '')) ? 'element' : 'synthetic';
}

function runMapping(input, options) {
  const opts = options || {};
  const target = input.target || { fields: [] };
  const sources = input.sources || [];
  const ignore = new Set((input.ignoreTransforms || []).map((s) => String(s).trim()));
  const parsed = {};
  const sampleErrors = {};
  for (const s of sources) {
    const text = (input.samples || {})[s.id];
    if (text === undefined || !String(text).trim()) continue;
    const p = parseSample(text, (input.formats || {})[s.id]);
    if (p.ok) parsed[s.id] = Object.assign(p, { skip: skipFor(p.value, sharedRoot(s.fields)) });
    else sampleErrors[s.id] = p.error;
  }
  const anyXml = Object.keys(parsed).some((id) => parsed[id].format === 'xml');
  const rootMode = targetRootMode(target);
  const format = OUTPUT_FORMATS.indexOf(input.format) >= 0 ? input.format
    : (rootMode === 'element' || (rootMode !== 'synthetic' && anyXml) ? 'xml' : 'json');
  const lists = targetLists(target);
  const typeOf = {};
  for (const f of target.fields || []) typeOf[plainPath(f.path)] = f.type;
  const targetGroups = new Set();
  for (const f of target.fields || []) {
    const segs = plainPath(f.path).split('.');
    for (let i = 1; i < segs.length; i++) targetGroups.add(segs.slice(0, i).join('.'));
  }

  function ownerOf(m) {
    if (m.sourceId && sources.some((s) => s.id === m.sourceId)) return sources.find((s) => s.id === m.sourceId);
    const p = plainPath(m.path);
    return sources.find((s) => (s.fields || []).some((f) => plainPath(f.path) === p)) || null;
  }
  function read(sourceId, path) {
    const p = parsed[sourceId];
    if (!p) return null;
    return resolveIn(p.value, path, p.skip);
  }
  function lookupAny(name, own) {
    const order = own ? [own].concat(sources.filter((s) => s !== own)) : sources;
    for (const s of order) {
      if (!parsed[s.id]) continue;
      const known = (s.fields || []).some((f) => plainPath(f.path) === plainPath(name) || plainPath(f.path).endsWith('.' + plainPath(name)));
      const hits = read(s.id, name);
      if (hits && hits.length) return hits[0].value;
      if (known) return null;
    }
    throw new RunError('unknownName', { name });
  }

  const doc = {};
  const rows = [];
  let rejected = false;

  function evaluate(transform, value, fromPath, own) {
    const split = splitValueTable(transform);
    const tree = parseExpression(split.expr);
    const env = {
      table: split.table, clock: opts.clock, uuid: opts.uuid, volatile: false,
      lookup: (name) => {
        if (name === 'x' || name === 'value' || (fromPath && (name === fromPath || name === leafName(fromPath)))) return value;
        return lookupAny(name, own);
      }
    };
    const out = evalNode(tree, env);
    return { value: out, volatile: env.volatile };
  }

  function applyMissing(row, whenNull, to, idx) {
    const rule = readWhenNull(whenNull);
    if (rule.kind === 'none') { row.status = 'missing'; return; }
    if (rule.kind === 'skip') { row.status = 'skipped'; return; }
    if (rule.kind === 'reject') { row.status = 'rejected'; rejected = true; return; }
    if (rule.kind === 'unknown') { row.status = 'unsupported'; row.code = 'whenNullUnknown'; row.params = { text: whenNull }; return; }
    let v;
    if (rule.kind === 'value') v = rule.value;
    else {
      const q = rule.text.match(/^(['"])([\s\S]*)\1$/);
      if (q) v = q[2];
      else if (rule.text === '') v = '';
      else {
        try { v = evaluate(rule.text, null, '', null).value; } catch (e) { v = rule.text; }
      }
    }
    writeAt(doc, to, typed(v, typeOf[plainPath(to)], format), idx || [], lists);
    row.status = 'defaulted';
    row.outputs.push(textOf(v));
  }

  const entries = Object.keys(input.mappings || {}).map((to) => Object.assign({ to }, input.mappings[to]))
    .filter((m) => String(m.path || '').trim())
    .sort((a, b) => splitPath(a.to).length - splitPath(b.to).length);

  for (const m of entries) {
    const transform = ignore.has(String(m.transform || '').trim()) ? '' : String(m.transform || '').trim();
    const row = { to: m.to, from: m.path, transform, whenNull: String(m.whenNull || ''), status: 'ok', inputs: [], outputs: [] };
    rows.push(row);
    const owner = ownerOf(m);
    if (!owner || !parsed[owner.id]) {
      row.status = 'noSample';
      row.params = { source: owner ? owner.name : '' };
      continue;
    }
    const hits = read(owner.id, m.path).filter((h) => h.value !== null);
    if (!hits.length) { applyMissing(row, row.whenNull, m.to, []); continue; }
    const toPlain = plainPath(m.to);
    if (m.how && m.how.kind) {
      try {
        const p = parsed[owner.id];
        const root = sharedRoot(owner.fields);
        const scopeValue = p.skip && root ? { [root]: p.value } : p.value;
        const r = require('./flowRun').runHow(m.how, m.path, [{ value: scopeValue }], { opts });
        row.inputs = r.inputs;
        row.status = 'transformed';
        if (r.volatile) row.volatile = true;
        if (r.value === null || r.value === undefined) { applyMissing(row, row.whenNull, m.to, []); continue; }
        if (writeAt(doc, m.to, typed(r.value, typeOf[toPlain], format), [], lists)) row.outputs.push(Array.isArray(r.value) ? '[' + r.value.map(textOf).join(', ') + ']' : textOf(r.value));
      } catch (e) {
        if (!(e instanceof RunError)) throw e;
        row.status = ['unknownFunction', 'syntax', 'unknownName', 'howInWords', 'conditionInWords'].indexOf(e.code) >= 0 ? 'unsupported' : 'error';
        row.code = e.code;
        row.params = e.params;
      }
      continue;
    }
    const whole = targetGroups.has(toPlain) && !transform;
    let written = 0;
    for (const h of hits) {
      if (whole) {
        row.inputs.push(isPlainObject(h.value) ? '{…}' : textOf(h.value));
        for (const f of target.fields || []) {
          const fp = plainPath(f.path);
          if (fp.indexOf(toPlain + '.') !== 0) continue;
          const rel = fp.slice(toPlain.length + 1);
          const inner = [];
          walk(h.value, splitPath(rel), 0, [], inner);
          for (const v of inner) {
            if (v.value === undefined) continue;
            if (writeAt(doc, m.to + '.' + rel, typed(v.value, f.type, format), h.idx.concat(v.idx), lists)) written++;
          }
        }
        continue;
      }
      if (isPlainObject(h.value)) {
        row.inputs.push('{…}');
        row.status = 'error';
        row.code = 'objectToField';
        continue;
      }
      row.inputs.push(textOf(h.value));
      let out = h.value;
      if (transform) {
        try {
          const r = evaluate(transform, h.value, m.path, owner);
          out = r.value;
          if (r.volatile) row.volatile = true;
          row.status = 'transformed';
        } catch (e) {
          if (!(e instanceof RunError)) throw e;
          row.status = e.code === 'unknownFunction' || e.code === 'syntax' || e.code === 'unknownName' ? 'unsupported' : 'error';
          row.code = e.code;
          row.params = e.params;
          continue;
        }
      }
      if (out === null || out === undefined) { applyMissing(row, row.whenNull, m.to, h.idx); continue; }
      if (writeAt(doc, m.to, typed(out, typeOf[toPlain], format), h.idx, lists)) { written++; row.outputs.push(textOf(out)); }
    }
    if (whole) {
      row.status = written ? 'whole' : 'missing';
      row.outputs.push(String(written));
    } else if (!written && row.status === 'ok' && hits.length) row.status = 'firstOnly';
  }

  for (const e of input.extra || []) {
    const to = String(e.to || '').trim();
    if (!to) continue;
    const transform = ignore.has(String(e.transform || '').trim()) ? '' : String(e.transform || '').trim();
    const row = { to, from: '', transform, whenNull: '', status: 'constant', inputs: [], outputs: [] };
    rows.push(row);
    if (Array.isArray(e.values) && typeof e.value === 'string') {
      e.values.forEach((v, i) => { writeAt(doc, to, typed(v, typeOf[plainPath(to)], format), [i], lists); row.outputs.push(String(v)); });
      continue;
    }
    if (typeof e.value === 'string') {
      writeAt(doc, to, typed(e.value, typeOf[plainPath(to)], format), [], lists);
      row.outputs.push(e.value);
      continue;
    }
    if (!transform) { row.status = 'missing'; continue; }
    try {
      const r = evaluate(transform, null, '', null);
      row.status = 'transformed';
      if (r.volatile) row.volatile = true;
      if (r.value === null || r.value === undefined) { row.status = 'missing'; continue; }
      writeAt(doc, to, typed(r.value, typeOf[plainPath(to)], format), [], lists);
      row.outputs.push(textOf(r.value));
    } catch (err) {
      if (!(err instanceof RunError)) throw err;
      row.status = err.code === 'unknownFunction' || err.code === 'syntax' || err.code === 'unknownName' ? 'unsupported' : 'error';
      row.code = err.code;
      row.params = err.params;
    }
  }

  let out = compact(doc);
  const keys = Object.keys(out);
  if (rootMode === 'synthetic' && format !== 'xml' && keys.length === 1 && isPlainObject(out[keys[0]])) out = out[keys[0]];
  const counts = {};
  rows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return {
    ok: true, format, doc: out, rejected,
    text: serialize(out, format, xmlName(String(target.name || 'root').replace(/\s.*$/, '') || 'root')),
    rows: rows.sort((a, b) => plainPath(a.to).localeCompare(plainPath(b.to))),
    sampleErrors, counts
  };
}

function evalExpr(text, lookup, options) {
  const opts = options || {};
  const split = splitValueTable(text);
  const env = { table: split.table, clock: opts.clock, uuid: opts.uuid, volatile: false, lookup };
  const value = evalNode(parseExpression(split.expr), env);
  return { value, volatile: env.volatile };
}

function leafName(p) { const segs = splitPath(p); return segs.length ? segs[segs.length - 1].name : ''; }

module.exports = {
  parseSample, splitPath, resolveIn, sharedRoot, skipFor, parseExpression, splitValueTable,
  readWhenNull, targetLists, writeAt, serialize, targetRootMode, runMapping, RunError,
  OUTPUT_FORMATS, evalExpr, walk, textOf, numberOf, truthy, isPlainObject, isDate, compact, plainPath, parseIso, xmlName,
  FUNCTIONS, mkDate, parseWithPattern, formatWithPattern, epochOf, fromEpoch, nowParts
};
