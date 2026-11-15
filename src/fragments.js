'use strict';

// Fragments of a flow: steps that run only under a condition, one of several
// branches, in parallel, or once per element — the combined fragments of a
// UML sequence diagram (owner, 2026-09-28: „co jeśli będzie rozwidlenie? …
// niektóre usługi mam takie, gdzie logika jest równolegle odpalana … jest
// odpowiednik switch w javie?").
//
// In api.json:
//   "fragments": [{ "id": "f1", "kind": "alt", "label": "", "on": "authorizationOption",
//                   "over": "", "parent": null | { "fragment": "f0", "branch": "f0b1" },
//                   "branches": [{ "id": "f1b1", "when": "MOBILE" }, { "id": "f1b2", "when": "" }] }]
//   a step:       "in": { "fragment": "f1", "branch": "f1b1" }   — its innermost branch
//
//   opt   one branch, `when` its condition                          if (…) { … }
//   alt   two or more, each with `when`; an empty last one is else;  if / else if / else
//         with `on` the branches are the values of that field        switch (on) { case … default }
//   par   two or more branches running at once, all awaited          CompletableFuture.allOf(…)
//   loop  one branch, `over` the list it walks                       for (x : over)
//   group one branch, only a `label`: steps kept together to read the flow
//         (no condition, no semantics)
//
// A fragment's steps are contiguous and its branches in order; nesting goes
// through `parent`. Pure: no vscode, no DOM — the designer injects what it
// needs, the md export and the tests use the same code.

const KINDS = ['opt', 'alt', 'par', 'loop', 'group'];

function str(v) {
  return typeof v === 'string' ? v : '';
}

function normalizeFragments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object' || !str(f.id).trim()) continue;
    const kind = KINDS.indexOf(f.kind) >= 0 ? f.kind : 'opt';
    const branches = (Array.isArray(f.branches) ? f.branches : [])
      .filter((b) => b && typeof b === 'object' && str(b.id).trim())
      // `otherwise`: the branch for every value no case names — kept only when set.
      .map((b) => (b.otherwise === true ? { id: str(b.id).trim(), when: '', otherwise: true } : { id: str(b.id).trim(), when: str(b.when) }));
    if (!branches.length) branches.push({ id: str(f.id).trim() + 'b1', when: '' });
    const frag = { id: str(f.id).trim(), kind, label: str(f.label), branches };
    if (str(f.on).trim()) frag.on = str(f.on).trim();
    if (str(f.over).trim()) frag.over = str(f.over).trim();
    const p = f.parent;
    frag.parent = p && typeof p === 'object' && str(p.fragment).trim() && str(p.branch).trim()
      ? { fragment: str(p.fragment).trim(), branch: str(p.branch).trim() } : null;
    out.push(frag);
  }
  return out;
}

function normalizeIn(raw) {
  return raw && typeof raw === 'object' && str(raw.fragment).trim() && str(raw.branch).trim()
    ? { fragment: str(raw.fragment).trim(), branch: str(raw.branch).trim() } : null;
}

// The branches a step lies in, outermost first: [{ fragment, branch, index }].
function pathOf(inRef, fragments) {
  const byId = new Map((fragments || []).map((f) => [f.id, f]));
  const out = [];
  let ref = inRef;
  let guard = 0;
  while (ref && guard++ < 32) {
    const frag = byId.get(ref.fragment);
    if (!frag) break;
    const index = frag.branches.findIndex((b) => b.id === ref.branch);
    if (index < 0) break;
    out.unshift({ fragment: frag, branch: frag.branches[index], index });
    ref = frag.parent;
  }
  return out;
}

// The flow as a tree for drawing: a sequence of
//   { type: 'step', index }  |  { type: 'fragment', fragment, branches: [{ branch, items }] }
// built from the steps in their order.
function flowTree(steps, fragments) {
  const root = [];
  // The open fragments, outermost first, each with the branch being filled.
  let open = [];
  const containerFor = (depth) => (depth === 0 ? root : open[depth - 1].current.items);
  (steps || []).forEach((step, index) => {
    const path = pathOf(step && step.in, fragments);
    // Keep the open fragments this step still lies in (same fragment, same branch).
    let keep = 0;
    while (keep < open.length && keep < path.length && open[keep].node.fragment.id === path[keep].fragment.id &&
      open[keep].current.branch.id === path[keep].branch.id) keep++;
    // Same fragment, a later branch: switch branch at that level.
    if (keep < open.length && keep < path.length && open[keep].node.fragment.id === path[keep].fragment.id) {
      open = open.slice(0, keep + 1);
      const node = open[keep].node;
      let b = node.branches.find((x) => x.branch.id === path[keep].branch.id);
      if (!b) { b = { branch: path[keep].branch, items: [] }; node.branches.push(b); }
      open[keep].current = b;
      keep++;
    } else {
      open = open.slice(0, keep);
    }
    for (let d = keep; d < path.length; d++) {
      const node = { type: 'fragment', fragment: path[d].fragment, branches: [] };
      const current = { branch: path[d].branch, items: [] };
      node.branches.push(current);
      containerFor(d).push(node);
      open.push({ node, current });
    }
    containerFor(open.length).push({ type: 'step', index });
  });
  return root;
}

