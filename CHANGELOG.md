# Changelog

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
