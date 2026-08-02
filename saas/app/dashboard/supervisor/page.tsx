// saas/app/dashboard/supervisor/page.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import aiKillSwitchLocales from '@/lib/i18n/aiKillSwitchLocales.json'
import { createBrowserProviderDiagnosticsSnapshot } from '@/lib/browser-provider'
import { getAccess } from '@/lib/auth/access'
import { loadLanguage } from '@/lib/i18n/loadLanguage'
import { createPlatformHealthSnapshot } from '@/lib/supervisor/platform-health'
import { anomaliesFromPlatformAlerts, classifyPlatformState, parseScheduledInstances } from '@/lib/supervisor/health-severity'
import { SupabaseVercelHealthStore, type VercelHealthRun } from '@/lib/supervisor/providers/vercel'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import GlobalAiKillSwitch from '@/components/supervisor/GlobalAiKillSwitch'
type Row = Record<string, any>
const safeLang = (value?: string) => { const lang = (value || 'en').slice(0, 2).toLowerCase(); return ['en','es','pt','pl','ru'].includes(lang) ? lang : 'en' }
const fmt = (value?: string | null) => value || '—'
const ms = (start?: string, end?: string) => { const a = Date.parse(start || ''); const b = Date.parse(end || ''); return Number.isFinite(a) && Number.isFinite(b) ? `${Math.max(0, Math.round((b - a) / 1000))}s` : '—' }
const age = (value?: string) => { const t = Date.parse(value || ''); return Number.isFinite(t) ? `${Math.max(0, Math.round((Date.now() - t) / 60000))}m` : '—' }
function countRuns(items: VercelHealthRun[], pred: (item: VercelHealthRun) => boolean) { return items.filter(pred).length }
function Field({ k, v }: { k: string; v: any }) { return <div><dt style={muted}>{k}</dt><dd style={{ margin: 0, wordBreak: 'break-word' }}>{String(v ?? '—')}</dd></div> }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section style={panel}><h2 style={{ marginTop: 0 }}>{title}</h2>{children}</section> }
async function readTable(db: any, table: string, select = '*') { const { data } = await db.from(table).select(select).limit(100); return (data ?? []) as Row[] }
function mapAudit(run: VercelHealthRun, type: string) { return run.auditEvents.find(e => e.eventType.includes(type))?.occurredAt }
function state(runs: VercelHealthRun[]) { if (runs.some(r => ['verification_failed','read_failed','rejected'].includes(r.status))) return 'red'; if (runs.some(r => r.status === 'incident_detected')) return 'yellow'; return 'green' }

