// The extension in one file; the webview page is built by labView.js.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.js'], outfile: 'out/extension.js', external: ['vscode'],
  bundle: true, platform: 'node', format: 'cjs', charset: 'utf8', logLevel: 'warning',
  minifyWhitespace: true, minifySyntax: true,
});
