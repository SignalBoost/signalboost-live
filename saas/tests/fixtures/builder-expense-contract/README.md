# Expense Report CLI

A Node.js command-line tool that reads a CSV file of expenses and produces JSON totals by category and overall.

## Requirements

- Node.js 24 or newer (uses only built-in modules).
- No external dependencies.

## CSV Format

The input CSV must contain a header row with exactly the columns `date`, `category`, and `amount` (any order).

- Dates must be valid `YYYY-MM-DD` calendar dates.
- Amounts are parsed as decimal strings and converted to integer cents for exact money arithmetic.
- Negative amounts are allowed and represent refunds.
- Quoted fields, commas inside quotes, and CRLF line endings are supported.

Example `sample.csv`:

```csv
date,category,amount
2024-01-01,Food,10.20
2024-01-02,Food,0.20
2024-01-03,"Transport, Local",-2.50
```

## Usage

```bash
node expenses.js sample.csv
```

Optional category filter:

```bash
node expenses.js sample.csv --category Food
```

## Output

JSON with categories sorted alphabetically and an `overall` total:

```json
{
  "categories": {
    "Food": "10.40",
    "Transport, Local": "-2.50"
  },
  "overall": "7.90"
}
```

All monetary values are formatted with exactly two decimal places.

## Errors

Invalid dates, missing columns, malformed amounts, and unreadable files produce a clear error message on stderr and a nonzero exit code.

## Tests

Run the test suite with:

```bash
node --test expenses.test.js
```

The tests cover normal input, quoted fields with commas, CRLF line endings, negative amounts, exact decimal arithmetic (including `0.10 + 0.20 === 0.30`), invalid dates, missing columns, malformed amounts, category filtering, and alphabetical category sorting.

