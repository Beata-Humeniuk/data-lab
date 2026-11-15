# Notes for Claude

## Never push without being asked

Do not push to this repository or change anything in the Marketplace unless
the owner asks for it in so many words. A push to `main` is a release:
`.github/workflows/publish.yml` publishes every new version from `main`.
Work goes to a branch and a pull request; the owner decides when it merges.

## Every change that users see is a new version

Bump `version` in `package.json` and `package-lock.json` together, and add the
change to `CHANGELOG.md`. `publish.yml` publishes a version only when its tag
`v<version>` does not exist yet.

## Extension decisions

- Interface in English only: `src/nls.js` has no translations and there is
  only `package.nls.json`. `test/nls-test.js` keeps Polish text out of the
  user-facing files.
- MIT license.

## Code

- No comments in code.
- Webview styles and script live in `media/lab.css` and `media/lab.js`, injected
  with a per-page nonce. The CSP is `default-src 'none'; connect-src 'none'`,
  with no `unsafe-inline` and `localResourceRoots: []`. No `style` attributes
  on elements (the CSP blocks them); use classes in `lab.css`.
- The webview follows the editor theme (`--vscode-*` variables, system colours
  as fallbacks). Screenshots go through `test/webviewTheme.js`,
  `themed(html, 'dark')`.
- Rules work on what the data itself says, never on names from one project.
  Tests use made-up data.
- Labs are saved as `<name>.lab.json` in the labs folder: `data` in the
  workspace, or `dataLab.labsFolder` (relative to the workspace or absolute).
  Without a folder they fall back to the extension's global storage. Nothing
  else is written into the project.

## Documentation

README in English only, with no build or test commands, and without repeating
`SECURITY.md`. Every fact appears once. After editing Markdown, read it again
for language and style.

## Before handing over

`npm ci`, `npm test`, `npm run package`, `npx vsce ls` (only the files the
package needs).
