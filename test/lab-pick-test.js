const { runChecks } = require('./helpers');
const { labPickItems } = require('../src/labPick');
const { forLanguage } = require('../src/nls');

const t = forLanguage('pl').t;
const list = [{ title: 'Próby rabatów', dir: 'a', mtime: 0 }, { title: 'Kanały', dir: 'b', mtime: 0 }];
const empty = labPickItems(list, '', t);
const typed = labPickItems(list, 'Pakiety konta', t);
const same = labPickItems(list, 'kanały', t);
const none = labPickItems([], 'x', t);

runChecks([
  [empty[0].action === 'new' && !empty[0].name && empty[0].alwaysShow && empty[0].label === '+ Nowe laboratorium', 'nothing typed: "+ Nowe laboratorium" asks for a name'],
  [typed[0].action === 'new' && typed[0].name === 'Pakiety konta' && typed[0].alwaysShow && typed[0].label.includes('Pakiety konta'),
    'a typed name no lab has: the first item creates it — Enter does it'],
  [!same[0].name && same.some((i) => i.action === 'open' && i.label === 'Kanały'), 'a typed name of an existing one: it opens, no duplicate'],
  [none[0].name === 'x' && !none.some((i) => i.action === 'delete'), 'no labs yet: no delete item'],
  [empty.filter((i) => i.action === 'open').length === 2 && empty[empty.length - 1].action === 'delete', 'existing labs, then delete']
]);
