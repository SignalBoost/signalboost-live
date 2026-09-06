const isNumber = require('is-number');
function toCents(value) {
  if (!isNumber(value)) throw new Error('Invalid amount');
  return Math.round(Number(value) * 100);
}
module.exports = { toCents };