// One branch in words, for the md and the tooltips. `L` — labels:
// { if, else, elseIf, case, default, par, loop, switchOn }.
function branchText(fragment, index, L) {
  const l = L || {};
  const b = fragment.branches[index] || { when: '' };
  const when = String(b.when || '').trim();
  // A named branch says its name (owner, 2026-11-12: „niewiadomo, który to
  // krok" — ten branches all read „in parallel 3/10"); its place stays.
  if (fragment.kind === 'par') return (l.par || 'in parallel') + ' ' + (index + 1) + '/' + fragment.branches.length + (when ? ': ' + when : '');
  if (fragment.kind === 'loop') return (l.loop || 'for each') + ' ' + (fragment.over || when || '');
  if (fragment.kind === 'group') return fragment.label || l.group || 'group';
  // A branch is its condition, no word in front (owner, 2026-11-13: „po co
  // to »gdy« tam wciskasz? … nie może być tu śmieci").
  if (fragment.kind === 'alt' && fragment.on) {
    return when ? fragment.on + ' = ' + when : (l.default || 'default') + ' (' + fragment.on + ')';
  }
  if (!when) return fragment.kind === 'alt' && index > 0 ? (l.else || 'otherwise') : '';
  return when;
}

// "Warunek: opt [authorizationOption != VOICE]" and the like, as the EA
// add-on wrote a step's fragments before it wrote them as structure:
// "loop [x] › alt [y]", "alt, inaczej", "par, równolegle".
// → [{ kind, when, later }] outermost first (`later` — not the first
// operand), or null.
function parseEaCondition(text) {
  const m = /^\s*Warunek:\s*(.+)$/m.exec(String(text || ''));
  if (!m) return null;
  const parts = m[1].split('›').map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const k = /^(opt|alt|par|loop)(,\s*(inaczej|równolegle))?\s*(\[(.*)\])?\s*$/i.exec(p);
    if (!k) return null;
    out.push({ kind: k[1].toLowerCase(), later: !!k[2], when: str(k[5]).trim() });
  }
  return out.length ? out : null;
}

// Steps carrying EA's condition line turned into fragments: consecutive steps
// with the same chain share one fragment; a "later" operand of the same
// kind right after the first opens the next branch of it. `newId(prefix)`
// makes ids. → { fragments, assign: Map(stepIndex → in), cleaned:
// Map(stepIndex → description without the line) } — empty when nothing matched.
function planEaFragments(steps, newId) {
  const fragments = [];
  const assign = new Map();
  const cleaned = new Map();
  let open = []; // [{ fragment, branch, branchIndex }] outermost first
  (steps || []).forEach((step, index) => {
    const chain = step && !step.in ? parseEaCondition(step.description) : null;
    if (!chain) { open = []; return; }
    const next = [];
    let reuse = true;
    chain.forEach((c, d) => {
      const o = reuse ? open[d] : null;
      const parent = d === 0 ? null : { fragment: next[d - 1].fragment.id, branch: next[d - 1].branch.id };
      if (o && o.fragment.kind === c.kind) {
        const sameBranch = o.sig === c.when && (c.later ? o.branchIndex > 0 : o.branchIndex === 0);
        if (sameBranch) { next.push(o); return; }
        if (c.later) {
          const branch = { id: newId('b'), when: c.when };
          o.fragment.branches.push(branch);
          next.push({ fragment: o.fragment, branch, branchIndex: o.fragment.branches.length - 1, sig: c.when });
          reuse = false;
          return;
        }
      }
      reuse = false;
      const frag = { id: newId('f'), kind: c.kind, label: '', branches: [], parent };
      if (c.kind === 'loop' && c.when) frag.over = c.when;
      const branch = { id: newId('b'), when: c.kind === 'loop' ? '' : c.when };
      frag.branches.push(branch);
      fragments.push(frag);
      next.push({ fragment: frag, branch, branchIndex: 0, sig: c.when });
    });
    open = next;
    const inner = next[next.length - 1];
    assign.set(index, { fragment: inner.fragment.id, branch: inner.branch.id });
    cleaned.set(index, String(step.description).replace(/^\s*Warunek:.*(\r?\n)?/m, '').trim());
  });
  // An alt that got only one branch is an opt with that condition.
  for (const f of fragments) if (f.kind === 'alt' && f.branches.length === 1) f.kind = 'opt';
  return { fragments, assign, cleaned };
}

