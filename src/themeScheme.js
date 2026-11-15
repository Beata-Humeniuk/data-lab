'use strict';

// Native form controls (select lists, checkboxes, scrollbars) and the
// system-colour fallbacks (Field, Canvas, CanvasText) follow `color-scheme`.
// A bare `light dark` resolves through prefers-color-scheme, which in a
// webview follows the operating system, not the editor theme, so a light
// editor on a dark OS got dark controls. VS Code marks the theme on <body>;
// the scheme is pinned from that class.
const THEME_SCHEME_CSS = `
  :root { color-scheme: light dark; }
  :root:has(> body.vscode-light), :root:has(> body.vscode-high-contrast-light) { color-scheme: light; }
  :root:has(> body.vscode-dark), :root:has(> body.vscode-high-contrast:not(.vscode-high-contrast-light)) { color-scheme: dark; }
`;

module.exports = { THEME_SCHEME_CSS };
