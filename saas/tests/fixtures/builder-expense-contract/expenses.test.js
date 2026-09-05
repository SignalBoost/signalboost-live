const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runCli(args, input) {
  const result = spawnSync(process.execPath, ['expenses.js', ...args], {
    input,
    encoding: 'utf8',
  });
  return result;
}

function makeTempCsv(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expenses-test-'));
  const file = path.join(dir, 'input.csv');
  fs.writeFileSync(file, content);
  return file;
}

const basicCsv = [
  'date,category,amount',
  '2024-01-01,Food,10.00',
  '2024-01-02,Food,20.00',
  '2024-01-03,Travel,5.50',
].join('\n');

test('totals by category and overall for normal input', () => {
  const file = makeTempCsv(basicCsv);
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.byCategory, {
    Food: "30.00",
    Travel: "5.50",
  });
  assert.equal(output.overall, "35.50");
});

test('sorts categories alphabetically', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Zulu,1.00',
    '2024-01-01,Alpha,2.00',
    '2024-01-01,Mike,3.00',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(output.categories), ['Alpha', 'Mike', 'Zulu']);
});

test('supports quoted fields with commas inside quotes', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,"Food, Drinks",12.34',
    '2024-01-02,Travel,5.00',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.categories, {
    'Food, Drinks': 1234,
    Travel: 500,
  });
  assert.equal(output.total, 1734);
});

test('supports CRLF line endings', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Food,10.00',
    '2024-01-02,Food,20.00',
  ].join('\r\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.categories.Food, 3000);
  assert.equal(output.total, 3000);
});

test('allows negative amounts for refunds', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Food,10.00',
    '2024-01-02,Food,-3.50',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.categories.Food, 650);
  assert.equal(output.total, 650);
});

test('0.10 + 0.20 equals exactly 0.30', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Test,0.10',
    '2024-01-02,Test,0.20',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.categories.Test, 30);
  assert.equal(output.total, 30);
});

test('supports --category filter', () => {
  const file = makeTempCsv(basicCsv);
  const result = runCli([file, '--category', 'Food']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.categories, { Food: 3000 });
  assert.equal(output.total, 3000);
});

test('rejects invalid dates with nonzero exit code', () => {
  const csv = [
    'date,category,amount',
    'not-a-date,Food,10.00',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /date/i);
});

test('rejects missing columns with nonzero exit code', () => {
  const csv = [
    'date,category',
    '2024-01-01,Food',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /column/i);
});

test('rejects malformed amounts with nonzero exit code', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Food,abc',
  ].join('\n');
  const file = makeTempCsv(csv);
  const result = runCli([file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /amount/i);
});

test('rejects missing file with nonzero exit code', () => {
  const result = runCli(['does-not-exist.csv']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /file|ENOENT/i);
});

test('rejects empty CSV with nonzero exit code', () => {
  const file = makeTempCsv('');
  const result = runCli([file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /header|column|empty/i);
});

