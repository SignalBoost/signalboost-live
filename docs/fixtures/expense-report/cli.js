const fs = require('node:fs');
const { summarize } = require('./report');
try {
  const entries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(summarize(entries)));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
