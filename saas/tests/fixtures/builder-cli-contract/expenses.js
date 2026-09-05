#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

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
      categoryFilter = args[++i];
    } else if (arg.startsWith('--category=')) {
      categoryFilter = arg.slice('--category='.length);
      if (!categoryFilter) {
        throw new Error('--category requires a value');
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error('Usage: node expenses.js <csv-file> [--category <name>]');
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
    throw new Error('Unclosed quoted field in CSV');
  }

  fields.push(current);
  return fields;
}

function parseCsv(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const rows = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    rows.push(parseCsvLine(line));
  }
  return rows;
}

function parseAmountToCents(raw) {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid amount: ${raw}`);
  }

  const trimmed = raw.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid amount: ${raw}`);
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ''] = unsigned.split('.');
  const cents = parseInt(whole, 10) * 100 + parseInt(fraction.padEnd(2, '0'), 10);
  return negative ? -cents : cents;
}

function isValidDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function processExpenses(csvContent, categoryFilter = null) {
  const rows = parseCsv(csvContent);

  if (rows.length === 0) {
    throw new Error('CSV file is empty');
  }

  const header = rows[0];
  const dateIdx = header.indexOf('date');
  const categoryIdx = header.indexOf('category');
  const amountIdx = header.indexOf('amount');

  if (dateIdx === -1 || categoryIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must contain date, category, and amount columns');
  }

  const totals = new Map();
  let overall = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== header.length) {
      throw new Error(`Row ${i + 1} has ${row.length} fields, expected ${header.length}`);
    }

    const date = row[dateIdx].trim();
    const category = row[categoryIdx].trim();
    const amountRaw = row[amountIdx];

    if (!isValidDate(date)) {
      throw new Error(`Invalid date at row ${i + 1}: ${row[dateIdx]}`);
    }

    if (!category) {
      throw new Error(`Missing category at row ${i + 1}`);
    }

    const cents = parseAmountToCents(amountRaw);

    if (categoryFilter !== null && category !== categoryFilter) {
      continue;
    }

    totals.set(category, (totals.get(category) || 0) + cents);
    overall += cents;
  }

  const categories = Array.from(totals.keys()).sort();
  const byCategory = {};
  for (const category of categories) {
    byCategory[category] = centsToDollars(totals.get(category));
  }

  return {
    byCategory,
    overall: centsToDollars(overall),
  };
}

function centsToDollars(cents) {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const formatted = `${whole}.${String(fraction).padStart(2, '0')}`;
  return Number(negative ? `-${formatted}` : formatted);
}

function main() {
  try {
    const { file, categoryFilter } = parseArgs(process.argv);
    const csvContent = fs.readFileSync(file, 'utf8');
    const result = processExpenses(csvContent, categoryFilter);
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
  parseAmountToCents,
  isValidDate,
  processExpenses,
  centsToDollars,
};

