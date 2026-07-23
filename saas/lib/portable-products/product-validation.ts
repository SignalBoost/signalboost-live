import type { PortableProductDescriptor, PortableProductImplementationClassification, PortableProductImplementationStatus } from './product-types.ts'

const classifications = new Set<PortableProductImplementationClassification>(['implemented_product', 'preview_product', 'internal_component', 'descriptor_only_compatibility_target'])
const implementationStatuses = new Set<PortableProductImplementationStatus>(['implemented', 'preview', 'internal_component', 'descriptor_only', 'deprecated'])
function fail(message: string): never { throw new Error(`Invalid portable product registry: ${message}`) }

/** Validates the frozen presentation registry and its manifest references. */
export function validatePortableProductRegistry(descriptors: readonly PortableProductDescriptor[]): void {
  if (!Array.isArray(descriptors) || !Object.isFrozen(descriptors)) fail('registry must be a frozen array')
  const productIds = new Set<string>(); const sortOrders = new Set<number>()
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor !== 'object' || !Object.isFrozen(descriptor)) fail('every descriptor must be frozen')
    if (!descriptor.manifest || !Object.isFrozen(descriptor.manifest)) fail('descriptor must reference a frozen manifest')
    if (productIds.has(descriptor.manifest.productId)) fail(`duplicate productId ${descriptor.manifest.productId}`)
    productIds.add(descriptor.manifest.productId)
    if (typeof descriptor.localizationKey !== 'string' || descriptor.localizationKey.length === 0 || typeof descriptor.glyph !== 'string' || descriptor.glyph.length === 0) fail('presentation fields must be non-empty strings')
    if (!implementationStatuses.has(descriptor.implementationStatus)) fail('invalid implementation status')
    if (!classifications.has(descriptor.implementationClassification)) fail('invalid implementation classification')
    if (!Number.isInteger(descriptor.sortOrder) || descriptor.sortOrder < 0 || sortOrders.has(descriptor.sortOrder)) fail('sortOrder must be unique non-negative integer')
    sortOrders.add(descriptor.sortOrder)
    if (descriptor.route !== undefined && (!descriptor.route.startsWith('/') || descriptor.route.startsWith('//'))) fail('route must be an internal path beginning with /')
  }
}