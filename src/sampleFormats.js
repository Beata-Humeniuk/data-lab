// The formats a sample can come in (owner, 2026-11-15: „czemu tylko json,
// jak mówiłam, że inne też będą formaty"): JSON, XML (a SOAP envelope read
// from its message), YAML, CSV/TSV (a header row, then one element per
// row) and key=value lines (.properties, a query string). Each is read
// into the same JSON-like value, so the run walks every one the same way;
// a dotted key or column ("order.id") is a nested field.
//
// `format` 'auto' recognizes the text: XML by its first sign, then JSON,
// CSV (one delimiter, the same count on every line), key=value, YAML. What
// is none of them is said, never read as something else.

const { parseXml, localName } = require('./miniXml');

const FORMATS = ['json', 'xml', 'yaml', 'csv', 'kv'];
const LABELS = { json: 'JSON', xml: 'XML', yaml: 'YAML', csv: 'CSV', kv: 'key=value' };

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !v.__t; }

// --- XML -----------------------------------------------------------------------

function xmlToValue(node) {
  const children = node.children || [];
  const attrNames = Object.keys(node.attrs || {}).filter((a) => !/^xmlns(:|$)/.test(a) && !/^xsi:/.test(a));
  const nil = Object.keys(node.attrs || {}).some((a) => /(^|:)nil$/.test(a) && /^(true|1)$/.test(node.attrs[a]));
  if (nil && !children.length) return null;
  if (!children.length && !attrNames.length) return node.text || '';
  const out = {};
  const repeated = new Set();
  for (const a of attrNames) out['@' + localName(a)] = node.attrs[a];
  for (const c of children) {
    const k = localName(c.tag);
    const v = xmlToValue(c);
    if (!Object.prototype.hasOwnProperty.call(out, k)) { out[k] = v; continue; }
    if (!repeated.has(k)) { out[k] = [out[k]]; repeated.add(k); }
    out[k].push(v);
  }
  if (String(node.text || '').trim()) out['#text'] = node.text;
  return out;
}

function readXml(body) {
  let root;
  try { root = parseXml(body); } catch (e) { return { ok: false, error: 'xml' }; }
  let top = (root.children || [])[0];
  if (!top) return { ok: false, error: 'xml' };
  if (localName(top.tag) === 'Envelope') {
    const bodyEl = (top.children || []).find((c) => localName(c.tag) === 'Body');
    const msg = bodyEl && (bodyEl.children || [])[0];
    if (msg) top = msg;
  }
  return { ok: true, format: 'xml', value: { [localName(top.tag)]: xmlToValue(top) } };
}

// --- nesting dotted keys ------------------------------------------------------

function setDotted(obj, key, value) {
  const segs = String(key).split('.').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return;
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const m = segs[i].match(/^(.*)\[(\d+)\]$/);
    if (m) {
      if (!Array.isArray(cur[m[1]])) cur[m[1]] = [];
      if (!isPlainObject(cur[m[1]][+m[2]])) cur[m[1]][+m[2]] = {};
      cur = cur[m[1]][+m[2]];
      continue;
    }
    if (!isPlainObject(cur[segs[i]])) cur[segs[i]] = {};
    cur = cur[segs[i]];
  }
  const last = segs[segs.length - 1];
  const m = last.match(/^(.*)\[(\d+)\]$/);
  if (m) {
    if (!Array.isArray(cur[m[1]])) cur[m[1]] = [];
    cur[m[1]][+m[2]] = value;
  } else cur[last] = value;
}

// --- CSV ------------------------------------------------------------------------

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
function csvDelimiter(lines) {
  if (lines.length < 2) return null;
  for (const d of ['\t', ';', ',', '|']) {
    const n = splitCsvLine(lines[0], d).length;
    if (n < 2) continue;
    if (lines.every((l) => splitCsvLine(l, d).length === n)) return d;
  }
  return null;
}
function readCsv(body) {
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== '');
  const d = csvDelimiter(lines);
  if (!d) return { ok: false, error: 'csv' };
  const head = splitCsvLine(lines[0], d).map((h) => h.trim());
  if (head.some((h) => !h)) return { ok: false, error: 'csv' };
  const rows = lines.slice(1).map((l) => {
    const cells = splitCsvLine(l, d);
    const row = {};
    head.forEach((h, i) => setDotted(row, h, cells[i] === undefined ? '' : cells[i].trim()));
    return row;
  });
  return { ok: true, format: 'csv', value: rows };
}

// --- key=value --------------------------------------------------------------------

