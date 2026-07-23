import type {
  PortableProductCategory,
  PortableProductDescriptor,
  PortableProductImplementationClassification,
  PortableProductImplementationStatus,
  PortableProductStatus,
} from './product-types.ts'

const PRODUCT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_STRING_LENGTH = 500
const MAX_REFERENCE_COUNT = 24
const statuses = new Set<PortableProductStatus>(['live', 'preview', 'internal', 'deprecated', 'hidden'])
const categories = new Set<PortableProductCategory>(['growth', 'media', 'operations', 'automation', 'infrastructure', 'governance', 'integrations'])
const classifications = new Set<PortableProductImplementationClassification>([
  'implemented_product', 'preview_product', 'internal_component', 'descriptor_only_compatibility_target',
])
const implementationStatuses = new Set<PortableProductImplementationStatus>([
  'implemented', 'preview', 'internal_component', 'descriptor_only', 'deprecated',
])
const descriptorFields = new Set<keyof PortableProductDescriptor>([
  'productId', 'localizationKey', 'fallbackName', 'fallbackDescription', 'glyph', 'status',
  'implementationStatus', 'implementationClassification', 'category', 'sortOrder',
  'publicVisible', 'licensingAvailable', 'route', 'documentationReferences',
  'architectureReferences', 'capabilityTags',
])
const secretLike = /(api[_-]?key|secret|token|password|credential|authorization|bearer|sk-[a-z0-9])/i

function fail(message: string): never { throw new Error(`Invalid portable product registry: ${message}`) }

function validateString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING_LENGTH) fail(`${field} must be a bounded non-empty string`)
  if (secretLike.test(value)) fail(`${field} must not contain credentials or secret-like values`)
}

function validateReferences(values: readonly string[], field: string) {
  if (!Array.isArray(values) || !Object.isFrozen(values)) fail(`${field} must be a frozen array`)
  if (values.length > MAX_REFERENCE_COUNT) fail(`${field} exceeds its maximum length`)
  const seen = new Set<string>()
  for (const value of values) {
    validateString(value, `${field} entry`)
    if (seen.has(value)) fail(`${field} contains duplicate values`)
    seen.add(value)
  }
}

/** Validates the immutable, metadata-only registry boundary and fails closed. */
export function validatePortableProductRegistry(descriptors: readonly PortableProductDescriptor[]): void {
  if (!Array.isArray(descriptors) || !Object.isFrozen(descriptors)) fail('registry must be a frozen array')
  const ids = new Set<string>()
  const sortOrders = new Set<number>()
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor !== 'object' || !Object.isFrozen(descriptor)) fail('every descriptor must be frozen')
    for (const [field, value] of Object.entries(descriptor)) {
      if (!descriptorFields.has(field as keyof PortableProductDescriptor)) fail(`${field} is not an allowed descriptor field`)
      if (typeof value === 'function') fail(`${field} must not be executable`)
    }
    validateString(descriptor.productId, 'productId')
    if (!PRODUCT_ID.test(descriptor.productId)) fail('productId must be exact lowercase kebab-case')
    if (ids.has(descriptor.productId)) fail(`duplicate productId ${descriptor.productId}`)
    ids.add(descriptor.productId)
    validateString(descriptor.localizationKey, 'localizationKey')
    validateString(descriptor.fallbackName, 'fallbackName')
    validateString(descriptor.fallbackDescription, 'fallbackDescription')
    validateString(descriptor.glyph, 'glyph')
    if (!statuses.has(descriptor.status)) fail('invalid status')
    if (!categories.has(descriptor.category)) fail('invalid category')
    if (!implementationStatuses.has(descriptor.implementationStatus)) fail('invalid implementation status')
    if (!classifications.has(descriptor.implementationClassification)) fail('invalid implementation classification')
    if (!Number.isInteger(descriptor.sortOrder) || descriptor.sortOrder < 0) fail('sortOrder must be a non-negative integer')
    if (sortOrders.has(descriptor.sortOrder)) fail(`duplicate sortOrder ${descriptor.sortOrder}`)
    sortOrders.add(descriptor.sortOrder)
    if (typeof descriptor.publicVisible !== 'boolean' || typeof descriptor.licensingAvailable !== 'boolean') fail('visibility and licensing flags must be boolean')
    if (descriptor.route !== undefined) {
      validateString(descriptor.route, 'route')
      if (!descriptor.route.startsWith('/') || descriptor.route.startsWith('//') || descriptor.route.startsWith('/mailto:')) fail('route must be an internal path beginning with /')
    }
    if ((descriptor.status === 'hidden' || descriptor.status === 'internal') && descriptor.publicVisible) fail('hidden or internal products cannot be public')
    if (descriptor.status === 'internal' && descriptor.licensingAvailable) fail('internal products cannot be licensable')
    if (descriptor.status === 'preview' && !['preview_product', 'descriptor_only_compatibility_target'].includes(descriptor.implementationClassification)) fail('preview products must retain a preview-safe classification')
    if (descriptor.implementationClassification === 'descriptor_only_compatibility_target' && descriptor.implementationStatus !== 'descriptor_only') fail('descriptor-only classification requires descriptor-only implementation status')
    if (descriptor.implementationStatus === 'descriptor_only' && descriptor.implementationClassification !== 'descriptor_only_compatibility_target') fail('descriptor-only implementation status requires descriptor-only classification')
    if (descriptor.implementationClassification === 'descriptor_only_compatibility_target' && descriptor.status === 'live') fail('descriptor-only compatibility targets cannot be live')
    validateReferences(descriptor.documentationReferences, 'documentationReferences')
    validateReferences(descriptor.capabilityTags, 'capabilityTags')
    validateReferences(descriptor.architectureReferences, 'architectureReferences')
  }
}
