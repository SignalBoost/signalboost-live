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
//     --features repair.dispatch,siem.export \
//     --seats 25 --days 365 --grace 14
//
// The private key is read from a file you point at, never from this repository
// and never from an environment variable, so it does not end up in a shell
// history, a process listing or a CI log.

import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { generateIssuerKeyPair, issueLicense } from '../portable-license/index.ts';
import type { PortableLicenseClaims } from '../portable-license/index.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function required(name: string): string {
  const v = arg(name);
  if (!v) {
    console.error(`  missing --${name}`);
    process.exit(1);
  }
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
if (!fs.existsSync(keyFile)) {
  console.error(`  key file not found: ${keyFile}`);
  process.exit(1);
}
const privateKeyPem = fs.readFileSync(keyFile, 'utf8');

const days = Number(arg('days') ?? '365');
const grace = Number(arg('grace') ?? '14');
const seatsRaw = arg('seats');
const executionsRaw = arg('max-executions');

if (!Number.isFinite(days) || days <= 0) {
  console.error('  --days must be a positive number, or use --perpetual');
  process.exit(1);
}

const now = new Date();
const notBefore = arg('not-before') ? new Date(required('not-before')) : now;
const expiresAt = has('perpetual') ? null : new Date(notBefore.getTime() + days * 86_400_000);

const claims: PortableLicenseClaims = {
  schema: 'portable-license/1',
  licenseId: arg('license-id') ?? randomUUID(),
  issuer: required('issuer'),
  licensee: required('licensee'),
  productId: required('product'),
  edition: arg('edition') ?? 'standard',
  features: (arg('features') ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean),
  seats: seatsRaw ? Number(seatsRaw) : null,
  maxExecutions: executionsRaw ? Number(executionsRaw) : null,
  issuedAt: now.toISOString(),
  notBefore: notBefore.toISOString(),
  expiresAt: expiresAt ? expiresAt.toISOString() : null,
  graceDays: grace,
};

if (arg('note')) claims.note = required('note');

if (claims.features.length === 0) {
  console.error('  --features is empty, so this licence would unlock nothing. Pass at least one.');
  process.exit(1);
}

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
console.log('  you did not write down.\n');
