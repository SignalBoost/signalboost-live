// saas/app/dashboard/supervisor/page.tsx
//
// THREE AUDIENCES, IN ORDER, AND ONE VOCABULARY EACH.
//
//   OPERATIONS  at the top and always visible: current state, business impact, what to do,
//               whether this pages, what the conclusion rests on, and what may happen next.
//   ENGINEERING expandable: subsystem diagnostics, cluster, providers, work, trends.
//   AUDIT       expandable: verification, the evidence ledger behind the score, the timeline.
//
// The page used to print two independent status vocabularies with the same word. Operational
// severity ("is work blocked") and diagnostic thresholds ("did a rule cross 70") both rendered
// as "critical", so the top of the page could say Operational while a card below said
// critical, and an operator learned to distrust both. Diagnostics now come from
// diagnostic-status.ts, whose vocabulary has NO WORD FOR AN OUTAGE, so a diagnostic card can
// never be read as one.
//
// Nothing on this page decides anything. Every judgement is computed by a pure module —
// operational-assessment, risk-forecast, health-domains, health-ledger, diagnostic-status —
// so the page and the modules cannot disagree, and every claim on screen can be reproduced
// from its inputs in a test.
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import aiKillSwitchLocales from '@/lib/i18n/aiKillSwitchLocales.json'
import supervisorAssessmentLocales from '@/lib/i18n/supervisorAssessmentLocales.json'
import { createBrowserProviderDiagnosticsSnapshot } from '@/lib/browser-provider'
import { getAccess } from '@/lib/auth/access'
import { loadLanguage } from '@/lib/i18n/loadLanguage'
import { createPlatformHealthSnapshot } from '@/lib/supervisor/platform-health'
import { assessHealthDomains } from '@/lib/supervisor/health-domains'
import { buildHealthLedger } from '@/lib/supervisor/health-ledger'
import { assessDiagnostic, summariseDiagnostics, splitIncidents } from '@/lib/supervisor/diagnostic-status'
import { buildOperationalAssessment } from '@/lib/supervisor/operational-assessment'
import { buildRiskForecast } from '@/lib/supervisor/risk-forecast'
import { assessStability } from '@/lib/supervisor/assessment-stability'
import { buildAssessmentIntegrity } from '@/lib/supervisor/assessment-integrity'
import { recommendationPolicy } from '@/lib/supervisor/recommendation-policy'
import { assessContinuity, buildAssessmentRecord, MODULE_VERSION } from '@/lib/supervisor/assessment-record'
import { listAssessments, recordAssessmentIfChanged } from '@/lib/supervisor/assessment-ledger'
import { absenceWindowSeconds, listObservationPolicies, observationTiming } from '@/lib/supervisor/observation-policy'
import { SupabaseVercelHealthStore, type VercelHealthRun } from '@/lib/supervisor/providers/vercel'
import { getAdminSupabase, getCurrentUser } from '@/utils/supabase/server'
import GlobalAiKillSwitch from '@/components/supervisor/GlobalAiKillSwitch'
import OperationalAssessmentPanel from '@/components/supervisor/OperationalAssessmentPanel'
type Row = Record<string, any>
const PERSISTENCE_PROBE_ID = 'database'
const PERSISTENCE_PROBE_TARGET = 'self-healing:persistence-roundtrip'
const safeLang = (value?: string) => { const lang = (value || 'en').slice(0, 2).toLowerCase(); return ['en','es','pt','pl','ru'].includes(lang) ? lang : 'en' }
const fmt = (value?: string | null) => value || '—'
const ms = (start?: string, end?: string) => { const a = Date.parse(start || ''); const b = Date.parse(end || ''); return Number.isFinite(a) && Number.isFinite(b) ? `${Math.max(0, Math.round((b - a) / 1000))}s` : '—' }
const age = (value?: string) => { const t = Date.parse(value || ''); return Number.isFinite(t) ? `${Math.max(0, Math.round((Date.now() - t) / 60000))}m` : '—' }
function countRuns(items: VercelHealthRun[], pred: (item: VercelHealthRun) => boolean) { return items.filter(pred).length }
function Field({ k, v }: { k: string; v: any }) { return <div><dt style={muted}>{k}</dt><dd style={{ margin: 0, wordBreak:'break-word' }}>{String(v ?? '—')}</dd></div> }
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section style={panel}><h2 style={{ marginTop:0 }}>{title}</h2>{children}</section> }
async function readTable(db: any, table: string, select = '*') { const { data } = await db.from(table).select(select).limit(100); return (data ?? []) as Row[] }
function mapAudit(run: VercelHealthRun, type: string) { return run.auditEvents.find(e => e.eventType.includes(type))?.occurredAt }

