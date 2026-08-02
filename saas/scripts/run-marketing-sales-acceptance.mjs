#!/usr/bin/env node
// saas/scripts/run-marketing-sales-acceptance.mjs
//
// Runs Marketing + Sales acceptance against the BUYER'S adapter and ad account.
//
// Usage (from saas/):
//   node scripts/run-marketing-sales-acceptance.mjs ./my-ad-platform.mjs \
//     --account act-123 --token "$ADS_TOKEN" \
//     --landing https://mycompany.com/offer --approver cfo@mycompany.com \
//     [--currency USD] [--cap 100]
//
// The module must default-export an AdPlatformAdapter, or a factory returning one.
//
// THIS CREATES ONE REAL CAMPAIGN ON THE ACCOUNT YOU NAME. It is created PAUSED with the
// smallest cap you allow, its spend is read back, and it is then explicitly paused again —
// the pause is the point, because being able to stop a campaign is the capability nobody
// tests until they need it at 2am. Nothing spends. Delete the campaign afterwards; the run
// prints its id.
//
// It supplies no adapter, no account, no token, no landing URL and no approver. Every one of
// those is refused rather than defaulted: a default would test our wiring instead of yours,
// and a live campaign belongs on an account you nominate.
//
// Exit codes:
//   0  every check passed
//   1  the harness ran and at least one check failed
//   2  it could not run at all

import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);

function usage(message) {
  console.error(`\n  ${message}\n`);
  console.error('  usage: node scripts/run-marketing-sales-acceptance.mjs <adapter-module> \\');
  console.error('           --account <ref> --token <token> --landing <url> --approver <name> \\');
  console.error('           [--currency USD] [--cap <minor-units>]\n');
  process.exit(2);
}

// Flag values are marked consumed first; the positional is whatever is left. Found by
// elimination rather than by assuming it comes first.
const consumed = new Set();
function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  consumed.add(index);
  consumed.add(index + 1);
  return argv[index + 1] ?? null;
}

const accountRef = flag('--account');
const accessToken = flag('--token');
const landingUrl = flag('--landing');
const spendApprovedBy = flag('--approver');
const currency = flag('--currency') || 'USD';
const capRaw = flag('--cap');
const positional = argv.filter((_, index) => !consumed.has(index) && !argv[index].startsWith('--'));
const modulePath = positional[0] || null;

if (!modulePath) usage('An adapter module path is required.');
if (!accountRef) usage('--account <ref> is required. This runs against your ad account, not a simulated one.');
if (!accessToken) usage('--token <token> is required. It is read from your argument and nowhere else.');
if (!landingUrl) usage('--landing <url> is required — an ad that leads nowhere still costs money.');
if (!spendApprovedBy) usage('--approver <name> is required. Approving the creative is not approving the budget.');

const capMinor = capRaw == null ? 100 : Number(capRaw);
if (!Number.isInteger(capMinor) || capMinor <= 0) usage('--cap must be a positive whole number of MINOR units (cents, not dollars).');

let adapter;
try {
  const resolved = pathToFileURL(path.resolve(process.cwd(), modulePath)).href;
  const loaded = await import(resolved);
  const exported = loaded.default ?? loaded;
  adapter = typeof exported === 'function' ? await exported() : exported;
} catch (error) {
  usage(`Could not load the adapter module: ${error?.message || error}`);
}

for (const method of ['createCampaign', 'fetchSpend', 'pauseCampaign']) {
  if (typeof adapter?.[method] !== 'function') {
    usage(`The adapter must implement ${method}(). A platform that can start spending but cannot report spend or be stopped must never be registered.`);
  }
}

const { runMarketingSalesAcceptance } = await import(
  pathToFileURL(path.resolve(process.cwd(), 'lib/outreach/marketing-sales-portable.ts')).href
).catch(async () => import(pathToFileURL(path.resolve(process.cwd(), 'lib/outreach/marketing-sales-acceptance.ts')).href));

const result = await runMarketingSalesAcceptance({
  adapter,
  accountRef,
  accessToken,
  landingUrl,
  spendApprovedBy,
  currency,
  capMinor,
});

if (result.refusal) {
  console.error(`\n  ACCEPTANCE REFUSED: ${result.refusal}\n`);
  process.exit(2);
}

const width = Math.max(...result.checks.map(check => check.id.length));
console.log(`\n  Marketing + Sales acceptance — ${result.passed ? 'PASS' : 'FAIL'}`);
console.log(`  platform: ${result.platform}`);
console.log(`  account:  ${result.accountRef}`);
console.log(`  ran at:   ${result.ranAt}\n`);
for (const check of result.checks) {
  console.log(`  ${check.passed ? 'pass' : 'FAIL'}  ${check.id.padEnd(width)}  ${check.detail}`);
}

if (result.campaignCreated) {
  console.log(`\n  A campaign was created on your account: ${result.campaignCreated}`);
  console.log('  It was created paused and paused again. Delete it when you are done.');
  const stopped = result.checks.find(check => check.id === 'campaign_stopped');
  if (stopped && !stopped.passed) {
    console.log('\n  WARNING: the pause was NOT acknowledged. Stop this campaign in the ad console now.');
  }
}

console.log('\n  Record follows. Retain it — it is the acceptance artifact.\n');
console.log(JSON.stringify(result, null, 2));
console.log(`\n  record sha256: ${crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')}\n`);

process.exit(result.passed ? 0 : 1);
