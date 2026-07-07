import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'
import { proposeInfrastructurePr } from '@/lib/infra-pr/tool'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

type Severity = 'low' | 'medium' | 'high' | 'critical'
type TimelineType = 'alert' | 'fix' | 'escalation' | 'reroute' | 'approval' | 'decision'
type PipelineId = 'primary' | 'backup' | 'secondary'

const VIDEO_CHANNELS = ['youtube', 'short_video']
const WORKFLOW_FILE = 'brand-overlay.yml'
const DISPATCH_TIMEOUT_MS = 30_000
const NOW = () => new Date().toISOString()

function minutesSince(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}
function id(prefix: string, value?: string) { return `${prefix}_${String(value || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 44)}` }
function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(n))) }
function avg(values: number[]) { const v = values.filter(Number.isFinite); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0 }
function severity(score: number): Severity { return score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low' }
function labelForSeverity(s: Severity) { return s === 'critical' ? 'Critical' : s === 'high' ? 'High' : s === 'medium' ? 'Medium' : 'Low' }
function pipelineStatus(score: number) { return score >= 90 ? 'critical' : score >= 70 ? 'degraded' : score >= 45 ? 'watch' : 'healthy' }
function campaignVideo(c: any) { return c?.metadata?.video || null }
function isVideoCampaign(c: any) { return VIDEO_CHANNELS.includes(String(c?.channel || '')) }
function isRendering(c: any) { return campaignVideo(c)?.status === 'rendering' }
function isFailed(c: any) { const v = campaignVideo(c); return v?.status === 'failed' || Boolean(v?.error || v?.voiceError || v?.brandingExhausted) }
function isReadyButNotFinal(c: any) { const v = campaignVideo(c); return v?.status === 'ready' && !(v?.branded === true && v?.voicedUrl) }
function keys(obj: any): string[] { return obj && typeof obj === 'object' ? Object.keys(obj) : [] }
function unbrandedLangs(video: any): string[] { const u = video?.unbrandedVoiced || {}; const b = video?.brandedLangs || {}; return keys(u).filter(lang => u[lang] && !b[lang]) }

function lifeCriticalText(value: any): boolean {
  const t = JSON.stringify(value || {}).toLowerCase()
  return [
    'life-critical', 'life critical', 'life and death', 'medical device', 'patient safety',
    'aviation fuel', 'aircraft safety', 'hospital emergency', 'nuclear', 'radiological',
    'emergency shutdown', 'human safety', 'safety critical'
  ].some(word => t.includes(word))
}

function buildPipeline(idValue: PipelineId, name: string, role: string, metrics: any) {
  const overload = clamp(metrics.active * 14 + metrics.failed * 22 + Math.max(0, metrics.avgAgeMin - 15) * 1.4 + metrics.errorRate * 55)
  const latencyMs = Math.max(180, metrics.avgAgeMin * 800 + metrics.active * 120)
  return {
    id: idValue,
    name,
    role,
    status: pipelineStatus(overload),
    healthScore: clamp(100 - overload),
    overloadRisk: overload,
    latencyMs,
    estimatedCostUsd: Number((metrics.costBase + metrics.active * metrics.costPerActive + metrics.failed * 2.5).toFixed(2)),
    activeJobs: metrics.active,
    failedJobs: metrics.failed,
    successRate: clamp(100 - metrics.errorRate * 100),
    nextAction: overload >= 70 ? 'autonomous_preemptive_reroute' : overload >= 45 ? 'autonomous_throttle_and_watch' : 'normal_execution',
    telemetry: metrics,
  }
}

function buildEvent(type: TimelineType, input: any) {
  const color = type === 'alert' ? 'yellow' : type === 'fix' && input.status === 'success' ? 'green' : type === 'escalation' && input.status === 'rejected' ? 'red' : type === 'escalation' ? 'orange' : type === 'reroute' ? 'cyan' : 'slate'
  return { id: input.id || id(type, input.pipeline || input.title), type, timestamp: input.timestamp || NOW(), pipeline: input.pipeline || 'primary', title: input.title, severity: input.severity || 'low', status: input.status || 'open', color, decision: input.decision || null, approverRole: input.approverRole || null, riskLevel: input.riskLevel || input.severity || 'low', recommendation: input.recommendation || '', telemetry: input.telemetry || {} }
}

function candidateIdsFromTelemetry(telemetry: any) {
  const failed = Array.isArray(telemetry?.failed) ? telemetry.failed : []
  const waitingFinal = Array.isArray(telemetry?.waitingFinal) ? telemetry.waitingFinal : []
  return Array.from(new Set([...failed, ...waitingFinal].map((item: any) => String(item?.id || '')).filter(Boolean)))
}

async function dispatchBrandOverlayWorkflow() {
  const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN
  if (!token) return { ok: false, status: 0, error: 'Missing GITHUB_WRITE_TOKEN or GITHUB_TOKEN.' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS)
  try {
    const res = await fetch(`https://api.github.com/repos/SignalBoost/signalboost-live/actions/workflows/${WORKFLOW_FILE}/dispatches`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }), cache: 'no-store', signal: controller.signal })
    clearTimeout(timer)
    if (res.status === 204) return { ok: true, status: 204, error: null }
    return { ok: false, status: res.status, error: (await res.text()).slice(0, 1000) }
  } catch (e: any) {
    clearTimeout(timer)
    return { ok: false, status: 0, error: e?.message || 'GitHub workflow dispatch failed.' }
  }
}

