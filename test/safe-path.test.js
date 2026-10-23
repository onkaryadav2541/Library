import {test} from 'node:test';
import assert from 'node:assert/strict';
import {win32, posix} from 'node:path';
import {isWithinRoot} from '../safe-path.js';

for (const [name, api, root] of [
  ['Windows', win32, 'C:\\Users\\Onkar\\Downloads\\Library-main (1)\\Library-main\\public'],
  ['Linux', posix, '/workspace/Library/public']
]) {
  test(`${name}: homepage, assets, and nested books are accessible`, () => {
    for (const file of ['index.html', 'app.js', 'style.css', 'books/1342.txt']) {
      assert.equal(isWithinRoot(root, api.resolve(root, file), api), true);
    }
  });
  test(`${name}: parent paths and similarly named sibling directories are blocked`, () => {
    for (const file of ['../server.js', '../public-other/secret.txt', '..', '.']) {
      assert.equal(isWithinRoot(root, api.resolve(root, file), api), false);
    }
    if (name === 'Windows') assert.equal(isWithinRoot(root, 'D:\\secret.txt', api), false);
  });
}
