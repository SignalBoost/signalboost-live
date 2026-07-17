import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAccess } from '@/lib/auth/access'
import { loadLanguage } from '@/lib/i18n/loadLanguage'
import { SupabaseVercelHealthStore } from '@/lib/supervisor/providers/vercel'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'

function Field({ k, v }: { k: string; v: string }) { return <div><dt style={muted}>{k}</dt><dd style={{ margin: 0, wordBreak: 'break-word' }}>{v}</dd></div> }
function pick(v?: string) { const l = (v || 'en').slice(0, 2).toLowerCase(); return ['en','es','pt','pl','ru'].includes(l) ? l : 'en' }
export default async function VercelHealthPage() {
  const user = await getCurrentUser(); if (!user) redirect('/login')
  const access = await getAccess(); const dict = await loadLanguage(pick((await cookies()).get('sb_locale')?.value)); const t = (dict as any).vercelHealth || {}
  if (!access.isAdmin) return <main style={page}><h1>{t.title || 'Vercel Deployment Health Intelligence'}</h1><p>{t.adminOnly || 'Admin access required.'}</p></main>
  const runs = await new SupabaseVercelHealthStore(getAdminSupabase()).listRuns({ limit: 20 })
  return <main style={page}><section style={panel}><p style={kicker}>{t.kicker || 'Read-only Vercel workflow'}</p><h1>{t.title || 'Vercel Deployment Health Intelligence'}</h1><p style={muted}>{t.subtitle || 'Observed deployments, evidence, verification, and persisted operator history. No redeploys, saves, env changes, or browser automation are available here.'}</p>{runs.length === 0 ? <p style={muted}>{t.empty || 'No health runs recorded yet.'}</p> : <div style={{ display:'grid', gap:16 }}>{runs.map(run => <article key={run.runId} style={card}><div style={row}><div><p style={kicker}>{run.status}</p><h2 style={{ margin:'4px 0' }}><code>{run.runId}</code></h2></div><span style={badge}>{run.verification.status}</span></div><dl style={grid}><Field k="Project" v={run.projectId}/><Field k="Environment" v={run.environment}/><Field k="Completed" v={run.completedAt}/><Field k="Incident" v={run.incident?.errorCode || 'none'}/><Field k="Plan" v={run.plan?.planId || 'none'}/><Field k="Completed steps" v={run.completedStepIds.join(', ') || 'none'}/></dl><h3>{t.evidence || 'Evidence'}</h3><ul>{run.evidence.map(e => <li key={e.evidenceId}><strong>{e.kind}</strong> · <code>{e.stepId}</code> — {e.summary}</li>)}</ul><p style={muted}>{run.verification.summary}</p></article>)}</div>}</section></main>
}
const page={minHeight:'100vh',padding:32,color:'#fff',background:'linear-gradient(135deg,#07111f,#05070c)'}; const panel={border:'1px solid rgba(255,255,255,.12)',borderRadius:24,padding:24,background:'rgba(255,255,255,.06)'}; const card={border:'1px solid rgba(255,255,255,.12)',borderRadius:18,padding:18,background:'rgba(0,0,0,.24)'}; const grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}; const row={display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap' as const}; const muted={color:'rgba(255,255,255,.68)'}; const kicker={color:'#1af0ff',fontWeight:800,textTransform:'uppercase' as const,letterSpacing:1}; const badge={border:'1px solid rgba(26,240,255,.35)',borderRadius:999,padding:'6px 10px',color:'#1af0ff'}
