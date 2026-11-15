function leafOf(p) { const i = p.lastIndexOf('.'); return i < 0 ? p : p.slice(i + 1); }
function prefixOf(p) { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(0, i + 1); }
function groupKeyOf(p) { const i = p.lastIndexOf('.'); return i < 0 ? '(root)' : p.slice(0, i); }

function norm(s) {
  return String(s).toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/[żź]/g, 'z')
    .replace(/[_\-\s]/g, '');
}

const FAMILY_TO_GROUP = {
  integer: 'num', decimal: 'num', boolean: 'bool', timestamp: 'ts',
  date: 'strdate', datetime: 'strdate', time: 'strdate',
  enum: 'enum', bytes: 'bytes', uuid: 'str', string: 'str', unknown: 'str'
};

function bareTypeName(t) {
  let s = String(t || '').trim();
  s = s.replace(/\?$/, '').replace(/^\?/, '');
  const list = s.match(/^(?:List|Set|Collection|ArrayList|Iterable)<(.+)>$/i);
  if (list) s = list[1];
  const arr = /\[\]$/.test(s);
  s = s.replace(/\[\]$/, '');
  s = s.replace(/^[A-Za-z_][\w.]*[:.](?=[A-Za-z_])/, (m) => (/^(xs|xsd|tns|ns\d*|java|javax|jakarta)[:.]/i.test(m) || m.indexOf('.') >= 0 ? '' : m));
  s = s.replace(/\(.*$/, '').replace(/\s+(with|without)\s+(local\s+)?time\s+zone$/i, ' tz').trim();
  return (s + (arr ? '[]' : '')).toLowerCase();
}

const DB_NAMES = /^(varchar2?|nvarchar2?|n?char|n?clob|text|tinytext|mediumtext|longtext|number|numeric|decimal|money|smallmoney|int|integer|bigint|smallint|tinyint|serial|bigserial|float|real|double precision|binary_float|binary_double|date|datetime2?|smalldatetime|timestamp|timestamp tz|time|boolean|bit|blob|raw|long raw|bytea|varbinary|binary|image|uniqueidentifier|uuid|json|jsonb|xml|xmltype|interval)$/;
const JAVA_NAMES = /^(string|integer|long|short|byte|double|float|bigdecimal|biginteger|boolean|character|char|localdate|localdatetime|localtime|instant|zoneddatetime|offsetdatetime|date|timestamp|uuid|byte\[\]|object|map|list|enum)$/;

function familyOf(bare, raw) {
  const s = bare;
  const original = String(raw || '').trim();
  if (/^enum(\[|$)/i.test(original) || s === 'enum') return 'enum';
  if (/^(number|numeric|decimal)\s*\(\s*\d+\s*(,\s*0\s*)?\)$/i.test(original)) return 'integer';
  if (/^java\.util\.Date$/.test(original) || /^(java\.sql\.)?Timestamp$/.test(original)) return 'datetime';
  if (/^(string|str):(date-time|datetime)$/.test(s) || /^(datetime|datetime2|smalldatetime|localdatetime|zoneddatetime|offsetdatetime|instant|timestamp tz)$/.test(s)) return 'datetime';
  if (s === 'timestamp' && /^timestamp$/i.test(original.replace(/\(.*$/, '').trim()) && /[A-Z]/.test(original)) return 'datetime';
  if (/^timestamp-(millis|micros|nanos)$/.test(s) || /^local-timestamp/.test(s) || /^(timestamp|epoch|epochmillis|epochseconds|unixtime|unix_timestamp)$/.test(s)) return 'timestamp';
  if (/^(string|str):date$/.test(s) || /^(date|localdate|gyearmonth|gyear|gmonthday)$/.test(s)) return 'date';
  if (/^(string|str):(time|partial-time)$/.test(s) || /^(time|localtime|time-millis|time-micros)$/.test(s)) return 'time';
  if (/^(boolean|bool|bit)$/.test(s)) return 'boolean';
  if (/^(string|str):(byte|binary|base64)$/.test(s) || /^(bytes|byte\[\]|base64binary|hexbinary|blob|raw|long raw|bytea|varbinary|binary|image|fixed|file)$/.test(s)) return 'bytes';
  if (/^(string|str):uuid$/.test(s) || /^(uuid|uniqueidentifier|guid)$/.test(s)) return 'uuid';
  if (/^(integer|int):/.test(s) || /^(int|integer|int32|int64|long|short|byte|biginteger|bigint|smallint|tinyint|serial|bigserial|positiveinteger|nonnegativeinteger|negativeinteger|nonpositiveinteger|unsignedint|unsignedlong|unsignedshort|unsignedbyte|counter)$/.test(s)) return 'integer';
  if (/^(number|num):/.test(s) || /^(number|numeric|decimal|float|double|real|double precision|bigdecimal|money|smallmoney|binary_float|binary_double)$/.test(s)) return 'decimal';
  if (/^(string|str)(:.*)?$/.test(s) || /^(varchar2?|nvarchar2?|n?char|n?clob|text|tinytext|mediumtext|longtext|character|anyuri|token|normalizedstring|nmtoken|nmtokens|id|idref|language|name|ncname|qname|notation|duration|json|jsonb|xml|xmltype|interval|gday|gmonth)$/.test(s)) return 'string';
  return 'unknown';
}

function systemOf(bare, raw) {
  const original = String(raw || '').trim();
  if (/^(string|integer|number|boolean|str|int|num|bool):/.test(bare)) return 'json';
  if (/^(xs|xsd):/i.test(original) || /^(datetime|base64binary|hexbinary|positiveinteger|nonnegativeinteger|negativeinteger|nonpositiveinteger|unsigned(int|long|short|byte)|anyuri|normalizedstring|nmtokens?|gyear(month)?|gmonth(day)?|gday|qname|ncname)$/.test(bare)) return 'xsd';
  if (/^(timestamp-(millis|micros|nanos)|local-timestamp-(millis|micros)|time-(millis|micros)|bytes|fixed|record)$/.test(bare) || /^enum\[/.test(original)) return 'avro';
  if (/^java(x)?\./i.test(original) || /^(java\.)?(String|Integer|Long|Short|Byte|Double|Float|BigDecimal|BigInteger|Boolean|Character|LocalDate|LocalDateTime|LocalTime|Instant|ZonedDateTime|OffsetDateTime|UUID)$/.test(original) || /^byte\[\]$/.test(original) || /^(List|Set|Collection)<.+>$/.test(original)) return 'java';
  if (DB_NAMES.test(bare) && (/[A-Z]/.test(original) || /\(/.test(original))) return 'db';
  if (/^(varchar2?|nvarchar2?|clob|nclob|blob|raw|bytea|varbinary|uniqueidentifier|number|numeric|bigint|smallint|tinyint|serial|bigserial|datetime2?|smalldatetime|money|jsonb|xmltype)$/.test(bare)) return 'db';
  if (JAVA_NAMES.test(bare) && /^[A-Z]/.test(original)) return 'java';
  return 'unknown';
}

function typeInfo(t) {
  const raw = String(t || '');
  const bare = bareTypeName(raw);
  const family = familyOf(bare, raw);
  return { family, group: FAMILY_TO_GROUP[family] || 'str', system: systemOf(bare, raw), bare, raw };
}

function typeGroup(t) { return typeInfo(t).group; }

function enumsDiffer(a, b) {
  const va = enumValues(a), vb = enumValues(b);
  if (!va.length || !vb.length) return false;
  if (va.length !== vb.length) return true;
  const set = {};
  va.forEach((v) => { set[v] = true; });
  return vb.some((v) => !set[v]);
}
function compatible(a, b) {
  const fa = typeInfo(a).family, fb = typeInfo(b).family;
  if (fa === 'enum' && typeGroup(b) === 'str' && fb !== 'enum') return true;
  if (fa === 'uuid' && fb === 'string') return true;
  if (typeGroup(a) !== typeGroup(b) || enumsDiffer(a, b)) return false;
  if (fa === 'unknown' || fb === 'unknown') return true;
  return fa === fb || (fa === 'integer' && fb === 'decimal');
}

const CONVERTIBLE = {
  integer: ['decimal', 'string', 'boolean', 'timestamp', 'enum'],
  decimal: ['integer', 'string'],
  boolean: ['integer', 'string', 'enum'],
  string: ['integer', 'decimal', 'boolean', 'date', 'datetime', 'time', 'timestamp', 'enum', 'bytes', 'uuid'],
  enum: ['string', 'enum', 'integer', 'boolean'],
  date: ['datetime', 'timestamp', 'string'],
  datetime: ['date', 'time', 'timestamp', 'string'],
  time: ['string', 'datetime'],
  timestamp: ['datetime', 'date', 'integer', 'string'],
  bytes: ['string'],
  uuid: ['string'],
  unknown: []
};

function checkTypes(from, to) {
  const a = typeInfo(from), b = typeInfo(to);
  let level;
  if (a.family === 'unknown' || b.family === 'unknown') level = 'unknown';
  else if (a.family === 'enum' && b.family === 'enum' && enumsDiffer(from, to)) level = 'convertible';
  else if (a.group === b.group && (a.family === b.family || (a.group === 'num' && a.family === 'integer' && b.family === 'decimal'))) level = 'same';
  else if (a.group === b.group) level = 'convertible';
  else if ((CONVERTIBLE[a.family] || []).indexOf(b.family) >= 0) level = 'convertible';
  else level = 'incompatible';
  const lossy = level !== 'same' && (
    (a.family === 'decimal' && b.family === 'integer') ||
    (a.family === 'datetime' && (b.family === 'date' || b.family === 'time')) ||
    (a.family === 'timestamp' && b.family === 'date'));
  return { level, ok: level === 'same', lossy, from: a, to: b, presets: conversionPresets(from, to) };
}

function conversionPresets(from, to) {
  const a = typeInfo(from).family, b = typeInfo(to).family;
  const out = [];
  const add = (id, template, params, table) => out.push({ id, labelKey: 'conv.' + id, template, params: params || [], table: !!table });
  if (a === b) {
    if (a === 'decimal') add('round', 'round({x}, {scale})', [{ name: 'scale', labelKey: 'conv.param.scale', default: '2' }]);
    if (a === 'enum') add('valueMap', 'valueMap({x})', [], true);
    if (a === 'date' || a === 'datetime' || a === 'time') add('reformat', "formatDate({x}, '{pattern}')", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: a === 'date' ? 'yyyy-MM-dd' : (a === 'time' ? 'HH:mm:ss' : "yyyy-MM-dd'T'HH:mm:ss") }]);
    return out;
  }
  if (b === 'string') {
    if (a === 'date' || a === 'datetime' || a === 'time') add('formatDate', "formatDate({x}, '{pattern}')", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: a === 'date' ? 'yyyy-MM-dd' : (a === 'time' ? 'HH:mm:ss' : "yyyy-MM-dd'T'HH:mm:ss") }]);
    else if (a === 'timestamp') add('formatEpoch', "formatDate(fromEpochMillis({x}), '{pattern}')", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: "yyyy-MM-dd'T'HH:mm:ss" }]);
    else if (a === 'bytes') add('base64Encode', 'base64Encode({x})');
    else if (a === 'boolean') add('boolToText', "{x} ? '{yes}' : '{no}'", [{ name: 'yes', labelKey: 'conv.param.yes', default: 'Y' }, { name: 'no', labelKey: 'conv.param.no', default: 'N' }]);
    else if (a === 'enum') add('valueMap', 'valueMap({x})', [], true);
    add('toString', 'toString({x})');
  } else if (b === 'integer') {
    if (a === 'string') add('parseInteger', 'toInteger(trim({x}))');
    if (a === 'decimal') { add('roundToInteger', 'round({x}, 0)'); add('truncate', 'truncate({x})'); }
    if (a === 'boolean') add('boolToInt', '{x} ? 1 : 0');
    if (a === 'timestamp') add('epochSeconds', 'epochMillis({x}) / 1000');
    if (a === 'enum') add('valueMap', 'valueMap({x})', [], true);
  } else if (b === 'decimal') {
    if (a === 'string') add('parseDecimal', 'toDecimal(trim({x}), {scale})', [{ name: 'scale', labelKey: 'conv.param.scale', default: '2' }]);
    if (a === 'integer') add('toDecimal', 'toDecimal({x})');
  } else if (b === 'boolean') {
    if (a === 'string' || a === 'enum') add('textToBool', "equalsIgnoreCase({x}, '{yes}')", [{ name: 'yes', labelKey: 'conv.param.yes', default: 'Y' }]);
    if (a === 'integer') add('intToBool', '{x} != 0');
  } else if (b === 'date') {
    if (a === 'string') add('parseDate', "parseDate({x}, '{pattern}')", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: 'yyyy-MM-dd' }]);
    if (a === 'datetime') add('toDate', 'toLocalDate({x})');
    if (a === 'timestamp') add('epochToDate', 'toLocalDate(fromEpochMillis({x}))');
  } else if (b === 'datetime') {
    if (a === 'string') add('parseDateTime', "parseDateTime({x}, '{pattern}')", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: "yyyy-MM-dd'T'HH:mm:ss" }]);
    if (a === 'date') add('atStartOfDay', 'atStartOfDay({x})');
    if (a === 'time') add('atToday', 'today().at({x})');
    if (a === 'timestamp') add('fromEpoch', 'fromEpochMillis({x})');
  } else if (b === 'time') {
    if (a === 'string') add('parseTime', "parseTime({x}, '{pattern}')", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: 'HH:mm:ss' }]);
    if (a === 'datetime') add('toTime', 'toLocalTime({x})');
  } else if (b === 'timestamp') {
    if (a === 'date') add('dateToEpoch', 'epochMillis(atStartOfDay({x}))');
    if (a === 'datetime') add('toEpoch', 'epochMillis({x})');
    if (a === 'integer') add('secondsToMillis', '{x} * 1000');
    if (a === 'string') add('parseToEpoch', "epochMillis(parseDateTime({x}, '{pattern}'))", [{ name: 'pattern', labelKey: 'conv.param.pattern', default: "yyyy-MM-dd'T'HH:mm:ss" }]);
  } else if (b === 'enum') {
    add('valueMap', 'valueMap({x})', [], true);
    if (a === 'string') add('enumOf', 'enumOf(trim({x}))');
  } else if (b === 'bytes') {
    if (a === 'string') { add('base64Decode', 'base64Decode({x})'); add('utf8Bytes', 'utf8Bytes({x})'); }
  } else if (b === 'uuid') {
    if (a === 'string') add('parseUuid', 'parseUuid({x})');
  }
  return out;
}

