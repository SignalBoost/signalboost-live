// saas/portable-license/index.ts
//
// Shared entitlement layer for every portable. Host-agnostic: no environment,
// no network, no filesystem, no platform imports.

export * from './types.ts';
export { canonicalize, encodeToken, signingInput, verifyLicense, TOKEN_PREFIX } from './verify.ts';
export { createEntitlementGate, createUnlicensedDevelopmentGate, type EntitlementGate } from './enforce.ts';
export { issueLicense, generateIssuerKeyPair } from './issue.ts';