async function executeAutoFix(action: any, ctx: any) {
  const db = getAdminSupabase()
  const telemetry = action?.telemetry || {}
  const targetId = String(action?.targetId || '')
  const title = String(action?.objective || telemetry?.title || telemetry?.rootCause || '')
  const at = NOW()
  const result: any = { attempted: [], success: [], failed: [], fallback: [], notes: [] }
  const ids = candidateIdsFromTelemetry(telemetry)

  const resetFailures = targetId.includes('failed_video') || title.toLowerCase().includes('failed video') || Array.isArray(telemetry?.failed)
  if (resetFailures && ids.length) {
    const { data: campaigns, error } = await db.from('cos_campaign_queue').select('*').in('id', ids)
    if (error) result.failed.push({ action: 'load_failed_campaigns', error: error.message })
    for (const c of campaigns || []) {
      const metadata = { ...(c.metadata || {}) }
      const previousVideo = metadata.video || null
      delete metadata.video
      metadata.governance_last_autofix = { at, action: 'reset_failed_video_metadata', previousVideo, by: ctx.email || ctx.userId }
      const { error: updateError } = await db.from('cos_campaign_queue').update({ metadata, status: c.status === 'rejected' ? 'waiting_approval' : c.status }).eq('id', c.id)
      result.attempted.push({ action: 'reset_failed_video_metadata', id: c.id })
      if (updateError) result.failed.push({ action: 'reset_failed_video_metadata', id: c.id, error: updateError.message })
      else result.success.push({ action: 'reset_failed_video_metadata', id: c.id })
    }
    result.fallback.push({ pipeline: 'backup', action: 'render_restart_will_be_picked_up_by_watchdog' })
  }

  const dispatchBranding = targetId.includes('branding_backlog') || title.toLowerCase().includes('branding') || Array.isArray(telemetry?.waitingFinal)
  if (dispatchBranding) {
    const dispatch = await dispatchBrandOverlayWorkflow()
    result.attempted.push({ action: 'dispatch_brand_overlay_workflow', workflow: WORKFLOW_FILE })
    if (dispatch.ok) result.success.push({ action: 'dispatch_brand_overlay_workflow', workflow: WORKFLOW_FILE, status: dispatch.status })
    else result.failed.push({ action: 'dispatch_brand_overlay_workflow', workflow: WORKFLOW_FILE, error: dispatch.error, status: dispatch.status })
    result.fallback.push({ pipeline: dispatch.ok ? 'primary' : 'backup', action: dispatch.ok ? 'branding_worker_dispatched' : 'watchdog_will_retry_and_reroute' })
  }

  if (!result.attempted.length) {
    result.attempted.push({ action: 'autonomous_preemptive_monitoring' })
    result.success.push({ action: 'autonomous_preemptive_monitoring' })
    result.fallback.push({ pipeline: 'backup', action: 'armed_if_primary_degrades' })
  }
  result.notes.push('Human approval is not requested for ordinary operational remediation. Escalation is reserved for life-critical scenarios only.')
  return result
}

