const path = require('path');
const { runChecks } = require('./helpers');
const { resolveLabsFolder, slugOf, labIdOf, DEFAULT_FOLDER } = require('../src/labsFolder');

const ws = path.join(path.sep, 'work', 'shop');
const abs = path.join(path.sep, 'data', 'labs');
runChecks([
  [resolveLabsFolder('', ws).folder === path.join(ws, DEFAULT_FOLDER) && resolveLabsFolder('', ws).kind === 'default' && DEFAULT_FOLDER === 'data', 'no setting: the data folder in the workspace'],
  [resolveLabsFolder('docs/labs', ws).folder === path.join(ws, 'docs', 'labs'), 'a relative setting: inside the workspace'],
  [resolveLabsFolder(abs, ws).folder === abs && resolveLabsFolder(abs, '').folder === abs, 'an absolute setting: as it is, with or without a workspace'],
  [resolveLabsFolder('', '') === null && resolveLabsFolder('labs', '') === null, 'no workspace and no absolute setting: no folder'],
  [slugOf('Tea shop orders', []) === 'tea-shop-orders' && slugOf('Zamówienia ŁÓDŹ', []) === 'zamowienia-lodz', 'file names from lab names'],
  [slugOf('Orders', ['orders', 'orders-2']) === 'orders-3' && slugOf('!!!', []) === 'lab', 'a taken name gets a number; an empty one a default'],
  [labIdOf('orders.lab.json') === 'orders' && labIdOf('orders.json') === '', 'only *.lab.json files are labs']
]);