function readKv(body) {
  const text = body.trim();
  const out = {};
  // A query string: a=1&b=2 (on one line, maybe after a "?").
  if (!/\n/.test(text) && /&/.test(text) && /=/.test(text)) {
    for (const part of text.replace(/^\?/, '').split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } };
      if (i < 0) setDotted(out, dec(part), '');
      else setDotted(out, dec(part.slice(0, i)), dec(part.slice(i + 1)));
    }
    return { ok: true, format: 'kv', value: out };
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '' && !/^\s*[#!]/.test(l));
  if (!lines.length || !lines.every((l) => /^\s*[^=\s][^=]*=/.test(l))) return { ok: false, error: 'kv' };
  // .properties escapes: \= \: \  in a key, \n \t \\ in a value.
  const unescape = (x) => x.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  for (const l of lines) {
    let i = -1;
    for (let k = 0; k < l.length; k++) { if (l[k] === '\\') { k++; continue; } if (l[k] === '=') { i = k; break; } }
    if (i < 0) continue;
    setDotted(out, unescape(l.slice(0, i).trim()), unescape(l.slice(i + 1).replace(/^\s+/, '')));
  }
  return { ok: true, format: 'kv', value: out };
}

// --- YAML -------------------------------------------------------------------------

function readYaml(body) {
  let v;
  // CORE_SCHEMA: numbers, yes/no and null as YAML says, a date left as the
  // text it was written as.
  try { const yaml = require('js-yaml'); v = yaml.load(body, { schema: yaml.CORE_SCHEMA }); } catch (e) { return { ok: false, error: 'yaml', detail: String(e && e.message || e) }; }
  if (v === null || typeof v !== 'object') return { ok: false, error: 'yaml' };
  return { ok: true, format: 'yaml', value: v };
}

// --- the entry ----------------------------------------------------------------------

// → { ok, format, value } or { ok: false, error: <format tried or 'unknown'>, detail }.
function parseSample(text, format) {
  const body = String(text || '').replace(/^﻿/, '').trim();
  if (!body) return { ok: false, error: 'empty' };
  const want = FORMATS.indexOf(format) >= 0 ? format : 'auto';
  if (want === 'xml') return readXml(body);
  if (want === 'json') {
    try { return { ok: true, format: 'json', value: JSON.parse(body) }; } catch (e) { return { ok: false, error: 'json', detail: String(e && e.message || e) }; }
  }
  if (want === 'yaml') return readYaml(body);
  if (want === 'csv') return readCsv(body);
  if (want === 'kv') return readKv(body);
  if (body.startsWith('<')) return readXml(body);
  if (/^[[{]/.test(body)) {
    try { return { ok: true, format: 'json', value: JSON.parse(body) }; } catch (e) {
      // A YAML flow mapping ({a: 1}) is no JSON; anything else that opens
      // like JSON and is not is said as broken JSON.
      const y = readYaml(body);
      return y.ok ? y : { ok: false, error: 'json', detail: String(e && e.message || e) };
    }
  }
  const csv = readCsv(body);
  if (csv.ok && !/^[^\n]*:\s/.test(body)) return csv;
  const kv = readKv(body);
  if (kv.ok) return kv;
  const y = readYaml(body);
  if (y.ok) return y;
  return { ok: false, error: 'unknown' };
}

// The fields a sample shows: its leaves, a list marked where it repeats —
// what a context object described by a sample carries.
function valueFields(value) {
  const out = [];
  const seen = new Set();
  const typeOf = (v) => (v === null ? 'string' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v === 'boolean' ? 'boolean' : 'string');
  // listAt: the path of the innermost list the field sits in (the list
  // itself for a list of values), listTail: how many parts below it — the
  // designer finds a list by them, as it does for a contract's fields.
  const mark = (f, listAt) => {
    if (listAt !== false && listAt !== undefined) {
      f.listAt = listAt;
      f.listTail = f.path.split('.').length - (listAt ? listAt.split('.').length : 0);
    }
    return f;
  };
  const walk = (v, prefix, inList, depth) => {
    if (depth > 10) return;
    if (Array.isArray(v)) {
      const items = v.filter((x) => x !== undefined);
      if (!items.length) { if (prefix && !seen.has(prefix)) { seen.add(prefix); out.push(mark({ path: prefix, type: 'string', min: 0, max: '*', card: '0..*', doc: '', nillable: false }, prefix)); } return; }
      items.forEach((x) => walk(x, prefix, prefix, depth + 1));
      return;
    }
    if (isPlainObject(v)) {
      for (const k of Object.keys(v)) {
        const name = k.charAt(0) === '@' ? k.slice(1) : k;
        if (k === '#text') continue;
        walk(v[k], prefix ? prefix + '.' + name : name, inList, depth + 1);
      }
      return;
    }
    if (!prefix || seen.has(prefix)) return;
    seen.add(prefix);
    out.push(mark({ path: prefix, type: typeOf(v), min: 1, max: inList !== false ? '*' : '1', card: inList !== false ? '1..*' : '1..1', doc: '', nillable: v === null }, inList));
  };
  walk(value, '', false, 0);
  return out;
}

module.exports = { FORMATS, LABELS, parseSample, valueFields, xmlToValue };
