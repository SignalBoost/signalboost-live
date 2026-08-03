// saas/lib/portable-products/manifestTypes.ts
import type { PortableProductCategory, PortableProductStatus } from './product-types.ts'

export type PortableProductMaturity = 'experimental' | 'preview' | 'beta' | 'production'

/** Immutable, provider-neutral metadata for one portable product. */
export interface PortableProductManifest {
  readonly productId: string
  readonly displayName: string
  readonly shortDescription: string
  readonly longDescription: string
  /**
   * The product's category in the buyer's vocabulary — "self-healing software",
   * "press and media software". OPTIONAL, and deliberately so: a product only declares
   * one when being filed under the wrong category would cost a sale.
   *
   * It exists because every surface that writes about a product to an outsider was
   * inventing a category noun of its own. A real outreach draft called the Self-Healing
   * Supervisor "a monitoring software" and another called it "a supervision software" —
   * filing a product that DIAGNOSES AND REPAIRS under a commodity heading the buyer
   * already pays someone else for. The name of the category is a product decision, so
   * it is declared here once and read everywhere, exactly like displayName.
   */
  readonly categoryLabel?: string
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
