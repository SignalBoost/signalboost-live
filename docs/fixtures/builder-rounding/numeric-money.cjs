const isNumber = require('is-number');
function toCents(value) {
  if (!isNumber(value)) throw new Error('Invalid amount');
  const text = String(value);
  const sign = text.startsWith('-') ? -1 : 1;
  const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
  const digits = (fraction + '00').slice(0, 3);
  const cents = Number(whole) * 100 + Number(digits.slice(0, 2));
  const third = Number(digits[2]);
  const remainder = fraction.slice(2);
  const roundUp = third > 5 || (third === 5 && (/[1-9]/.test(remainder)));
  return Math.round(sign * (cents + (roundUp ? 1 : 0)));
}
module.exports = { toCents };
