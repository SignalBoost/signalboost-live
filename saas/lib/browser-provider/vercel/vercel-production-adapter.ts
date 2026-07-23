// saas/lib/browser-provider/vercel/vercel-production-adapter.ts
//
// The production-capable Vercel browser adapter. This is a SEPARATE adapter from
// the read-only sandbox VercelBrowserAdapter, which is left exactly as-is. This one
// declares supportsProduction() === true and carries a production-allowed origin, so
// it can ONLY register in a BrowserProviderRegistry that was constructed with
// { allowProduction: true } — i.e. only when the owner has explicitly opened the
// production door (see provider-registry.ts and BROWSER_PRODUCTION_ENABLED at the
// call site). In a default registry it is rejected exactly like any other
// production provider.
//
// It reuses the sandbox adapter's capability/navigation/selector/verification/
// evidence knowledge (the same Vercel dashboard structure), re-homed under a
// distinct providerId so the two adapters never collide, and pairs them with a
// production-authorized origin. Real execution against that origin is still gated
// downstream by the production launch profile (https-only, execute_change opt-in)
// and the two-phase signed-approval model — registering here authorizes nothing
// on its own; it only makes the provider selectable when production is enabled.

import type { BrowserProviderAdapter, BrowserProviderExecutionMode } from '../provider-adapter.ts'
import { assertBrowserProviderHealth } from '../provider-health.ts'
import {
  vercelCapabilities,
  vercelEvidenceProfiles,
  vercelNavigationProfiles,
  vercelSelectors,
  vercelVerificationProfiles,
  vercelVersion,
} from './vercel-data.ts'

const PRODUCTION_PROVIDER_ID = 'vercel-production'

// Re-home every profile onto the production providerId so registry ownership
// checks pass and the production and sandbox adapters never share identity.
function rehome<T extends { providerId: string }>(items: readonly T[]): T[] {
  return items.map(item => ({ ...item, providerId: PRODUCTION_PROVIDER_ID }))
}

// A production-authorized origin: real Vercel dashboard, production allowed. This
// is the origin the production launch profile must also allowlist before any
// session opens against it.
const vercelProductionOrigins = [{
  originId: 'vercel_dashboard',
  providerId: PRODUCTION_PROVIDER_ID,
  labelKey: 'browserProvider.vercel.origins.dashboard',
  exactOrigin: 'https://vercel.com',
  environments: ['production'] as const,
  readOnlyAllowed: true,
  browserOnDemandAllowed: true,
  autoFailoverAllowed: false,
  productionAllowed: true,
  schemaVersion: vercelVersion.schemaVersion,
}]

export const VercelProductionBrowserAdapter: BrowserProviderAdapter = Object.freeze({
  providerId: PRODUCTION_PROVIDER_ID,
  displayNameKey: 'browserProvider.vercel.displayName',
  adapterVersion: vercelVersion.adapterVersion,
  schemaVersion: vercelVersion.schemaVersion,
  health: assertBrowserProviderHealth({ state: 'unknown', checkedAt: '1970-01-01T00:00:00.000Z' }),
  capabilities: Object.freeze(rehome(vercelCapabilities)),
  origins: Object.freeze(vercelProductionOrigins),
  navigationProfiles: Object.freeze(rehome(vercelNavigationProfiles)),
  selectors: Object.freeze(rehome(vercelSelectors)),
  verificationProfiles: Object.freeze(rehome(vercelVerificationProfiles)),
  evidenceProfiles: Object.freeze(rehome(vercelEvidenceProfiles)),
  supportsExecutionMode: (mode: BrowserProviderExecutionMode) => mode === 'read_only',
  supportsReadOnlyInspection: () => true,
  supportsAutoFailover: () => false,
  supportsBrowserOnDemand: () => true,
  supportsSandbox: () => false,
  supportsProduction: () => true,
  getVersion: () => vercelVersion,
})
