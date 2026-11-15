# Changelog

## [1.3.0] - 2026-11-15

- The left panel holds inputs and transformations apart: **+ Add a
  transformation** and **+ From an algorithm…** sit there, and the selected
  transformation opens on the right, one at a time.
- **Save** (Ctrl+S), **Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z) as in Logic
  Spec, with an **Unsaved** mark. Changes are written on Save; unsaved ones of
  a closed lab come back on opening it.
- **Export md** describes a transformation in a Markdown file: what it reads,
  its steps and the fields of the result.
- **Output fields** (formerly Select columns / Select fields): output names
  first, each taken from a column; a dot in the name makes a nested field.
  The step starts with the columns of the step before it — after a Merge too;
  before, it started with the columns from before the Merge and kept them.
- Merge with all fields of an XML list: fields written as attributes come in
  under their plain names, and one whose name the element already has gets
  the list's name (`Name_Subcategory`). Before, such a field was hidden in
  the tables and the next steps did not see it.

## [1.2.0] - 2026-11-15

- Algorithms: the steps of a transformation saved apart from the data, as
  `<name>.algorithm.json` in the labs folder, to run on any data in any lab. A
  change in one place changes the algorithm everywhere it is used; **Detach**
  keeps a copy instead.
- Named results can be used in every transformation of the lab, not only in
  those below them; the lab works out the order. Their nested lists and objects
  are sources too.
- Filter conditions show their operators (=, ≠, between, is filled, …)
  instead of internal keys.
- Named results are listed under **Results** on the left and open as a table.
- A result name taken by an input or another result, and a result built from
  itself, are said.

## [1.1.0] - 2026-11-15

- When Spec Studio is installed and the workspace has its package folder
  (`<workspace name>-spec`), labs are saved in its `data` folder. The setting
  `dataLab.useSpecPackage` turns this off; `dataLab.labsFolder` still wins.
- Fewer texts in the lab: no example placeholders in the input fields, no hints
  under the expression and the merge, shorter flatten options.

## [1.0.0] - 2026-11-15

First public release.

- Labs: sample data in JSON, XML, YAML, CSV/TSV or key=value, transformed step
  by step, with the result of every step as a table.
- Steps for lists, objects and single values, including merging, comparing,
  flattening nested objects and lists, removing nested fields, and new fields
  from transformations, combined text or expressions.
- Tables show nested objects as columns and number elements from 0.
- Results as JSON, XML, YAML, CSV or properties.
- Labs are saved as `<name>.lab.json` files in the `data` folder of the
  workspace, or in the folder set in `dataLab.labsFolder`.
- **Open as a flow design** opens the lab's flow design in Logic Spec.
