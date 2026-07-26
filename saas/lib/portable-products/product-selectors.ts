// saas/lib/portable-products/product-selectors.ts
import { portableProductRegistry } from './product-registry.ts'
import type { PortableProductCategory, PortableProductDescriptor } from './product-types.ts'

function sorted(products: readonly PortableProductDescriptor[]): readonly PortableProductDescriptor[] {
  return Object.freeze([...products].sort((left, right) => left.sortOrder - right.sortOrder || left.manifest.productId.localeCompare(right.manifest.productId)))
}
export function listPortableProducts(): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry) }
export function listPublicPortableProducts(includeDeprecated = false): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry.filter(product => product.manifest.publicVisible && product.manifest.status !== 'internal' && product.manifest.status !== 'hidden' && (includeDeprecated || product.manifest.status !== 'deprecated'))) }
// Licensable means LIVE, not merely "not hidden". This filter used to exclude only internal,
// hidden and deprecated, so a manifest that set licensingAvailable while still at status
// 'preview' was offered to buyers as licensable — provider-hub did exactly that. Preview means
// the portable has not been proven to plug into a buyer's stack, so it must not appear here.
// Requiring 'live' makes the rule structural instead of relying on every future manifest
// setting licensingAvailable honestly.
export function listLicensablePortableProducts(): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry.filter(product => product.manifest.licensingAvailable && product.manifest.status === 'live')) }
export function getPortableProduct(productId: string): PortableProductDescriptor { const product = portableProductRegistry.find(candidate => candidate.manifest.productId === productId); if (!product) throw new Error(`Unknown portable product ID: ${productId}`); return product }
export function listPortableProductsByCategory(category: PortableProductCategory): readonly PortableProductDescriptor[] { return sorted(portableProductRegistry.filter(product => product.manifest.category === category)) }
