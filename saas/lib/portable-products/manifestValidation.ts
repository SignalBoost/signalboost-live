// saas/lib/portable-products/manifestValidation.ts
import type { PortableProductManifest, PortableProductMaturity } from './manifestTypes.ts'
import type { PortableProductCategory, PortableProductStatus } from './product-types.ts'

const categories = new Set<PortableProductCategory>(['growth', 'media', 'operations', 'automation', 'infrastructure', 'governance', 'integrations'])
const maturities = new Set<PortableProductMaturity>(['experimental', 'preview', 'beta', 'production'])
const statuses = new Set<PortableProductStatus>(['live', 'preview', 'internal', 'deprecated', 'hidden'])
const arrayFields: readonly (keyof PortableProductManifest)[] = ['supportedLanguages', 'targetAudience', 'requiredCapabilities', 'optionalCapabilities', 'dependencies', 'exclusions', 'architectureReferences', 'documentationReferences', 'futureFeatures']
const SECRET_LIKE = /(?:api[_-]?key|secret|token|password|credential|authorization)\s*[:=]\s*\S+|bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{16,}\b/i
const MAX_STRING_LENGTH = 2_000

function fail(message: string): never { throw new Error(`Invalid portable product manifest: ${message}`) }
function validateString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > MAX_STRING_LENGTH) fail(`${field} must be a bounded non-empty string`)
  if (SECRET_LIKE.test(value)) fail(`${field} must not contain credential-like content`)
}
function validateUniqueFrozenStrings(values: unknown, field: string) {
  if (!Array.isArray(values) || !Object.isFrozen(values)) fail(`${field} must be a frozen array`)
  const seen = new Set<string>()
  for (const value of values) {
    validateString(value, `${field} entry`)
    if (seen.has(value)) fail(`${field} contains duplicate values`)
    seen.add(value)
  }
}

/** Validates only static manifest metadata and returns silently when valid. */
export function validatePortableProductManifests(manifests: readonly PortableProductManifest[]): void {
  if (!Array.isArray(manifests) || !Object.isFrozen(manifests)) fail('manifests must be a frozen array')
  const productIds = new Set<string>()
  for (const manifest of manifests) {
    if (!manifest || typeof manifest !== 'object' || !Object.isFrozen(manifest)) fail('every manifest must be frozen')
    for (const [field, value] of Object.entries(manifest)) if (typeof value === 'function') fail(`${field} must not be executable`)
    validateString(manifest.productId, 'productId')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.productId)) fail('productId must be lowercase kebab-case')
    if (productIds.has(manifest.productId)) fail(`duplicate productId ${manifest.productId}`)
    productIds.add(manifest.productId)
    validateString(manifest.displayName, 'displayName')
    validateString(manifest.shortDescription, 'shortDescription')
    validateString(manifest.longDescription, 'longDescription')
    // Optional, but held to the same bar as any other buyer-visible string when present.
    if (manifest.categoryLabel !== undefined) validateString(manifest.categoryLabel, 'categoryLabel')
    if (!categories.has(manifest.category)) fail('invalid category')
    if (!statuses.has(manifest.status)) fail('invalid status')
    if (!maturities.has(manifest.maturity)) fail('invalid maturity')
    for (const field of arrayFields) validateUniqueFrozenStrings(manifest[field], String(field))
  }
}