async function createLifeCriticalTicket(action: any, ctx: any, remediation?: any) {
  const targetId = String(action?.targetId || id('life_critical'))
  const risk = String(action?.riskLevel || 'critical')
  const pipeline = String(action?.pipeline || 'primary')
  const objective = String(action?.objective || `Life-critical COS governance escalation for ${pipeline}`)
  return proposeInfrastructurePr({ provider: 'cos_governance', actionId: 'create_life_critical_escalation_ticket', verb: 'create', title: objective.slice(0, 140), description: `Life-critical escalation generated by COS Governance Dashboard. Pipeline=${pipeline}; risk=${risk}; target=${targetId}.`, payload: { targetId, pipeline, riskLevel: risk, intent: action?.intent || 'life_critical_governance_escalation', status: 'pending_human_review', approver: { role: ctx.role, email: ctx.email, userId: ctx.userId }, telemetry: action?.telemetry || {}, remediation: remediation || null, createdAt: NOW() } }, { userId: ctx.userId, role: ctx.role })
}

async function logGovernanceAction(action: any, ctx: any, remediation?: any, pr?: any) {
  const db = getAdminSupabase()
  const at = NOW()
  const actionName = String(action?.action || 'governance_action')
  const targetId = String(action?.targetId || id('target'))
  const lifeCritical = lifeCriticalText(action)
  const decisionId = id(`gov_${actionName}`, `${targetId}_${Date.now()}`)
  const objective = String(action?.objective || `COS governance action: ${actionName}`)
  const successful = remediation?.failed?.length ? false : true
  const status = lifeCritical && actionName === 'override' ? 'rejected' : actionName === 'auto_apply' && successful ? 'executed' : actionName === 'escalate' && lifeCritical ? 'logged' : 'executed'
  const payload = { decisionId, action: actionName, targetId, pipeline: action?.pipeline || 'primary', intent: action?.intent || 'hybrid_dynamic_router_governance', riskLevel: action?.riskLevel || 'medium', lifeCritical, autonomous: !lifeCritical, approver: lifeCritical ? { role: ctx.role, email: ctx.email, userId: ctx.userId } : null, decision: lifeCritical ? action?.decision || 'life_critical_review' : 'autonomous_resolution_no_human_required', telemetry: action?.telemetry || {}, remediation: remediation || null, prCockpit: pr || null, createdAt: at }

  const { error } = await db.from('cos_decisions').insert({ decision_id: decisionId, user_id: ctx.userId, objective, channel: 'cos_governance', state: lifeCritical && actionName === 'override' ? 'BLOCKED' : successful ? 'EXECUTE' : 'PREPARE_AND_HOLD', required_source: 'live_governance_router', must_use_tool: true, proposes_action: true, required_approval: lifeCritical, approval_reasons: [`pipeline=${payload.pipeline}`, `risk=${payload.riskLevel}`, `lifeCritical=${lifeCritical}`], confidence: successful ? 92 : 76, output: { report: objective, governance: payload }, status, created_at: at })
  if (error) return { ok: false, error: error.message, event: payload }
  return { ok: true, event: payload, remediation, pr }
}

