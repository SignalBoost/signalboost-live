#!/usr/bin/env node
'use strict';

const fs = require('fs');

function parseArgs(argv) {
  const args = argv.slice(2);
  let categoryFilter = null;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--category') {
      if (i + 1 >= args.length) {
        throw new Error('--category requires a value');
      }
      categoryFilter = args[i + 1];
      i++;
    } else if (arg.startsWith('--category=')) {
      categoryFilter = arg.slice('--category='.length);
      if (categoryFilter === '') {
        throw new Error('--category requires a value');
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error('Usage: node expenses.js [--category <name>] <csv-file>');
  }

  return { file: positional[0], categoryFilter };
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  if (inQuotes) {
    throw new Error('Unterminated quoted field');
  }

  fields.push(current);
  return fields;
}

function parseCsv(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      current += ch;
      if (ch === '"') {
        if (i + 1 < content.length && content[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        current += ch;
      } else if (ch === '\n') {
        lines.push(current);
        current = '';
      } else if (ch === '\r') {
        if (i + 1 < content.length && content[i + 1] === '\n') {
          i++;
        }
        lines.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }

  if (inQuotes) {
    throw new Error('Unterminated quoted field');
  }

  if (current !== '') {
    lines.push(current);
  }

  return lines;
}

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function parseAmount(amountStr) {
  if (typeof amountStr !== 'string') {
    throw new Error('Malformed amount: missing value');
  }

  const trimmed = amountStr.trim();
  const match = /^-?\d+(\.\d{1,2})?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Malformed amount: ${amountStr}`);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const parts = unsigned.split('.');
  const whole = parts[0];
  const fraction = parts.length === 2 ? parts[1].padEnd(2, '0') : '00';

  let cents = Number(whole) * 100 + Number(fraction);
  if (negative) cents = -cents;

  if (!Number.isSafeInteger(cents)) {
    throw new Error(`Malformed amount: ${amountStr}`);
  }

  return cents;
}

function formatCents(cents) {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function processExpenses(content, categoryFilter) {
  const lines = parseCsv(content);
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  const header = parseCsvLine(lines[0]);
  const dateIdx = header.indexOf('date');
  const categoryIdx = header.indexOf('category');
  const amountIdx = header.indexOf('amount');

  if (dateIdx === -1 || categoryIdx === -1 || amountIdx === -1) {
    throw new Error('Missing required columns: date,category,amount');
  }

  const totals = new Map();

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;

    const fields = parseCsvLine(lines[i]);
    if (fields.length < Math.max(dateIdx, categoryIdx, amountIdx) + 1) {
      throw new Error(`Row ${i + 1}: missing fields`);
    }

    const date = fields[dateIdx].trim();
    const category = fields[categoryIdx].trim();
    const amountStr = fields[amountIdx];

    if (!isValidDate(date)) {
      throw new Error(`Row ${i + 1}: invalid date: ${date}`);
    }

    if (category === '') {
      throw new Error(`Row ${i + 1}: empty category`);
    }

    const cents = parseAmount(amountStr);

    if (categoryFilter !== null && category !== categoryFilter) {
      continue;
    }

    totals.set(category, (totals.get(category) || 0) + cents);
  }

  const sortedCategories = Array.from(totals.keys()).sort();
  const byCategory = {};
  let overall = 0;

  for (const category of sortedCategories) {
    const cents = totals.get(category);
    byCategory[category] = formatCents(cents);
    overall += cents;
  }

  return {
    categories: byCategory,
    total: overall
  };
}

function main() {
  try {
    const { file, categoryFilter } = parseArgs(process.argv);
    const content = fs.readFileSync(file, 'utf8');
    const result = processExpenses(content, categoryFilter);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseCsvLine,
  parseCsv,
  isValidDate,
  parseAmount,
  formatCents,
  processExpenses
};

