// Engineering evaluation only: never seed this checker as model-authored evidence.
// Usage: node rounding-probe.cjs /absolute/path/to/money.js
const { resolve } = require('node:path');
const { toCents } = require(resolve(process.argv[2]));

// Integer decimal oracle independent of binary floating-point rounding.
function expectedCents(text) {
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * 100n;
  const rounded = (2n * numerator + scale) / (2n * scale);
  return Number(negative ? -rounded : rounded);
}

const cases = [];
for (let n = 0; n <= 5000; n++) {
  const decimal = `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}`;
  cases.push(decimal, `-${decimal}`);
}
for (const whole of [0, 1, 2, 10, 999]) {
  for (const fraction of ['0049999', '0050000', '0050001', '0149999', '0150000', '0150001', '9949999', '9950000', '9950001', '9999999']) {
    cases.push(`${whole}.${fraction}`, `-${whole}.${fraction}`);
  }
}
const failures = [];
for (const input of cases) {
  const actual = toCents(input);
  const expected = expectedCents(input);
  if (actual !== expected) failures.push({ input, actual, expected });
}
console.log(JSON.stringify({ checked: cases.length, failures: failures.length, examples: failures.slice(0, 6) }));
process.exitCode = failures.length ? 1 : 0;
