// saas/portable-license/index.ts
//
// Shared entitlement layer for every portable. Host-agnostic: no environment,
// no network, no filesystem, no platform imports.

export * from './types.ts';
export { canonicalize, encodeToken, signingInput, verifyLicense, TOKEN_PREFIX } from './verify.ts';
export {
  createEntitlementGate,
  createUnlicensedDevelopmentGate,
  type EntitlementGate,
  type EntitlementCheck,
} from './enforce.ts';
export { issueLicense, generateIssuerKeyPair } from './issue.ts';
export {
  SELF_HEALING_CATALOG,
  assertIssuableFeatures,
  catalogFor,
  editionNames,
  featuresForEdition,
  knownFeatureIds,
  unknownFeatures,
  type CatalogFeature,
  type ProductCatalog,
} from './catalog.ts';
export {
  guardWithEntitlement,
  unmatchedGuards,
  type GuardOptions,
  type GuardedMethod,
  type EntitlementRefusal,
} from './guard.ts';
export {
  createStaticRevocationList,
  createCachingRevocationSource,
  mergeRevocationSources,
  type CachingRevocationOptions,
} from './revocation.ts';
