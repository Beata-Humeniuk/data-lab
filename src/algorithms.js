'use strict';

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function sameSteps(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }

function normalizeAlgorithm(value, fallbackName) {
  const out = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { name: String(out.name || fallbackName || ''), steps: Array.isArray(out.steps) ? out.steps : [] };
}

function linkedSteps(lab, algorithms) {
  let changed = false;
  for (const p of lab.pipelines || []) {
    const a = p && p.algorithm ? algorithms[p.algorithm] : null;
    if (!a || sameSteps(p.steps, a.steps)) continue;
    p.steps = clone(a.steps);
    changed = true;
  }
  return changed;
}

function editedAlgorithms(lab, algorithms) {
  const out = {};
  for (const p of lab.pipelines || []) {
    const id = p && p.algorithm;
    if (!id || !algorithms[id] || out[id] || sameSteps(p.steps, algorithms[id].steps)) continue;
    out[id] = clone(p.steps || []);
  }
  return out;
}

module.exports = { normalizeAlgorithm, linkedSteps, editedAlgorithms, sameSteps };
