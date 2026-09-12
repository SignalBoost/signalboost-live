// Known-regression checks for reviewed dependency floors, not a security certification.
// A fresh npm audit and application CI remain independent release requirements.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = process.argv[2] ?? '.';
assert.ok(['.', 'saas'].includes(workspace), 'Expected workspace . or saas');
const directory = resolve(fileURLToPath(new URL('..', import.meta.url)), workspace);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson(resolve(directory, 'package.json'));
const lock = readJson(resolve(directory, 'package-lock.json'));
assert.equal(lock.lockfileVersion, 3, 'Expected npm lockfile v3');
assert.equal(lock.name, manifest.name, 'Root lockfile identity is stale');
assert.equal(lock.packages[''].name, manifest.name, 'Locked workspace identity is stale');
for (const field of ['dependencies', 'devDependencies']) {
  assert.deepEqual(lock.packages[''][field] ?? {}, manifest[field] ?? {}, `${workspace}: stale ${field}`);
  for (const name of Object.keys(manifest[field] ?? {})) {
    assert.ok(lock.packages[`node_modules/${name}`], `${workspace}: missing locked dependency ${name}`);
  }
}

// Each floor is the compatible patched release verified in the September 2026 repair.
// Check nested copies as well; removing a direct dependency cannot hide an old nested copy.
const floors = {
  next: '16.3.5', postcss: '8.5.23', browserslist: '4.28.7',
  'baseline-browser-mapping': '2.11.0', 'form-data': '4.0.6', nanoid: '3.3.18',
  'postcss-selector-parser': '6.1.3', 'brace-expansion': '1.1.18',
  'js-yaml': '3.15.2', qs: '6.16.0', sharp: '0.35.4',
};
function atLeast(version, floor) {
  // Prereleases and non-registry resolutions never satisfy a reviewed stable floor.
  const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  assert.ok(pattern.test(version), `Unverified stable version ${version}`);
  const actual = version.split('.').map(Number);
  const minimum = floor.split('.').map(Number);
  assert.ok(actual.every(Number.isSafeInteger), 'Unbounded version number');
  for (let i = 0; i < 3; i++) if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  return true;
}
let checked = 0;
for (const [path, entry] of Object.entries(lock.packages)) {
  const name = path.split('node_modules/').at(-1);
  if (!Object.hasOwn(floors, name)) continue;
  assert.ok(atLeast(entry.version, floors[name]), `${workspace}/${path}: ${entry.version} is below reviewed floor ${floors[name]}`);
  checked++;
}
assert.ok(checked > 0, 'No reviewed dependencies were inspected');
console.log(`${workspace}: manifest/lock agreement and ${checked} reviewed dependency versions passed`);

if (process.argv.includes('--smoke')) {
  const require = createRequire(resolve(directory, 'package.json'));
  for (const name of ['next', 'postcss', 'browserslist', 'form-data', 'nanoid', 'sharp']) {
    // Inspect the installed lockfile path, not an optional package.json export.
    const installed = readJson(resolve(directory, 'node_modules', name, 'package.json'));
    assert.equal(installed.version, lock.packages[`node_modules/${name}`].version, `${name}: installed/locked version mismatch`);
  }
  const browsers = require('browserslist')('last 1 Chrome version');
  assert.ok(browsers.length > 0 && browsers[0].startsWith('chrome '));
  const css = await require('postcss')([require('autoprefixer')]).process('a { display: flex; }', { from: undefined });
  assert.match(css.css, /display:\s*flex/);
  const FormData = require('form-data');
  const form = new FormData();
  form.append('safe\r\nX-Injected: yes', Buffer.from('ok'), { filename: 'safe\r\nX-Injected: yes.txt' });
  const body = form.getBuffer().toString('utf8');
  assert.ok(!body.includes('\r\nX-Injected: yes'), 'Multipart field/filename newline was not escaped');
  assert.ok(body.includes('%0D%0A'), 'Expected escaped multipart newline');
  assert.equal(require('nanoid').nanoid(21).length, 21);
  assert.deepEqual(require('qs').parse('a[b]=1'), { a: { b: '1' } });
  assert.equal(require('js-yaml').safeLoad('answer: 42').answer, 42);
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  assert.equal((await sharp(image).metadata()).width, 1);
  console.log(`${workspace}: CSS, browser queries, multipart escaping, identifiers, query/YAML parsing and native image smoke checks passed`);
}
