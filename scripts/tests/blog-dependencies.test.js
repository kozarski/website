const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const blogRequire = createRequire(path.resolve(__dirname, '../../blog/package.json'));
const copy = blogRequire('@11ty/recursive-copy');

test('Eleventy copy dependency supports glob filters, exclusions, and binary assets', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'website-copy-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'source');
  const destination = path.join(dir, 'destination');
  await fs.mkdir(path.join(source, 'nested'), { recursive: true });
  const asset = Buffer.from([0, 255, 12, 128]);
  await fs.writeFile(path.join(source, 'nested', 'photo.png'), asset);
  await fs.writeFile(path.join(source, 'nested', 'style.css'), 'body { color: red; }');
  await fs.writeFile(path.join(source, 'nested', 'private.css'), 'excluded');
  await fs.writeFile(path.join(source, 'notes.txt'), 'excluded');
  await copy(source, destination, { filter: ['**/*.{png,css}', '!**/private.css'] });
  assert.deepEqual(await fs.readFile(path.join(destination, 'nested', 'photo.png')), asset);
  assert.equal(await fs.readFile(path.join(destination, 'nested', 'style.css'), 'utf8'), 'body { color: red; }');
  await assert.rejects(fs.access(path.join(destination, 'nested', 'private.css')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(destination, 'notes.txt')), { code: 'ENOENT' });
});
