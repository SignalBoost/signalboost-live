import { LocalizedText } from '@/components/i18n/LocalizedText'

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getCurrentUser } from '@/utils/supabase/server'
import { listPortableProductCatalogItems, parsePortableProductCatalogFilters, portableProductCatalogFilterOptions } from '@/lib/portable-products/catalog-serialization'
import { uiText } from '@/lib/i18n/uiText'

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
  if (!access.isAdmin) return <main style={page}><h1><LocalizedText fallback={uiText('generatedUi.u_44a4613ddb65eac0')} /></h1><p style={muted}><LocalizedText fallback={uiText('generatedUi.u_d92c603b66e19cf6')} /></p></main>
  let filters
  try { filters = parsePortableProductCatalogFilters(toSearchParams(await searchParams ?? {})) } catch { return <main style={page}><h1><LocalizedText fallback={uiText('generatedUi.u_44a4613ddb65eac0')} /></h1><p style={muted}><LocalizedText fallback={uiText('generatedUi.u_6f921d47fdd5c514')} /></p></main> }
  const items = listPortableProductCatalogItems(filters)
  return <main style={page}>
    <section style={panel}><p style={{ color: '#1af0ff', fontWeight: 800 }}>{uiText('generatedUi.u_333ea8529e36bffe')}</p><h1><LocalizedText fallback={uiText('generatedUi.u_44a4613ddb65eac0')} /></h1><p style={muted}>{uiText('generatedUi.u_2f6955be2fef823c')}</p>
      <nav aria-label={uiText('generatedUi.u_10d44ee84f0d3326')}><strong><LocalizedText fallback={uiText('generatedUi.u_3e24bee4ed5e38d8')} /></strong><a href="/dashboard/portable-products" style={link}>{uiText('generatedUi.u_a52ace420f2175d0')}</a>{portableProductCatalogFilterOptions.statuses.map(value => <a key={value} href={`/dashboard/portable-products?status=${value}`} style={link}>{uiText('generatedUi.u_e92e1c5195b2bfd8')}{value}</a>)}{portableProductCatalogFilterOptions.categories.map(value => <a key={value} href={`/dashboard/portable-products?category=${value}`} style={link}>{uiText('generatedUi.u_7dd45cbeb07d9314')}{value}</a>)}{portableProductCatalogFilterOptions.booleans.map(value => <a key={`visible-${value}`} href={`/dashboard/portable-products?publicVisible=${value}`} style={link}>{uiText('generatedUi.u_14cdb3d1d32867a6')}{value}</a>)}{portableProductCatalogFilterOptions.booleans.map(value => <a key={`licensed-${value}`} href={`/dashboard/portable-products?licensingAvailable=${value}`} style={link}>{uiText('generatedUi.u_0fb41b8986607f9c')}{value}</a>)}</nav>
    </section>
    {items.map(item => <article key={item.productId} style={panel}><h2>{item.displayName}</h2><p style={muted}><code>{item.productId}</code> · {item.status} · {item.maturity} · {item.category}{uiText('generatedUi.u_5765a6f05507025f')}{String(item.publicVisible)}{uiText('generatedUi.u_525e3acd5ff629d7')}{String(item.licensingAvailable)}</p><p>{item.shortDescription}</p><dl style={{ display: 'grid', gap: 10 }}><div><dt><LocalizedText fallback={uiText('generatedUi.u_9c533847af49f2d8')} /></dt><dd>{values(item.supportedLanguages)}</dd></div><div><dt><LocalizedText fallback={uiText('generatedUi.u_b70afc50939b9469')} /></dt><dd>{values(item.architectureReferences)}</dd></div><div><dt><LocalizedText fallback={uiText('generatedUi.u_60e84d89270e6f0a')} /></dt><dd>{values(item.documentationReferences)}</dd></div><div><dt>{uiText('generatedUi.u_2e41b118eb209c13')}</dt><dd>{values(item.dependencies)}</dd></div><div><dt>{uiText('generatedUi.u_fcc9f1f929785440')}</dt><dd>{values(item.exclusions)}</dd></div></dl></article>)}
    {!items.length && <section style={panel}><p style={muted}><LocalizedText fallback={uiText('generatedUi.u_496bf21abe493505')} /></p></section>}
  </main>
}
