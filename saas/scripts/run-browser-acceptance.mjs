#!/usr/bin/env node
// saas/scripts/run-browser-acceptance.mjs
//
// Runs Browser Agent acceptance against the BUYER'S OWN browser stack, from a pipeline.
//
// Usage (from saas/):
//   node scripts/run-browser-acceptance.mjs ./my-browser-ports.mjs \
//     --adapter browserstack --probe https://app.mycompany.com
//
// The ports module must default-export (or export as a factory returning) an object with:
//
//   buildSessionFactory   the factory builder for the vendor you own — createBrowserstackSessionFactory,
//                         createSeleniumGridSessionFactory, createHyperbrowserSessionFactory, and so on.
//                         Twenty-six are available; you pass the one for YOUR stack.
//   configuration         that vendor's declared keys — hub endpoint, region, actor id, whatever
//                         its catalog contract says.
//   transport             your implementation of the vendor call. You hold the account.
//   credentialBroker      optional. Omit only for a vendor whose contract declares no credential
//                         (Selenium Grid, Playwright MCP, a private fleet).
//   activity              optional. { sinkId, config, primitives } to also prove activity records
//                         reach the destination you chose.
//
// IT SUPPLIES NOTHING OF ITS OWN. No adapter, no transport, no credential, no origin. A default
// anywhere here would test our wiring instead of yours and produce a green result that proves
// nothing about whether your vendor account, network policy and vault work together.
//
// --probe must be an EXACT https origin you control — no path, no trailing slash. One session is
// opened against it through your transport.
//
// Exit codes, so this belongs in a deployment gate:
//   0  every check passed
//   1  the harness ran and at least one check failed
//   2  it could not run at all

import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);

function usage(message) {
  console.error(`\n  ${message}\n`);
  console.error('  usage: node scripts/run-browser-acceptance.mjs <ports-module> --adapter <id> --probe <https-origin>\n');
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

const adapterFlag = flag('--adapter');
const probeOrigin = flag('--probe');
const positional = argv.filter((_, index) => !consumed.has(index) && !argv[index].startsWith('--'));
const modulePath = positional[0] || null;

if (!modulePath) usage('A ports module path is required.');
if (!probeOrigin) usage('--probe <https-origin> is required. Supply an exact origin you control; this harness will not choose one for you.');

let ports;
try {
  const resolved = pathToFileURL(path.resolve(process.cwd(), modulePath)).href;
  const loaded = await import(resolved);
  const exported = loaded.default ?? loaded;
  ports = typeof exported === 'function' ? await exported() : exported;
} catch (error) {
  usage(`Could not load the ports module: ${error?.message || error}`);
}

const adapterId = adapterFlag || ports?.adapterId;
if (!adapterId) usage('--adapter <id> is required, or set adapterId in your ports module.');
if (typeof ports?.buildSessionFactory !== 'function') {
  usage('The ports module must export buildSessionFactory — the factory builder for the vendor you own, e.g. createBrowserstackSessionFactory.');
}
if (typeof ports?.transport?.openSession !== 'function') {
  usage('The ports module must export a transport with an openSession({ configuration, credential }) method. You hold the vendor account, so the vendor call is yours.');
}

const { runBrowserAcceptance } = await import(
  pathToFileURL(path.resolve(process.cwd(), 'lib/portable-browser/index.ts')).href
).catch(async () => import(pathToFileURL(path.resolve(process.cwd(), 'lib/portable-browser/browser-acceptance-harness.ts')).href));

const result = await runBrowserAcceptance({
  adapterId,
  buildSessionFactory: ports.buildSessionFactory,
  configuration: ports.configuration ?? {},
  transport: ports.transport,
  credentialBroker: ports.credentialBroker,
  probeOrigin,
  activity: ports.activity,
});

if (result.refusal) {
  console.error(`\n  ACCEPTANCE REFUSED: ${result.refusal}\n`);
  process.exit(2);
}

const width = Math.max(...result.checks.map(check => check.id.length));
console.log(`\n  Browser Agent acceptance — ${result.passed ? 'PASS' : 'FAIL'}`);
console.log(`  adapter:      ${result.adapterId}`);
console.log(`  probe origin: ${result.probeOrigin}`);
if (result.activitySinkId) console.log(`  activity:     ${result.activitySinkId}`);
console.log(`  ran at:       ${result.ranAt}\n`);
for (const check of result.checks) {
  console.log(`  ${check.passed ? 'pass' : 'FAIL'}  ${check.id.padEnd(width)}  ${check.detail}`);
}

// Called out separately because it is the one failure a buyer must not merely note and move on
// from: it means live credentials would reach their log aggregator.
const canary = result.checks.find(check => check.id === 'credential_absent_from_errors');
if (canary && !canary.passed) {
  console.log('\n  STOP. A live credential survived into an error message. Do not deploy this wiring.');
}

console.log('\n  Record follows. Retain it — it is the acceptance artifact.\n');
console.log(JSON.stringify(result, null, 2));
console.log(`\n  record sha256: ${crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex')}\n`);

process.exit(result.passed ? 0 : 1);
