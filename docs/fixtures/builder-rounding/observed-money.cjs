const isNumber = require('is-number');
function toCents(value) {
  if (!isNumber(value)) throw new Error('Invalid amount');
  const cents = Number(value) * 100;
  return Math.sign(cents) * Math.round(Math.abs(cents) + Number.EPSILON * Math.abs(cents) + 0.0001);
}
module.exports = { toCents };
