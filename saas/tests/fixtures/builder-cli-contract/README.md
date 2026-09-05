# Expense Report CLI

A Node.js command-line tool that reads a CSV file of expenses and produces JSON totals by category and overall, using only built-in modules.

## Requirements

- Node.js 18 or newer (uses the built-in `node:test` runner for tests).

## Usage

```bash
node expenses.js sample.csv
node expenses.js sample.csv --category Food
node expenses.js sample.csv --category=Food
```

### Options

- `--category <name>` or `--category=<name>`: only include rows whose category exactly matches `<name>`.

## CSV Format

The input CSV must have a header row with exactly these columns:

```csv
date,category,amount
```

- `date`: `YYYY-MM-DD` calendar date. Invalid dates such as `2024-02-30` are rejected.
- `category`: non-empty category name. Quoted fields, commas inside quotes, and escaped quotes (`""`) are supported.
- `amount`: decimal dollar amount with up to two decimal places. Negative amounts are treated as refunds.

Both LF and CRLF line endings are supported.

Example:

```csv
date,category,amount
2024-01-15,Food,12.50
2024-01-16,Food,7.25
2024-01-17,Travel,45.00
2024-01-18,Food,-3.00
2024-01-19,Utilities,89.99
2024-01-20,"Food, Drinks",5.00
2024-01-21,Food,0.10
2024-01-22,Food,0.20
```

## Output

The CLI writes JSON to stdout with categories sorted alphabetically:

```json
{
  "byCategory": {
    "Food": 17.05,
    "Food, Drinks": 5,
    "Travel": 45,
    "Utilities": 89.99
  },
  "overall": 157.04
}
```

Amounts are calculated exactly using integer cents, so `0.10 + 0.20` is exactly `0.30`.

## Errors

Invalid dates, missing columns, malformed amounts, empty files, and malformed CSV cause a clear error on stderr and a nonzero exit code.

## Tests

Run the automated test suite with:

```bash
node --test expenses.test.js
```

