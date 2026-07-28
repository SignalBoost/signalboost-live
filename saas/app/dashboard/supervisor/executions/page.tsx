import { LocalizedText } from '@/components/i18n/LocalizedText'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { SupabaseExecutionRecordStore } from '@/lib/supervisor/persistence'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


export default async function SupervisorExecutionsPage() {
  const user = await getCurrentUser()
  const access = await getAccess()
  if (!user) redirect('/login')
  if (!access.isAdmin) return <main style={{ padding: 32, color: '#fff' }}><h1><LocalizedText fallback={uiCopy('u_98c6e4398b79b0e2')} /></h1><p><LocalizedText fallback={uiCopy('u_bcb00cd706068955')} /></p></main>
  const store = new SupabaseExecutionRecordStore(getAdminSupabase())
  const { items } = await store.listExecutions({ limit: 50, environment: 'sandbox' })
  return <main style={{ minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)' }}>
    <section style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <p style={{ color: '#1af0ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{uiCopy('u_75f4f079ba4e6387')}</p>
      <h1 style={{ margin: '6px 0 12px', fontSize: 34 }}><LocalizedText fallback={uiCopy('u_5d112470655a3094')} /></h1>
      <p style={{ color: 'rgba(255,255,255,.72)', maxWidth: 920 }}><LocalizedText fallback={uiCopy('u_8f8f821000cba63e')} /></p>
      <div style={{ overflowX: 'auto', marginTop: 24 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}><thead><tr>{[uiCopy('u_5615dfc422aaa233'),uiCopy('u_f787dc289627b048'),uiCopy('u_6815073a135cdcee'),uiCopy('u_8337a4d79b63ba78'),uiCopy('u_30703e0b94bf5fd4'),uiCopy('u_6fcb5480aa2418ef'),uiCopy('u_47b4e41b1962cee3'),uiCopy('u_7e2ebd7c34578ec4'),uiCopy('u_7e603a7075824fd2'),uiCopy('u_0ea652c6ac586d16')].map(h => <th key={h} style={{ textAlign:'left', padding:'12px 10px', color:'#ffc300', borderBottom:'1px solid rgba(255,255,255,.14)' }}>{h}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.executionId}><td style={cell}><code>{item.executionId}</code><div style={{ color:'#1af0ff', fontSize:12 }}>{uiCopy('u_a486904a7fc7f17e')}</div></td><td style={cell}>{item.incidentId}<br/><span style={muted}>{item.provider}</span></td><td style={cell}>{item.targetEnvironment}<br/><span style={muted}>{item.targetOrigin}</span></td><td style={cell}>{item.status}</td><td style={cell}>{item.verificationStatus}</td><td style={cell}>{item.startedAt}</td><td style={cell}>{item.completedAt || item.failedAt || '—'}</td><td style={cell}>{item.checkpointStatus}</td><td style={cell}>{item.completedStepIds.length}{uiCopy('u_4f3a18d5bd7beaf6')}</td><td style={cell}>{item.sanitizedErrorMessage || '—'}</td></tr>)}</tbody></table>{items.length === 0 ? <p style={{ color:'rgba(255,255,255,.66)' }}><LocalizedText fallback={uiCopy('u_6ce43182054345ef')} /></p> : null}</div>
    </section>
  </main>
}
const cell = { padding:'12px 10px', borderBottom:'1px solid rgba(255,255,255,.08)', verticalAlign:'top' as const, color:'rgba(255,255,255,.88)', fontSize:13 }
const muted = { color:'rgba(255,255,255,.55)', fontSize:12 }
