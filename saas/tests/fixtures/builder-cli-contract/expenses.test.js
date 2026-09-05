'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseArgs,
  parseCsvLine,
  parseCsv,
  parseAmountToCents,
  isValidDate,
  processExpenses,
  centsToDollars,
} = require('./expenses');

const SAMPLE_CSV = [
  'date,category,amount',
  '2024-01-15,Food,12.50',
  '2024-01-16,Food,7.25',
  '2024-01-17,Travel,45.00',
  '2024-01-18,Food,-3.00',
  '2024-01-19,Utilities,89.99',
].join('\n');

test('normal input produces category totals and overall total', () => {
  const result = processExpenses(SAMPLE_CSV);
  assert.deepEqual(result.byCategory, {
    Food: 16.75,
    Travel: 45,
    Utilities: 89.99,
  });
  assert.equal(result.overall, 151.74);
});

test('categories are sorted alphabetically', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Zeta,1.00',
    '2024-01-02,Alpha,2.00',
    '2024-01-03,Mike,3.00',
  ].join('\n');
  const result = processExpenses(csv);
  assert.deepEqual(Object.keys(result.byCategory), ['Alpha', 'Mike', 'Zeta']);
});

test('0.10 + 0.20 equals exactly 0.30', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Test,0.10',
    '2024-01-02,Test,0.20',
  ].join('\n');
  const result = processExpenses(csv);
  assert.equal(result.byCategory.Test, 0.3);
  assert.equal(result.overall, 0.3);
});

test('negative amounts are treated as refunds', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Food,10.00',
    '2024-01-02,Food,-2.50',
  ].join('\n');
  const result = processExpenses(csv);
  assert.equal(result.byCategory.Food, 7.5);
  assert.equal(result.overall, 7.5);
});

test('quoted fields with commas are parsed correctly', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,"Food, Drinks",5.00',
  ].join('\n');
  const result = processExpenses(csv);
  assert.equal(result.byCategory['Food, Drinks'], 5);
});

test('CRLF line endings are supported', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Food,1.00',
    '2024-01-02,Food,2.00',
  ].join('\r\n');
  const result = processExpenses(csv);
  assert.equal(result.byCategory.Food, 3);
});

test('escaped quotes inside quoted fields are handled', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,"Food ""Fast""",5.00',
  ].join('\n');
  const result = processExpenses(csv);
  assert.equal(result.byCategory['Food "Fast"'], 5);
});

test('--category filter includes only matching rows', () => {
  const result = processExpenses(SAMPLE_CSV, 'Food');
  assert.deepEqual(result.byCategory, { Food: 16.75 });
  assert.equal(result.overall, 16.75);
});

test('invalid date is rejected', () => {
  const csv = [
    'date,category,amount',
    '2024-02-30,Food,5.00',
  ].join('\n');
  assert.throws(() => processExpenses(csv), /Invalid date at row 2/);
});

test('missing columns are rejected', () => {
  const csv = [
    'date,category',
    '2024-01-01,Food',
  ].join('\n');
  assert.throws(
    () => processExpenses(csv),
    /CSV must contain date, category, and amount columns/
  );
});

test('malformed amount is rejected', () => {
  const csv = [
    'date,category,amount',
    '2024-01-01,Food,12.345',
  ].join('\n');
  assert.throws(() => processExpenses(csv), /Invalid amount: 12.345/);
});

test('empty CSV is rejected', () => {
  assert.throws(() => processExpenses(''), /CSV file is empty/);
});

test('parseArgs handles --category and positional file', () => {
  assert.deepEqual(parseArgs(['node', 'expenses.js', 'sample.csv', '--category', 'Food']), {
    file: 'sample.csv',
    categoryFilter: 'Food',
  });
  assert.deepEqual(parseArgs(['node', 'expenses.js', 'sample.csv', '--category=Food']), {
    file: 'sample.csv',
    categoryFilter: 'Food',
  });
});

test('parseArgs rejects missing file', () => {
  assert.throws(() => parseArgs(['node', 'expenses.js']), /Usage:/);
});

test('parseCsvLine handles quoted comma and escaped quote', () => {
  assert.deepEqual(parseCsvLine('"a,b","c""d",e'), ['a,b', 'c"d', 'e']);
});