// The flow as a mermaid flowchart: decisions as diamonds, parallel branches
// between a fork and a join, a loop back to its head. `label(step, index)` —
// the node text; `L` — the words (see branchText) plus request/response/join.
function flowMermaid(flow, label, L) {
  const l = L || {};
  const q = (s) => String(s || '').replace(/"/g, "'");
  // The editor's own colours: a forced light theme turned the loop frames
  // into white blocks on a dark page (owner, 2026-11-12: „nagle na biało").
  const lines = ['flowchart TD'];
  // Edges after every node and frame: an edge written inside a frame pulls
  // the nodes it names into that frame (a step before a loop drawn inside it).
  const edges = [];
  let n = 0;
  const id = (p) => p + (n++);
  lines.push('  REQ(["' + q(l.request || 'Request') + '"])');
  // Draws a sequence starting from `from` (node id); → the last node id.
  const seq = (items, from, edge) => {
    let prev = from;
    let pending = edge || '';
    for (const it of items) {
      if (it.type === 'step') {
        const sid = 'S' + it.index;
        lines.push('  ' + sid + '["' + q(label(flow.steps[it.index], it.index)) + '"]');
        edges.push('  ' + prev + ' -->' + (pending ? '|' + q(pending) + '|' : '') + ' ' + sid);
        prev = sid; pending = '';
        continue;
      }
      const f = it.fragment;
      // A loop is a titled frame around its steps (owner, 2026-11-12: a
      // hexagon with dashed edges back to it, loops inside loops, read as
      // „dziwny … nieczytelny"): what repeats is what lies inside.
      if (f.kind === 'loop') {
        const sub = id('L');
        lines.push('  subgraph ' + sub + '["' + q(str(f.label).trim() || ((l.loop || 'for each') + ' ' + (f.over || ''))) + '"]');
        const items = it.branches[0] ? it.branches[0].items : [];
        let last;
        if (items.length) last = seq(items, prev, pending);
        else {
          last = id('E');
          lines.push('  ' + last + '["…"]');
          edges.push('  ' + prev + ' -->' + (pending ? '|' + q(pending) + '|' : '') + ' ' + last);
        }
        lines.push('  end');
        prev = last; pending = '';
        continue;
      }
      if (f.kind === 'group') {
        const sub = id('G');
        lines.push('  subgraph ' + sub + '["' + q(f.label || l.group || 'group') + '"]');
        const last = seq(it.branches[0] ? it.branches[0].items : [], prev, pending);
        lines.push('  end');
        prev = last; pending = '';
        continue;
      }
      if (f.kind === 'par') {
        const fork = id('P');
        const join = id('J');
        lines.push('  ' + fork + '[/"' + q(l.par || 'in parallel') + '"/]');
        lines.push('  ' + join + '[\\"' + q(l.join || 'all done') + '"\\]');
        edges.push('  ' + prev + ' -->' + (pending ? '|' + q(pending) + '|' : '') + ' ' + fork);
        for (const b of it.branches) edges.push('  ' + seq(b.items, fork, '') + ' --> ' + join);
        prev = join; pending = '';
        continue;
      }
      const dec = id('D');
      const join = id('J');
      // Its name first, when it has one.
      const head = str(f.label).trim() || (f.kind === 'alt' && f.on ? 'switch ' + f.on : (f.kind === 'opt' ? str(f.branches[0] && f.branches[0].when) + '?' : '?'));
      lines.push('  ' + dec + '{"' + q(head) + '"}');
      lines.push('  ' + join + '(( ))');
      edges.push('  ' + prev + ' -->' + (pending ? '|' + q(pending) + '|' : '') + ' ' + dec);
      it.branches.forEach((b) => {
        const i = f.branches.indexOf(b.branch);
        const word = f.kind === 'opt' ? (l.yes || 'yes')
          : f.on ? (str(b.branch.when).trim() || (l.default || 'default'))
            : (str(b.branch.when).trim() || (l.else || 'otherwise'));
        edges.push('  ' + seq(b.items, dec, word) + ' --> ' + join);
        void i;
      });
      // An opt, or an alt without an else, can skip every branch.
      const hasElse = f.kind === 'alt' && f.branches.some((b, i) => i > 0 && !str(b.when).trim());
      if (f.kind === 'opt' || !hasElse) edges.push('  ' + dec + ' -->|' + q(f.kind === 'opt' ? (l.no || 'no') : f.on ? (l.default || 'default') : (l.else || 'otherwise')) + '| ' + join);
      prev = join; pending = '';
    }
    return prev;
  };
  const last = seq(flowTree(flow.steps, flow.fragments || []), 'REQ', '');
  lines.push('  RESP(["' + q(l.response || 'Response') + '"])');
  edges.push('  ' + last + ' --> RESP');
  return lines.concat(edges).join('\n');
}

// Two fragments one right after the other, of the same kind, with the same
// branches and the same parent, and nothing between them but steps that lie
// outside any fragment and depend on no condition (a step added later
// between two conditional ones): one fragment. The unconditional steps move
// in front of it. Changes `flow` in place → how many fragments were merged.
function mergeAdjacentFragments(flow) {
  let frags = flow.fragments || [];
  if (frags.length < 2) return 0;
  const sig = (f) => f.kind + '|' + JSON.stringify(f.parent) + '|' + (f.on || '') + '|' + (f.over || '') + '|' + f.branches.map((b) => b.when).join('\u0001');
  const outer = (step) => { const p = pathOf(step && step.in, frags); return p.length ? p[0].fragment : null; };
  let merged = 0;
  for (let guard = 0; guard < 50; guard++) {
    let done = false;
    const steps = flow.steps;
    for (let i = 0; i < steps.length && !done; i++) {
      const a = outer(steps[i]);
      if (!a || a.parent) continue;
      // the end of a's run
      let end = i;
      while (end + 1 < steps.length && outer(steps[end + 1]) === a) end++;
      let j = end + 1;
      while (j < steps.length && !steps[j].in) j++;
      const b = j < steps.length ? outer(steps[j]) : null;
      if (!b || b === a || b.parent || sig(a) !== sig(b)) continue;
      // Move the plain steps between the runs in front of a's run.
      const between = steps.splice(end + 1, j - end - 1);
      steps.splice(i, 0, ...between);
      const branchMap = new Map(b.branches.map((x, k) => [x.id, a.branches[k].id]));
      for (const st of steps) if (st.in && st.in.fragment === b.id) st.in = { fragment: a.id, branch: branchMap.get(st.in.branch) || a.branches[0].id };
      for (const f of frags) if (f.parent && f.parent.fragment === b.id) f.parent = { fragment: a.id, branch: branchMap.get(f.parent.branch) || a.branches[0].id };
      frags = flow.fragments = frags.filter((f) => f !== b);
      merged++;
      done = true;
    }
    if (!done) break;
  }
  return merged;
}

// Several steps picked in the designer made one fragment (owner,
// 2026-09-28: „opcja grupowania"): they move next to each other where the
// first of them is, in their order, and go into the new fragment's first
// branch; a step that lay deeper keeps its own fragment, now inside the new
// one. The new fragment sits in the branch all of them share (or in the main
// line). `newId()` makes ids. Changes `flow` in place → the fragment, or null.
function groupSteps(flow, indices, kind, newId) {
  const picked = Array.from(new Set(indices || [])).filter((i) => i >= 0 && i < flow.steps.length).sort((a, b) => a - b);
  if (!picked.length) return null;
  const frags = flow.fragments || [];
  const steps = picked.map((i) => flow.steps[i]);
  const paths = steps.map((st) => pathOf(st.in, frags));
  // The branch every picked step lies in.
  let common = 0;
  while (paths.every((p) => p[common] && paths[0][common] &&
    p[common].fragment.id === paths[0][common].fragment.id && p[common].branch.id === paths[0][common].branch.id)) common++;
  const parent = common ? { fragment: paths[0][common - 1].fragment.id, branch: paths[0][common - 1].branch.id } : null;
  const id = newId();
  // The kinds written out: this runs in the page too, without the module's constants.
  const frag = { id, kind: ['opt', 'alt', 'par', 'loop', 'group'].indexOf(kind) >= 0 ? kind : 'group', label: '', branches: [{ id: id + 'b1', when: '' }], parent };
  if (frag.kind === 'alt' || frag.kind === 'par') frag.branches.push({ id: id + 'b2', when: '' });
  const into = { fragment: id, branch: frag.branches[0].id };
  steps.forEach((st, k) => {
    const p = paths[k];
    if (p.length === common) { st.in = Object.assign({}, into); return; }
    p[common].fragment.parent = Object.assign({}, into);
  });
  // Next to each other, where the first one is.
  const at = picked[0];
  const rest = flow.steps.filter((st, i) => picked.indexOf(i) < 0);
  const before = flow.steps.slice(0, at).filter((st, i) => picked.indexOf(i) < 0).length;
  flow.steps = rest.slice(0, before).concat(steps, rest.slice(before));
  flow.fragments = frags.concat([frag]);
  return frag;
}

// Steps taken out for a copy, with the branches among them (owner,
// 2026-10-08: „brakuje mi też opcji kopiowania branchy tak jak kroków"):
// the fragments below the branch every one of them shares go along, the
// shared ones stay behind — what is copied lands where it is pasted. With
// `rootId` a whole fragment goes, itself included, all of its steps.
// → { steps, fragments }, clones; ids as they are (placeSlice renews them).
function copySlice(flow, ids, rootId) {
  const frags = flow.fragments || [];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const wanted = new Set(ids || []);
  const all = (flow.steps || []).map((st) => ({ st, path: pathOf(st.in, frags) }));
  const chosen = rootId
    ? all.filter((x) => x.path.some((p) => p.fragment.id === rootId))
    : all.filter((x) => wanted.has(x.st.id));
  if (!chosen.length) return { steps: [], fragments: [] };
  let cut = 0;
  if (rootId) {
    cut = chosen[0].path.findIndex((p) => p.fragment.id === rootId);
  } else {
    const first = chosen[0].path;
    while (chosen.every((x) => x.path[cut] && first[cut] &&
      x.path[cut].fragment.id === first[cut].fragment.id && x.path[cut].branch.id === first[cut].branch.id)) cut++;
  }
  const kept = new Set();
  const steps = chosen.map((x) => {
    const st = clone(x.st);
    const below = x.path.slice(cut);
    for (const p of below) kept.add(p.fragment.id);
    if (below.length) st.in = { fragment: below[below.length - 1].fragment.id, branch: below[below.length - 1].branch.id };
    else delete st.in;
    return st;
  });
  const fragments = frags.filter((f) => kept.has(f.id)).map((f) => {
    const c = clone(f);
    if (!c.parent || !kept.has(c.parent.fragment)) c.parent = null;
    return c;
  });
  return { steps, fragments };
}

// A copied slice into `flow`: its fragments get ids of their own (pasted
// twice, two fragments), the outermost ones and the steps outside them go
// into `into` (a branch, or null — the main line). Adds the fragments to
// `flow` and changes the steps in place → the steps, to insert where `into`
// is. `newId()` makes ids.
function placeSlice(flow, steps, fragments, into, newId) {
  const ids = {};
  const branches = {};
  const placed = (fragments || []).map((f) => {
    const id = newId();
    ids[f.id] = id;
    const c = JSON.parse(JSON.stringify(f));
    c.id = id;
    c.branches = (c.branches || []).map((b, k) => { branches[b.id] = id + 'b' + (k + 1); return Object.assign({}, b, { id: id + 'b' + (k + 1) }); });
    return c;
  });
  const map = (ref) => (ref && ids[ref.fragment] && branches[ref.branch]
    ? { fragment: ids[ref.fragment], branch: branches[ref.branch] } : (into ? Object.assign({}, into) : null));
  for (const f of placed) f.parent = map(f.parent);
  for (const st of steps) {
    const ref = map(st.in);
    if (ref) st.in = ref; else delete st.in;
  }
  if (placed.length) flow.fragments = (flow.fragments || []).concat(placed);
  return steps;
}

// The fragments among `ids` that no step lies in any more (after a cut),
// gone — their inner ones with them. Changes `flow` in place.
function pruneFragments(flow, ids) {
  const frags = flow.fragments || [];
  const used = new Set();
  for (const st of flow.steps || []) for (const p of pathOf(st.in, frags)) used.add(p.fragment.id);
  const drop = new Set((ids || []).filter((id) => !used.has(id)));
  if (!drop.size) return;
  flow.fragments = frags.filter((f) => !drop.has(f.id));
  if (!flow.fragments.length) delete flow.fragments;
}

// What the designer's page runs itself (inject.js): closure-free.
const FRAGMENTS_INJECTABLE = { pathOf, flowTree, branchText, mergeAdjacentFragments, groupSteps, copySlice, placeSlice, pruneFragments };

module.exports = {
  FRAGMENTS_INJECTABLE, FRAGMENT_KINDS: KINDS, mergeAdjacentFragments, groupSteps, copySlice, placeSlice, pruneFragments, normalizeFragments, normalizeIn, pathOf, flowTree, branchText,
  parseEaCondition, planEaFragments, flowMermaid
};
