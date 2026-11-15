const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { forLanguage } = require('./nls');
const { THEME_SCHEME_CSS } = require('./themeScheme');

const mediaFile = (name) => fs.readFileSync(path.join(__dirname, '..', 'media', name), 'utf8');

const ICON = (d) => '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const UNDO_ICON = ICON('<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a4 4 0 0 1 0 8H7"/>');
const REDO_ICON = ICON('<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a4 4 0 0 0 0 8H9"/>');

function attrText(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function bodyHtml(t) {
  return [
    '<header>',
    '  <span class="t" id="title"></span>',
    '  <span id="dirty" title="' + attrText(t('dv.unsavedTitle')) + '"><i></i>' + attrText(t('dv.unsaved')) + '</span>',
    '  <span class="grow"></span>',
    '  <button type="button" class="tb" id="undoBtn" title="' + attrText(t('dv.undoTitle')) + '" aria-label="' + attrText(t('dv.undo')) + '" disabled>' + UNDO_ICON + '</button>',
    '  <button type="button" class="tb" id="redoBtn" title="' + attrText(t('dv.redoTitle')) + '" aria-label="' + attrText(t('dv.redo')) + '" disabled>' + REDO_ICON + '</button>',
    '  <button type="button" class="primary" id="saveBtn" title="' + attrText(t('dv.saveTitle')) + '" disabled>' + attrText(t('dv.save')) + '</button>',
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
