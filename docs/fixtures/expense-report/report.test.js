const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { toCents } = require('./money');
const { summarize } = require('./report');
const entries = require('./sample.json');
test('decimal conversion is exact for cents', () => {
  assert.equal(toCents('12.50'), 1250);
  assert.equal(toCents('-2.50'), -250);
});
test('invalid amounts are rejected', () => assert.throws(() => toCents('oops'), /Invalid amount/));
test('empty report is zero', () => assert.deepEqual(summarize([]), { count: 0, totalCents: 0 }));
test('void entries are excluded', () => assert.deepEqual(summarize([{ amount: '100', status: 'void' }]), { count: 0, totalCents: 0 }));
test('refunds reduce posted totals', () => assert.deepEqual(summarize(entries), { count: 3, totalCents: 1425 }));
test('CLI follows the same report contract', () => {
  const output = execFileSync(process.execPath, ['cli.js', 'sample.json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), { count: 3, totalCents: 1425 });
});
test('CLI reports missing input with a failure exit code', () => {
  const result = spawnSync(process.execPath, ['cli.js', 'does-not-exist.json'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
});
