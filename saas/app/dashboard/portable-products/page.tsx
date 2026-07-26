import { LocalizedText } from '@/components/i18n/LocalizedText'

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getCurrentUser } from '@/utils/supabase/server'
import { listPortableProductCatalogItems, parsePortableProductCatalogFilters, portableProductCatalogFilterOptions } from '@/lib/portable-products/catalog-serialization'

type SearchParams = Record<string, string | string[] | undefined>
const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 20, background: 'rgba(255,255,255,.055)', marginBottom: 18 }
const muted = { color: 'rgba(255,255,255,.68)' }
const chip = { display: 'inline-block', margin: '2px 6px 2px 0', padding: '3px 8px', border: '1px solid rgba(26,240,255,.3)', borderRadius: 999, color: '#b8f7ff' }
const link = { color: '#1af0ff', marginRight: 12 }

function toSearchParams(input: SearchParams): URLSearchParams {
  const result = new URLSearchParams()
  for (const [key, raw] of Object.entries(input)) for (const value of Array.isArray(raw) ? raw : [raw]) if (value !== undefined) result.append(key, value)
  return result
}
function values(items: readonly string[]) { return items.length ? items.map(item => <span key={item} style={chip}>{item}</span>) : '—' }

export default async function PortableProductsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const access = await getAccess()
  if (!access.isAdmin) return <main style={page}><h1><LocalizedText fallback={"Portable Product Catalog"} /></h1><p style={muted}><LocalizedText fallback={"Admin access required."} /></p></main>
  let filters
  try { filters = parsePortableProductCatalogFilters(toSearchParams(await searchParams ?? {})) } catch { return <main style={page}><h1><LocalizedText fallback={"Portable Product Catalog"} /></h1><p style={muted}><LocalizedText fallback={"Invalid catalog filters. Use only the listed read-only filters."} /></p></main> }
  const items = listPortableProductCatalogItems(filters)
  return <main style={page}>
    <section style={panel}><p style={{ color: '#1af0ff', fontWeight: 800 }}>INTERNAL · READ-ONLY</p><h1><LocalizedText fallback={"Portable Product Catalog"} /></h1><p style={muted}>Registry-backed metadata for developer and operator inspection. No commercial, fulfillment, mutation, or execution actions are available here.</p>
      <nav aria-label="Catalog filters"><strong><LocalizedText fallback={"Bounded filters:"} /></strong><a href="/dashboard/portable-products" style={link}>All</a>{portableProductCatalogFilterOptions.statuses.map(value => <a key={value} href={`/dashboard/portable-products?status=${value}`} style={link}>status: {value}</a>)}{portableProductCatalogFilterOptions.categories.map(value => <a key={value} href={`/dashboard/portable-products?category=${value}`} style={link}>category: {value}</a>)}{portableProductCatalogFilterOptions.booleans.map(value => <a key={`visible-${value}`} href={`/dashboard/portable-products?publicVisible=${value}`} style={link}>public: {value}</a>)}{portableProductCatalogFilterOptions.booleans.map(value => <a key={`licensed-${value}`} href={`/dashboard/portable-products?licensingAvailable=${value}`} style={link}>licensed: {value}</a>)}</nav>
    </section>
    {items.map(item => <article key={item.productId} style={panel}><h2>{item.displayName}</h2><p style={muted}><code>{item.productId}</code> · {item.status} · {item.maturity} · {item.category} · public: {String(item.publicVisible)} · licensing: {String(item.licensingAvailable)}</p><p>{item.shortDescription}</p><dl style={{ display: 'grid', gap: 10 }}><div><dt><LocalizedText fallback={"Supported languages"} /></dt><dd>{values(item.supportedLanguages)}</dd></div><div><dt><LocalizedText fallback={"Architecture references"} /></dt><dd>{values(item.architectureReferences)}</dd></div><div><dt><LocalizedText fallback="Documentation references" /></dt><dd>{values(item.documentationReferences)}</dd></div><div><dt>Dependencies</dt><dd>{values(item.dependencies)}</dd></div><div><dt>Exclusions</dt><dd>{values(item.exclusions)}</dd></div></dl></article>)}
    {!items.length && <section style={panel}><p style={muted}><LocalizedText fallback={"No catalog items match these bounded filters."} /></p></section>}
  </main>
}
