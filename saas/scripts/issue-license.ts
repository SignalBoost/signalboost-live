// saas/scripts/issue-license.ts
//
// Seller side. Mints a signed licence token for one buyer.
//
// Run with type stripping, from saas/:
//
//   node --experimental-strip-types scripts/issue-license.ts --genkey
//
//   node --experimental-strip-types scripts/issue-license.ts \
//     --key-file /secure/issuer.key \
//     --issuer signalboost \
//     --product self-healing-supervisor \
//     --licensee "Buyer GmbH" \
//     --edition enterprise \
//     --seats 25 --days 365 --grace 14
//
// Features come from the edition's entry in the catalogue unless --features
// overrides them, and either way they are checked against the catalogue before
// anything is signed. A feature name no code checks produces a licence that
// silently unlocks nothing: the buyer pays, the gate refuses, and nobody finds
// out until an incident.
//
// The private key is read from a file you point at, never from this repository
// and never from an environment variable, so it does not end up in a shell
// history, a process listing or a CI log.

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { generateIssuerKeyPair, issueLicense } from '../portable-license/index.ts';
import {
  assertIssuableFeatures,
  catalogFor,
  editionNames,
  featuresForEdition,
} from '../portable-license/catalog.ts';
import type { PortableLicenseClaims } from '../portable-license/index.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function die(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function required(name: string): string {
  const v = arg(name);
  if (!v) die(`missing --${name}`);
  return v;
}

if (has('genkey')) {
  const { publicKeyPem, privateKeyPem } = generateIssuerKeyPair();
  console.log('\n  Issuer key pair generated.\n');
  console.log('  PRIVATE KEY — put this in your vault. It is the only thing standing');
  console.log('  between anyone and a licence that verifies. It is not recoverable.\n');
  console.log(privateKeyPem);
  console.log('  PUBLIC KEY — ships in every buyer deployment as configuration.\n');
  console.log(publicKeyPem);
  process.exit(0);
}

const keyFile = required('key-file');
if (!fs.existsSync(keyFile)) die(`key file not found: ${keyFile}`);
const privateKeyPem = fs.readFileSync(keyFile, 'utf8');

const productId = required('product');
const edition = arg('edition') ?? 'standard';
const skipCatalog = has('no-catalog-check');

let features: string[];
const explicit = arg('features');

if (explicit) {
  features = explicit
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
} else {
  const fromEdition = featuresForEdition(productId, edition);
  if (!fromEdition) {
    die(
      catalogFor(productId)
        ? `"${edition}" is not an edition of ${productId}. Known editions: ${editionNames(productId).join(', ')}.`
        : `No feature catalogue for "${productId}", so --features cannot be inferred. Pass --features explicitly.`,
    );
  }
  features = fromEdition;
}

if (skipCatalog) {
  console.warn('\n  WARNING: --no-catalog-check is set. Feature names are NOT being verified');
  console.warn('  against any capability in the code. A typo here becomes a licence that');
  console.warn('  unlocks nothing.\n');
  if (features.length === 0) die('a licence with no features unlocks nothing');
} else {
  try {
    assertIssuableFeatures(productId, features);
  } catch (err) {
    die(`${(err as Error).message}\n\n  Pass --no-catalog-check to override, but read that message first.`);
  }
}

const days = Number(arg('days') ?? '365');
const grace = Number(arg('grace') ?? '14');
const seatsRaw = arg('seats');
const executionsRaw = arg('max-executions');

if (!has('perpetual') && (!Number.isFinite(days) || days <= 0)) {
  die('--days must be a positive number, or use --perpetual');
}

const now = new Date();
const notBefore = arg('not-before') ? new Date(required('not-before')) : now;
if (Number.isNaN(notBefore.getTime())) die('--not-before must be a parseable date');

const expiresAt = has('perpetual') ? null : new Date(notBefore.getTime() + days * 86_400_000);

const claims: PortableLicenseClaims = {
  schema: 'portable-license/1',
  licenseId: arg('license-id') ?? randomUUID(),
  issuer: required('issuer'),
  licensee: required('licensee'),
  productId,
  edition,
  features,
  seats: seatsRaw ? Number(seatsRaw) : null,
  maxExecutions: executionsRaw ? Number(executionsRaw) : null,
  issuedAt: now.toISOString(),
  notBefore: notBefore.toISOString(),
  expiresAt: expiresAt ? expiresAt.toISOString() : null,
  graceDays: grace,
};

if (arg('note')) claims.note = required('note');

const token = issueLicense(claims, privateKeyPem);

console.log('\n  Licence issued\n');
console.log(`  licence id   ${claims.licenseId}`);
console.log(`  product      ${claims.productId}`);
console.log(`  licensee     ${claims.licensee}`);
console.log(`  edition      ${claims.edition}`);
console.log(`  features     ${claims.features.join(', ')}`);
console.log(`  seats        ${claims.seats ?? 'unlimited'}`);
console.log(`  valid from   ${claims.notBefore}`);
console.log(`  expires      ${claims.expiresAt ?? 'never'}`);
console.log(`  grace        ${claims.graceDays} days`);
console.log('\n  Token — the buyer puts this in their own configuration or vault:\n');
console.log(token);
console.log('\n  Record the licence id. Revocation is by id, and you cannot revoke what');
console.log('  you did not write down.');
console.log('\n  Seats and execution limits are recorded here but are NOT enforced by the');
console.log('  product. They are contract terms. Say so to the buyer rather than letting');
console.log('  them assume a control exists.\n');
