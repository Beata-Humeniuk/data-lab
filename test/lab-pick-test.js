const { runChecks } = require('./helpers');
const { labPickItems } = require('../src/labPick');
const { forLanguage } = require('../src/nls');

const t = forLanguage('en').t;
const list = [{ title: 'Discount trials', file: 'a', id: 'discount-trials', where: 'folder', mtime: 0 }, { title: 'Channels', file: 'b', id: 'channels', where: 'storage', mtime: 0 }];
const empty = labPickItems(list, '', t);
const typed = labPickItems(list, 'Account packages', t);
const same = labPickItems(list, 'channels', t);
const none = labPickItems([], 'x', t);

runChecks([
  [empty[0].action === 'new' && !empty[0].name && empty[0].alwaysShow && empty[0].label === '+ New lab', 'nothing typed: "+ New lab" asks for a name'],
  [typed[0].action === 'new' && typed[0].name === 'Account packages' && typed[0].alwaysShow && typed[0].label.includes('Account packages'),
    'a typed name no lab has: the first item creates it — Enter does it'],
  [!same[0].name && same.some((i) => i.action === 'open' && i.label === 'Channels'), 'a typed name of an existing one: it opens, no duplicate'],
  [none[0].name === 'x' && !none.some((i) => i.action === 'delete'), 'no labs yet: no delete item'],
  [empty.find((i) => i.label === 'Channels').description === 'extension storage' && empty.find((i) => i.label === 'Discount trials').id === 'discount-trials', 'a lab kept in the extension storage says so; the others open by their file and id'],
  [empty.filter((i) => i.action === 'open').length === 2 && empty[empty.length - 1].action === 'delete', 'existing labs, then delete']
]);

const withAlgorithms = labPickItems(list, '', t, 2);
runChecks([
  [withAlgorithms[withAlgorithms.length - 1].action === 'deleteAlgorithm' && !empty.some((i) => i.action === 'deleteAlgorithm'), 'saved algorithms: an item to delete one, none without them']
]);
