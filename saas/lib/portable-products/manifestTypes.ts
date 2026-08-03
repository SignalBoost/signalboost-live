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
  /**
   * HOW THE WORK GETS DONE — the execution channels this product actually supports,
   * in the buyer's vocabulary. OPTIONAL, and only declared once each channel has been
   * verified in the code rather than assumed from a directory name.
   *
   * It exists because outreach drafts described these products as though a human ran
   * every step. The opposite is true and it is a primary reason to buy: the work is
   * automated, with a human able to take control at any point. That is a product fact,
   * so it is declared here rather than retyped into each campaign brief.
   *
   * Each entry must be honest about its LIMIT as well as its capability — see the
   * Supervisor's browser entry, which says "prepares" rather than "runs" because the
   * shipped adapter emits a dry-run package for the buyer's own runtime to execute.
   */
  readonly executionModes?: readonly string[]
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
