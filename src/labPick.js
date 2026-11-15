function labPickItems(list, typed, t, algorithmCount) {
  const name = String(typed || '').trim();
  const exists = name && list.some((s) => String(s.title).trim().toLowerCase() === name.toLowerCase());
  const first = name && !exists
    ? { label: t('lab.newNamed', { name }), action: 'new', name, alwaysShow: true }
    : { label: t('lab.new'), action: 'new', alwaysShow: !name };
  const items = [first].concat(list.map((s) => ({
    label: s.title,
    description: [s.where === 'storage' ? t('lab.inStorage') : '', s.mtime ? new Date(s.mtime).toLocaleString() : ''].filter(Boolean).join(' · '),
    action: 'open', file: s.file, id: s.id
  })));
  if (list.length) items.push({ label: t('lab.delete'), action: 'delete' });
  if (algorithmCount) items.push({ label: t('alg.delete'), action: 'deleteAlgorithm' });
  return items;
}

module.exports = { labPickItems };
