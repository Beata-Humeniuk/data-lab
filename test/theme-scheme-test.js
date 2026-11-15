const { runChecks } = require('./helpers');
const { buildLabHtml } = require('../src/labView');
const { THEME_SCHEME_CSS } = require('../src/themeScheme');

const FIXED_SURFACE = /var\(--vscode-((?:input|dropdown|editor|editorWidget|sideBar)-background|(?:panel|widget)-border|list-(?:hover|activeSelection)Background|(?:editor-|input-)?foreground), *#[0-9a-fA-F]{3,6}\)/g;
const html = buildLabHtml('pl-PL');
const bad = html.match(FIXED_SURFACE) || [];
runChecks([
  [bad.length === 0, 'lab: no fixed-colour fallback for a themed surface' + (bad.length ? ' — ' + bad.slice(0, 3).join(', ') : '')],
  [html.includes(THEME_SCHEME_CSS), 'lab: color-scheme pinned from the VS Code theme class']
]);
