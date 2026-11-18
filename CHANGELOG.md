# Changelog

## [Unreleased]

- Remove columns shows the fields as a tree of checkboxes instead of a long
  list of nested paths: a field with fields inside opens below its row, with
  the number of ticked ones inside; ticking it removes it with all it holds.
- The result is copied with an icon in its corner, which keeps clear of the
  scrollbar; the second Copy above the result is gone.
- Comments before each element can come from several fields, one comment line
  for each. A lab saved with one comment field opens as before.

## [1.5.0] - 2026-11-17

- Several columns in one step: a Filter condition on several columns (**any
  of** or **each of** them), Sort by more columns (**+ then by**), Remove
  duplicates by several columns, Change column on several columns at once,
  and Add field with more fields in the same step (**+ another field**).
  Remove columns gets **all** and **none**, Output fields **+ all the
  others**.
- The steps of a transformation are listed under it in the left panel: select
  one to go to it, drag it to change the order.
- Only the table of the last step is open; the source and the other steps fold
  under a line with their size, and open when it is selected.
- **+ Add a step** opens a menu of the operations, grouped, instead of a row
  of buttons under the table.
- **Copy** in the top right corner of the result code puts it on the
  clipboard.
- Colours: each group of steps has its own, the same in the menu, the left
  panel, the step and its table.

## [1.4.0] - 2026-11-15

- Steps move up and down with the **↑** and **↓** arrows next to them.
- **Copy** next to **Open in editor** puts the result on the clipboard.
- **comment before each element** under the result: the value of a chosen
  field goes before each element as a comment — `<!-- … -->` in XML, `# …`
  in YAML and properties, `// …` in JSON (opened as JSON with comments). The
  field can stay in the data or be left out. CSV has no comments.
- A transformation has its own name, any text, at the top of it: the list and
  the md show it. The result name stays the name other transformations use;
  renaming it renames it in the transformations that use it, and a character
  a result name cannot have becomes `_` as it is typed.
- Change column, Add field and Output fields on a field an XML attribute
  holds (`Name="…"`) write the new value into that field; before, it went
  into a new field next to it and the table kept showing the old value, so
  **in capitals** or **in lowercase** looked as if it did nothing.
- Change column with no transformation picked and a name in **save as**
  renames the column, in its place; with a transformation, **save as** still
  puts the result into a new column and keeps this one. A line under it says
  which.
- **replace a text** with nothing to find leaves the text as it is; before, it
  put the new text between every two letters.

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
