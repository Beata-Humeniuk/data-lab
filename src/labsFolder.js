const path = require('path');

const DEFAULT_FOLDER = 'data';
const LAB_SUFFIX = '.lab.json';
const ALGORITHM_SUFFIX = '.algorithm.json';

function specPackageOf(workspacePath) {
  return workspacePath ? path.join(workspacePath, path.basename(workspacePath) + '-spec') : '';
}

function resolveLabsFolder(setting, workspacePath, specPackage) {
  const chosen = String(setting || '').trim();
  if (chosen && path.isAbsolute(chosen)) return { folder: path.normalize(chosen), kind: 'custom' };
  if (!workspacePath) return null;
  if (chosen) return { folder: path.join(workspacePath, chosen), kind: 'custom' };
  if (specPackage) return { folder: path.join(specPackage, DEFAULT_FOLDER), kind: 'spec' };
  return { folder: path.join(workspacePath, DEFAULT_FOLDER), kind: 'default' };
}

function slugOf(name, taken) {
  const base = String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l')
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

function algorithmIdOf(fileName) {
  return fileName.endsWith(ALGORITHM_SUFFIX) ? fileName.slice(0, -ALGORITHM_SUFFIX.length) : '';
}

module.exports = { DEFAULT_FOLDER, LAB_SUFFIX, ALGORITHM_SUFFIX, resolveLabsFolder, specPackageOf, slugOf, labIdOf, algorithmIdOf };