function renderPreset(preset, sourceLeaf, params, rows) {
  let text = preset.template.replace(/\{x\}/g, sourceLeaf || 'x');
  (preset.params || []).forEach((p) => {
    const v = params && params[p.name] !== undefined && params[p.name] !== '' ? params[p.name] : p.default;
    text = text.replace(new RegExp('\\{' + p.name + '\\}', 'g'), v);
  });
  if (preset.table) {
    const pairs = (rows || []).filter((r) => String(r.from || '').trim() !== '' || String(r.to || '').trim() !== '')
      .map((r) => String(r.from || '').trim() + '→' + String(r.to || '').trim());
    text += ' { ' + pairs.join(', ') + ' }';
  }
  return text;
}

function enumValues(t) {
  const m = String(t || '').match(/^enum\[(.*)\]$/i);
  return m ? m[1].split(',').map((v) => v.trim()).filter(Boolean) : [];
}

function entriesToMappings(entries, sources) {
  const out = {};
  (entries || []).forEach((e) => {
    const to = String(e && e.to || '').trim();
    const from = String(e && e.from || '').trim();
    if (!to || !from) return;
    let owner = null;
    for (const s of sources || []) {
      if (s.fields.some((f) => f.path === from)) { owner = s; break; }
    }
    out[to] = { sourceId: owner ? owner.id : '', path: from, transform: String(e.transform || ''), whenNull: String(e.whenNull || '') };
    if (String(e.note || '').trim()) out[to].note = String(e.note);
    if (e.how && typeof e.how === 'object') out[to].how = e.how;
    if (e.when && typeof e.when === 'object') out[to].when = e.when;
  });
  return out;
}

