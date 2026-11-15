'use strict';

const vscode = require('vscode');
const path = require('path');
const { forLanguage } = require('./nls');
const { LAB_SUFFIX, resolveLabsFolder, specPackageOf, slugOf, labIdOf } = require('./labsFolder');

function displayLanguage() {
  const ws = vscode.workspace;
  const chosen = ws && typeof ws.getConfiguration === 'function'
    ? String(ws.getConfiguration('specTools').get('language') || 'auto') : 'auto';
  if (chosen === 'pl' || chosen === 'en') return chosen;
  return vscode.env && vscode.env.language;
}
const nls = forLanguage(displayLanguage());

const LEGACY_LAB_FILE = 'lab.json';
const LOGIC_SPEC = 'beatahumeniuk.logic-spec';

function storageRoot(context) { return vscode.Uri.joinPath(context.globalStorageUri, 'labs'); }
const SPEC_STUDIO = 'beatahumeniuk.spec-studio';
async function specPackage(root) {
  if (!root || !vscode.extensions.getExtension(SPEC_STUDIO)) return '';
  if (vscode.workspace.getConfiguration('dataLab', root).get('useSpecPackage') === false) return '';
  const dir = specPackageOf(root.fsPath);
  try { return (await vscode.workspace.fs.stat(vscode.Uri.file(dir))).type === vscode.FileType.Directory ? dir : ''; } catch (e) { return ''; }
}
async function labsFolder() {
  const root = workspaceRoot();
  const resolved = resolveLabsFolder(vscode.workspace.getConfiguration('dataLab', root).get('labsFolder'), root ? root.fsPath : '', await specPackage(root));
  return resolved ? vscode.Uri.file(resolved.folder) : null;
}

async function readText(uri) {
  try { return Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'); } catch (e) { return null; }
}
async function readJson(uri) {
  const t = await readText(uri);
  if (t === null) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
async function writeJson(uri, value) {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'));
}

function normalizeLab(lab, fallbackName) {
  const out = lab && typeof lab === 'object' ? lab : {};
  out.name = String(out.name || fallbackName || nls.t('lab.nameDefault'));
  out.inputs = Array.isArray(out.inputs) ? out.inputs : [];
  out.pipelines = Array.isArray(out.pipelines) ? out.pipelines : [];
  out.format = out.format || 'json';
  return out;
}

async function labsIn(folder, where) {
  let entries = [];
  try { entries = await vscode.workspace.fs.readDirectory(folder); } catch (e) { return []; }
  const out = [];
  for (const [nm, kind] of entries) {
    let file = null;
    let id = '';
    let remove = null;
    if (kind === vscode.FileType.File && labIdOf(nm)) { file = vscode.Uri.joinPath(folder, nm); id = labIdOf(nm); remove = file; }
    else if (kind === vscode.FileType.Directory) { file = vscode.Uri.joinPath(folder, nm, LEGACY_LAB_FILE); id = nm; remove = vscode.Uri.joinPath(folder, nm); }
    if (!file) continue;
    let mtime = 0;
    try { mtime = (await vscode.workspace.fs.stat(file)).mtime; } catch (e) { continue; }
    const lab = await readJson(file);
    out.push({ file, id, remove, where, title: String((lab && lab.name) || id), mtime });
  }
  return out;
}
async function listLabs(context) {
  const folder = await labsFolder();
  const inFolder = folder ? await labsIn(folder, 'folder') : [];
  const inStorage = folder && path.resolve(folder.fsPath) === path.resolve(storageRoot(context).fsPath) ? [] : await labsIn(storageRoot(context), 'storage');
  return inFolder.concat(inStorage).sort((a, b) => b.mtime - a.mtime);
}

async function openCommand(context) {
  const list = await listLabs(context);
  const { labPickItems } = require('./labPick');
  const picked = await new Promise((resolve) => {
    const qp = vscode.window.createQuickPick();
    qp.title = nls.t('lab.pick');
    qp.placeholder = nls.t('lab.pickPh');
    qp.items = labPickItems(list, '', nls.t);
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); qp.hide(); };
    qp.onDidChangeValue((v) => { qp.items = labPickItems(list, v, nls.t); });
    qp.onDidAccept(() => {
      const chosen = qp.selectedItems[0] || qp.activeItems[0];
      if (chosen) finish(chosen);
      else if (String(qp.value || '').trim()) finish({ action: 'new', name: String(qp.value).trim() });
    });
    qp.onDidHide(() => { finish(undefined); qp.dispose(); });
    qp.show();
  });
  if (!picked) return;
  if (picked.action === 'delete') {
    const which = await vscode.window.showQuickPick(list.map((s) => ({ label: s.title, description: s.where === 'storage' ? nls.t('lab.inStorage') : '', remove: s.remove })), { title: nls.t('lab.deletePick') });
    if (!which) return;
    const yes = nls.t('lab.deleteYes');
    if (await vscode.window.showWarningMessage(nls.t('lab.deleteConfirm', { name: which.label }), { modal: true }, yes) !== yes) return;
    await vscode.workspace.fs.delete(which.remove, { recursive: true, useTrash: false });
    vscode.window.showInformationMessage(nls.t('lab.deleted', { name: which.label }));
    return;
  }
  let file = picked.file;
  let id = picked.id;
  if (picked.action === 'new') {
    const name = picked.name || await vscode.window.showInputBox({ title: nls.t('lab.pick'), prompt: nls.t('lab.namePrompt'), value: nls.t('lab.nameDefault') + ' ' + (list.length + 1) });
    if (name === undefined) return;
    const chosen = await labsFolder();
    const folder = chosen || storageRoot(context);
    if (!chosen) vscode.window.showInformationMessage(nls.t('lab.noFolder'));
    await vscode.workspace.fs.createDirectory(folder);
    id = slugOf(name, (await labsIn(folder, '')).map((x) => x.id));
    file = vscode.Uri.joinPath(folder, id + LAB_SUFFIX);
    await writeJson(file, normalizeLab({ name: String(name).trim() }));
  }
  await openLab(context, file, id);
}

