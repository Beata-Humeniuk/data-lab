const { parseXml, localName } = require('./miniXml');

const FORMATS = ['json', 'xml', 'yaml', 'csv', 'kv'];
const LABELS = { json: 'JSON', xml: 'XML', yaml: 'YAML', csv: 'CSV', kv: 'key=value' };

function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) && !v.__t; }

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

function readKv(body) {
  const text = body.trim();
  const out = {};
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
  const unescape = (x) => x.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  for (const l of lines) {
    let i = -1;
    for (let k = 0; k < l.length; k++) { if (l[k] === '\\') { k++; continue; } if (l[k] === '=') { i = k; break; } }
    if (i < 0) continue;
    setDotted(out, unescape(l.slice(0, i).trim()), unescape(l.slice(i + 1).replace(/^\s+/, '')));
  }
  return { ok: true, format: 'kv', value: out };
}

function readYaml(body) {
  let v;
  try { const yaml = require('js-yaml'); v = yaml.load(body, { schema: yaml.CORE_SCHEMA }); } catch (e) { return { ok: false, error: 'yaml', detail: String(e && e.message || e) }; }
  if (v === null || typeof v !== 'object') return { ok: false, error: 'yaml' };
  return { ok: true, format: 'yaml', value: v };
}

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

function valueFields(value) {
  const out = [];
  const seen = new Set();
  const typeOf = (v) => (v === null ? 'string' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v === 'boolean' ? 'boolean' : 'string');
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
