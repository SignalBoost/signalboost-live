import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Severity = 'low' | 'medium' | 'high' | 'critical'
type TimelineType = 'alert' | 'fix' | 'escalation' | 'reroute' | 'approval' | 'decision'
type PipelineId = 'primary' | 'backup' | 'secondary'

const VIDEO_CHANNELS = ['youtube', 'short_video']
const NOW = () => new Date().toISOString()

function minutesSince(value: any): number | null {
  if (!value) return null
  const ts = Date.parse(String(value))
  if (!Number.isFinite(ts)) return null
  return Math.max(0, Math.round((Date.now() - ts) / 60000))
}

function id(prefix: string, value?: string) {
  return `${prefix}_${String(value || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 44)}`
}

function severity(score: number): Severity {
  if (score >= 90) return 'critical'
  if (score >= 70) return 'high'
  if (score >= 45) return 'medium'
  return 'low'
}

function labelForSeverity(s: Severity) {
  return s === 'critical' ? 'Critical' : s === 'high' ? 'High' : s === 'medium' ? 'Medium' : 'Low'
}

function campaignVideo(c: any) {
  return c?.metadata?.video || null
}

function isVideoCampaign(c: any) {
  return VIDEO_CHANNELS.includes(String(c?.channel || ''))
}

function isRendering(c: any) {
  return campaignVideo(c)?.status === 'rendering'
}

function isFailed(c: any) {
  const v = campaignVideo(c)
  return v?.status === 'failed' || Boolean(v?.error || v?.voiceError || v?.brandingExhausted)
}

function isReadyButNotFinal(c: any) {
  const v = campaignVideo(c)
  return v?.status === 'ready' && !(v?.branded === true && v?.voicedUrl)
}

function avg(values: number[]) {
  const safe = values.filter(n => Number.isFinite(n))
  if (!safe.length) return 0
  return Math.round(safe.reduce((a, b) => a + b, 0) / safe.length)
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)))
}

function pipelineStatus(score: number) {
  if (score >= 90) return 'critical'
  if (score >= 70) return 'degraded'
  if (score >= 45) return 'watch'
  return 'healthy'
}

function buildPipeline(idValue: PipelineId, name: string, role: string, metrics: any) {
  const overload = clamp(metrics.active * 14 + metrics.failed * 22 + Math.max(0, metrics.avgAgeMin - 15) * 1.4 + metrics.errorRate * 55)
  const latencyMs = Math.max(180, metrics.avgAgeMin * 800 + metrics.active * 120)
  const cost = Number((metrics.costBase + metrics.active * metrics.costPerActive + metrics.failed * 2.5).toFixed(2))
  return {
    id: idValue,
    name,
    role,
    status: pipelineStatus(overload),
    healthScore: clamp(100 - overload),
    overloadRisk: overload,
    latencyMs,
    estimatedCostUsd: cost,
    activeJobs: metrics.active,
    failedJobs: metrics.failed,
    successRate: clamp(100 - metrics.errorRate * 100),
    nextAction: overload >= 70 ? 'preemptive_reroute' : overload >= 45 ? 'throttle_and_watch' : 'normal_execution',
    telemetry: metrics,
  }
}

function buildEvent(type: TimelineType, input: any) {
  return {
    id: input.id || id(type, input.pipeline || input.title),
    type,
    timestamp: input.timestamp || NOW(),
    pipeline: input.pipeline || 'primary',
    title: input.title,
    severity: input.severity || 'low',
    status: input.status || 'open',
    color: type === 'alert' ? 'yellow' : type === 'fix' && input.status === 'success' ? 'green' : type === 'escalation' && input.status === 'rejected' ? 'red' : type === 'escalation' ? 'orange' : type === 'reroute' ? 'cyan' : 'slate',
    decision: input.decision || null,
    approverRole: input.approverRole || null,
    riskLevel: input.riskLevel || input.severity || 'low',
    recommendation: input.recommendation || '',
    telemetry: input.telemetry || {},
  }
}

