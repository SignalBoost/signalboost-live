name: SaaS CI

# Runs on every push to main (the working branch) and on pull requests.
# The typecheck job alone catches the class of error that has reached production
# before (e.g. a referenced-but-undefined function), without needing any secrets.

on:
  push:
    branches: [main]
    paths:
      - 'saas/**'
      - '.github/workflows/saas-ci.yml'
  pull_request:
    paths:
      - 'saas/**'
      - '.github/workflows/saas-ci.yml'

permissions:
  contents: read

defaults:
  run:
    working-directory: saas

jobs:
  typecheck:
    name: Typecheck (tsc --noEmit)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm install --no-audit --no-fund
      - name: Typecheck
        run: npx tsc --noEmit

  build:
    name: Production build (next build)
    runs-on: ubuntu-latest
    # Build can compile without real secrets; placeholders satisfy module-load client init.
    env:
      NEXT_TELEMETRY_DISABLED: '1'
      NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co'
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm install --no-audit --no-fund
      - name: Build
        run: npm run build

  test:
    name: Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm install --no-audit --no-fund
      - name: Run tests
        run: npm test
