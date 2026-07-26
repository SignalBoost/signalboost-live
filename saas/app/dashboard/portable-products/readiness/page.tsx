import { LocalizedText } from '@/components/i18n/LocalizedText'

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { portableProductReadinessDashboard } from '@/lib/portable-products'
import { getCurrentUser } from '@/utils/supabase/server'

const page = { minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#07111f,#05070c)' }
const panel = { border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 20, background: 'rgba(255,255,255,.055)', marginBottom: 18 }
const muted = { color: 'rgba(255,255,255,.68)' }
const ready = { color: '#8df5b1', fontWeight: 800 }
const attention = { color: '#ffd580', fontWeight: 800 }
const chip = { display: 'inline-block', margin: '2px 6px 2px 0', padding: '3px 8px', border: '1px solid rgba(26,240,255,.3)', borderRadius: 999, color: '#b8f7ff' }

export default async function PortableProductReadinessPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const access = await getAccess()
  if (!access.isAdmin) return <main style={page}><h1><LocalizedText fallback={"Portable Product Readiness Dashboard"} /></h1><p style={muted}>Admin access required.</p></main>
  return <main style={page}>
    <section style={panel}><p style={{ color: '#1af0ff', fontWeight: 800 }}>INTERNAL · READ-ONLY</p><h1><LocalizedText fallback={"Portable Product Readiness Dashboard"} /></h1><p style={muted}>Deterministic metadata analysis from the portable product registry, manifests, dependency graph, documented language coverage, and repository test coverage. “Ready” describes declared metadata readiness only; it does not run tests or create, package, deploy, sell, license, or execute a product.</p><p><a href="/dashboard/portable-products" style={{ color: '#1af0ff' }}>View Portable Product Catalog</a></p></section>
    {portableProductReadinessDashboard.products.map(product => <article key={product.productId} style={panel}><h2>{product.displayName}</h2><p style={muted}><code>{product.productId}</code> · implementation: {product.implementationStatus}</p><p><span style={product.readyForLicensing ? ready : attention}>Licensing: {product.readyForLicensing ? 'ready' : 'attention'}</span> · <span style={product.readyForPackaging ? ready : attention}>Packaging: {product.readyForPackaging ? 'ready' : 'attention'}</span> · <span style={product.readyForDocumentation ? ready : attention}>Documentation: {product.readyForDocumentation ? 'ready' : 'attention'}</span> · <span style={product.readyForDeploymentIntegration ? ready : attention}>Deployment integration: {product.readyForDeploymentIntegration ? 'ready' : 'attention'}</span> · <span style={product.readyForFutureSale ? ready : attention}>Future sale: {product.readyForFutureSale ? 'ready' : 'attention'}</span></p><dl style={{ display: 'grid', gap: 10 }}>{product.readiness.map(item => <div key={item.dimension}><dt><strong>{item.dimension}</strong> · <span style={item.status === 'ready' ? ready : attention}>{item.status}</span></dt><dd>{item.evidence.map(value => <span key={value} style={chip}>{value}</span>)}</dd></div>)}</dl></article>)}
  </main>
}
