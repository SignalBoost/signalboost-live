import type { PortableProductManifest } from './manifestTypes.ts'

export type PortableProductStatus = 'live' | 'preview' | 'internal' | 'deprecated' | 'hidden'
export type PortableProductCategory = 'growth' | 'media' | 'operations' | 'automation' | 'infrastructure' | 'governance' | 'integrations'
export type PortableProductImplementationStatus = 'implemented' | 'preview' | 'internal_component' | 'descriptor_only' | 'deprecated'
export type PortableProductImplementationClassification = 'implemented_product' | 'preview_product' | 'internal_component' | 'descriptor_only_compatibility_target'

/** Presentation-only registry entry that references one self-describing manifest. */
export interface PortableProductDescriptor {
  readonly manifest: PortableProductManifest
  readonly localizationKey: string
  readonly glyph: string
  readonly implementationStatus: PortableProductImplementationStatus
  readonly implementationClassification: PortableProductImplementationClassification
  readonly sortOrder: number
  readonly route?: string
}