function mergeCanvasEntries(existing, canvasEntries) {
  const rows = (canvasEntries || []).filter((e) => e && String(e.to || '').trim());
  const mapped = {};
  rows.forEach((e) => { mapped[String(e.to).trim()] = true; });
  const kept = (existing || []).filter((e) => e && !mapped[String(e.to || '').trim()]
    && (typeof e.value === 'string' || (!String(e.from || '').trim() && (String(e.transform || '').trim() || String(e.note || '').trim() || e.when))));
  return rows.concat(kept);
}

function mappingsToEntries(mappings, order) {
  const keys = Object.keys(mappings || {});
  const rank = {};
  (order || []).forEach((p, i) => { rank[p] = i; });
  keys.sort((a, b) => (rank[a] === undefined ? 1e9 : rank[a]) - (rank[b] === undefined ? 1e9 : rank[b]) || a.localeCompare(b));
  return keys.map((to) => {
    const m = mappings[to] || {};
    const e = { from: String(m.path || ''), to, transform: String(m.transform || ''), whenNull: String(m.whenNull || '') };
    if (String(m.note || '').trim()) e.note = String(m.note);
    if (m.how && typeof m.how === 'object') e.how = m.how;
    if (m.when && typeof m.when === 'object') e.when = m.when;
    return e;
  }).filter((e) => e.from);
}