async function logGovernanceAction(action: any, ctx: any) {
  const db = getAdminSupabase()
  const now = NOW()
  const actionName = String(action?.action || 'governance_action')
  const targetId = String(action?.targetId || id('target'))
  const decisionId = id(`gov_${actionName}`, `${targetId}_${Date.now()}`)
  const objective = String(action?.objective || `COS governance action: ${actionName}`)
  const status = actionName === 'override' ? 'rejected' : actionName === 'auto_apply' ? 'executed' : 'logged'
  const payload = {
    decisionId,
    action: actionName,
    targetId,
    pipeline: action?.pipeline || 'primary',
    intent: action?.intent || 'hybrid_dynamic_router_governance',
    riskLevel: action?.riskLevel || 'medium',
    approver: { role: ctx.role, email: ctx.email, userId: ctx.userId },
    decision: action?.decision || (actionName === 'auto_apply' ? 'auto-apply' : actionName === 'override' ? 'override' : 'escalate'),
    telemetry: action?.telemetry || {},
    createdAt: now,
  }

  const { error } = await db.from('cos_decisions').insert({
    decision_id: decisionId,
    user_id: ctx.userId,
    objective,
    channel: 'cos_governance',
    state: actionName === 'override' ? 'BLOCKED' : actionName === 'auto_apply' ? 'EXECUTE' : 'PREPARE_AND_HOLD',
    required_source: 'live_governance_router',
    must_use_tool: true,
    proposes_action: true,
    required_approval: actionName !== 'auto_apply',
    approval_reasons: [
      `pipeline=${payload.pipeline}`,
      `risk=${payload.riskLevel}`,
      `decision=${payload.decision}`,
    ],
    confidence: actionName === 'auto_apply' ? 88 : 72,
    output: { report: objective, governance: payload },
    status,
    created_at: now,
  })

  if (error) return { ok: false, error: error.message, event: payload }
  return { ok: true, event: payload }
}

