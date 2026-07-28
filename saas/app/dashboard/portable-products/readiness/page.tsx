import { LocalizedText } from '@/components/i18n/LocalizedText'

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { portableProductReadinessDashboard } from '@/lib/portable-products'
import { getCurrentUser } from '@/utils/supabase/server'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


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
  if (!access.isAdmin) return <main style={page}><h1><LocalizedText fallback={uiCopy('u_795920e987cb2480')} /></h1><p style={muted}><LocalizedText fallback={uiCopy('u_2a0cd01565895817')} /></p></main>
  return <main style={page}>
    <section style={panel}><p style={{ color: '#1af0ff', fontWeight: 800 }}>{uiCopy('u_57e29912637302fc')}</p><h1><LocalizedText fallback={uiCopy('u_b6e0fcf82c8263bb')} /></h1><p style={muted}>{uiCopy('u_2d9b32a694da6629')}</p><p><a href="/dashboard/portable-products" style={{ color: '#1af0ff' }}><LocalizedText fallback={uiCopy('u_744fabca24a3a8f3')} /></a></p></section>
    {portableProductReadinessDashboard.products.map(product => <article key={product.productId} style={panel}><h2>{product.displayName}</h2><p style={muted}><code>{product.productId}</code>{uiCopy('u_e5f3a9d1f28503e4')}{product.implementationStatus}</p><p><span style={product.readyForLicensing ? ready : attention}>{uiCopy('u_1193541fd942fbe8')}{product.readyForLicensing ? uiCopy('u_0e318535053a6a0a') : uiCopy('u_a73da3438ae0dce8')}</span> · <span style={product.readyForPackaging ? ready : attention}>{uiCopy('u_920d6e12f2e9588d')}{product.readyForPackaging ? uiCopy('u_b3b3ae1ddd063328') : uiCopy('u_97896cc597352e3e')}</span> · <span style={product.readyForDocumentation ? ready : attention}>{uiCopy('u_20cee7f28e5bbcdf')}{product.readyForDocumentation ? uiCopy('u_cdefda2bbe39bea3') : uiCopy('u_a135bb010450aab8')}</span> · <span style={product.readyForDeploymentIntegration ? ready : attention}>{uiCopy('u_29af341fff77be6f')}{product.readyForDeploymentIntegration ? uiCopy('u_6223cbd5f84a8c29') : uiCopy('u_4bc299a534896bfe')}</span> · <span style={product.readyForFutureSale ? ready : attention}>{uiCopy('u_9e8e3ee73dca83c5')}{product.readyForFutureSale ? uiCopy('u_1dda1373c0dfcbe7') : uiCopy('u_7ce5ae5683fbd26c')}</span></p><dl style={{ display: 'grid', gap: 10 }}>{product.readiness.map(item => <div key={item.dimension}><dt><strong>{item.dimension}</strong> · <span style={item.status === 'ready' ? ready : attention}>{item.status}</span></dt><dd>{item.evidence.map(value => <span key={value} style={chip}>{value}</span>)}</dd></div>)}</dl></article>)}
  </main>
}
