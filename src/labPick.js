function labPickItems(list, typed, t) {
  const name = String(typed || '').trim();
  const exists = name && list.some((s) => String(s.title).trim().toLowerCase() === name.toLowerCase());
  const first = name && !exists
    ? { label: t('lab.newNamed', { name }), detail: t('lab.newDetail'), action: 'new', name, alwaysShow: true }
    : { label: t('lab.new'), detail: t('lab.newDetail'), action: 'new', alwaysShow: !name };
  const items = [first].concat(list.map((s) => ({
    label: s.title,
    description: [s.where === 'storage' ? t('lab.inStorage') : '', s.mtime ? new Date(s.mtime).toLocaleString() : ''].filter(Boolean).join(' · '),
    action: 'open', file: s.file, id: s.id
  })));
  if (list.length) items.push({ label: t('lab.delete'), action: 'delete' });
  return items;
}

module.exports = { labPickItems };
