import { LocalizedText } from '@/components/i18n/LocalizedText'

import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { portableProductReadinessDashboard } from '@/lib/portable-products'
import { getCurrentUser } from '@/utils/supabase/server'
import { uiText } from '@/lib/i18n/uiText'

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
  if (!access.isAdmin) return <main style={page}><h1><LocalizedText fallback={uiText('generatedUi.u_b4423ecd10fcf47d')} /></h1><p style={muted}><LocalizedText fallback={uiText('generatedUi.u_d92c603b66e19cf6')} /></p></main>
  return <main style={page}>
    <section style={panel}><p style={{ color: '#1af0ff', fontWeight: 800 }}>{uiText('generatedUi.u_333ea8529e36bffe')}</p><h1><LocalizedText fallback={uiText('generatedUi.u_b4423ecd10fcf47d')} /></h1><p style={muted}>{uiText('generatedUi.u_27426e0b3993bb58')}</p><p><a href="/dashboard/portable-products" style={{ color: '#1af0ff' }}><LocalizedText fallback={uiText('generatedUi.u_b636f933f33aab49')} /></a></p></section>
    {portableProductReadinessDashboard.products.map(product => <article key={product.productId} style={panel}><h2>{product.displayName}</h2><p style={muted}><code>{product.productId}</code>{uiText('generatedUi.u_d614926f0f6dd290')}{product.implementationStatus}</p><p><span style={product.readyForLicensing ? ready : attention}>{uiText('generatedUi.u_02dee50cec590881')}{product.readyForLicensing ? uiText('generatedUi.u_b24d6d33736ecd56') : uiText('generatedUi.u_e0787d272a439bb7')}</span> · <span style={product.readyForPackaging ? ready : attention}>{uiText('generatedUi.u_f8ab57063418176e')}{product.readyForPackaging ? uiText('generatedUi.u_b24d6d33736ecd56') : uiText('generatedUi.u_e0787d272a439bb7')}</span> · <span style={product.readyForDocumentation ? ready : attention}>{uiText('generatedUi.u_550f30ce417616c4')}{product.readyForDocumentation ? uiText('generatedUi.u_b24d6d33736ecd56') : uiText('generatedUi.u_e0787d272a439bb7')}</span> · <span style={product.readyForDeploymentIntegration ? ready : attention}>{uiText('generatedUi.u_baa102390903a6fb')}{product.readyForDeploymentIntegration ? uiText('generatedUi.u_b24d6d33736ecd56') : uiText('generatedUi.u_e0787d272a439bb7')}</span> · <span style={product.readyForFutureSale ? ready : attention}>{uiText('generatedUi.u_a9c1feab4ebdf0b5')}{product.readyForFutureSale ? uiText('generatedUi.u_b24d6d33736ecd56') : uiText('generatedUi.u_e0787d272a439bb7')}</span></p><dl style={{ display: 'grid', gap: 10 }}>{product.readiness.map(item => <div key={item.dimension}><dt><strong>{item.dimension}</strong> · <span style={item.status === 'ready' ? ready : attention}>{item.status}</span></dt><dd>{item.evidence.map(value => <span key={value} style={chip}>{value}</span>)}</dd></div>)}</dl></article>)}
  </main>
}