function sampleFileFilters() {
  return {
    [nls.t('map.runSampleFilter')]: ['json', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'properties', 'txt'],
    [nls.t('map.runAllFiles')]: ['*']
  };
}
function outputLanguage(format) {
  return { xml: 'xml', yaml: 'yaml', properties: 'properties', csv: 'plaintext' }[format] || 'json';
}
function workspaceRoot() {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri : undefined;
}

const panels = new Map();
async function openLab(context, file, id) {
  const key = path.resolve(file.fsPath);
  if (panels.has(key)) { panels.get(key).reveal(vscode.ViewColumn.Active); return; }
  const { buildLabHtml } = require('./labView');
  const dp = require('./dataPipeline');
  let lab = normalizeLab(await readJson(file), id);
  const panel = vscode.window.createWebviewPanel('dataLab', nls.t('lab.title', { name: lab.name }), vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] });
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
  panel.webview.html = buildLabHtml(displayLanguage());
  panels.set(key, panel);
  panel.onDidDispose(() => panels.delete(key));
  const docOf = () => ({ inputs: lab.inputs, pipelines: lab.pipelines, format: lab.format });
  const compute = () => {
    let r;
    try { r = dp.runDocument(docOf(), {}); } catch (e) { return { inputs: {}, pipelines: [], error: String(e && e.message || e) }; }
    const fmt = dp.RESULT_FORMATS.indexOf(lab.format) >= 0 ? lab.format : 'json';
    const columnsOf = {};
    const paths = new Set();
    r.pipelines.forEach((p) => p.sources.forEach((s) => paths.add(s.path)));
    for (const p of paths) columnsOf[p] = dp.columnsOf(dp.asList(dp.valueAt(r.root, p)));
    r.pipelines.forEach((p, i) => {
      if (p.result !== undefined && p.result !== null) p.text = dp.outputText(p.result, fmt, String((lab.pipelines[i] || {}).name || '').trim() || 'result');
      delete p.result;
    });
    delete r.root;
    r.columnsOf = columnsOf;
    return r;
  };
  const catalog = dp.changeCatalog(nls.t);
  panel.webview.onDidReceiveMessage(async (m) => {
    if (m.type === 'ready') { panel.webview.postMessage({ type: 'load', doc: docOf(), catalog, title: nls.t('lab.title', { name: lab.name }), result: compute() }); return; }
    if (m.type === 'doc' && m.doc && typeof m.doc === 'object') {
      lab = normalizeLab(Object.assign({}, m.doc, { name: lab.name }), lab.name);
      await writeJson(file, lab);
      panel.webview.postMessage({ type: 'result', result: compute() });
      return;
    }
    if (m.type === 'pickFile') {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, title: nls.t('map.runPickSample'), openLabel: nls.t('map.runPickSample'),
        defaultUri: workspaceRoot(), filters: sampleFileFilters() });
      if (!picked || !picked.length) return;
      const text = Buffer.from(await vscode.workspace.fs.readFile(picked[0])).toString('utf8').replace(/^﻿/, '');
      panel.webview.postMessage({ type: 'fileLoaded', index: m.index, text });
      return;
    }
    if (m.type === 'openOutput') {
      const d = await vscode.workspace.openTextDocument({ language: outputLanguage(m.format), content: String(m.text || '') });
      await vscode.window.showTextDocument(d, { preview: false, viewColumn: vscode.ViewColumn.Beside });
      return;
    }
    if (m.type === 'openAsFlow') {
      if (!vscode.extensions.getExtension(LOGIC_SPEC)) { vscode.window.showWarningMessage(nls.t('lab.noLogicSpec')); return; }
      await vscode.commands.executeCommand('logicSpec.openLabFlow', {
        id, name: lab.name, inputs: lab.inputs.map((x) => ({ name: x.name, text: x.text || '', format: x.format || 'auto' }))
      });
    }
  });
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand('dataLab.open', () => openCommand(context)));
}
function deactivate() {}

module.exports = { activate, deactivate };
