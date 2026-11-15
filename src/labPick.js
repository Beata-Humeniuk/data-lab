// The items of the lab pick, for what is typed in it (owner,
// 2026-11-15: a name typed into the pick and Enter did nothing — the pick
// only filtered). Text that names no lab is a new one by that name,
// always offered first, so Enter creates it.
// list: [{ title, dir, mtime }]; t: the catalog's t.
function labPickItems(list, typed, t) {
  const name = String(typed || '').trim();
  const exists = name && list.some((s) => String(s.title).trim().toLowerCase() === name.toLowerCase());
  const first = name && !exists
    ? { label: t('lab.newNamed', { name }), detail: t('lab.newDetail'), action: 'new', name, alwaysShow: true }
    : { label: t('lab.new'), detail: t('lab.newDetail'), action: 'new', alwaysShow: !name };
  const items = [first].concat(list.map((s) => ({
    label: s.title, description: s.mtime ? new Date(s.mtime).toLocaleString() : '', action: 'open', dir: s.dir
  })));
  if (list.length) items.push({ label: t('lab.delete'), action: 'delete' });
  return items;
}

module.exports = { labPickItems };
