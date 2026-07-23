export type PortableProductStatus = 'live' | 'preview' | 'internal' | 'deprecated' | 'hidden'

export type PortableProductCategory =
  | 'growth'
  | 'media'
  | 'operations'
  | 'automation'
  | 'infrastructure'
  | 'governance'
  | 'integrations'

export type PortableProductImplementationStatus =
  | 'implemented'
  | 'preview'
  | 'internal_component'
  | 'descriptor_only'
  | 'deprecated'

/** Describes implementation readiness without exposing implementation details to buyers. */
export type PortableProductImplementationClassification =
  | 'implemented_product'
  | 'preview_product'
  | 'internal_component'
  | 'descriptor_only_compatibility_target'

/** Serializable, metadata-only catalog data for a portable product. */
export interface PortableProductDescriptor {
  productId: string
  localizationKey: string
  fallbackName: string
  fallbackDescription: string
  glyph: string
  status: PortableProductStatus
  implementationStatus: PortableProductImplementationStatus
  implementationClassification: PortableProductImplementationClassification
  category: PortableProductCategory
  sortOrder: number
  publicVisible: boolean
  licensingAvailable: boolean
  route?: string
  documentationReferences: readonly string[]
  capabilityTags: readonly string[]
  architectureReferences: readonly string[]
}
