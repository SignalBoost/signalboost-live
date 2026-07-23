import type { PortableProductCategory, PortableProductStatus } from './product-types.ts'

export type PortableProductMaturity = 'experimental' | 'preview' | 'beta' | 'production'

/** Immutable, provider-neutral metadata for one portable product. */
export interface PortableProductManifest {
  readonly productId: string
  readonly displayName: string
  readonly shortDescription: string
  readonly longDescription: string
  readonly category: PortableProductCategory
  readonly status: PortableProductStatus
  readonly maturity: PortableProductMaturity
  readonly publicVisible: boolean
  readonly licensingAvailable: boolean
  readonly supportedLanguages: readonly string[]
  readonly targetAudience: readonly string[]
  readonly requiredCapabilities: readonly string[]
  readonly optionalCapabilities: readonly string[]
  readonly dependencies: readonly string[]
  readonly exclusions: readonly string[]
  readonly architectureReferences: readonly string[]
  readonly documentationReferences: readonly string[]
  readonly futureFeatures: readonly string[]
}