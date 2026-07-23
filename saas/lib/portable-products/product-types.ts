export type PortableProductStatus = 'live' | 'preview' | 'internal' | 'deprecated' | 'hidden'

export type PortableProductCategory =
  | 'growth'
  | 'media'
  | 'operations'
  | 'automation'
  | 'infrastructure'
  | 'governance'
  | 'integrations'

/** Describes implementation readiness without exposing implementation details to buyers. */
export type PortableProductImplementationClassification =
  | 'implemented_product'
  | 'preview_product'
  | 'internal_component'
  | 'descriptor_only_compatibility_target'

/**
 * Serializable catalog data for a portable product. This boundary intentionally contains
 * metadata only: it must never gain executable behavior, credentials, runtime clients, or UI.
 */
export interface PortableProductDescriptor {
  productId: string
  localizationKey: string
  fallbackName: string
  fallbackDescription: string
  glyph: string
  status: PortableProductStatus
  category: PortableProductCategory
  sortOrder: number
  publicVisible: boolean
  licensingAvailable: boolean
  route?: string
  documentationReferences: readonly string[]
  capabilityTags: readonly string[]
  architectureReferences: readonly string[]
  implementationClassification: PortableProductImplementationClassification
}
