import { LocalizedText } from '@/components/i18n/LocalizedText'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { SupabaseExecutionRecordStore } from '@/lib/supervisor/persistence'
import { uiText } from '@/lib/i18n/uiText'

export default async function SupervisorExecutionsPage() {
  const user = await getCurrentUser()
  const access = await getAccess()
  if (!user) redirect('/login')
  if (!access.isAdmin) return <main style={{ padding: 32, color: '#fff' }}><h1><LocalizedText fallback={uiText('generatedUi.u_212a54cf3072409e')} /></h1><p><LocalizedText fallback={uiText('generatedUi.u_d92c603b66e19cf6')} /></p></main>
  const store = new SupabaseExecutionRecordStore(getAdminSupabase())
  const { items } = await store.listExecutions({ limit: 50, environment: 'sandbox' })
  return <main style={{ minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)' }}>
    <section style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <p style={{ color: '#1af0ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{uiText('generatedUi.u_f31883a5560d6711')}</p>
      <h1 style={{ margin: '6px 0 12px', fontSize: 34 }}><LocalizedText fallback={uiText('generatedUi.u_212a54cf3072409e')} /></h1>
      <p style={{ color: 'rgba(255,255,255,.72)', maxWidth: 920 }}><LocalizedText fallback={uiText('generatedUi.u_564052b8b45b2e4f')} /></p>
      <div style={{ overflowX: 'auto', marginTop: 24 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}><thead><tr>{["Execution","Incident / provider","Environment","Status","Verification","Started","Finished","Checkpoint","Steps","Failure"].map(h => <th key={h} style={{ textAlign:'left', padding:'12px 10px', color:'#ffc300', borderBottom:'1px solid rgba(255,255,255,.14)' }}>{h}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.executionId}><td style={cell}><code>{item.executionId}</code><div style={{ color:'#1af0ff', fontSize:12 }}>{uiText('generatedUi.u_b4e9b090399181ab')}</div></td><td style={cell}>{item.incidentId}<br/><span style={muted}>{item.provider}</span></td><td style={cell}>{item.targetEnvironment}<br/><span style={muted}>{item.targetOrigin}</span></td><td style={cell}>{item.status}</td><td style={cell}>{item.verificationStatus}</td><td style={cell}>{item.startedAt}</td><td style={cell}>{item.completedAt || item.failedAt || '—'}</td><td style={cell}>{item.checkpointStatus}</td><td style={cell}>{item.completedStepIds.length}{uiText('generatedUi.u_4ddb3e96801a1ee2')}</td><td style={cell}>{item.sanitizedErrorMessage || '—'}</td></tr>)}</tbody></table>{items.length === 0 ? <p style={{ color:'rgba(255,255,255,.66)' }}><LocalizedText fallback={uiText('generatedUi.u_0d6780fac899f2d9')} /></p> : null}</div>
    </section>
  </main>
}
const cell = { padding:'12px 10px', borderBottom:'1px solid rgba(255,255,255,.08)', verticalAlign:'top' as const, color:'rgba(255,255,255,.88)', fontSize:13 }
const muted = { color:'rgba(255,255,255,.55)', fontSize:12 }
