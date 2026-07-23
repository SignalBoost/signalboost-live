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

export interface PortableProductDescriptor {
  productId: string
  localizationKey: string
  fallbackName: string
  fallbackDescription: string
  glyph: string
  status: PortableProductStatus
  implementationStatus: PortableProductImplementationStatus
  category: PortableProductCategory
  sortOrder: number
  publicVisible: boolean
  licensingAvailable: boolean
  route?: string
  documentationReferences: readonly string[]
  capabilityTags: readonly string[]
  architectureReferences: readonly string[]
}
