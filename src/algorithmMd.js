'use strict';

// A transformation's steps described in Markdown: what it reads, each step in
// a line, and the fields it gives. Pure: no vscode, no disk.

const OPS = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

function code(v) {
  const t = String(v === undefined || v === null ? '' : v);
  return '`' + t.replace(/`/g, "'") + '`';
}
function cell(v) {
  return String(v === undefined || v === null ? '' : v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
function list(items) {
  return items.map(code).join(', ');
}
function keysText(keys) {
  return (keys || []).filter((k) => String(k.a || '').trim() && String(k.b || '').trim())
    .map((k) => code(k.a) + ' = ' + code(k.b)).join(' and ');
}
function valueText(c, which) {
  const v = c[which];
  return code(v === undefined ? '' : v);
}
function fieldsOf(x) {
  const many = Array.isArray(x.fields) ? x.fields.map((f) => String(f || '').trim()).filter(Boolean) : [];
  if (many.length) return many;
  return String(x.field || '').trim() ? [String(x.field).trim()] : [];
}
function conditionText(c) {
  const fs = fieldsOf(c);
  const f = fs.length > 1 ? (c.match === 'all' ? 'each of ' : 'any of ') + list(fs) : code(fs[0] || c.field);
  const op = c.op || 'eq';
  if (OPS[op]) return f + ' ' + OPS[op] + ' ' + valueText(c, 'value');
  switch (op) {
    case 'between': return f + ' between ' + valueText(c, 'value') + ' and ' + valueText(c, 'value2');
    case 'isSet': return f + ' is filled';
    case 'notSet': return f + ' is empty';
    case 'in': return f + ' is one of ' + valueText(c, 'value');
    case 'notIn': return f + ' is none of ' + valueText(c, 'value');
    case 'matches': return f + ' matches the pattern ' + valueText(c, 'value');
    case 'lenMin': return 'length of ' + f + ' ≥ ' + valueText(c, 'value');
    case 'lenMax': return 'length of ' + f + ' ≤ ' + valueText(c, 'value');
  }
  return f + ' ' + op + ' ' + valueText(c, 'value');
}
function howText(how, catalog) {
  const chain = [how].concat(Array.isArray(how && how.then) ? how.then : []).filter((h) => h && h.kind);
  return chain.map((h) => {
    const spec = (catalog || []).find((c) => c.kind === h.kind);
    const label = spec ? spec.label : h.kind;
    const params = (spec ? spec.params : Object.keys(h).filter((k) => k !== 'kind' && k !== 'then').map((k) => ({ key: k, label: k })))
      .filter((p) => h[p.key] !== undefined && String(h[p.key]) !== '')
      .map((p) => {
        const opt = (p.options || []).find((o) => o[0] === h[p.key]);
        return p.label + ' ' + code(opt ? opt[1] : h[p.key]);
      });
    return label + (params.length ? ' (' + params.join(', ') + ')' : '');
  }).join(' → ');
}
function addedOne(s, catalog) {
  const name = code(s.name);
  switch (s.from) {
    case 'column': return name + ' = ' + code(s.column);
    case 'input': return name + ' = ' + code(s.path);
    case 'calc': return name + ' = ' + code(s.column || 'element') + (s.how && s.how.kind ? ' → ' + howText(s.how, catalog) : '');
    case 'parts': return name + ' = ' + (s.parts || []).map((p) => (p.kind === 'field' ? code(p.value) : '"' + String(p.value || '') + '"')).join(' + ');
    case 'expr': return name + ' = ' + code(s.expr);
  }
  return name + ' = "' + String(s.value === undefined ? '' : s.value) + '"';
}
function addedText(s, catalog) {
  const items = [s].concat(Array.isArray(s.more) ? s.more : []).filter((x) => x && String(x.name || '').trim());
  if (items.length <= 1) return 'Add field ' + addedOne(s, catalog);
  return 'Add fields ' + items.map((x) => addedOne(x, catalog)).join('; ');
}
function sortText(s) {
  const keys = Array.isArray(s.keys) && s.keys.length ? s.keys : [{ field: s.field, desc: s.desc }];
  return 'Sort by ' + keys.map((k) => (k.field ? code(k.field) : 'the whole element') + (k.desc ? ', descending' : ', ascending')).join('; then by ');
}

function stepText(s, catalog) {
  switch (s.kind) {
    case 'filter': {
      const conds = (s.conditions || []).filter((c) => fieldsOf(c).length);
      return conds.length ? 'Keep the elements where ' + conds.map(conditionText).join(s.join === 'or' ? ' or ' : ' and ') : 'Filter (no condition)';
    }
    case 'sort': return sortText(s);
    case 'distinct': { const fs = fieldsOf(s); return 'Remove duplicates' + (fs.length ? ' by ' + list(fs) : ''); }
    case 'reverse': return 'Reverse the order';
    case 'skip': return 'Skip the first ' + String(s.n || '0');
    case 'limit': return 'Take the first ' + String(s.n || '0');
    case 'merge': {
      const k = keysText(s.keys);
      const fields = (s.fields || []).filter(Boolean);
      return 'Merge with ' + code(s.other) + (k ? ' where ' + k : '') + (s.keep === 'all' ? '; all elements kept' : '; only the matched elements') +
        '; fields taken: ' + (fields.length ? list(fields) : 'all');
    }
    case 'compare': {
      const k = keysText(s.keys);
      if (s.mode === 'notIn') return 'Keep the elements with no match in ' + code(s.other) + (k ? ' where ' + k : '');
      if (s.mode === 'join') return 'Attach the match from ' + code(s.other) + ' as ' + code(s.as || String(s.other || '').split('.').pop()) + (k ? ' where ' + k : '');
      return 'Keep the elements with a match in ' + code(s.other) + (k ? ' where ' + k : '');
    }
    case 'append': return 'Append the elements of ' + code(s.other);
    case 'columns': {
      const cols = (s.columns || []).filter((c) => String(c.from || '').trim());
      return 'Output fields:\n\n   | Output field | From |\n   |---|---|\n' +
        cols.map((c) => '   | ' + cell(String(c.as || '').trim() || c.from.split('.').pop()) + ' | ' + cell(c.from) + ' |').join('\n');
    }
    case 'drop': return 'Remove the fields ' + list((s.fields || []).filter(Boolean));
    case 'flatten': return (s.field ? 'Flatten ' + code(s.field) : 'Flatten all nested objects') +
      (s.names === 'own' ? ', fields under their own names' : ', field names prefixed with the parent') + (s.keepEmpty === false ? ', elements without items left out' : '');
    case 'change': {
      const fs = fieldsOf(s);
      if (fs.length > 1) return 'Change ' + list(fs) + ': ' + (s.how && s.how.kind ? howText(s.how, catalog) : 'no change');
      if (!(s.how && s.how.kind) && String(s.as || '').trim()) return 'Rename ' + code(s.field) + ' to ' + code(s.as);
      return 'Change ' + (s.field ? code(s.field) : 'the value') + ': ' + (s.how && s.how.kind ? howText(s.how, catalog) : 'no change') +
      (String(s.as || '').trim() ? ', saved as ' + code(s.as) : '');
    }
    case 'add': return addedText(s, catalog);
    case 'take': return 'Take the field ' + code(s.field);
    case 'asList': return 'Wrap in a list';
    case 'first': return 'Take the first element';
    case 'last': return 'Take the last element';
    case 'nth': return 'Take the element at index ' + String(s.index !== undefined ? s.index : Math.max(0, (parseInt(s.n, 10) || 1) - 1)) + ' (counted from 0)';
    case 'count': return 'Count the elements';
    case 'sum': return 'Sum of ' + code(s.field);
    case 'min': return 'Minimum of ' + code(s.field);
    case 'max': return 'Maximum of ' + code(s.field);
    case 'avg': return 'Average of ' + code(s.field);
    case 'join': return 'Join into text, separator "' + String(s.sep === undefined ? ', ' : s.sep) + '"';
  }
  return s.kind;
}

function readsOf(pipeline) {
  const out = [];
  const add = (p) => { const t = String(p || '').trim(); if (t && out.indexOf(t) < 0) out.push(t); };
  for (const s of pipeline.steps || []) {
    if (s.kind === 'merge' || s.kind === 'compare' || s.kind === 'append') add(s.other);
    if (s.kind === 'add') [s].concat(Array.isArray(s.more) ? s.more : []).forEach((x) => { if (x && x.from === 'input') add(x.path); });
  }
  return out;
}
function kindText(v) {
  if (!v) return '';
  if (v.kind === 'list') return 'a list';
  if (v.kind === 'object') return 'an object';
  return 'a value';
}

// { title, pipeline, run (that pipeline in runDocument's result), catalog }
function algorithmMd(opts) {
  const p = opts.pipeline || {};
  const run = opts.run || null;
  const lines = ['# ' + String(opts.title || '').trim(), ''];
  lines.push('## Input', '');
  lines.push('- ' + (p.source ? code(p.source) : 'not chosen') + (run && run.sourceView ? ': ' + kindText(run.sourceView) : ''));
  for (const r of readsOf(p)) lines.push('- ' + code(r));
  lines.push('', '## Steps', '');
  const steps = p.steps || [];
  if (!steps.length) lines.push('No steps.');
  steps.forEach((s, i) => lines.push((i + 1) + '. ' + stepText(s, opts.catalog)));
  if (p.comment && String(p.comment.field || '').trim()) lines.push('', 'Before each element of the result, a comment: the value of ' + code(p.comment.field) + (p.comment.keep === false ? ', the field left out of the data.' : '.'));
  if (run && run.result !== undefined && run.result !== null) {
    const v = run.result;
    lines.push('', '## Output', '');
    const cols = run.endColumns || [];
    if (Array.isArray(v) || (v && typeof v === 'object')) {
      lines.push(Array.isArray(v) ? 'A list; fields of each element:' : 'An object; fields:', '');
      if (cols.length) lines.push('| Field |', '|---|', ...cols.filter(Boolean).map((c) => '| ' + cell(c) + ' |'));
    } else lines.push('A value.');
  }
  return lines.join('\n') + '\n';
}

module.exports = { algorithmMd, stepText, conditionText };
