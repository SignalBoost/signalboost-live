import { LocalizedText } from '@/components/i18n/LocalizedText'

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getCurrentUser } from '@/utils/supabase/server'
import { listPortableProductCatalogItems, parsePortableProductCatalogFilters, portableProductCatalogFilterOptions } from '@/lib/portable-products/catalog-serialization'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  if (!access.isAdmin) return <main style={page}><h1><LocalizedText fallback={uiCopy('u_29abf37a25671958')} /></h1><p style={muted}><LocalizedText fallback={uiCopy('u_329db850a99cc8b5')} /></p></main>
  let filters
  try { filters = parsePortableProductCatalogFilters(toSearchParams(await searchParams ?? {})) } catch { return <main style={page}><h1><LocalizedText fallback={uiCopy('u_4a9ca6f7afa71380')} /></h1><p style={muted}><LocalizedText fallback={uiCopy('u_b33f807a33dd87db')} /></p></main> }
  const items = listPortableProductCatalogItems(filters)
  return <main style={page}>
    <section style={panel}><p style={{ color: '#1af0ff', fontWeight: 800 }}>{uiCopy('u_b2ca5c8b223e520e')}</p><h1><LocalizedText fallback={uiCopy('u_13e4e9aab881b7de')} /></h1><p style={muted}>{uiCopy('u_b0b911d86bdbea62')}</p>
      <nav aria-label={uiCopy('u_e0656ec5bed5119a')}><strong><LocalizedText fallback={uiCopy('u_fcda7aef1e75487b')} /></strong><a href="/dashboard/portable-products" style={link}>{uiCopy('u_0fbc7a27a544ccbc')}</a>{portableProductCatalogFilterOptions.statuses.map(value => <a key={value} href={`/dashboard/portable-products?status=${value}`} style={link}>{uiCopy('u_c76d38acb9e39404')}{value}</a>)}{portableProductCatalogFilterOptions.categories.map(value => <a key={value} href={`/dashboard/portable-products?category=${value}`} style={link}>{uiCopy('u_db0a4bea3e510d30')}{value}</a>)}{portableProductCatalogFilterOptions.booleans.map(value => <a key={`visible-${value}`} href={`/dashboard/portable-products?publicVisible=${value}`} style={link}>{uiCopy('u_4658a72ec2949cd0')}{value}</a>)}{portableProductCatalogFilterOptions.booleans.map(value => <a key={`licensed-${value}`} href={`/dashboard/portable-products?licensingAvailable=${value}`} style={link}>{uiCopy('u_c5e63a355267f0e3')}{value}</a>)}</nav>
    </section>
    {items.map(item => <article key={item.productId} style={panel}><h2>{item.displayName}</h2><p style={muted}><code>{item.productId}</code> · {item.status} · {item.maturity} · {item.category}{uiCopy('u_fef3a057c643eb90')}{String(item.publicVisible)}{uiCopy('u_4118dd6e6dbbafbd')}{String(item.licensingAvailable)}</p><p>{item.shortDescription}</p><dl style={{ display: 'grid', gap: 10 }}><div><dt><LocalizedText fallback={uiCopy('u_a7c592f5e6dd5183')} /></dt><dd>{values(item.supportedLanguages)}</dd></div><div><dt><LocalizedText fallback={uiCopy('u_f10835fd4036544b')} /></dt><dd>{values(item.architectureReferences)}</dd></div><div><dt><LocalizedText fallback={uiCopy('u_f32eee83ae9f3b43')} /></dt><dd>{values(item.documentationReferences)}</dd></div><div><dt>{uiCopy('u_e39481cac7344972')}</dt><dd>{values(item.dependencies)}</dd></div><div><dt>{uiCopy('u_407d1e3834316bfb')}</dt><dd>{values(item.exclusions)}</dd></div></dl></article>)}
    {!items.length && <section style={panel}><p style={muted}><LocalizedText fallback={uiCopy('u_d1f914c808f4e71c')} /></p></section>}
  </main>
}