function governanceEventsFromDecisions(decisions: any[]) {
  return decisions.filter(row => row?.channel === 'cos_governance' || row?.output?.governance).map(row => {
    const gov = row?.output?.governance || {}
    const action = String(gov.action || 'decision')
    const type: TimelineType = gov.lifeCritical ? 'escalation' : action === 'auto_apply' ? 'fix' : action === 'override' ? 'approval' : 'fix'
    return buildEvent(type, { id: row.decision_id, timestamp: row.created_at, pipeline: gov.pipeline || 'primary', title: row.objective || `Governance ${action}`, severity: gov.riskLevel || 'medium', status: row.status === 'executed' ? 'success' : row.status === 'rejected' ? 'rejected' : 'pending', decision: gov.decision || row.status, approverRole: gov.approver?.role || null, riskLevel: gov.riskLevel || 'medium', recommendation: gov.lifeCritical ? 'Life-critical item requires human review.' : 'Autonomous COS remediation completed or queued.', telemetry: { row, governance: gov } })
  })
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status || 403 })
  const db = getAdminSupabase()
  const [campaignRes, decisionRes] = await Promise.all([db.from('cos_campaign_queue').select('*').order('created_at', { ascending: false }).limit(40), db.from('cos_decisions').select('*').order('created_at', { ascending: false }).limit(100)])
  const campaigns = campaignRes.error ? [] : (campaignRes.data || [])
  const decisions = decisionRes.error ? [] : (decisionRes.data || [])
  const videoCampaigns = campaigns.filter(isVideoCampaign)
  const active = videoCampaigns.filter(isRendering)
  const failed = videoCampaigns.filter(isFailed)
  const waitingFinal = videoCampaigns.filter(isReadyButNotFinal)
  const activeAges = active.map(c => minutesSince(campaignVideo(c)?.started_at || c.created_at) || 0)
  const recentDecisions = decisions.filter(d => minutesSince(d.created_at) !== null && (minutesSince(d.created_at) || 0) <= 120)
  const unresolvedDecisions = decisions.filter(d => d.status === 'logged')

  const primary = buildPipeline('primary', 'Primary COSA video pipeline', 'COS -> campaign queue -> render -> voice -> brand -> approval', { active: active.length, failed: failed.length, avgAgeMin: avg(activeAges), errorRate: videoCampaigns.length ? failed.length / Math.max(1, videoCampaigns.length) : 0, costBase: 12, costPerActive: 4.5, waitingFinal: waitingFinal.length, source: 'cos_campaign_queue' })
  const backup = buildPipeline('backup', 'Backup internal FFmpeg and direct-to-COSA router', 'Provider fallback -> internal FFmpeg preview -> queue recovery', { active: campaigns.filter(c => String(c?.metadata?.source || '').includes('cos_chat')).length, failed: campaigns.filter(c => String(c?.metadata?.source || '').includes('cos_chat') && isFailed(c)).length, avgAgeMin: avg(campaigns.slice(0, 10).map(c => minutesSince(c.created_at) || 0)), errorRate: 0.04, costBase: 3, costPerActive: 1.2, source: 'internal_ffmpeg_fallback' })
  const secondary = buildPipeline('secondary', 'Secondary autonomous governance watchdog', '24x7 cron watchdog -> auto-fix -> rare life-critical escalation', { active: unresolvedDecisions.length, failed: decisions.filter(d => d.status === 'rejected').length, avgAgeMin: avg(unresolvedDecisions.map(d => minutesSince(d.created_at) || 0)), errorRate: decisions.length ? decisions.filter(d => d.status === 'rejected').length / Math.max(1, decisions.length) : 0, costBase: 1, costPerActive: 0.5, source: 'cos_decisions' })
  const pipelines = [primary, backup, secondary]

  const alerts: any[] = []
  if (primary.overloadRisk >= 45) { const minutes = primary.overloadRisk >= 85 ? 8 : primary.overloadRisk >= 70 ? 15 : 30; alerts.push({ id: 'alert_primary_overload', pipeline: primary.id, severity: severity(primary.overloadRisk), title: `Primary pipeline overload risk: ${labelForSeverity(severity(primary.overloadRisk))}`, forecast: `Possible overload in ${minutes} minutes if ${active.length} active render(s) continue without completion.`, suggestedFix: 'Autonomous router arms backup/internal FFmpeg fallback and watchdog throttles/restarts stuck work.', telemetry: primary.telemetry }) }
  if (waitingFinal.length > 0) alerts.push({ id: 'alert_branding_backlog', pipeline: 'primary', severity: waitingFinal.length >= 3 ? 'high' : 'medium', title: 'Branding/voice stage backlog detected', forecast: `${waitingFinal.length} campaign(s) have base/video state but no final branded preview yet.`, suggestedFix: 'Autonomous watchdog dispatches brand-overlay worker and clears stale locks.', telemetry: { waitingFinal: waitingFinal.map(c => ({ id: c.id, title: c.title, video: campaignVideo(c) })) } })
  if (failed.length > 0) alerts.push({ id: 'alert_failed_video_jobs', pipeline: 'primary', severity: failed.length >= 3 ? 'critical' : 'high', title: 'Failed video job(s) require self-healing', forecast: `${failed.length} failed campaign(s) can block approval and publishing.`, suggestedFix: 'Autonomous watchdog resets failed metadata and restarts render through primary/backup pipeline.', telemetry: { failed: failed.map(c => ({ id: c.id, title: c.title, video: campaignVideo(c) })) } })
  if (secondary.overloadRisk >= 45) alerts.push({ id: 'alert_escalation_pressure', pipeline: 'secondary', severity: severity(secondary.overloadRisk), title: 'Governance backlog pressure', forecast: `${unresolvedDecisions.length} COS decision(s) are awaiting outcome labels; this does not block autonomous remediation.`, suggestedFix: 'Autonomous governance continues. Human review only appears for life-critical flagged items.', telemetry: secondary.telemetry })

  const fixes = alerts.map((alert, index) => ({ id: `fix_${alert.id}`, alertId: alert.id, pipeline: alert.pipeline, status: 'autonomous_watchdog_active', rootCause: alert.title, suggestedFix: alert.suggestedFix, action: 'auto_apply_without_human_approval', riskLevel: alert.severity, confidence: Math.max(70, 94 - index * 5), telemetry: alert.telemetry }))
  const escalations = fixes.filter(f => lifeCriticalText(f)).map(f => ({ id: `esc_${f.id}`, pipeline: f.pipeline, intent: 'life_critical_review', riskLevel: f.riskLevel, status: 'pending', approver: guard.ctx.role, decision: 'human_review_required', fallbackAlternatives: ['hold action', 'notify responsible human', 'maintain safe state'], created_at: NOW(), telemetry: f.telemetry }))
  const timeline = [...alerts.map(a => buildEvent('alert', { id: a.id, pipeline: a.pipeline, title: a.title, severity: a.severity, recommendation: a.suggestedFix, telemetry: a })), ...fixes.map(f => buildEvent('fix', { id: f.id, pipeline: f.pipeline, title: f.suggestedFix, severity: f.riskLevel, status: 'success', recommendation: f.action, telemetry: f })), ...escalations.map(e => buildEvent('escalation', { id: e.id, pipeline: e.pipeline, title: `Life-critical escalation pending: ${e.intent}`, severity: e.riskLevel, status: e.status, approverRole: e.approver, recommendation: e.fallbackAlternatives.join(', '), telemetry: e })), ...governanceEventsFromDecisions(decisions), ...recentDecisions.filter(d => d.channel !== 'cos_governance').slice(0, 10).map(d => buildEvent('decision', { id: d.decision_id, timestamp: d.created_at, pipeline: 'secondary', title: d.objective || 'COS decision logged', severity: d.required_approval ? 'medium' : 'low', status: d.status, recommendation: d.output?.report || '', telemetry: d }))].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  const graph = { nodes: pipelines.map(p => ({ id: p.id, label: p.name, status: p.status, healthScore: p.healthScore })), edges: [{ from: 'primary', to: 'backup', label: primary.overloadRisk >= 45 ? 'autonomous preemptive reroute armed' : 'standby fallback', active: primary.overloadRisk >= 45 }, { from: 'backup', to: 'secondary', label: 'watchdog verifies recovery', active: fixes.length > 0 }, { from: 'secondary', to: 'life-critical-review', label: 'human only when life-critical', active: escalations.length > 0 }] }
  return NextResponse.json({ ok: true, generatedAt: NOW(), mode: 'fully-autonomous-except-life-critical', pipelines, alerts, fixes, escalations, timeline, graph, automation: { autoApply: 'enabled_for_all_non_lifecritical_remediations', escalation: 'life_critical_only', fallbackRouting: 'automatic', watchdog: 'scheduled_24x7' }, sourceErrors: { campaigns: campaignRes.error?.message || null, decisions: decisionRes.error?.message || null } })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status || 403 })
  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const action = String(body?.action || 'auto_apply')
  const lifeCritical = lifeCriticalText(body)
  let remediation: any = null
  let pr: any = null
  if (action === 'auto_apply' || !lifeCritical) remediation = await executeAutoFix({ ...body, action: 'auto_apply' }, guard.ctx)
  if (lifeCritical && action === 'escalate') pr = await createLifeCriticalTicket(body, guard.ctx, remediation)
  const loggedAction = lifeCritical ? action : 'auto_apply'
  const result = await logGovernanceAction({ ...body, action: loggedAction, decision: lifeCritical ? body?.decision : 'autonomous_resolution_no_human_required' }, guard.ctx, remediation, pr)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
