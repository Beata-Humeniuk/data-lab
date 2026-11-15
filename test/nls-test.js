'use strict';

const fs = require('fs');
const path = require('path');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const { forLanguage, baseLanguage, EN, TRANSLATIONS } = require('../src/nls');

assert(Object.keys(TRANSLATIONS).length === 0, 'no translations, the extension speaks English only');

for (const key of Object.keys(EN)) {
  const value = EN[key];
  if (Array.isArray(value)) {
    assert(value.length === 2, key + ': plural forms are [one, many]');
    assert(value.every((v) => typeof v === 'string' && v !== ''), key + ': plural forms are non-empty');
  } else {
    assert(typeof value === 'string' && value !== '', key + ': base value is a non-empty string');
  }
}

assert(baseLanguage('pl-PL') === 'pl' && baseLanguage('en-US') === 'en' && baseLanguage('') === 'en', 'language tag reduces to its base');

const en = forLanguage('en-US');
const pl = forLanguage('pl-PL');
assert(en.lang === 'en' && pl.lang === 'en', 'every language resolves to English');
assert(pl.t('lab.deleteYes') === 'Delete', 'simple lookup');
assert(en.t('lab.title', { name: 'a' }) === 'DataLab: a', 'placeholder substitution');
assert(en.t('no.such.key') === 'no.such.key', 'unknown key returns the key');

const root = path.join(__dirname, '..');
const POLISH = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const userFacing = ['src/nls.js', 'src/labView.js', 'src/extension.js', 'src/labPick.js', 'src/dataPipeline.js', 'media/lab.js', 'media/lab.css', 'package.json', 'package.nls.json'];
for (const file of userFacing) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!POLISH.test(text), file + ' holds no Polish text');
}

const manifest = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const nlsEn = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
const used = new Set((manifest.match(/%[\w.]+%/g) || []).map((m) => m.slice(1, -1)));
assert(used.size > 0, 'manifest references nls keys');
for (const key of used) assert(typeof nlsEn[key] === 'string' && nlsEn[key] !== '', 'package.nls.json defines ' + key);
const nlsFiles = fs.readdirSync(root).filter((f) => /^package\.nls\..+\.json$/.test(f));
assert(nlsFiles.length === 0, 'no per-language manifest files, got: ' + nlsFiles.join(', '));

console.log('nls-test OK');
