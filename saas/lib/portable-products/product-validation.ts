import type { PortableProductDescriptor, PortableProductCategory, PortableProductImplementationStatus, PortableProductStatus } from './product-types.ts'

const PRODUCT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const statuses: readonly PortableProductStatus[] = ['live', 'preview', 'internal', 'deprecated', 'hidden']
const categories: readonly PortableProductCategory[] = ['growth', 'media', 'operations', 'automation', 'infrastructure', 'governance', 'integrations']
const implementationStatuses: readonly PortableProductImplementationStatus[] = ['implemented', 'preview', 'internal_component', 'descriptor_only', 'deprecated']
const SECRET_LIKE = /(api[_-]?key|secret|token|password|credential|authorization|bearer|sk-[a-z0-9])/i
const MAX_STRING_LENGTH = 500
const MAX_REFERENCE_COUNT = 24

function fail(message: string): never { throw new Error(`Invalid portable product registry: ${message}`) }
function assertBoundedString(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > MAX_STRING_LENGTH) fail(`${label} must be a bounded non-empty string`)
  if (SECRET_LIKE.test(value)) fail(`${label} must not contain credential-like content`)
}
function assertFrozenArray(values: unknown, label: string): asserts values is readonly string[] {
  if (!Array.isArray(values) || !Object.isFrozen(values) || values.length > MAX_REFERENCE_COUNT) fail(`${label} must be a frozen bounded array`)
  for (const value of values) assertBoundedString(value, `${label} entry`)
  if (new Set(values).size !== values.length) fail(`${label} must not contain duplicates`)
}

export function validatePortableProductRegistry(descriptors: readonly PortableProductDescriptor[]): void {
  if (!Array.isArray(descriptors) || !Object.isFrozen(descriptors)) fail('registry must be a frozen array')
  const ids = new Set<string>(); const sortOrders = new Set<number>()
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor !== 'object' || !Object.isFrozen(descriptor)) fail('each descriptor must be frozen')
    for (const value of Object.values(descriptor)) if (typeof value === 'function') fail('descriptors must not contain executable values')
    assertBoundedString(descriptor.productId, 'productId'); if (!PRODUCT_ID.test(descriptor.productId)) fail(`productId "${descriptor.productId}" must be lowercase kebab-case`)
    if (ids.has(descriptor.productId)) fail(`duplicate productId "${descriptor.productId}"`); ids.add(descriptor.productId)
    assertBoundedString(descriptor.localizationKey, 'localizationKey'); assertBoundedString(descriptor.fallbackName, 'fallbackName'); assertBoundedString(descriptor.fallbackDescription, 'fallbackDescription'); assertBoundedString(descriptor.glyph, 'glyph')
    if (!statuses.includes(descriptor.status)) fail(`invalid status for "${descriptor.productId}"`)
    if (!categories.includes(descriptor.category)) fail(`invalid category for "${descriptor.productId}"`)
    if (!implementationStatuses.includes(descriptor.implementationStatus)) fail(`invalid implementation status for "${descriptor.productId}"`)
    if (!Number.isInteger(descriptor.sortOrder) || descriptor.sortOrder < 0) fail(`sortOrder for "${descriptor.productId}" must be a non-negative integer`)
    if (sortOrders.has(descriptor.sortOrder)) fail(`duplicate sortOrder ${descriptor.sortOrder}`); sortOrders.add(descriptor.sortOrder)
    if (descriptor.route !== undefined) { assertBoundedString(descriptor.route, 'route'); if (!descriptor.route.startsWith('/') || descriptor.route.startsWith('//')) fail(`route for "${descriptor.productId}" must begin with one /`) }
    if (descriptor.status === 'hidden' && descriptor.publicVisible) fail('hidden products cannot be public')
    if (descriptor.status === 'internal' && descriptor.licensingAvailable) fail('internal products cannot be licensable')
    if (descriptor.status === 'preview' && descriptor.implementationStatus === 'implemented') fail('preview products cannot be classified as implemented/live')
    assertFrozenArray(descriptor.documentationReferences, 'documentationReferences'); assertFrozenArray(descriptor.capabilityTags, 'capabilityTags'); assertFrozenArray(descriptor.architectureReferences, 'architectureReferences')
  }
}
