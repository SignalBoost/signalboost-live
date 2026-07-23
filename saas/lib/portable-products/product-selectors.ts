import { portableProductRegistry } from './product-registry.ts'
import type { PortableProductCategory, PortableProductDescriptor } from './product-types.ts'

function sorted(products: readonly PortableProductDescriptor[]): readonly PortableProductDescriptor[] {
  return Object.freeze([...products].sort((left, right) => left.sortOrder - right.sortOrder || left.productId.localeCompare(right.productId)))
}
export function listPortableProducts(): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry) }
export function listPublicPortableProducts(includeDeprecated = false): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry.filter(product => product.publicVisible && product.status !== 'internal' && product.status !== 'hidden' && (includeDeprecated || product.status !== 'deprecated'))) }
export function listLicensablePortableProducts(): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry.filter(product => product.licensingAvailable && product.status !== 'internal' && product.status !== 'hidden' && product.status !== 'deprecated')) }
export function getPortableProduct(productId: string): PortableProductDescriptor { const product = portableProductRegistry.find(candidate => candidate.productId === productId); if (!product) throw new Error(`Unknown portable product ID: ${productId}`); return product }
export function listPortableProductsByCategory(category: PortableProductCategory): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry.filter(product => product.category === category)) }
