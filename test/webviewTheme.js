'use strict';

// A webview page as VS Code shows it: the theme class on <body> and the
// theme colours as --vscode-* variables. Screenshots of the designer are
// taken through this, in the dark theme by default (the one the owner
// uses); a page opened bare in a browser has no --vscode-* variables and
// shows only the fallbacks.
const THEMES = {
  dark: {
    bodyClass: 'vscode-dark',
    vars: {
      'editor-background': '#1f1f1f', 'editor-foreground': '#cccccc', 'foreground': '#cccccc',
      'descriptionForeground': '#9d9d9d', 'focusBorder': '#0078d4', 'panel-border': '#2b2b2b',
      'widget-border': '#313131', 'editorWidget-background': '#202020', 'sideBar-background': '#181818',
      'input-background': '#313131', 'input-foreground': '#cccccc', 'input-border': '#3c3c3c',
      'dropdown-background': '#313131', 'dropdown-listBackground': '#1f1f1f', 'dropdown-foreground': '#cccccc',
      'dropdown-border': '#3c3c3c', 'button-background': '#0078d4', 'button-foreground': '#ffffff',
      'list-hoverBackground': '#2a2d2e', 'list-activeSelectionBackground': '#04395e',
      'menu-background': '#1f1f1f', 'textLink-foreground': '#4daafc',
      'font-family': "system-ui, 'Segoe UI', sans-serif", 'editor-font-family': 'ui-monospace, Menlo, monospace'
    }
  },
  light: {
    bodyClass: 'vscode-light',
    vars: {
      'editor-background': '#ffffff', 'editor-foreground': '#3b3b3b', 'foreground': '#3b3b3b',
      'descriptionForeground': '#3b3b3b', 'focusBorder': '#005fb8', 'panel-border': '#e5e5e5',
      'widget-border': '#e5e5e5', 'editorWidget-background': '#f8f8f8', 'sideBar-background': '#f8f8f8',
      'input-background': '#ffffff', 'input-foreground': '#3b3b3b', 'input-border': '#cecece',
      'dropdown-background': '#ffffff', 'dropdown-listBackground': '#ffffff', 'dropdown-foreground': '#3b3b3b',
      'dropdown-border': '#cecece', 'button-background': '#005fb8', 'button-foreground': '#ffffff',
      'list-hoverBackground': '#f2f2f2', 'list-activeSelectionBackground': '#e8e8e8',
      'menu-background': '#ffffff', 'textLink-foreground': '#005fb8',
      'font-family': "system-ui, 'Segoe UI', sans-serif", 'editor-font-family': 'ui-monospace, Menlo, monospace'
    }
  }
};

function themed(html, kind = 'dark') {
  const theme = THEMES[kind];
  const vars = Object.entries(theme.vars).map(([k, v]) => `--vscode-${k}: ${v};`).join(' ');
  return html
    .replace('</head>', `<style>html { ${vars} }</style></head>`)
    .replace(/<body([^>]*)>/, (m, attrs) => `<body${attrs} class="${theme.bodyClass}">`);
}

module.exports = { THEMES, themed };
