import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import { SupabaseExecutionRecordStore } from '@/lib/supervisor/persistence'

export default async function SupervisorExecutionsPage() {
  const user = await getCurrentUser()
  const access = await getAccess()
  if (!user) redirect('/login')
  if (!access.isAdmin) return <main style={{ padding: 32, color: '#fff' }}><h1>Supervisor execution history</h1><p>Admin access required.</p></main>
  const store = new SupabaseExecutionRecordStore(getAdminSupabase())
  const { items } = await store.listExecutions({ limit: 50, environment: 'sandbox' })
  return <main style={{ minHeight: '100vh', padding: 32, color: '#fff', background: 'linear-gradient(135deg,#06111f,#05070c)' }}>
    <section style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 24, background: 'rgba(255,255,255,.06)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <p style={{ color: '#1af0ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Read-only sandbox audit</p>
      <h1 style={{ margin: '6px 0 12px', fontSize: 34 }}>Supervisor execution history</h1>
      <p style={{ color: 'rgba(255,255,255,.72)', maxWidth: 920 }}>Durable records are sanitized audit history only. They cannot approve, replay, resume, or execute browser tasks. Paused browser sessions remain memory-only and do not survive restart.</p>
      <div style={{ overflowX: 'auto', marginTop: 24 }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}><thead><tr>{['Execution','Incident / provider','Environment','Status','Verification','Started','Finished','Checkpoint','Steps','Failure'].map(h => <th key={h} style={{ textAlign:'left', padding:'12px 10px', color:'#ffc300', borderBottom:'1px solid rgba(255,255,255,.14)' }}>{h}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.executionId}><td style={cell}><code>{item.executionId}</code><div style={{ color:'#1af0ff', fontSize:12 }}>SANDBOX</div></td><td style={cell}>{item.incidentId}<br/><span style={muted}>{item.provider}</span></td><td style={cell}>{item.targetEnvironment}<br/><span style={muted}>{item.targetOrigin}</span></td><td style={cell}>{item.status}</td><td style={cell}>{item.verificationStatus}</td><td style={cell}>{item.startedAt}</td><td style={cell}>{item.completedAt || item.failedAt || '—'}</td><td style={cell}>{item.checkpointStatus}</td><td style={cell}>{item.completedStepIds.length} completed</td><td style={cell}>{item.sanitizedErrorMessage || '—'}</td></tr>)}</tbody></table>{items.length === 0 ? <p style={{ color:'rgba(255,255,255,.66)' }}>No sandbox execution records found.</p> : null}</div>
    </section>
  </main>
}
const cell = { padding:'12px 10px', borderBottom:'1px solid rgba(255,255,255,.08)', verticalAlign:'top' as const, color:'rgba(255,255,255,.88)', fontSize:13 }
const muted = { color:'rgba(255,255,255,.55)', fontSize:12 }