test('parseAmountToCents converts dollars to integer cents', () => {
  assert.equal(parseAmountToCents('0.10'), 10);
  assert.equal(parseAmountToCents('0.20'), 20);
  assert.equal(parseAmountToCents('-2.50'), -250);
  assert.equal(parseAmountToCents('5'), 500);
});

test('centsToDollars formats cents as decimal dollars', () => {
  assert.equal(centsToDollars(30), 0.3);
  assert.equal(centsToDollars(1675), 16.75);
  assert.equal(centsToDollars(-250), -2.5);
});

test('isValidDate validates real calendar dates', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2023-02-29'), false);
  assert.equal(isValidDate('2024-13-01'), false);
  assert.equal(isValidDate('2024-01-32'), false);
  assert.equal(isValidDate('01-02-2024'), false);
});


// Process-level contract: exercise the executable, including exit codes and stderr.
const { spawnSync } = require('node:child_process');
const fsp = require('node:fs');
const ospath = require('node:path');
const osmod = require('node:os');
const CLI = ospath.join(__dirname, 'expenses.js');

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'CLI must exit normally, not be killed');
  assert.ok(Number.isInteger(result.status), 'CLI must return an exit code');
  return result;
}

function tempDirectory(t) {
  const dir = fsp.mkdtempSync(ospath.join(osmod.tmpdir(), 'expenses-cli-'));
  t.after(() => fsp.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function withCsv(t, content) {
  const file = ospath.join(tempDirectory(t), 'input.csv');
  fsp.writeFileSync(file, content);
  return file;
}

const FAILING_INPUTS = [
  ['invalid date', 'date,category,amount\n2024-02-30,Food,5.00\n', /Invalid date/],
  ['missing columns', 'date,category\n2024-01-01,Food\n', /must contain date, category, and amount/],
  ['malformed amount', 'date,category,amount\n2024-01-01,Food,12.345\n', /Invalid amount/],
  ['empty CSV', '', /empty/i],
  ['unclosed quoted field', 'date,category,amount\n2024-01-01,"Food,5.00\n', /Unclosed quoted field/],
  ['wrong field count', 'date,category,amount\n2024-01-01,Food\n', /expected 3/],
  ['empty category', 'date,category,amount\n2024-01-01,,5.00\n', /Missing category/],
];

function assertCliFailure(result, pattern) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^Error: /m);
  assert.match(result.stderr, pattern);
  assert.equal(result.stdout, '', 'failed runs must not emit reports');
}

for (const [label, csv, pattern] of FAILING_INPUTS) {
  test(`CLI exits nonzero and explains ${label}`, (t) => {
    assertCliFailure(runCli([withCsv(t, csv)]), pattern);
  });
}

test('CLI rejects a nonexistent file', (t) => {
  assertCliFailure(runCli([ospath.join(tempDirectory(t), 'absent.csv')]), /ENOENT|no such file/i);
});

test('CLI rejects usage errors', (t) => {
  const file = withCsv(t, 'date,category,amount\n2024-01-01,Food,1.00\n');
  assertCliFailure(runCli([]), /Usage:/);
  assertCliFailure(runCli([file, '--totals']), /Unknown option/);
  assertCliFailure(runCli([file, '--category']), /--category requires a value/);
});

test('CLI prints correct JSON and exact decimal addition', (t) => {
  const file = withCsv(t, [
    'date,category,amount', '2024-01-01,Food,0.10',
    '2024-01-02,Food,0.20', '2024-01-03,"Food, Drinks",5.00',
    '2024-01-04,Travel,45.00',
  ].join('\n'));
  const result = runCli([file]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(report.byCategory), ['Food', 'Food, Drinks', 'Travel']);
  assert.deepEqual(report, { byCategory: { Food: 0.3, 'Food, Drinks': 5, Travel: 45 }, overall: 50.3 });
});

test('CLI supports both category filter forms', (t) => {
  const file = withCsv(t, 'date,category,amount\n2024-01-01,Food,10.00\n2024-01-02,Travel,45.00\n');
  for (const args of [['--category', 'Food'], ['--category=Food']]) {
    const result = runCli([file, ...args]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { byCategory: { Food: 10 }, overall: 10 });
  }
});