function cardWords(f) {
  const parts = [f.min > 0 ? 'wymagane' : 'opcjonalne'];
  if (f.max === '*') parts.push('lista');
  if (f.nillable) parts.push('może być null');
  return parts.join(' · ');
}

function findSourceField(sources, m) {
  if (!m) return null;
  let s = null;
  for (let i = 0; i < sources.length; i++) if (sources[i].id === m.sourceId) s = sources[i];
  if (!s) return { missing: true, path: m.path, type: '?', card: '?', min: 0, max: '1', source: null };
  let f = null;
  for (let i = 0; i < s.fields.length; i++) if (s.fields[i].path === m.path) f = s.fields[i];
  if (!f) return { missing: true, path: m.path, type: '?', card: '?', min: 0, max: '1', source: s };
  const out = {};
  for (const k in f) out[k] = f[k];
  out.source = s;
  return out;
}

function listToOne(sf, tf) {
  return !!sf && !!tf && sf.max === '*' && tf.max !== '*';
}

function fieldVerdict(sf, tf, m) {
  const plain = (t) => String(t || '').replace(/\[\]$/, '').trim();
  const nameOf = (f) => String((f && f.typeName) || '').trim();
  const sameNamed = (nameOf(tf) && (plain(sf.type) === nameOf(tf) || nameOf(sf) === nameOf(tf))) || (nameOf(sf) && plain(tf.type) === nameOf(sf));
  const typeBad = !sameNamed && !compatible(sf.type, tf.type);
  const needNull = (sf.min === 0 || !!sf.nillable) && tf.min > 0;
  const entry = m || {};
  return {
    typeBad: typeBad, needTransform: typeBad, needNull: needNull,
    listToOne: listToOne(sf, tf),
    noTransform: typeBad && !String(entry.transform || '').trim(),
    noNullRule: needNull && !String(entry.whenNull || '').trim()
  };
}

