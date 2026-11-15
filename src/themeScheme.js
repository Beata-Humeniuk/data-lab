'use strict';

const THEME_SCHEME_CSS = `
  :root { color-scheme: light dark; }
  :root:has(> body.vscode-light), :root:has(> body.vscode-high-contrast-light) { color-scheme: light; }
  :root:has(> body.vscode-dark), :root:has(> body.vscode-high-contrast:not(.vscode-high-contrast-light)) { color-scheme: dark; }
`;

module.exports = { THEME_SCHEME_CSS };
