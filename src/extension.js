'use strict';

// DataLab: sample data in any format and its transformations, step by step,
// the result of every step as a table. Not a file of the project — a lab
// lives in the extension's own storage (globalStorage/labs/<id>/lab.json):
//
//   lab.json = { name, inputs: [{ name, text, format }], pipelines: [...], format }
//
// The transformations are dataPipeline.js; the engine under it (flowRun,
// mappingRun, sampleFormats, howKinds and what they need) is Logic Spec's,
// copied into src/ so a step here gives the same result as in a flow.

const vscode = require('vscode');
const path = require('path');
const { forLanguage } = require('./nls');

function displayLanguage() {
  const ws = vscode.workspace;
  const chosen = ws && typeof ws.getConfiguration === 'function'
    ? String(ws.getConfiguration('specTools').get('language') || 'auto') : 'auto';
  if (chosen === 'pl' || chosen === 'en') return chosen;
  return vscode.env && vscode.env.language;
}
const nls = forLanguage(displayLanguage());

const LAB_FILE = 'lab.json';
const LOGIC_SPEC = 'beatahumeniuk.logic-spec';

function labsRoot(context) { return vscode.Uri.joinPath(context.globalStorageUri, 'labs'); }

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

function slugOf(name) {
  return (String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lab') + '-' + Date.now().toString(36);
}

function normalizeLab(lab, fallbackName) {
  const out = lab && typeof lab === 'object' ? lab : {};
  out.name = String(out.name || fallbackName || nls.t('lab.nameDefault'));
  out.inputs = Array.isArray(out.inputs) ? out.inputs : [];
  out.pipelines = Array.isArray(out.pipelines) ? out.pipelines : [];
  out.format = out.format || 'json';
  return out;
}

async function listLabs(context) {
  const root = labsRoot(context);
  let entries = [];
  try { entries = await vscode.workspace.fs.readDirectory(root); } catch (e) { return []; }
  const out = [];
  for (const [nm, kind] of entries) {
    if (kind !== vscode.FileType.Directory) continue;
    const dir = vscode.Uri.joinPath(root, nm);
    const file = vscode.Uri.joinPath(dir, LAB_FILE);
    let mtime = 0;
    try { mtime = (await vscode.workspace.fs.stat(file)).mtime; } catch (e) { continue; }
    const lab = await readJson(file);
    out.push({ dir, id: nm, title: String((lab && lab.name) || nm), mtime });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// The scratchpads Logic Spec kept before DataLab (globalStorage of
// beatahumeniuk.logic-spec, scratch/<id>/: data.json and api.json) come
// over once, under the same id — so "Otwórz jako projekt flow" opens the
// flow design they already had there. Logic Spec's files are only read.
async function importScratchpads(context) {
  if (context.globalState.get('dataLab.imported')) return;
  const scratch = vscode.Uri.file(path.join(path.dirname(context.globalStorageUri.fsPath), LOGIC_SPEC, 'scratch'));
  let entries = [];
  try { entries = await vscode.workspace.fs.readDirectory(scratch); } catch (e) { entries = []; }
  let count = 0;
  for (const [nm, kind] of entries) {
    if (kind !== vscode.FileType.Directory) continue;
    const from = vscode.Uri.joinPath(scratch, nm);
    const to = vscode.Uri.joinPath(labsRoot(context), nm);
    if (await readText(vscode.Uri.joinPath(to, LAB_FILE)) !== null) continue;
    const design = await readJson(vscode.Uri.joinPath(from, 'api.json')) || {};
    const data = await readJson(vscode.Uri.joinPath(from, 'data.json'));
    const lab = normalizeLab(data && typeof data === 'object' ? data : {}, design.name || nm);
    if (!lab.inputs.length && Array.isArray(design.context)) {
      for (const c of design.context) { const n = String((c && c.name) || '').trim(); if (n) lab.inputs.push({ name: n, text: '', format: 'auto' }); }
    }
    await vscode.workspace.fs.createDirectory(to);
    await writeJson(vscode.Uri.joinPath(to, LAB_FILE), lab);
    count++;
  }
  await context.globalState.update('dataLab.imported', true);
  if (count) vscode.window.showInformationMessage(nls.t('lab.imported', { count }));
}

async function openCommand(context) {
  await importScratchpads(context);
  const list = await listLabs(context);
  const { labPickItems } = require('./labPick');
  // A name typed into the pick is a new lab by that name: Enter creates it.
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
    const which = await vscode.window.showQuickPick(list.map((s) => ({ label: s.title, dir: s.dir })), { title: nls.t('lab.deletePick') });
    if (!which) return;
    const yes = nls.t('lab.deleteYes');
    if (await vscode.window.showWarningMessage(nls.t('lab.deleteConfirm', { name: which.label }), { modal: true }, yes) !== yes) return;
    await vscode.workspace.fs.delete(which.dir, { recursive: true, useTrash: false });
    vscode.window.showInformationMessage(nls.t('lab.deleted', { name: which.label }));
    return;
  }
  let dir = picked.dir;
  if (picked.action === 'new') {
    const name = picked.name || await vscode.window.showInputBox({ title: nls.t('lab.pick'), prompt: nls.t('lab.namePrompt'), value: nls.t('lab.nameDefault') + ' ' + (list.length + 1) });
    if (name === undefined) return;
    dir = vscode.Uri.joinPath(labsRoot(context), slugOf(name));
    await vscode.workspace.fs.createDirectory(dir);
    await writeJson(vscode.Uri.joinPath(dir, LAB_FILE), normalizeLab({ name: String(name).trim() }));
  }
  await openLab(context, dir);
}

function sampleFileFilters() {
  return {
    [nls.t('map.runSampleFilter')]: ['json', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'properties', 'txt'],
    [nls.t('map.runAllFiles')]: ['*']
  };
}
function outputLanguage(format) {
  return { xml: 'xml', yaml: 'yaml', properties: 'properties' }[format] || 'json';
}
function workspaceRoot() {
  const f = vscode.workspace.workspaceFolders;
  return f && f.length ? f[0].uri : undefined;
}

const panels = new Map();
async function openLab(context, dir) {
  const key = path.resolve(dir.fsPath);
  if (panels.has(key)) { panels.get(key).reveal(vscode.ViewColumn.Active); return; }
  const { buildLabHtml } = require('./labView');
  const dp = require('./dataPipeline');
  const { serialize, OUTPUT_FORMATS } = require('./mappingRun');
  const file = vscode.Uri.joinPath(dir, LAB_FILE);
  const id = path.basename(dir.fsPath);
  let lab = normalizeLab(await readJson(file), id);
  const panel = vscode.window.createWebviewPanel('dataLab', nls.t('lab.title', { name: lab.name }), vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true });
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
  panel.webview.html = buildLabHtml(displayLanguage());
  panels.set(key, panel);
  panel.onDidDispose(() => panels.delete(key));
  const docOf = () => ({ inputs: lab.inputs, pipelines: lab.pipelines, format: lab.format });
  const compute = () => {
    let r;
    try { r = dp.runDocument(docOf(), {}); } catch (e) { return { inputs: {}, pipelines: [], error: String(e && e.message || e) }; }
    const fmt = OUTPUT_FORMATS.indexOf(lab.format) >= 0 ? lab.format : 'json';
    const columnsOf = {};
    const paths = new Set();
    r.pipelines.forEach((p) => p.sources.forEach((s) => paths.add(s.path)));
    for (const p of paths) columnsOf[p] = dp.columnsOf(dp.asList(dp.valueAt(r.root, p)));
    r.pipelines.forEach((p, i) => {
      if (p.result !== undefined && p.result !== null) p.text = serialize(p.result, fmt, String((lab.pipelines[i] || {}).name || '').trim() || 'wynik');
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
    // The lab's flow design lives in Logic Spec (its designer and run);
    // DataLab hands over the id, the name and the inputs with their data.
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
