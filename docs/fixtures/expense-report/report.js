const { toCents } = require('./money');
function summarize(entries) {
  const posted = entries.filter(entry => entry.status === 'posted');
  return {
    count: posted.length,
    totalCents: posted.reduce((sum, entry) => sum + Math.abs(toCents(entry.amount)), 0),
  };
}
module.exports = { summarize };
