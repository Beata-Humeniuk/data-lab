const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { forLanguage } = require('./nls');
const { THEME_SCHEME_CSS } = require('./themeScheme');

const mediaFile = (name) => fs.readFileSync(path.join(__dirname, '..', 'media', name), 'utf8');

function attrText(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function bodyHtml(t) {
  return [
    '<header>',
    '  <span class="t" id="title"></span>',
    '  <span class="grow"></span>',
    '  <button type="button" class="link" id="asFlow" title="' + attrText(t('dv.asFlowTitle')) + '">' + attrText(t('dv.asFlow')) + '</button>',
    '</header>',
    '<div id="main">',
    '  <section id="inputs" aria-label="' + attrText(t('dv.inputs')) + '"></section>',
    '  <section id="work" aria-label="' + attrText(t('dv.transforms')) + '"></section>',
    '</div>'
  ].join('\n');
}

function buildLabHtml(languageTag) {
  const catalog = forLanguage(languageTag);
  const nonce = crypto.randomBytes(16).toString('base64');
  return [
    '<!DOCTYPE html><html lang="' + catalog.lang + '"><head><meta charset="utf-8">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; connect-src \'none\'; style-src \'nonce-' + nonce + '\'; script-src \'nonce-' + nonce + '\'">',
    '<style nonce="' + nonce + '">', THEME_SCHEME_CSS, mediaFile('lab.css'), '</style></head><body>',
    bodyHtml(catalog.t),
    '<script nonce="' + nonce + '">',
    'const NLS = ' + JSON.stringify(catalog.stringsTable()).replace(/</g, '\\u003c') + ';',
    mediaFile('lab.js'),
    '</script>',
    '</body></html>'
  ].join('\n');
}

module.exports = { buildLabHtml };