function evaluateField(t, m, sources) {
  const sf = findSourceField(sources, m);
  if (!sf) return { key: t.min > 0 ? 'missing' : 'unmapped' };
  if (sf.missing) return { key: 'error', sf: sf, m: m };
  const v = fieldVerdict(sf, t, m);
  return {
    key: v.noTransform || v.noNullRule ? 'todo' : 'ok', sf: sf, m: m,
    needTransform: v.needTransform, needNull: v.needNull,
    typeBad: v.typeBad, listToOne: v.listToOne
  };
}

function reasonText(ev) {
  if (ev.key === 'missing') return 'wymagane pole bez mapowania';
  if (ev.key === 'error') return 'źródło usunięte — mapowanie nieaktualne';
  if (ev.key === 'todo') {
    const parts = [];
    if (ev.needTransform && !((ev.m.transform || '').trim())) parts.push('konwersja wartości');
    if (ev.needNull && !((ev.m.whenNull || '').trim())) parts.push('obsługa NULL');
    return 'brakuje: ' + parts.join(' + ');
  }
  return '';
}

function segments(text, tokens) {
  if (!tokens.length) return [{ text: text, hit: false, miss: true }];
  const low = text.toLowerCase(), ranges = [];
  tokens.forEach(function (tk) {
    let i = low.indexOf(tk);
    while (i >= 0) { ranges.push([i, i + tk.length]); i = low.indexOf(tk, i + tk.length); }
  });
  if (!ranges.length) return [{ text: text, hit: false, miss: true }];
  ranges.sort(function (x, y) { return x[0] - y[0]; });
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) last[1] = Math.max(last[1], ranges[i][1]);
    else merged.push(ranges[i]);
  }
  const out = [];
  let pos = 0;
  merged.forEach(function (rg) {
    if (rg[0] > pos) out.push({ text: text.slice(pos, rg[0]), hit: false, miss: true });
    out.push({ text: text.slice(rg[0], rg[1]), hit: true, miss: false });
    pos = rg[1];
  });
  if (pos < text.length) out.push({ text: text.slice(pos), hit: false, miss: true });
  return out;
}

