import { listPortableProducts } from './product-selectors.ts'
import type { PortableProductManifest } from './manifestTypes.ts'
import type { PortableProductCategory, PortableProductStatus } from './product-types.ts'

export const portableProductCatalogSchemaVersion = 'portable-product-catalog.v1' as const

export interface PortableProductCatalogItem {
  readonly productId: string
  readonly displayName: string
  readonly shortDescription: string
  readonly longDescription: string
  readonly category: PortableProductCategory
  readonly status: PortableProductStatus
  readonly maturity: string
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

export interface PortableProductCatalog {
  readonly schemaVersion: typeof portableProductCatalogSchemaVersion
  readonly generatedAt: string
  readonly items: readonly PortableProductCatalogItem[]
}

export interface PortableProductCatalogFilters {
  readonly status?: PortableProductStatus
  readonly category?: PortableProductCategory
  readonly publicVisible?: boolean
  readonly licensingAvailable?: boolean
  readonly productId?: string
}

function copyStrings(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...(values ?? [])])
}

/** Copies only inspection-safe manifest metadata into a detached catalog item. */
export function serializePortableProductCatalogItem(manifest: PortableProductManifest): PortableProductCatalogItem {
  return Object.freeze({
    productId: manifest.productId,
    displayName: manifest.displayName,
    shortDescription: manifest.shortDescription,
    longDescription: manifest.longDescription,
    category: manifest.category,
    status: manifest.status,
    maturity: manifest.maturity,
    publicVisible: manifest.publicVisible,
    licensingAvailable: manifest.licensingAvailable,
    supportedLanguages: copyStrings(manifest.supportedLanguages),
    targetAudience: copyStrings(manifest.targetAudience),
    requiredCapabilities: copyStrings(manifest.requiredCapabilities),
    optionalCapabilities: copyStrings(manifest.optionalCapabilities),
    dependencies: copyStrings(manifest.dependencies),
    exclusions: copyStrings(manifest.exclusions),
    architectureReferences: copyStrings(manifest.architectureReferences),
    documentationReferences: copyStrings(manifest.documentationReferences),
    futureFeatures: copyStrings(manifest.futureFeatures),
  })
}

/** Internal inspection excludes registry entries explicitly marked internal, hidden, or deprecated. */
export function listPortableProductCatalogItems(filters: PortableProductCatalogFilters = {}): readonly PortableProductCatalogItem[] {
  const items = listPortableProducts()
    .filter(({ manifest }) => !['internal', 'hidden', 'deprecated'].includes(manifest.status))
    .filter(({ manifest }) => filters.status === undefined || manifest.status === filters.status)
    .filter(({ manifest }) => filters.category === undefined || manifest.category === filters.category)
    .filter(({ manifest }) => filters.publicVisible === undefined || manifest.publicVisible === filters.publicVisible)
    .filter(({ manifest }) => filters.licensingAvailable === undefined || manifest.licensingAvailable === filters.licensingAvailable)
    .filter(({ manifest }) => filters.productId === undefined || manifest.productId === filters.productId)
    .map(({ manifest }) => serializePortableProductCatalogItem(manifest))
  return Object.freeze(items)
}

export function serializePortableProductCatalog(generatedAt: string, filters: PortableProductCatalogFilters = {}): PortableProductCatalog {
  return Object.freeze({ schemaVersion: portableProductCatalogSchemaVersion, generatedAt, items: listPortableProductCatalogItems(filters) })
}

export const portableProductCatalogFilterOptions = Object.freeze({
  statuses: Object.freeze(['live', 'preview'] as const),
  categories: Object.freeze(['growth', 'media', 'operations', 'automation', 'infrastructure', 'governance', 'integrations'] as const),
  booleans: Object.freeze(['true', 'false'] as const),
})

export function parsePortableProductCatalogFilters(searchParams: URLSearchParams): PortableProductCatalogFilters {
  const allowed = new Set(['status', 'category', 'publicVisible', 'licensingAvailable', 'productId'])
  for (const key of searchParams.keys()) {
    if (!allowed.has(key) || searchParams.getAll(key).length !== 1) throw new Error('Invalid portable product catalog filter')
  }
  const value = (key: string) => searchParams.get(key) ?? undefined
  const status = value('status')
  const category = value('category')
  const productId = value('productId')
  const parseBoolean = (key: 'publicVisible' | 'licensingAvailable') => {
    const candidate = value(key)
    if (candidate === undefined) return undefined
    if (!portableProductCatalogFilterOptions.booleans.includes(candidate as 'true' | 'false')) throw new Error('Invalid portable product catalog filter')
    return candidate === 'true'
  }
  if (status !== undefined && !portableProductCatalogFilterOptions.statuses.includes(status as 'live' | 'preview')) throw new Error('Invalid portable product catalog filter')
  if (category !== undefined && !portableProductCatalogFilterOptions.categories.includes(category as PortableProductCategory)) throw new Error('Invalid portable product catalog filter')
  if (productId !== undefined && !listPortableProductCatalogItems().some(item => item.productId === productId)) throw new Error('Invalid portable product catalog filter')
  return Object.freeze({ status: status as PortableProductStatus | undefined, category: category as PortableProductCategory | undefined, publicVisible: parseBoolean('publicVisible'), licensingAvailable: parseBoolean('licensingAvailable'), productId })
}