function governanceEventsFromDecisions(decisions: any[]) {
  return decisions
    .filter(row => row?.channel === 'cos_governance' || row?.output?.governance)
    .map(row => {
      const gov = row?.output?.governance || {}
      const action = String(gov.action || 'decision')
      const type: TimelineType = action === 'auto_apply' ? 'fix' : action === 'override' ? 'approval' : 'escalation'
      return buildEvent(type, {
        id: row.decision_id,
        timestamp: row.created_at,
        pipeline: gov.pipeline || 'primary',
        title: row.objective || `Governance ${action}`,
        severity: gov.riskLevel || 'medium',
        status: row.status === 'executed' ? 'success' : row.status === 'rejected' ? 'rejected' : 'pending',
        decision: gov.decision || row.status,
        approverRole: gov.approver?.role || null,
        riskLevel: gov.riskLevel || 'medium',
        recommendation: `Recorded by ${gov.approver?.email || 'admin'} as ${gov.decision || row.status}.`,
        telemetry: { row, governance: gov },
      })
    })
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status || 403 })

  const db = getAdminSupabase()
  const [campaignRes, decisionRes] = await Promise.all([
    db.from('cos_campaign_queue').select('*').order('created_at', { ascending: false }).limit(40),
    db.from('cos_decisions').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  const campaigns = campaignRes.error ? [] : (campaignRes.data || [])
  const decisions = decisionRes.error ? [] : (decisionRes.data || [])
  const videoCampaigns = campaigns.filter(isVideoCampaign)
  const active = videoCampaigns.filter(isRendering)
  const failed = videoCampaigns.filter(isFailed)
  const waitingFinal = videoCampaigns.filter(isReadyButNotFinal)
  const activeAges = active.map(c => minutesSince(campaignVideo(c)?.started_at || c.created_at) || 0)
  const recentDecisions = decisions.filter(d => minutesSince(d.created_at) !== null && (minutesSince(d.created_at) || 0) <= 120)
  const unresolvedDecisions = decisions.filter(d => d.status === 'logged')

  const primary = buildPipeline('primary', 'Primary COSA video pipeline', 'COS → campaign queue → render → voice → brand → approval', {
    active: active.length,
    failed: failed.length,
    avgAgeMin: avg(activeAges),
    errorRate: videoCampaigns.length ? failed.length / Math.max(1, videoCampaigns.length) : 0,
    costBase: 12,
    costPerActive: 4.5,
    waitingFinal: waitingFinal.length,
    source: 'cos_campaign_queue',
  })
  const backup = buildPipeline('backup', 'Backup direct-to-COSA router', 'Concierge/COS direct router → proposeCampaign → queue', {
    active: campaigns.filter(c => String(c?.metadata?.source || '').includes('cos_chat')).length,
    failed: campaigns.filter(c => String(c?.metadata?.source || '').includes('cos_chat') && isFailed(c)).length,
    avgAgeMin: avg(campaigns.slice(0, 10).map(c => minutesSince(c.created_at) || 0)),
    errorRate: 0.06,
    costBase: 6,
    costPerActive: 2,
    source: 'concierge_direct_router',
  })
  const secondary = buildPipeline('secondary', 'Secondary PR Cockpit escalation', 'Governance hold → admin decision → PR/infrastructure cockpit', {
    active: unresolvedDecisions.length,
    failed: decisions.filter(d => d.status === 'rejected').length,
    avgAgeMin: avg(unresolvedDecisions.map(d => minutesSince(d.created_at) || 0)),
    errorRate: decisions.length ? decisions.filter(d => d.status === 'rejected').length / Math.max(1, decisions.length) : 0,
    costBase: 2,
    costPerActive: 0.8,
    source: 'cos_decisions',
  })
  const pipelines = [primary, backup, secondary]

  const alerts: any[] = []
  if (primary.overloadRisk >= 45) {
    const minutes = primary.overloadRisk >= 85 ? 8 : primary.overloadRisk >= 70 ? 15 : 30
    alerts.push({
      id: 'alert_primary_overload',
      pipeline: primary.id,
      severity: severity(primary.overloadRisk),
      title: `Primary pipeline overload risk: ${labelForSeverity(severity(primary.overloadRisk))}`,
      forecast: `Possible overload in ${minutes} minutes if ${active.length} active render(s) continue without completion.`,
      suggestedFix: primary.overloadRisk >= 70 ? 'Reroute new video requests to backup router and throttle non-critical jobs.' : 'Keep primary active, pre-warm backup router, and monitor latency.',
      telemetry: primary.telemetry,
    })
  }
  if (waitingFinal.length > 0) {
    alerts.push({
      id: 'alert_branding_backlog',
      pipeline: 'primary',
      severity: waitingFinal.length >= 3 ? 'high' : 'medium',
      title: 'Branding/voice stage backlog detected',
      forecast: `${waitingFinal.length} campaign(s) have base/video state but no final branded preview yet.`,
      suggestedFix: 'Kick branding worker, check GitHub Actions overlay worker, and hold approval until final preview is playable.',
      telemetry: { waitingFinal: waitingFinal.map(c => ({ id: c.id, title: c.title, video: campaignVideo(c) })) },
    })
  }
  if (failed.length > 0) {
    alerts.push({
      id: 'alert_failed_video_jobs',
      pipeline: 'primary',
      severity: failed.length >= 3 ? 'critical' : 'high',
      title: 'Failed video job(s) require self-healing',
      forecast: `${failed.length} failed campaign(s) can block approval and publishing.`,
      suggestedFix: 'Reset failed video metadata, rerender, and escalate if a second attempt fails.',
      telemetry: { failed: failed.map(c => ({ id: c.id, title: c.title, video: campaignVideo(c) })) },
    })
  }
  if (secondary.overloadRisk >= 45) {
    alerts.push({
      id: 'alert_escalation_pressure',
      pipeline: 'secondary',
      severity: severity(secondary.overloadRisk),
      title: 'Escalation queue pressure',
      forecast: `${unresolvedDecisions.length} COS decision(s) are still awaiting outcome labels.`,
      suggestedFix: 'Ask admin to approve, reject, execute, or measure decisions to keep the training set current.',
      telemetry: secondary.telemetry,
    })
  }

  const fixes = alerts.map((alert, index) => {
    const canAutoApply = alert.severity === 'low' || alert.severity === 'medium'
    return {
      id: `fix_${alert.id}`,
      alertId: alert.id,
      pipeline: alert.pipeline,
      status: canAutoApply ? 'pending_auto_apply' : 'requires_approval',
      rootCause: alert.title,
      suggestedFix: alert.suggestedFix,
      action: canAutoApply ? 'auto_apply_preemptive_fix' : 'escalate_to_pr_cockpit',
      riskLevel: alert.severity,
      confidence: Math.max(62, 92 - index * 6),
      telemetry: alert.telemetry,
    }
  })

  const escalations = fixes
    .filter(f => f.status === 'requires_approval' || f.riskLevel === 'high' || f.riskLevel === 'critical')
    .map(f => ({
      id: `esc_${f.id}`,
      pipeline: f.pipeline,
      intent: 'prevent_pipeline_failure',
      riskLevel: f.riskLevel,
      status: 'pending',
      approver: guard.ctx.role,
      decision: 'awaiting_admin_decision',
      fallbackAlternatives: ['apply throttling', 'reroute to backup', 'notify admin', 'schedule maintenance', 'open PR Cockpit item'],
      created_at: NOW(),
      telemetry: f.telemetry,
    }))

  const timeline = [
    ...alerts.map(a => buildEvent('alert', { id: a.id, pipeline: a.pipeline, title: a.title, severity: a.severity, recommendation: a.suggestedFix, telemetry: a })),
    ...fixes.map(f => buildEvent('fix', { id: f.id, pipeline: f.pipeline, title: f.suggestedFix, severity: f.riskLevel, status: f.status === 'pending_auto_apply' ? 'pending' : 'blocked', recommendation: f.action, telemetry: f })),
    ...escalations.map(e => buildEvent('escalation', { id: e.id, pipeline: e.pipeline, title: `Escalation pending: ${e.intent}`, severity: e.riskLevel, status: e.status, approverRole: e.approver, recommendation: e.fallbackAlternatives.join(', '), telemetry: e })),
    ...governanceEventsFromDecisions(decisions),
    ...recentDecisions.filter(d => d.channel !== 'cos_governance').slice(0, 10).map(d => buildEvent('decision', { id: d.decision_id, timestamp: d.created_at, pipeline: 'secondary', title: d.objective || 'COS decision logged', severity: d.required_approval ? 'medium' : 'low', status: d.status, recommendation: d.output?.report || '', telemetry: d })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))

  const graph = {
    nodes: pipelines.map(p => ({ id: p.id, label: p.name, status: p.status, healthScore: p.healthScore })),
    edges: [
      { from: 'primary', to: 'backup', label: primary.overloadRisk >= 45 ? 'preemptive reroute armed' : 'standby fallback', active: primary.overloadRisk >= 45 },
      { from: 'backup', to: 'secondary', label: 'failed auto-fix escalates', active: escalations.length > 0 },
      { from: 'primary', to: 'secondary', label: 'approval / PR cockpit', active: unresolvedDecisions.length > 0 },
    ],
  }

  return NextResponse.json({
    ok: true,
    generatedAt: NOW(),
    mode: 'hybrid-dynamic-governed',
    pipelines,
    alerts,
    fixes,
    escalations,
    timeline,
    graph,
    sourceErrors: {
      campaigns: campaignRes.error?.message || null,
      decisions: decisionRes.error?.message || null,
    },
  })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status || 403 })

  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const action = String(body?.action || '')
  if (!['auto_apply', 'override', 'escalate'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'action must be auto_apply, override, or escalate' }, { status: 400 })
  }

  const result = await logGovernanceAction({ ...body, action }, guard.ctx)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