function searchFields(sources, query, limit, target) {
  const tokens = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  sources.forEach(function (s) {
    s.fields.forEach(function (f) {
      const hay = (f.path + ' ' + f.type + ' ' + s.name + ' ' + s.kind + ' ' + (f.doc || '') + (f.parentDocs || []).map((p) => ' ' + p.doc).join('')).toLowerCase();
      if (tokens.some(function (tk) { return hay.indexOf(tk) < 0; })) return;
      const lowPath = f.path.toLowerCase(), lowLeaf = leafOf(f.path).toLowerCase();
      let score = 0;
      tokens.forEach(function (tk) {
        if (lowLeaf.indexOf(tk) === 0) score -= 40;
        else if (lowLeaf.indexOf(tk) >= 0) score -= 20;
        else if (lowPath.indexOf(tk) >= 0) score -= 8;
        score += Math.min(lowPath.length, 60) / 60;
      });
      if (target) {
        if (compatible(target.type, f.type)) score -= 6;
        const a = norm(leafOf(f.path)), b = norm(leafOf(target.path));
        if (a === b) score -= 60;
        else if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) score -= 24;
        else if (a.slice(0, 4) === b.slice(0, 4)) score -= 12;
      }
      const item = {};
      for (const k in f) item[k] = f[k];
      item.sourceId = s.id;
      item.sourceName = s.name;
      item.kind = s.kind;
      item.color = s.color;
      item.score = score;
      out.push(item);
    });
  });
  out.sort(function (a, b) {
    return a.score - b.score || a.path.length - b.path.length || a.path.localeCompare(b.path);
  });
  const top = out.slice(0, limit);
  top.forEach(function (f) { f.segs = segments(f.path, tokens); });
  return top;
}

function autoMapCandidates(targetFields, sources, mappings) {
  const found = {};
  targetFields.forEach(function (t) {
    if (mappings[t.path]) return;
    const leaf = norm(leafOf(t.path));
    const hits = [];
    sources.forEach(function (s) {
      s.fields.forEach(function (f) {
        if (norm(leafOf(f.path)) === leaf) hits.push({ sourceId: s.id, path: f.path });
      });
    });
    if (hits.length === 1) found[t.path] = hits[0];
  });
  return found;
}

function typeConstantsSource() {
  return [
    'const FAMILY_TO_GROUP = ' + JSON.stringify(FAMILY_TO_GROUP) + ';',
    'const DB_NAMES = ' + DB_NAMES.toString() + ';',
    'const JAVA_NAMES = ' + JAVA_NAMES.toString() + ';',
    'const CONVERTIBLE = ' + JSON.stringify(CONVERTIBLE) + ';'
  ].join('\n');
}

const TYPE_ENGINE_INJECTABLE = {
  typeGroup, bareTypeName, familyOf, systemOf, typeInfo, enumsDiffer, enumValues,
  compatible, listToOne, fieldVerdict
};

module.exports = {
  leafOf, prefixOf, groupKeyOf, norm, typeGroup, compatible, cardWords,
  bareTypeName, familyOf, systemOf, typeInfo, enumsDiffer, checkTypes, conversionPresets, renderPreset, enumValues,
  FAMILY_TO_GROUP, DB_NAMES, JAVA_NAMES, CONVERTIBLE,
  entriesToMappings, mappingsToEntries, mergeCanvasEntries,
  findSourceField, listToOne, fieldVerdict, evaluateField, reasonText,
  segments, searchFields, autoMapCandidates,
  typeConstantsSource, TYPE_ENGINE_INJECTABLE
};