export default async function SupervisorOperationsCenter({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/login')
  const params = await searchParams || {}
  const param = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v }
  const matches = (value: unknown, key: string) => { const f = param(key); return !f || f === 'all' || String(value ?? '').toLowerCase() === f.toLowerCase() }
  const search = String(param('q') || '').trim().toLowerCase()
  const textHas = (...values: unknown[]) => !search || values.some(v => String(v ?? '').toLowerCase().includes(search))
  const access = await getAccess(); const lang = safeLang((await cookies()).get('sb_locale')?.value); const dict = await loadLanguage(lang); const t = (dict as any).supervisorSoc as Record<string,string>
  const killSwitchCopy = ((aiKillSwitchLocales as any)[lang] || (aiKillSwitchLocales as any).en) as Record<string,string>
  if (!access.isAdmin) return <main style={page}><h1>{t.title}</h1><p>{t.adminOnly}</p></main>
  const db = getAdminSupabase(); const runs = await new SupabaseVercelHealthStore(db).listRuns({ limit: 50 }).catch(() => [])
  const [instances, workItems, leases, triggers] = await Promise.all([
    readTable(db, 'supervisor_instances').catch(() => []), readTable(db, 'supervisor_work_items').catch(() => []), readTable(db, 'supervisor_leases').catch(() => []), readTable(db, 'vercel_observation_triggers').catch(() => []),
  ])
  const health = createPlatformHealthSnapshot({ runs, instances, workItems, leases, triggers, ciState: 'unknown', localizationComplete: true })
  // THE HEADLINE IS A VERIFIED CLAIM, NOT A RULE FIRING. The snapshot above scores subsystems
  // and raises anomalies; it does not know whether anything is actually broken. Severity is
  // decided by checking impact — is work stranded, has a runtime missed its own schedule, is
  // the monitoring data even trustworthy — because an operator woken at 3am by "critical"
  // must be able to trust that the word was earned.
  const scheduledInstances = parseScheduledInstances(process.env.SUPERVISOR_SCHEDULED_INSTANCES)
  const verified = classifyPlatformState({
    anomalies: anomaliesFromPlatformAlerts(health.alerts as any),
    instances: instances.map(i => {
      const id = String(i.instance_id || i.instanceId || '')
      const interval = scheduledInstances[id]
      return {
        instanceId: id,
        status: String(i.status ?? ''),
        // Declared through SUPERVISOR_SCHEDULED_INSTANCES. Undeclared means continuous, which
        // is the stricter reading — a runtime nobody declared still gets reported when quiet.
        liveness: interval ? ('scheduled' as const) : ('continuous' as const),
        scheduleIntervalSeconds: interval || null,
        lastHeartbeatAt: i.heartbeat_at || i.heartbeatAt || null,
        lastCompletedAt: i.updated_at || i.updatedAt || null,
      }
    }),
    work: workItems.map(w => ({
      workItemId: String(w.work_item_id || w.workItemId || w.id || ''),
      state: String(w.state ?? ''),
      ownedByLeaseId: w.lease_id || w.leaseId || null,
      updatedAt: w.updated_at || w.updatedAt || null,
    })),
    leases: leases.map(l => ({
      leaseId: String(l.lease_id || l.leaseId || l.id || ''),
      workItemId: l.work_item_id || l.workItemId || null,
      status: String(l.status ?? ''),
      expiresAt: l.expires_at || l.expiresAt || null,
      heartbeatAt: l.heartbeat_at || l.heartbeatAt || null,
    })),
    observedAt: health.capturedAt,
    // If the snapshot failed its own verification, nothing derived from it is asserted.
    monitoringTrustworthy: health.verification.status === 'verified',
    monitoringReasons: health.verification.reasons,
  })
  const stateLabel = verified.state === 'incident' ? (t.stateIncident || 'Incident — verified impact')
    : verified.state === 'degraded' ? (t.stateDegraded || 'Attention required')
    : verified.state === 'unknown' ? (t.stateUnknown || 'Unverified — investigation required')
    : (t.stateOperational || 'Operational')
  const topFinding = verified.findings.find(f => f.severity === 'critical')
    || verified.findings.find(f => f.severity === 'high')
    || verified.findings.find(f => f.severity === 'unverified')
    || verified.findings[0]
  // FAIL CLOSED, exactly as saas/proxy.ts does. It admits traffic only on `=== true`; a missing
  // table, a missing row or an RLS denial all mean blocked. Reading `!== false` here made an
  // unreadable row render as "AI AUTONOMY ACTIVE" while the middleware 503'd every webhook.
  const { data: systemStatus, error: systemStatusError } = await db.from('system_status').select('ai_autonomous_execution_enabled').eq('id', 'global').maybeSingle()
  const killSwitchState: 'active' | 'engaged' | 'unavailable' = systemStatusError || !systemStatus ? 'unavailable' : systemStatus.ai_autonomous_execution_enabled === true ? 'active' : 'engaged'
  const bpal = createBrowserProviderDiagnosticsSnapshot(); const providers = bpal.providers.filter(p => matches(p.providerId, 'provider'))
  const activeInstances = instances.filter(i => ['starting','healthy','draining'].includes(String(i.status)))
  const filteredWorkItems = workItems.filter(w => matches(w.provider, 'provider') && matches(w.environment, 'environment') && matches(w.state, 'status') && textHas(w.project_id, w.projectId, w.work_item_id, w.workItemId, w.incident_id, w.provider))
  const activeWork = filteredWorkItems.filter(w => !['completed','failed','blocked','expired','abandoned'].includes(String(w.state))).slice(0, 25)
  const latest = runs[0]; const successful = runs.filter(r => ['healthy','incident_detected'].includes(r.status) && ['verified','partially_verified'].includes(r.verification.status))
  const platform = state(runs); const lastAudit = runs.flatMap(r => r.auditEvents).sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt))[0]?.occurredAt
  const filteredRuns = runs.filter(r => matches(r.environment, 'environment') && matches(r.status, 'status') && matches(r.verification.status, 'verification') && matches(r.incident?.severity, 'severity') && matches(r.incident?.provider || 'vercel', 'provider') && textHas(r.projectId, r.governance?.deploymentId, r.incident?.affectedResource, r.incident?.incidentId, r.runId, r.incident?.provider))
  const githubWork = workItems.filter(w => String(w.provider) === 'github')
  const githubTriggers = triggers.filter(tr => String(tr.provider || tr.provider_id || '').includes('github') || String(tr.trigger_source || '').includes('github'))
  const githubActive = githubWork.filter(w => !['completed','failed','blocked','expired','abandoned'].includes(String(w.state)))
  const githubFailed = githubWork.filter(w => ['failed','blocked','expired','abandoned'].includes(String(w.state)))
  const incidents = filteredRuns.filter(r => r.incident).slice(0, 20)
  const severity = (s: string) => incidents.filter(r => r.incident?.severity === s)
  const avg = (vals: number[]) => vals.length ? `${Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)}s` : '—'
  const durations = filteredRuns.map(r => (Date.parse(r.completedAt)-Date.parse(r.startedAt))/1000).filter(Number.isFinite)
  const pct = (n: number, d = filteredRuns.length) => d ? `${n} (${Math.round((n / d) * 100)}%)` : '0 (0%)'
  const verificationSuccess = filteredRuns.length ? `${Math.round((countRuns(filteredRuns, r => ['verified','partially_verified'].includes(r.verification.status)) / filteredRuns.length) * 100)}%` : '—'
  const stateLabel = platform === 'green' ? t.green : platform === 'yellow' ? t.yellow : t.red
  return <main style={page}>
    <section style={hero}><p style={kicker}>{t.kicker}</p><h1 style={{ margin:'6px 0' }}>{t.title}</h1><p style={muted}>{t.subtitle}</p><p style={notice}>{t.readOnly}</p></section>
    <GlobalAiKillSwitch state={killSwitchState} labels={{ title: t.aiKillSwitch, active: t.aiAutonomyActive, disabled: t.aiAutonomyDisabled, description: t.aiKillSwitchDescription, engage: t.engageGlobalKillSwitch, restore: t.restoreAiAutonomy, working: t.updatingAiStatus, error: t.aiStatusUpdateFailed, unavailable: killSwitchCopy.unavailable, unavailableDescription: killSwitchCopy.unavailableDescription, unavailableAction: killSwitchCopy.unavailableAction }} />
    <div style={grid2}>
      <Card title={t.platformHealth}><dl style={fields}><Field k={t.overallState} v={stateLabel}/><Field k={t.impact || 'Impact'} v={topFinding ? topFinding.impact : (t.noImpact || 'No impact detected.')}/><Field k={t.requiredAction || 'Required action'} v={topFinding ? topFinding.requiredAction : (t.noActionRequired || 'None.')}/><Field k={t.pagesOnCall || 'Wakes on-call'} v={verified.pageOutOfHours ? (t.yes || 'Yes') : (t.no || 'No')}/><Field k={t.healthScore || 'Health score'} v={`${health.score}%`}/><Field k={t.lastObservation} v={fmt(latest?.completedAt)}/><Field k={t.lastVerification} v={fmt(latest?.verification.checkedAt)}/><Field k={t.lastAudit} v={fmt(lastAudit)}/><Field k={t.uptime} v={activeInstances.map(i => `${i.instance_id || i.instanceId}: ${age(i.started_at || i.startedAt)}`).join(' · ') || t.none}/><Field k={t.activeInstances} v={activeInstances.length}/><Field k={t.leader} v={leases.find(l => l.status === 'active') ? `${leases.find(l => l.status === 'active')?.owner_instance_id} / ${leases.find(l => l.status === 'active')?.owner_runtime_id}` : t.none}/></dl></Card>
      <Card title={t.healthMetrics}><dl style={fields}><Field k={t.totalObservations} v={runs.length}/><Field k={t.successfulObservations} v={successful.length}/><Field k={t.verificationSuccess} v={verificationSuccess}/><Field k={t.avgObservationDuration} v={avg(durations)}/><Field k={t.avgVerificationDuration} v={avg(durations)}/><Field k={t.providerAvailability} v={providers.map(p => `${p.providerId}: ${p.health.state}`).join(' · ')}/><Field k={t.queueDepth} v={activeWork.length}/></dl></Card>
    </div>

    <div style={grid2}>
      <Card title={t.subsystemHealth || 'Subsystem Health'}><div style={cards}>{health.subsystems.map(s => <article key={s.id} style={card}><h3>{(t as any)[s.id] || s.id}</h3><dl style={fields}><Field k={t.status} v={s.status}/><Field k={t.healthScore || 'Health score'} v={`${s.score}%`}/><Field k={t.metric || 'Metric'} v={s.metric ?? '—'}/><Field k={t.evidence} v={s.evidence.join(' · ') || s.summary}/></dl></article>)}</div></Card>
      <Card title={t.trendGraphs || 'Trend Graphs'}><div style={cards}>{health.trends.map(tr => <article key={tr.bucket} style={mini}><h3>{(t as any)[tr.bucket] || tr.bucket}</h3><div style={{height:10,borderRadius:999,background:'rgba(255,255,255,.12)',overflow:'hidden'}}><span style={{display:'block',height:'100%',width:`${tr.score}%`,background:tr.score>89?'#38f2a4':tr.score>69?'#ffd166':'#ff5c7a'}} /></div><dl style={fields}><Field k={t.healthScore || 'Health score'} v={`${tr.score}%`}/><Field k={t.healthy || 'Healthy'} v={tr.healthy}/><Field k={t.warning || 'Warning'} v={tr.warning}/><Field k={t.criticalStatus || 'Critical'} v={tr.critical}/><Field k={t.unknown || 'Unknown'} v={tr.unknown}/></dl></article>)}</div></Card>
    </div>
    <div style={grid2}>
      <Card title={t.recentAlerts || 'Recent Alerts'}>{health.alerts.length ? health.alerts.map(a => <article key={a.alertId} style={mini}><strong>{(t as any)[a.type] || a.type}</strong><p>{a.message}</p><Field k={t.evidence} v={a.evidence.join(' · ') || '—'}/></article>) : <p style={muted}>{t.noData}</p>}</Card>
      <Card title={t.recentRecoveries || 'Recent Recoveries'}>{health.recoveries.length ? health.recoveries.map(a => <article key={a.alertId} style={mini}>{a.message}</article>) : <p style={muted}>{t.none}</p>}</Card>
      <Card title={t.currentWarnings || 'Current Warnings'}>{health.subsystems.filter(s => s.status === 'warning').map(s => <p key={s.id}>{(t as any)[s.id] || s.id}: {s.summary}</p>) || <p style={muted}>{t.none}</p>}</Card>
      <Card title={t.healthHistory || 'Health History'}><dl style={fields}><Field k={t.last_hour || 'Last hour'} v={`${health.trends[0]?.score ?? 0}%`}/><Field k={t['24_hours'] || '24 hours'} v={`${health.trends[1]?.score ?? 0}%`}/><Field k={t['7_days'] || '7 days'} v={`${health.trends[2]?.score ?? 0}%`}/><Field k={t['30_days'] || '30 days'} v={`${health.trends[3]?.score ?? 0}%`}/><Field k={t.verificationStatus} v={health.verification.status}/></dl></Card>
    </div>
    <Card title={t.supervisorCluster || 'Supervisor Cluster'}><div style={tableWrap}><table style={table}><thead><tr>{[t.supervisorId || "Supervisor ID",t.runtimeId || "Runtime ID",t.leaseOwner || "Lease owner",t.fence,t.heartbeat || "Heartbeat",t.status,t.activeWork,t.lastReconciliation || "Last reconciliation"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{activeInstances.map(i => { const owned = leases.filter(l => l.owner_instance_id === i.instance_id && l.owner_runtime_id === i.runtime_id && l.status === 'active'); return <tr key={`${i.instance_id}-${i.runtime_id}`}><td>{i.instance_id}</td><td>{i.runtime_id}</td><td>{owned.length ? t.leader : t.none}</td><td>{owned.map(l => l.fencing_token).join(', ') || '—'}</td><td>{fmt(i.heartbeat_at || i.heartbeatAt)}</td><td>{i.status}</td><td>{activeWork.filter(w => owned.some(l => l.work_item_id === w.work_item_id)).length}</td><td>{fmt(i.last_reconciliation_at || i.updated_at || i.heartbeat_at)}</td></tr> })}</tbody></table></div></Card>
    <Card title={t.githubProvider}><p style={notice}>{t.githubReadOnlyNotice}</p><dl style={fields}><Field k={t.githubConnectionHealth} v={githubFailed.length ? t.warning : t.healthy}/><Field k={t.githubRepositoryCount} v={githubWork.filter(w => String(w.work_item_type || w.workItemType).includes('github')).length}/><Field k={t.githubActiveObservations} v={githubActive.length}/><Field k={t.githubFailedObservations} v={githubFailed.length}/><Field k={t.githubWebhookStatus} v={githubTriggers.length ? t.healthy : t.unknown}/><Field k={t.githubSchedulerStatus} v={githubWork.length ? t.healthy : t.unknown}/><Field k={t.githubRateLimit} v={t.unknown}/><Field k={t.githubRecentWorkflowFailures} v={githubFailed.filter(w => String(w.capability_version || w.capabilityVersion).includes('workflow')).length}/><Field k={t.githubRecentPullRequestFindings} v={githubWork.filter(w => String(w.capability_version || w.capabilityVersion).includes('pull')).length}/><Field k={t.verificationStatus} v={githubWork.find(w => w.state === 'verification_pending') ? 'pending' : t.unknown}/><Field k={t.evidence} v={githubWork.map(w => w.execution_id || w.executionId).filter(Boolean).slice(0,3).join(' · ') || t.none}/><Field k={t.auditTimeline} v={githubTriggers.map(tr => tr.delivery_id || tr.deliveryId || tr.trigger_source).filter(Boolean).slice(0,3).join(' · ') || t.none}/><Field k={t.currentLease} v={leases.find(l => githubActive.some(w => w.work_item_id === l.work_item_id))?.lease_id || t.none}/></dl></Card>
    <Card title={t.providerHealth}><div style={cards}>{providers.map(p => { const pruns = runs.filter(r => r.projectId || p.providerId === 'vercel'); const current = activeWork.filter(w => (w.provider || '').toString() === p.providerId); const open = incidents.filter(r => r.incident?.provider === p.providerId); const lease = leases.find(l => current.some(w => w.work_item_id === l.work_item_id) && l.status === 'active'); return <article key={p.providerId} style={card}><h3>{p.providerId}</h3><dl style={fields}><Field k={t.status} v={p.health.state}/><Field k={t.lastObservationAny} v={fmt(pruns[0]?.completedAt)}/><Field k={t.currentWork} v={current.length}/><Field k={t.openIncidents} v={open.length}/><Field k={t.currentOwner} v={lease ? `${lease.owner_instance_id}/${lease.owner_runtime_id}` : t.none}/><Field k={t.currentLease} v={lease?.lease_id || t.none}/><Field k={t.fence} v={lease?.fencing_token ?? 0}/><Field k={t.verificationStatus} v={pruns[0]?.verification.status || t.none}/><Field k={t.capabilityCount} v={p.capabilities.filter(c => c.readOnly).length}/><Field k={t.lastAudit} v={fmt(pruns.flatMap(r => r.auditEvents).at(0)?.occurredAt)}/></dl></article> })}</div></Card>
    <Card title={t.activeWork}><div style={tableWrap}><table style={table}><thead><tr>{[t.workId,t.provider,t.project,t.environment,t.triggerSource,t.assignedSupervisor,t.leaseStatus,t.fence,t.currentStage,t.verificationStage,t.age,t.duration,t.status].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{activeWork.map(w => { const lease = leases.find(l => l.work_item_id === w.work_item_id && l.status === 'active'); const run = runs.find(r => r.governance?.workItemId === w.work_item_id); const trigger = triggers.find(tr => tr.work_item_id === w.work_item_id); return <tr key={w.work_item_id}><td>{w.work_item_id}</td><td>{w.provider}</td><td>{w.project_id || '—'}</td><td>{w.environment}</td><td>{trigger?.trigger_source || '—'}</td><td>{lease ? `${lease.owner_instance_id}/${lease.owner_runtime_id}` : '—'}</td><td>{lease?.status || '—'}</td><td>{lease?.fencing_token ?? '—'}</td><td>{w.state}</td><td>{run?.verification.status || '—'}</td><td>{age(w.created_at)}</td><td>{ms(w.created_at, run?.completedAt)}</td><td>{w.state}</td></tr> })}</tbody></table></div></Card>
    <div style={grid2}><Card title={t.incidentQueue}>{["critical","high","medium","low"].map(s => <details key={s} open style={subcard}><summary>{(t as any)[s]} · {severity(s).length}</summary>{severity(s).map(r => <article key={r.runId} style={mini}><h3>{r.incident?.provider} · {r.incident?.incidentId}</h3><dl style={fields}><Field k={t.evidence} v={r.evidence.map(e=>e.summary).join(' | ')}/><Field k={t.auditTimeline} v={r.auditEvents.map(e=>e.eventType).join(' → ')}/><Field k={t.verification} v={r.verification.status}/><Field k={t.bpalCapability} v={r.bpalSelections.map(b=>b.capabilityId).join(', ') || t.none}/><Field k={t.selectedChannel} v={r.selectedChannel}/><Field k={t.metadata} v={JSON.stringify({ project:r.projectId, environment:r.environment, deployment:r.governance?.deploymentId || r.incident?.affectedResource || null })}/></dl></article>)}</details>)}</Card>
    <Card title={t.verification}><dl style={fields}><Field k={t.verified} v={pct(countRuns(filteredRuns,r=>r.verification.status==='verified'))}/><Field k={t.partiallyVerified} v={pct(countRuns(filteredRuns,r=>r.verification.status==='partially_verified'))}/><Field k={t.unverifiable} v={pct(countRuns(filteredRuns,r=>r.verification.status==='unverifiable'))}/><Field k={t.failed} v={pct(countRuns(filteredRuns,r=>r.verification.status==='failed'))}/><Field k={t.rejected} v={pct(countRuns(filteredRuns,r=>r.verification.status==='rejected'))}/></dl></Card></div>
    <Card title={t.auditTimeline}>{runs.length === 0 ? <p style={muted}>{t.noData}</p> : <ol style={timeline}>{runs.slice(0,10).map(r => <li key={r.runId} style={mini}><strong>{r.runId}</strong><div>{[t.observation,mapAudit(r,"observation"),t.thinker,mapAudit(r,"thinker"),t.policy,mapAudit(r,"policy"),t.bpal,mapAudit(r,"bpal"),t.verification,r.verification.checkedAt,t.persistence,r.completedAt,t.completion,r.completedAt].map((x,i)=><span key={i} style={i%2?muted:pill}>{x || '—'}</span>)}</div></li>)}</ol>}</Card>
    <Card title={t.metrics || 'Metrics'}><dl style={fields}><Field k={t.observationRate || 'Observation rate'} v={`${filteredRuns.length}/50`}/><Field k={t.verificationRate || 'Verification rate'} v={verificationSuccess}/><Field k={t.incidentRate || 'Incident rate'} v={filteredRuns.length ? `${Math.round((incidents.length/filteredRuns.length)*100)}%` : '—'}/><Field k={t.averageResponseTime || 'Average response time'} v={avg(durations)}/><Field k={t.averageVerificationTime || 'Average verification time'} v={avg(durations)}/><Field k={t.queueDepth} v={activeWork.length}/><Field k={t.supervisorUtilization || 'Supervisor utilization'} v={activeInstances.length ? `${Math.round((activeWork.length/activeInstances.length)*100)}%` : '0%'}/><Field k={t.providerUtilization || 'Provider utilization'} v={providers.length ? `${Math.round((activeWork.length/providers.length)*100)}%` : '0%'}/></dl></Card>
    <Card title={`${t.filters} / ${t.search}`}><dl style={fields}><Field k={t.provider} v={providers.map(p=>p.providerId).join(', ')}/><Field k={t.environment} v={[...new Set(runs.map(r=>r.environment))].join(', ') || t.all}/><Field k={t.status} v={[...new Set(runs.map(r=>r.status))].join(', ') || t.all}/><Field k={t.severity} v={['critical','high','medium','low'].map(s => `${(t as any)[s]}:${severity(s).length}`).join(' · ')}/><Field k={t.time} v={t.all}/><Field k={t.triggerSource} v={[...new Set(triggers.map(tr=>tr.trigger_source).filter(Boolean))].join(', ') || t.all}/><Field k={t.supervisor} v={activeInstances.map(i=>i.instance_id).join(', ') || t.all}/><Field k={t.verificationState} v={[...new Set(runs.map(r=>r.verification.status))].join(', ') || t.all}/><Field k={t.search} v={`${t.project}, ${t.deployment}, ${t.incident}, ${t.provider}, ${t.workId}`}/></dl></Card>
  </main>
}
const page={minHeight:'100vh',padding:32,color:'#fff',background:'linear-gradient(135deg,#07111f,#05070c)'}; const hero={border:'1px solid rgba(255,255,255,.12)',borderRadius:28,padding:28,background:'rgba(255,255,255,.07)',marginBottom:18}; const panel={border:'1px solid rgba(255,255,255,.12)',borderRadius:22,padding:20,background:'rgba(255,255,255,.055)',marginBottom:18}; const card={border:'1px solid rgba(255,255,255,.12)',borderRadius:18,padding:16,background:'rgba(0,0,0,.22)'}; const subcard={border:'1px solid rgba(26,240,255,.2)',borderRadius:14,padding:12,background:'rgba(26,240,255,.06)',marginTop:12}; const mini={border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:12,marginTop:10}; const grid2={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:18}; const fields={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}; const cards={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}; const muted={color:'rgba(255,255,255,.68)'}; const notice={color:'#b8ffdd',fontWeight:700}; const kicker={color:'#1af0ff',fontWeight:800,textTransform:'uppercase' as const,letterSpacing:1}; const tableWrap={overflowX:'auto' as const}; const table={width:'100%',borderCollapse:'collapse' as const}; const timeline={display:'grid',gap:12,paddingLeft:20}; const pill={display:'inline-block',border:'1px solid rgba(26,240,255,.25)',borderRadius:999,padding:'4px 8px',margin:'4px',color:'#1af0ff'}
