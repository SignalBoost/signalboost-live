// saas/portable-license/issue.ts
//
// Seller side. Mints a signed licence token from claims and an Ed25519 private
// key. Kept in the same module as verification on purpose: the canonical form
// is shared, so the two sides cannot drift apart into a signature that verifies
// on one machine and fails on another.
//
// The private key never belongs in this repository. It belongs in the vault
// used by whatever issues licences at purchase time.

import { createPrivateKey, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import type { PortableLicenseClaims, PortableLicenseToken } from './types.ts';
import { encodeToken, signingInput } from './verify.ts';

export function generateIssuerKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function issueLicense(claims: PortableLicenseClaims, privateKeyPem: string): PortableLicenseToken {
  if (claims.schema !== 'portable-license/1') {
    throw new Error('issueLicense: claims.schema must be "portable-license/1".');
  }
  if (claims.graceDays < 0 || !Number.isFinite(claims.graceDays)) {
    throw new Error('issueLicense: graceDays must be a non-negative number.');
  }
  for (const field of ['issuedAt', 'notBefore'] as const) {
    if (Number.isNaN(Date.parse(claims[field]))) {
      throw new Error(`issueLicense: ${field} must be an ISO-8601 instant.`);
    }
  }
  if (claims.expiresAt !== null && Number.isNaN(Date.parse(claims.expiresAt))) {
    throw new Error('issueLicense: expiresAt must be an ISO-8601 instant or null.');
  }
  if (claims.expiresAt !== null && Date.parse(claims.expiresAt) <= Date.parse(claims.notBefore)) {
    throw new Error('issueLicense: expiresAt must be after notBefore.');
  }
  const signature = cryptoSign(null, signingInput(claims), createPrivateKey(privateKeyPem));
  return encodeToken(claims, signature);
}