export default async function SupervisorOperationsCenter({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser(); if (!user) redirect('/login')
  const params = await searchParams || {}
  const param = (key: string) => { const v = params[key]; return Array.isArray(v) ? v[0] : v }
  const matches = (value: unknown, key: string) => { const f = param(key); return !f || f === 'all' || String(value ?? '').toLowerCase() === f.toLowerCase() }
  const search = String(param('q') || '').trim().toLowerCase()
  const textHas = (...values: unknown[]) => !search || values.some(v => String(v ?? '').toLowerCase().includes(search))
  const access = await getAccess(); const lang = safeLang((await cookies()).get('sb_locale')?.value); const dict = await loadLanguage(lang)
  // COPY LIVES IN TWO FILES AND THE EXISTING ONE WINS. supervisorSoc is the page's long-standing
  // dictionary; supervisorAssessmentLocales carries only the keys this rebuild introduced. Merging
  // with supervisorSoc last means a key that already exists keeps its established translation and
  // can never be silently overwritten by a new file.
  const assessmentCopy = ((supervisorAssessmentLocales as any)[lang] || (supervisorAssessmentLocales as any).en) as Record<string,string>
  const t = { ...assessmentCopy, ...((dict as any).supervisorSoc as Record<string,string>) } as Record<string,string>
  const killSwitchCopy = ((aiKillSwitchLocales as any)[lang] || (aiKillSwitchLocales as any).en) as Record<string,string>
  if (!access.isAdmin) return <main style={page}><h1>{t.title}</h1><p>{t.adminOnly}</p></main>
  const db = getAdminSupabase(); const runs = await new SupabaseVercelHealthStore(db).listRuns({ limit: 50 }).catch(() => [])
  const { data: persistenceProbeRows } = await db.from('self_healing_native_probe_samples').select('status,observed_at,details').eq('probe_id',PERSISTENCE_PROBE_ID).eq('target',PERSISTENCE_PROBE_TARGET).order('observed_at',{ ascending:false }).limit(12)
  const persistenceRecent = ((persistenceProbeRows ?? []) as Row[]).filter(row => Date.now() - Date.parse(String(row.observed_at || '')) <= 2 * 60 * 60 * 1000 && row.details?.verification === 'read_back_verified')
  const persistenceEvidence = persistenceRecent.length ? { attempted: persistenceRecent.length, failed: persistenceRecent.filter(row => String(row.status) !== 'healthy').length } : null
  const [instances, workItems, leases, triggers] = await Promise.all([
    readTable(db, 'supervisor_instances').catch(() => []), readTable(db, 'supervisor_work_items').catch(() => []), readTable(db, 'supervisor_leases').catch(() => []), readTable(db, 'vercel_observation_triggers').catch(() => []),
  ])
  const health = createPlatformHealthSnapshot({ runs, instances, workItems, leases, triggers, ciState: 'unknown', localizationComplete: true })
  const bpal = createBrowserProviderDiagnosticsSnapshot(); const providers = bpal.providers.filter(p => matches(p.providerId, 'provider'))
  const activeInstances = instances.filter(i => ['starting','healthy','draining'].includes(String(i.status)))
  const filteredWorkItems = workItems.filter(w => matches(w.provider, 'provider') && matches(w.environment, 'environment') && matches(w.state, 'status') && textHas(w.project_id, w.projectId, w.work_item_id, w.workItemId, w.incident_id, w.provider))
  const activeWork = filteredWorkItems.filter(w => !['completed','failed','blocked','expired','abandoned'].includes(String(w.state))).slice(0, 25)
  const latest = runs[0]; const successful = runs.filter(r => ['healthy','incident_detected'].includes(r.status) && ['verified','partially_verified'].includes(r.verification.status))
  const lastAudit = runs.flatMap(r => r.auditEvents).sort((a,b) => Date.parse(b.occurredAt)-Date.parse(a.occurredAt))[0]?.occurredAt
  const filteredRuns = runs.filter(r => matches(r.environment, 'environment') && matches(r.status, 'status') && matches(r.verification.status, 'verification') && matches(r.incident?.severity, 'severity') && matches(r.incident?.provider || 'vercel', 'provider') && textHas(r.projectId, r.governance?.deploymentId, r.incident?.affectedResource, r.incident?.incidentId, r.runId, r.incident?.provider))

  // ── THE FACTS EVERYTHING ELSE IS COMPUTED FROM ───────────────────────────────
  // Each of these is read once, here, and passed to the pure modules. A figure computed twice
  // in two places is how the page contradicted itself the first time.
  const liveWork = workItems.filter(w => !['completed','failed','blocked','expired','abandoned'].includes(String(w.state)))
  const activeLeaseIds = new Set(leases.filter(l => String(l.status) === 'active').map(l => String(l.lease_id || l.leaseId || l.id || '')))
  // BLOCKED means live work with no ACTIVE lease owning it. That is the difference between
  // "no leader" — normal for a serverless runtime — and an outage.
  const blockedWork = liveWork.filter(w => !activeLeaseIds.has(String(w.lease_id || w.leaseId || ''))).length
  const expiredLeases = leases.filter(l => Date.parse(l.expires_at || l.expiresAt || '') <= Date.now())
  // HOLDING WORK MEANS HOLDING LIVE WORK. Counting every expired lease with a work_item_id
  // swept in leases whose item had already completed, and the forecast then claimed high
  // exposure — "that work would become unowned and stop progressing" — about records that
  // had already finished. Finished records are a reconciliation backlog, which is separately
  // reported as housekeeping. A forecast built on a count that does not mean what its
  // sentence says is the same defect as the old "critical", one layer down.
  const liveWorkIds = new Set(liveWork.map(w => String(w.work_item_id || w.workItemId || w.id || '')))
  const expiredLeasesWithWork = expiredLeases.filter(l => liveWorkIds.has(String(l.work_item_id || l.workItemId || ''))).length
  const staleWork = liveWork.filter(w => Date.now() - Date.parse(w.updated_at || w.created_at || w.createdAt || '') > 60*60*1000).length
  const failedRuns = runs.filter(r => ['read_failed','verification_failed','rejected'].includes(r.status))
  const verificationFailed = runs.filter(r => ['failed','rejected','unverifiable'].includes(r.verification.status)).length
  const auditGaps = runs.filter(r => !(r.auditEvents || []).some(e => e.eventType.includes('workflow_completed') || e.eventType.includes('workflow_failed') || e.eventType.includes('workflow_rejected'))).length
  const providerBroken = bpal.providers.filter(p => p.support.productionExecutionEnabled || p.worker.maximumConcurrentWork !== 0 || p.capabilities.length === 0)

  // ── CADENCE COMES FROM POLICY, NOT FROM ELAPSED TIME ─────────────────────────
  // A missed WINDOW is an owed run that did not happen. It is not "27 minutes of silence",
  // which means opposite things for a 15-minute cron and a continuous daemon.
  const observationPolicies = await listObservationPolicies(db)
  const enabledPolicies = observationPolicies.filter(policy => policy.enabled)
  const lastObservationAt = latest?.completedAt || null
  const missedWindows = enabledPolicies.filter(policy => observationTiming(policy, lastObservationAt).windowMissed).length
  const leadPolicy = enabledPolicies[0] || null
  // WHERE THE OBSERVATION STANDS, not merely whether a scheduler should fire. "Due now"
  // beside "1 missed window" read as a contradiction; overdue-by, tolerance and escalates-in
  // are the three numbers that answer it, and all three are derived from the declared cadence.
  const timing = leadPolicy ? observationTiming(leadPolicy, lastObservationAt) : null
  // A runtime with neither a policy nor a heartbeat cannot be judged at all. Saying so is the
  // point: reported as healthy is how a real outage stays invisible, reported as absent is how
  // on-call stops trusting the alarm.
  const unverifiableRuntimes = activeInstances
    .filter(i => !enabledPolicies.some(p => p.instanceId === String(i.instance_id || i.instanceId || '')) && !(i.heartbeat_at || i.heartbeatAt))
    .map(i => String(i.instance_id || i.instanceId || i.runtime_id || '?'))

  // ── DOMAINS, LEDGER, ASSESSMENT, FORECAST ────────────────────────────────────
  const snapshot = assessHealthDomains({
    execution: { dispatched: runs.length, failed: failedRuns.length },
    observation: { expected: successful.length + missedWindows, completed: successful.length },
    verification: { attempted: runs.length, failed: verificationFailed },
    audit: { runs: runs.length, withoutTerminalEvent: auditGaps },
    // A dedicated controlled write/read round-trip now supplies independent persistence evidence.
    // No audit or neighbouring metric is borrowed as a substitute.
    persistence: persistenceEvidence,
    coordination: { absentInstances: 0, activeInstances: activeInstances.length, expiredLeasesWithWork, staleWork },
    providerConnectivity: { registered: bpal.providers.length, invalid: providerBroken.length },
    businessImpact: { blockedWork, queueDepth: activeWork.length },
  })
  const ledger = buildHealthLedger({ snapshot })
  const forecast = buildRiskForecast({
    missedObservationWindows: missedWindows,
    observationIntervalSeconds: leadPolicy ? leadPolicy.intervalSeconds : null,
    queueDepth: activeWork.length,
    blockedWork,
    expiredLeasesWithWork,
    reconciliationBacklog: expiredLeases.length,
    invalidProviderRegistrations: providerBroken.length,
    unverifiableRuntimes,
  })
  const assessment = buildOperationalAssessment({
    blockedWork,
    confirmedServiceFailures: failedRuns.length,
    reducedCapabilities: providerBroken.map(p => p.providerId),
    observationsExpected: successful.length + missedWindows,
    observationsCompleted: successful.length,
    unverifiableLiveness: unverifiableRuntimes,
    unmeasuredDomains: snapshot.unmeasured,
    verificationAttempted: runs.length,
    verificationFailed,
    auditGaps,
    queueDepth: activeWork.length,
    riskForecastCount: forecast.forecasts.length,
  })
  const minutes = (seconds: number) => `${Math.round(seconds / 60)}m`
  const observationStateLabel = !timing
    ? t.noPolicy
    : timing.state === 'absent'
      ? t.observationAbsent
      : timing.state === 'overdue'
        ? t.observationOverdue
        : t.observationOnSchedule
  const execution = {
    model: t.executionModelValue,
    currentState: activeWork.length ? (t.runtimeObserving) : (t.runtimeIdle),
    observationState: observationStateLabel,
    overdueBy: timing && timing.overdueSeconds > 0 ? minutes(timing.overdueSeconds) : '—',
    tolerance: timing ? minutes(timing.toleranceSeconds) : '—',
    escalatesIn: !timing ? '—' : timing.escalatesInSeconds > 0 ? minutes(timing.escalatesInSeconds) : t.escalationPassed,
    lastCompleted: fmt(lastObservationAt),
    lastResult: latest ? `${latest.status} · ${latest.verification.status}` : (t.none),
  }
  // ── HAS THIS CONCLUSION HELD? ────────────────────────────────────────────────
  // `contradicts` uses the SAME predicate as confirmedServiceFailures above. If the streak
  // were computed from a looser or stricter test, the page could show "Operational, unchanged
  // across 50 observations" while the state was reached from a different reading of the same
  // runs — the exact class of self-contradiction this rebuild exists to remove.
  const failedRunIds = new Set(failedRuns.map(r => r.runId))
  const stability = assessStability(runs.map(r => ({ at: r.completedAt, contradicts: failedRunIds.has(r.runId) })))
  const hm = (seconds: number) => (seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m` : `${Math.round(seconds / 60)}m`)
  // ── CONTINUITY NOW COMES FROM STORED CONCLUSIONS WHERE THERE ARE ANY ─────────
  // The observation streak could only ever answer "has any run contradicted us". The ledger
  // answers the question an operator was actually asking — when did the state last change —
  // so it is preferred whenever it holds history, and the observation streak remains the
  // fallback for a ledger that is empty or unreachable.
  const ledgerHistory = await listAssessments(db)
  const continuity = assessContinuity(ledgerHistory.records, assessment.state)
  const observationStreak = !stability.measured
    ? t.notMeasured
    : stability.consecutive === 0
      ? t.contradictedByLastObservation
      // "at least" because at this point the limit is RETENTION, not stability.
      : `${stability.windowExhausted ? `${t.atLeast} ` : ''}${stability.consecutive} ${t.observationsUnit} · ${hm(stability.durationSeconds)}`
  const unchangedAcross = ledgerHistory.available && continuity.measured && continuity.consecutive > 0
    ? `${continuity.windowExhausted ? `${t.atLeast} ` : ''}${continuity.consecutive} ${t.assessmentsUnit} · ${hm(continuity.durationSeconds)}`
    : observationStreak
  // The assessment's own timestamp. It differs from the last observation whenever a run is
  // owed, and an operator asking "how fresh is this conclusion" is asking for this one.
  const assessedAt = new Date()
  const verification = {
    state: assessment.stateVerified ? t.verifiedState : t.partlyVerifiedState,
    lastAt: `${assessedAt.toISOString().slice(11, 16)} UTC`,
    unchangedAcross,
  }

  // ── DIAGNOSTICS: A SECOND VOCABULARY, DELIBERATELY WITHOUT THE WORD "CRITICAL" ─
  const diagnostics = health.subsystems.map(s => assessDiagnostic(s.id, s.score, s.metric ?? null, {
    blockedWork,
    runtimeIdleByDesign: activeWork.length === 0,
    observationWindowMissed: missedWindows > 0,
  }))
  const diagnosticSummary = summariseDiagnostics(diagnostics)
  const incidentRuns = filteredRuns.filter(r => r.incident).slice(0, 20)
  const incidents = splitIncidents(incidentRuns.map(r => ({
    runId: r.runId,
    severity: String(r.incident?.severity || 'unknown'),
    status: String(r.verification.status || ''),
    completedAt: r.completedAt,
  })))
  const incidentById = new Map<string, VercelHealthRun>(incidentRuns.map(r => [r.runId, r]))

  // Evidence age reported as AGES, not as a bare percentage. "Evidence freshness 23%" reads
  // like a failing grade and answers nothing — 23% of what? Two timestamps and a policy state
  // are what a person can act on; the score keeps its place behind them, with its working.
  const agesSeconds = runs.map(r => Math.round((Date.now() - Date.parse(r.completedAt)) / 1000)).filter(Number.isFinite)
  const evidenceAges = { newest: agesSeconds.length ? Math.min(...agesSeconds) : null, oldest: agesSeconds.length ? Math.max(...agesSeconds) : null }
  const ago = (seconds: number | null) => (seconds === null ? '—' : seconds < 90 ? `${seconds}s` : seconds < 5400 ? `${Math.round(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`)
  const evidenceAgeView = { newest: ago(evidenceAges.newest), oldest: ago(evidenceAges.oldest) }

  // ── DOES THE ASSESSMENT HOLD TOGETHER? ───────────────────────────────────────
  // Computed last, from the finished outputs of every other module, because its job is to
  // catch two of them disagreeing. Feeding it the raw inputs instead would let it agree with
  // a wrong conclusion for the same reason the conclusion was wrong.
  const integrityInput = {
    measuredDomains: snapshot.domains.length - snapshot.unmeasured.length,
    totalDomains: snapshot.domains.length,
    operationalState: assessment.state,
    blockedWork,
    confidence: assessment.confidence,
    limitingBasisLines: assessment.assessmentBasis.filter(line => line.polarity === 'limits').length,
    diagnosticsWithConfirmedImpact: diagnostics.filter(d => d.operationalImpact === 'confirmed').length,
    ledgerReconciles: ledger.reconciles,
    stabilityConsecutive: stability.consecutive,
    newestObservationContradicts: runs.length > 0 && failedRunIds.has(runs[0].runId),
    newestEvidenceSeconds: evidenceAges.newest,
    oldestEvidenceSeconds: evidenceAges.oldest,
    overdueSeconds: timing ? timing.overdueSeconds : 0,
    toleranceSeconds: timing ? timing.toleranceSeconds : 1,
    inputs: [runs.length, successful.length, missedWindows, blockedWork, activeWork.length, verificationFailed, auditGaps, expiredLeasesWithWork, providerBroken.length, persistenceRecent.length, persistenceEvidence?.failed ?? null, snapshot.unmeasured.join(','), lastObservationAt],
  }
  // Computed twice, deliberately. The first pass produces the fingerprint and the contradiction
  // count that the ledger row is built from; the second reports whether that row was actually
  // stored. `inputsRetained` is never assumed — the page asserts full reproducibility only on
  // the evidence of a write it can see.
  const integrityDraft = buildAssessmentIntegrity(integrityInput)

  // ── THE ASSESSMENT LEDGER ────────────────────────────────────────────────────
  // Every figure the modules consumed, verbatim, beside what was concluded from it. Written
  // only when the fingerprint differs from the newest stored row, so the ledger records
  // changes rather than page views.
  const inputsSnapshot = {
    observationsExpected: successful.length + missedWindows,
    observationsCompleted: successful.length,
    blockedWork,
    queueDepth: activeWork.length,
    confirmedServiceFailures: failedRuns.length,
    reducedCapabilities: providerBroken.map(p => p.providerId),
    verificationAttempted: runs.length,
    verificationFailed,
    auditGaps,
    unmeasuredDomains: snapshot.unmeasured,
    unverifiableLiveness: unverifiableRuntimes,
    persistenceAttempted: persistenceEvidence?.attempted ?? 0,
    persistenceFailed: persistenceEvidence?.failed ?? null,
    expiredLeasesWithWork,
    reconciliationBacklog: expiredLeases.length,
    missedObservationWindows: missedWindows,
    observationIntervalSeconds: leadPolicy ? leadPolicy.intervalSeconds : null,
    overdueSeconds: timing ? timing.overdueSeconds : 0,
    toleranceSeconds: timing ? timing.toleranceSeconds : 0,
    lastObservationAt,
    newestEvidenceSeconds: evidenceAges.newest,
    oldestEvidenceSeconds: evidenceAges.oldest,
  }
  const assessmentRecord = buildAssessmentRecord({
    state: assessment.state,
    impactAffected: assessment.impactAffected,
    confidence: assessment.confidence,
    pageOnCall: assessment.pageOnCall,
    stateReason: assessment.stateReason,
    impact: assessment.impact,
    basis: assessment.assessmentBasis,
    confidenceReasons: assessment.confidenceReasons.map(r => ({ code: r.code, label: r.label, penalty: r.penalty })),
    forecasts: forecast.forecasts.map(f => ({ code: f.code, observed: f.observed, trigger: f.trigger, consequence: f.consequence, exposure: f.exposure })),
    contradictions: integrityDraft.contradictions.map(c => ({ code: c.code, statement: c.statement })),
    evidenceAgeState: integrityDraft.evidenceAge.stateLabel,
    diagnosticsNominal: diagnosticSummary.nominal,
    diagnosticsAttention: diagnosticSummary.attention.length,
    score: ledger.score,
    inputs: inputsSnapshot,
    inputDigest: integrityDraft.reproducibility.digest,
  })
  const ledgerWrite = await recordAssessmentIfChanged(db, assessmentRecord)
  const inputsRetained = ledgerWrite.recorded || (!ledgerWrite.unavailable && ledgerHistory.records[0]?.inputDigest === assessmentRecord.inputDigest)
  const integrity = buildAssessmentIntegrity({ ...integrityInput, inputsRetained })

  const { data: systemStatus, error: systemStatusError } = await db.from('system_status').select('ai_autonomous_execution_enabled').eq('id', 'global').maybeSingle()
  const killSwitchState: 'active' | 'engaged' | 'unavailable' = systemStatusError || !systemStatus ? 'unavailable' : systemStatus.ai_autonomous_execution_enabled === true ? 'active' : 'engaged'
  const githubWork = workItems.filter(w => String(w.provider) === 'github')
  const githubTriggers = triggers.filter(tr => String(tr.provider || tr.provider_id || '').includes('github') || String(tr.trigger_source || '').includes('github'))
  const githubActive = githubWork.filter(w => !['completed','failed','blocked','expired','abandoned'].includes(String(w.state)))
  const githubFailed = githubWork.filter(w => ['failed','blocked','expired','abandoned'].includes(String(w.state)))
  const avg = (vals: number[]) => vals.length ? `${Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)}s` : '—'
  const durations = filteredRuns.map(r => (Date.parse(r.completedAt)-Date.parse(r.startedAt))/1000).filter(Number.isFinite)
  const pct = (n: number, d = filteredRuns.length) => d ? `${n} (${Math.round((n / d) * 100)}%)` : '0 (0%)'
  const verificationSuccess = filteredRuns.length ? `${Math.round((countRuns(filteredRuns, r => ['verified','partially_verified'].includes(r.verification.status)) / filteredRuns.length) * 100)}%` : '—'

  return <main style={page}>
    <section style={hero}><p style={kicker}>{t.kicker}</p><h1 style={{ margin:'6px 0' }}>{t.title}</h1><p style={muted}>{t.subtitle}</p><p style={notice}>{t.readOnly}</p></section>
    <GlobalAiKillSwitch state={killSwitchState} labels={{ title: t.aiKillSwitch, active: t.aiAutonomyActive, disabled: t.aiAutonomyDisabled, description: t.aiKillSwitchDescription, engage: t.engageGlobalKillSwitch, restore: t.restoreAiAutonomy, working: t.updatingAiStatus, error: t.aiStatusUpdateFailed, unavailable: killSwitchCopy.unavailable, unavailableDescription: killSwitchCopy.unavailableDescription, unavailableAction: killSwitchCopy.unavailableAction }} />
    <OperationalAssessmentPanel assessment={assessment} forecast={forecast} execution={execution} verification={verification} integrity={integrity} evidenceAge={evidenceAgeView} t={t} />
    <Card title={t.systemDiagnostics}>
      <dl style={fields}><Field k={t.diagnosticsNominal} v={diagnosticSummary.nominal}/><Field k={t.diagnosticsNeedingAttention} v={diagnosticSummary.attention.length}/><Field k={t.operationalImpactLabel} v={diagnosticSummary.quiet ? t.impactNone : t.diagnosticsWorkingHours}/></dl>
      <p style={muted}>{diagnosticSummary.quiet ? (t.diagnosticsQuiet) : (t.diagnosticsAttention)}</p>
      {diagnosticSummary.attention.length ? <details open style={subcard}><summary>{`${t.diagnosticsNeedingAttention} · ${diagnosticSummary.attention.length}`}</summary>{diagnosticSummary.attention.map(d => { const policy = recommendationPolicy(d.status); return <article key={d.subsystemId} style={mini}>
        <h3>{(t as any)[d.subsystemId] || d.subsystemId}</h3>
        <dl style={fields}><Field k={t.status} v={d.label}/><Field k={t.operationalImpactLabel} v={d.impactStatement}/><Field k={t.recommendation} v={d.recommendation || (t.noActionRequired)}/></dl>
        <details style={subcard}><summary>{t.whyThisConclusion}</summary>
          <dl style={fields}><Field k={t.reasonLabel} v={d.explanation}/><Field k={t.evidence} v={d.evidence.join(' · ')}/><Field k={t.reasoningLabel} v={d.reasoning}/><Field k={t.changesWhen} v={d.changesWhen}/></dl>
          <dl style={fields}><Field k={t.ruleLabel} v={d.ruleName}/><Field k={t.rulePurpose} v={d.rulePurpose}/><Field k={t.safetyRationale} v={d.ruleSafetyRationale}/><Field k={t.failureMode} v={d.ruleFailureMode}/></dl>
          <dl style={fields}><Field k={t.policyLabel} v={policy.policyLabel}/><Field k={t.priorityLabel} v={policy.priorityLabel}/><Field k={t.actionDeadline} v={policy.actionDeadlineLabel}/><Field k={t.expectedResolution} v={policy.expectedResolution}/></dl>
          <details style={subcard}><summary>{`${t.policySource} · ${policy.sourceLabel}`}</summary><dl style={fields}><Field k={t.defaultPolicyLabel} v={policy.defaultActionDeadlineLabel}/><Field k={t.buyerOverride} v={policy.buyerActionDeadlineLabel}/><Field k={t.inEffect} v={policy.actionDeadlineLabel}/></dl><p style={muted}>{`${policy.rationale} ${t.defaultPolicyNote}`}</p></details>
          <div style={chainWrap}><p style={muted}>{t.inferenceChain}</p>{d.inferenceChain.map((step, index) => <div key={step.step}>{index > 0 ? <p style={chainArrow}>{'↓'}</p> : null}<div style={chainStep}><p style={chainLabel}>{(t as any)[`chain_${step.step}`] || step.step}</p><p style={chainText}>{step.statement}</p></div></div>)}</div>
          <div style={findingConfidence}><p style={chainLabel}>{`${t.confidenceInThisFinding} · ${d.reasoningConfidence.label}`}</p><ul style={plainList}>{d.reasoningConfidence.factors.map(factor => <li key={factor.statement} style={factor.supports ? supportItem : conflictItem}>{factor.statement}</li>)}</ul></div>
        </details>
      </article> })}</details> : null}
    </Card>
    <div style={grid2}>
      <Card title={t.incidentQueue}>
        <details open style={subcard}><summary>{`${t.operationalIncidentsLabel} · ${incidents.active.length}`}</summary>{incidents.active.length ? incidents.active.map(rec => { const r = incidentById.get(rec.runId); return <article key={rec.runId} style={mini}><h3>{`${r?.incident?.provider} · ${r?.incident?.incidentId}`}</h3><dl style={fields}><Field k={t.severityLabel} v={rec.severity}/><Field k={t.verification} v={rec.status}/><Field k={t.evidence} v={r?.evidence.map(e=>e.summary).join(' | ')}/></dl></article> }) : <p style={muted}>{t.noOperationalIncidents}</p>}</details>
        <details style={subcard}><summary>{`${t.recordedIncidentsLabel} · ${incidents.historical.length}`}</summary><p style={muted}>{t.recordedIncidentsMeaning}</p>{incidents.historical.map(rec => { const r = incidentById.get(rec.runId); return <article key={rec.runId} style={mini}><h3>{`${r?.incident?.provider} · ${r?.incident?.incidentId}`}</h3><dl style={fields}><Field k={t.severityLabel} v={rec.severity}/><Field k={t.verification} v={rec.status}/><Field k={t.auditTimeline} v={r?.auditEvents.map(e=>e.eventType).join(' → ')}/><Field k={t.metadata} v={JSON.stringify({ project:r?.projectId, environment:r?.environment, deployment:r?.governance?.deploymentId || r?.incident?.affectedResource || null })}/></dl></article> })}</details>
      </Card>
      <Card title={t.activeWork}><div style={tableWrap}><table style={table}><thead><tr>{[t.workId,t.provider,t.project,t.environment,t.triggerSource,t.assignedSupervisor,t.leaseStatus,t.fence,t.currentStage,t.verificationStage,t.age,t.duration,t.status].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{activeWork.map(w => { const lease = leases.find(l => l.work_item_id === w.work_item_id && l.status === 'active'); const run = runs.find(r => r.governance?.workItemId === w.work_item_id); const trigger = triggers.find(tr => tr.work_item_id === w.work_item_id); return <tr key={w.work_item_id}><td>{w.work_item_id}</td><td>{w.provider}</td><td>{w.project_id || '—'}</td><td>{w.environment}</td><td>{trigger?.trigger_source || '—'}</td><td>{lease ? `${lease.owner_instance_id}/${lease.owner_runtime_id}` : '—'}</td><td>{lease?.status || '—'}</td><td>{lease?.fencing_token ?? '—'}</td><td>{w.state}</td><td>{run?.verification.status || '—'}</td><td>{age(w.created_at)}</td><td>{ms(w.created_at, run?.completedAt)}</td><td>{w.state}</td></tr> })}</tbody></table></div></Card>
    </div>
    <details style={panel}>
      <summary style={summaryText}>{t.engineeringView}</summary>
      <div style={grid2}>
        <Card title={t.subsystemMeasurements}><div style={cards}>{health.subsystems.map(s => { const d = diagnostics.find(x => x.subsystemId === s.id); return <article key={s.id} style={card}><h3>{(t as any)[s.id] || s.id}</h3><dl style={fields}><Field k={t.status} v={d ? d.label : s.status}/><Field k={t.metric} v={s.metric ?? '—'}/><Field k={t.operationalImpactLabel} v={d ? d.impactStatement : '—'}/><Field k={t.evidence} v={s.evidence.join(' · ') || s.summary}/></dl></article> })}</div></Card>
        <Card title={t.measurements}><dl style={fields}><Field k={t.totalObservations} v={runs.length}/><Field k={t.successfulObservations} v={successful.length}/><Field k={t.verificationSuccess} v={verificationSuccess}/><Field k={t.avgObservationDuration} v={avg(durations)}/><Field k={t.queueDepth} v={activeWork.length}/><Field k={t.providerAvailability} v={providers.map(p => `${p.providerId}: ${p.health.state}`).join(' · ')}/><Field k={t.observationRate} v={`${filteredRuns.length}/50`}/><Field k={t.incidentRate} v={filteredRuns.length ? `${Math.round((incidentRuns.length/filteredRuns.length)*100)}%` : '—'}/></dl></Card>
      </div>
      <Card title={t.supervisorCluster}><div style={tableWrap}><table style={table}><thead><tr>{[t.supervisorId,t.runtimeId,t.leaseOwner,t.fence,t.heartbeat,t.status,t.activeWork,t.lastReconciliation].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{activeInstances.map(i => { const owned = leases.filter(l => l.owner_instance_id === i.instance_id && l.owner_runtime_id === i.runtime_id && l.status === 'active'); return <tr key={`${i.instance_id}-${i.runtime_id}`}><td>{i.instance_id}</td><td>{i.runtime_id}</td><td>{owned.length ? t.leader : t.none}</td><td>{owned.map(l => l.fencing_token).join(', ') || '—'}</td><td>{fmt(i.heartbeat_at || i.heartbeatAt)}</td><td>{i.status}</td><td>{activeWork.filter(w => owned.some(l => l.work_item_id === w.work_item_id)).length}</td><td>{fmt(i.last_reconciliation_at || i.updated_at || i.heartbeat_at)}</td></tr> })}</tbody></table></div></Card>
      <Card title={t.providerHealth}><div style={cards}>{providers.map(p => { const pruns = runs.filter(r => r.projectId || p.providerId === 'vercel'); const current = activeWork.filter(w => (w.provider || '').toString() === p.providerId); const open = incidentRuns.filter(r => r.incident?.provider === p.providerId); const lease = leases.find(l => current.some(w => w.work_item_id === l.work_item_id) && l.status === 'active'); return <article key={p.providerId} style={card}><h3>{p.providerId}</h3><dl style={fields}><Field k={t.status} v={p.health.state}/><Field k={t.lastObservationAny} v={fmt(pruns[0]?.completedAt)}/><Field k={t.currentWork} v={current.length}/><Field k={t.openIncidents} v={open.length}/><Field k={t.currentOwner} v={lease ? `${lease.owner_instance_id}/${lease.owner_runtime_id}` : t.none}/><Field k={t.currentLease} v={lease?.lease_id || t.none}/><Field k={t.fence} v={lease?.fencing_token ?? 0}/><Field k={t.verificationStatus} v={pruns[0]?.verification.status || t.none}/><Field k={t.capabilityCount} v={p.capabilities.filter(c => c.readOnly).length}/><Field k={t.lastAudit} v={fmt(pruns.flatMap(r => r.auditEvents).at(0)?.occurredAt)}/></dl></article> })}</div></Card>
      <Card title={t.githubProvider}><p style={notice}>{t.githubReadOnlyNotice}</p><dl style={fields}><Field k={t.githubConnectionHealth} v={githubFailed.length ? t.warning : t.healthy}/><Field k={t.githubRepositoryCount} v={githubWork.filter(w => String(w.work_item_type || w.workItemType).includes('github')).length}/><Field k={t.githubActiveObservations} v={githubActive.length}/><Field k={t.githubFailedObservations} v={githubFailed.length}/><Field k={t.githubWebhookStatus} v={githubTriggers.length ? t.healthy : t.unknown}/><Field k={t.githubSchedulerStatus} v={githubWork.length ? t.healthy : t.unknown}/><Field k={t.githubRateLimit} v={t.unknown}/><Field k={t.githubRecentWorkflowFailures} v={githubFailed.filter(w => String(w.capability_version || w.capabilityVersion).includes('workflow')).length}/><Field k={t.githubRecentPullRequestFindings} v={githubWork.filter(w => String(w.capability_version || w.capabilityVersion).includes('pull')).length}/><Field k={t.evidence} v={githubWork.map(w => w.execution_id || w.executionId).filter(Boolean).slice(0,3).join(' · ') || t.none}/></dl></Card>
      <div style={grid2}>
        <Card title={t.recentAlerts}>{health.alerts.length ? health.alerts.map(a => <article key={a.alertId} style={mini}><strong>{(t as any)[a.type] || a.type}</strong><p>{a.message}</p><Field k={t.evidence} v={a.evidence.join(' · ') || '—'}/></article>) : <p style={muted}>{t.noData}</p>}</Card>
        <Card title={t.trendGraphs}><div style={cards}>{health.trends.map(tr => <article key={tr.bucket} style={mini}><h3>{(t as any)[tr.bucket] || tr.bucket}</h3><div style={{height:10,borderRadius:999,background:'rgba(255,255,255,.12)',overflow:'hidden'}}><span style={{display:'block',height:'100%',width:`${tr.score}%`,background:tr.score>89?'#38f2a4':tr.score>69?'#ffd166':'#ff5c7a'}} /></div></article>)}</div></Card>
      </div>
      <Card title={`${t.filters} / ${t.search}`}><dl style={fields}><Field k={t.provider} v={providers.map(p=>p.providerId).join(', ')}/><Field k={t.environment} v={[...new Set(runs.map(r=>r.environment))].join(', ') || t.all}/><Field k={t.status} v={[...new Set(runs.map(r=>r.status))].join(', ') || t.all}/><Field k={t.triggerSource} v={[...new Set(triggers.map(tr=>tr.trigger_source).filter(Boolean))].join(', ') || t.all}/><Field k={t.supervisor} v={activeInstances.map(i=>i.instance_id).join(', ') || t.all}/><Field k={t.verificationState} v={[...new Set(runs.map(r=>r.verification.status))].join(', ') || t.all}/><Field k={t.search} v={`${t.project}, ${t.deployment}, ${t.incident}, ${t.provider}, ${t.workId}`}/></dl></Card>
    </details>
    <details style={panel}>
      <summary style={summaryText}>{t.auditView}</summary>
      <Card title={t.evidenceLedger}>
        <dl style={fields}><Field k={t.assessmentScore} v={ledger.score === null ? (t.notMeasured) : `${ledger.score}%`}/><Field k={t.coverage} v={ledger.coverage}/><Field k={t.reconciles} v={ledger.reconciles ? (t.yes) : (t.no)}/></dl>
        <p style={muted}>{t.scoreMeaning}</p>
        {ledger.deductions.length ? <details style={subcard}><summary>{`${t.deductions} · ${ledger.deductions.length}`}</summary>{ledger.deductions.map(d => <article key={d.code} style={mini}><h3>{`${d.label} · −${d.points.toFixed(1)}`}</h3><dl style={fields}><Field k={t.why} v={d.why}/><Field k={t.evidence} v={d.evidence.join(' · ')}/><Field k={t.impact} v={d.impact}/><Field k={t.confidenceLabel} v={d.confidence}/><Field k={t.recommendation} v={d.recommendation}/></dl></article>)}</details> : <p style={strongText}>{t.noDeductions}</p>}
        {ledger.unmeasured.length ? <details style={subcard}><summary>{`${t.unmeasuredDomains} · ${ledger.unmeasured.length}`}</summary>{ledger.unmeasured.map(u => <p key={u.label} style={mini}>{`${u.label} — ${u.why}`}</p>)}</details> : null}
        {ledger.diagnostics.length ? <details style={subcard}><summary>{`${t.formulaDiagnostics} · ${ledger.diagnostics.length}`}</summary>{ledger.diagnostics.map(d => <article key={d.code} style={mini}><p>{d.note}</p><Field k={t.remedy} v={d.remedy}/></article>)}</details> : null}
      </Card>
      <div style={grid2}>
        <Card title={t.verification}><dl style={fields}><Field k={t.verified} v={pct(countRuns(filteredRuns,r=>r.verification.status==='verified'))}/><Field k={t.partiallyVerified} v={pct(countRuns(filteredRuns,r=>r.verification.status==='partially_verified'))}/><Field k={t.unverifiable} v={pct(countRuns(filteredRuns,r=>r.verification.status==='unverifiable'))}/><Field k={t.failed} v={pct(countRuns(filteredRuns,r=>r.verification.status==='failed'))}/><Field k={t.rejected} v={pct(countRuns(filteredRuns,r=>r.verification.status==='rejected'))}/><Field k={t.verificationStatus} v={health.verification.status}/><Field k={t.lastAudit} v={fmt(lastAudit)}/></dl></Card>
        <Card title={t.assessmentLedger}>
          <dl style={fields}><Field k={t.ledgerStatus} v={ledgerHistory.available ? (ledgerHistory.records.length ? `${ledgerHistory.records.length}` : t.noLedgerHistory) : t.ledgerUnavailable}/><Field k={t.thisAssessment} v={ledgerWrite.recorded ? t.ledgerRecorded : (ledgerWrite.reason || t.ledgerRecorded)}/><Field k={t.moduleVersion} v={MODULE_VERSION}/><Field k={t.stateSince} v={continuity.sinceAt || t.notMeasured}/><Field k={t.previousState} v={continuity.previousState || t.notMeasured}/></dl>
          <p style={muted}>{t.ledgerNote}</p>
          {ledgerHistory.records.length ? <div style={tableWrap}><table style={table}><thead><tr>{[t.recordedAt,t.currentState,t.confidenceLabel,t.conflictingSignals,t.inputDigest,t.moduleVersion].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{ledgerHistory.records.slice(0,12).map(rec => <tr key={`${rec.recordedAt}-${rec.inputDigest}`}><td>{rec.recordedAt}</td><td>{rec.operationalState}</td><td>{`${rec.confidence}%`}</td><td>{rec.contradictions}</td><td>{rec.inputDigest}</td><td>{rec.moduleVersion}</td></tr>)}</tbody></table></div> : null}
        </Card>
        <Card title={t.observationPolicy}><dl style={fields}>{enabledPolicies.map(p => <Field key={p.instanceId} k={p.instanceId} v={`${p.intervalSeconds}s · ${t.absenceWindow} ${absenceWindowSeconds(p)}s · ${p.source}`}/>)}<Field k={t.policyRationale} v={leadPolicy?.rationale || t.none}/></dl></Card>
      </div>
      <Card title={t.auditTimeline}>{runs.length === 0 ? <p style={muted}>{t.noData}</p> : <ol style={timeline}>{runs.slice(0,10).map(r => <li key={r.runId} style={mini}><strong>{r.runId}</strong><div>{[t.observation,mapAudit(r,'observation'),t.thinker,mapAudit(r,'thinker'),t.policy,mapAudit(r,'policy'),t.bpal,mapAudit(r,'bpal'),t.verification,r.verification.checkedAt,t.persistence,r.completedAt,t.completion,r.completedAt].map((x,i)=><span key={i} style={i%2?muted:pill}>{x || '—'}</span>)}</div></li>)}</ol>}</Card>
    </details>
  </main>
}
const page={minHeight:'100vh',padding:32,color:'#fff',background:'linear-gradient(135deg,#07111f,#05070c)'}; const hero={border:'1px solid rgba(255,255,255,.12)',borderRadius:28,padding:28,background:'rgba(255,255,255,.07)',marginBottom:18}; const panel={border:'1px solid rgba(255,255,255,.12)',borderRadius:22,padding:20,background:'rgba(255,255,255,.055)',marginBottom:18}; const card={border:'1px solid rgba(255,255,255,.12)',borderRadius:18,padding:16,background:'rgba(0,0,0,.22)'}; const subcard={border:'1px solid rgba(26,240,255,.2)',borderRadius:14,padding:12,background:'rgba(26,240,255,.06)',marginTop:12}; const mini={border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:12,marginTop:10}; const grid2={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:18}; const fields={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}; const cards={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14}; const muted={color:'rgba(255,255,255,.68)'}; const notice={color:'#b8ffdd',fontWeight:700}; const kicker={color:'#1af0ff',fontWeight:800,textTransform:'uppercase' as const,letterSpacing:1}; const tableWrap={overflowX:'auto' as const}; const table={width:'100%',borderCollapse:'collapse' as const}; const timeline={display:'grid',gap:12,paddingLeft:20}; const pill={display:'inline-block',border:'1px solid rgba(26,240,255,.25)',borderRadius:999,padding:'4px 8px',margin:'4px',color:'#1af0ff'}; const findingConfidence={marginTop:14,border:'1px solid rgba(255,255,255,.12)',borderRadius:14,padding:14}; const plainList={listStyle:'none',padding:0,margin:'10px 0 0',display:'grid',gap:6}; const supportItem={borderLeft:'2px solid rgba(56,242,164,.6)',paddingLeft:10,color:'rgba(255,255,255,.82)'}; const conflictItem={borderLeft:'2px solid rgba(255,92,122,.7)',paddingLeft:10,color:'#ffc9d4'}; const chainWrap={marginTop:14,border:'1px solid rgba(26,240,255,.18)',borderRadius:14,padding:14}; const chainStep={border:'1px solid rgba(255,255,255,.12)',borderRadius:12,padding:10}; const chainArrow={textAlign:'center' as const,margin:'6px 0',color:'#1af0ff',fontWeight:800}; const chainLabel={margin:0,fontSize:11,letterSpacing:1,textTransform:'uppercase' as const,color:'#1af0ff',fontWeight:800}; const chainText={margin:'4px 0 0'}; const strongText={fontWeight:700}; const summaryText={fontWeight:800,cursor:'pointer' as const,color:'#1af0ff'}