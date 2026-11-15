const path = require('path');

const DEFAULT_FOLDER = 'data';
const LAB_SUFFIX = '.lab.json';

function resolveLabsFolder(setting, workspacePath) {
  const chosen = String(setting || '').trim();
  if (chosen && path.isAbsolute(chosen)) return { folder: path.normalize(chosen), kind: 'custom' };
  if (!workspacePath) return null;
  return { folder: path.join(workspacePath, chosen || DEFAULT_FOLDER), kind: chosen ? 'custom' : 'default' };
}

function slugOf(name, taken) {
  const base = String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lab';
  const used = new Set((taken || []).map((x) => String(x).toLowerCase()));
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = base + '-' + n++;
  return slug;
}

function labIdOf(fileName) {
  return fileName.endsWith(LAB_SUFFIX) ? fileName.slice(0, -LAB_SUFFIX.length) : '';
}

module.exports = { DEFAULT_FOLDER, LAB_SUFFIX, resolveLabsFolder, slugOf, labIdOf };
