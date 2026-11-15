// The ways a value is transformed, picked from the "+ ƒ" list of a mapping
// row and executed by the run (flowRun.js) — owner, 2026-11-15: „brakuje
// mi tu opcji przekształceń wszelkiego rodzaju". The kinds the designer had
// before (asText … newId) keep their own forms; the ones here are described
// by their parameters, so the designer draws their form, the md words them
// (how.t.<kind> with the parameters) and the run executes them by kind.
//
// Parameter types: text, number, select (options: [value, labelKey]),
// field (a field of the flow, as a mapping's source), elemField (a field of
// the list's element, relative to it).

const UNITS = [['days', 'how.o.days'], ['weeks', 'how.o.weeks'], ['months', 'how.o.months'], ['years', 'how.o.years'], ['hours', 'how.o.hours'], ['minutes', 'how.o.minutes']];

const HOW_EXTRA = [
  // text
  { kind: 'replace', group: 'how.g.text', params: [{ key: 'find', type: 'text' }, { key: 'with', type: 'text' }] },
  { kind: 'replaceRegex', group: 'how.g.text', params: [{ key: 'pattern', type: 'text', size: 12 }, { key: 'with', type: 'text' }] },
  { kind: 'extract', group: 'how.g.text', params: [{ key: 'pattern', type: 'text', size: 12 }] },
  { kind: 'substring', group: 'how.g.text', params: [{ key: 'from', type: 'number', def: '1' }, { key: 'length', type: 'number' }] },
  { kind: 'padLeft', group: 'how.g.text', params: [{ key: 'length', type: 'number', def: '10' }, { key: 'char', type: 'text', def: '0', size: 2 }] },
  { kind: 'padRight', group: 'how.g.text', params: [{ key: 'length', type: 'number', def: '10' }, { key: 'char', type: 'text', def: ' ', size: 2 }] },
  { kind: 'prefix', group: 'how.g.text', params: [{ key: 'text', type: 'text' }] },
  { kind: 'suffix', group: 'how.g.text', params: [{ key: 'text', type: 'text' }] },
  { kind: 'capitalize', group: 'how.g.text', params: [] },
  { kind: 'removeDiacritics', group: 'how.g.text', params: [] },
  { kind: 'normalizeSpaces', group: 'how.g.text', params: [] },
  { kind: 'mask', group: 'how.g.text', params: [{ key: 'keep', type: 'number', def: '4' }, { key: 'char', type: 'text', def: '*', size: 2 }] },
  { kind: 'split', group: 'how.g.text', params: [{ key: 'sep', type: 'text', def: ',', size: 3 }] },
  { kind: 'length', group: 'how.g.text', params: [] },
  // numbers
  { kind: 'calc', group: 'how.g.number', params: [{ key: 'op', type: 'select', options: [['+', 'how.o.plus'], ['-', 'how.o.minus'], ['*', 'how.o.times'], ['/', 'how.o.div'], ['%', 'how.o.mod']], def: '+' }, { key: 'value', type: 'field' }] },
  { kind: 'percent', group: 'how.g.number', params: [{ key: 'value', type: 'number', def: '23' }] },
  { kind: 'abs', group: 'how.g.number', params: [] },
  { kind: 'floor', group: 'how.g.number', params: [] },
  { kind: 'ceil', group: 'how.g.number', params: [] },
  { kind: 'truncate', group: 'how.g.number', params: [] },
  { kind: 'atLeast', group: 'how.g.number', params: [{ key: 'value', type: 'field' }] },
  { kind: 'atMost', group: 'how.g.number', params: [{ key: 'value', type: 'field' }] },
  { kind: 'formatNumber', group: 'how.g.number', params: [{ key: 'decimals', type: 'number', def: '2' },
    { key: 'decSep', type: 'select', options: [[',', 'how.o.comma'], ['.', 'how.o.dot']], def: ',' },
    { key: 'groupSep', type: 'select', options: [['', 'how.o.none'], [' ', 'how.o.space'], ['.', 'how.o.dot'], [',', 'how.o.comma']], def: '' }] },
  // dates
  { kind: 'addTime', group: 'how.g.date', params: [{ key: 'amount', type: 'number', def: '30' }, { key: 'unit', type: 'select', options: UNITS, def: 'days' }] },
  { kind: 'dateDiff', group: 'how.g.date', params: [{ key: 'other', type: 'field' }, { key: 'unit', type: 'select', options: [['days', 'how.o.days'], ['months', 'how.o.months'], ['years', 'how.o.years']], def: 'days' }] },
  { kind: 'age', group: 'how.g.date', params: [] },
  { kind: 'startOfMonth', group: 'how.g.date', params: [] },
  { kind: 'endOfMonth', group: 'how.g.date', params: [] },
  { kind: 'dayOfWeek', group: 'how.g.date', params: [] },
  { kind: 'datePart', group: 'how.g.date', params: [{ key: 'part', type: 'select', options: [['year', 'how.o.year'], ['month', 'how.o.month'], ['day', 'how.o.day'], ['hour', 'how.o.hour'], ['minute', 'how.o.minute']], def: 'year' }] },
  { kind: 'formatDateAs', group: 'how.g.date', params: [{ key: 'pattern', type: 'text', def: 'dd.MM.yyyy', size: 14, labelKey: 'how.p.datePattern' }] },
  { kind: 'parseDateAs', group: 'how.g.date', params: [{ key: 'pattern', type: 'text', def: 'dd.MM.yyyy', size: 14, labelKey: 'how.p.datePattern' }] },
  // logic
  { kind: 'ifEmpty', group: 'how.g.logic', params: [{ key: 'value', type: 'field' }] },
  { kind: 'isEmpty', group: 'how.g.logic', params: [] },
  { kind: 'equalsTo', group: 'how.g.logic', params: [{ key: 'value', type: 'field' }] },
  { kind: 'inValues', group: 'how.g.logic', params: [{ key: 'values', type: 'text', size: 16 }] },
  { kind: 'negate', group: 'how.g.logic', params: [] },
  { kind: 'constant', group: 'how.g.logic', params: [{ key: 'value', type: 'text', size: 12 }] },
  // encoding
  { kind: 'base64Encode', group: 'how.g.code', params: [] },
  { kind: 'base64Decode', group: 'how.g.code', params: [] },
  { kind: 'urlEncode', group: 'how.g.code', params: [] },
  { kind: 'urlDecode', group: 'how.g.code', params: [] },
  { kind: 'sha256', group: 'how.g.code', params: [] },
  { kind: 'md5', group: 'how.g.code', params: [] },
  // lists
  { kind: 'listSum', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }] },
  { kind: 'listMin', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }] },
  { kind: 'listMax', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }] },
  { kind: 'listAvg', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }] },
  { kind: 'listSort', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }, { key: 'order', type: 'select', options: [['asc', 'how.o.asc'], ['desc', 'how.o.desc']], def: 'asc' }] },
  { kind: 'listDistinct', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }] },
  { kind: 'listLast', group: 'how.g.list', params: [{ key: 'field', type: 'elemField' }] },
  { kind: 'listAt', group: 'how.g.list', params: [{ key: 'position', type: 'number', def: '1' }, { key: 'field', type: 'elemField' }] },
  { kind: 'listReverse', group: 'how.g.list', params: [] }
];

// The kinds that work on a list as a whole (the rest work on each value).
const HOW_LIST_KINDS = ['listField', 'listFilter', 'listHead', 'listFirst', 'listPrefer', 'listHas', 'listCount', 'listJoin',
  'listSum', 'listMin', 'listMax', 'listAvg', 'listSort', 'listDistinct', 'listLast', 'listAt', 'listReverse'];

module.exports = { HOW_EXTRA, HOW_LIST_KINDS };
