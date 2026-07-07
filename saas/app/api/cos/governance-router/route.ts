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
const MAX_OVERLAY_ATTEMPTS = 5
const DISPATCH_TIMEOUT_MS = 30_000
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

function keys(obj: any): string[] {
  return obj && typeof obj === 'object' ? Object.keys(obj) : []
}

function unbrandedLangs(video: any): string[] {
  const unbranded = video?.unbrandedVoiced || {}
  return keys(unbranded).filter((lang) => Boolean(unbranded[lang]))
}

function isWaitingForBrand(campaign: any): boolean {
  const video = campaign?.metadata?.video || null
  if (!video || video.status !== 'ready') return false
  if (video.branded === true && video.voicedUrl && video.brandDebug?.mode !== 'direct-completion') return false
  const waiting = unbrandedLangs(video)
  const attempts = video.ghOverlayAttempts || {}
  return waiting.some((lang) => Number(attempts[lang] || 0) < MAX_OVERLAY_ATTEMPTS)
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
    const res = await fetch(`https://api.github.com/repos/SignalBoost/signalboost-live/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
      cache: 'no-store',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status === 204) return { ok: true, status: res.status, error: null }
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
  const now = NOW()
  const result: any = { attempted: [], success: [], failed: [], notes: [] }

  const ids = candidateIdsFromTelemetry(telemetry)
  const shouldResetFailures = targetId.includes('failed_video') || title.toLowerCase().includes('failed video') || Array.isArray(telemetry?.failed)
  if (shouldResetFailures && ids.length) {
    const { data: campaigns, error } = await db.from('cos_campaign_queue').select('*').in('id', ids)
    if (error) result.failed.push({ action: 'load_failed_campaigns', error: error.message })
    for (const campaign of campaigns || []) {
      const metadata = { ...(campaign.metadata || {}) }
      const previousVideo = metadata.video || null
      delete metadata.video
      metadata.governance_last_autofix = { at: now, action: 'reset_failed_video_metadata', previousVideo, by: ctx.email || ctx.userId }
      const { error: updateError } = await db.from('cos_campaign_queue').update({ metadata, status: campaign.status === 'rejected' ? 'waiting_approval' : campaign.status }).eq('id', campaign.id)
      result.attempted.push({ action: 'reset_failed_video_metadata', id: campaign.id })
      if (updateError) result.failed.push({ action: 'reset_failed_video_metadata', id: campaign.id, error: updateError.message })
      else result.success.push({ action: 'reset_failed_video_metadata', id: campaign.id })
    }
    result.notes.push('Failed video metadata was cleared so the video pipeline can rerender on the next kick/backfill run.')
  }

  const shouldDispatchBranding = targetId.includes('branding_backlog') || title.toLowerCase().includes('branding') || Array.isArray(telemetry?.waitingFinal)
  if (shouldDispatchBranding) {
    const idsToMark = ids.length ? ids : []
    const dispatch = await dispatchBrandOverlayWorkflow()
    result.attempted.push({ action: 'dispatch_brand_overlay_workflow', workflow: WORKFLOW_FILE })
    if (dispatch.ok) result.success.push({ action: 'dispatch_brand_overlay_workflow', workflow: WORKFLOW_FILE, status: dispatch.status })
    else result.failed.push({ action: 'dispatch_brand_overlay_workflow', workflow: WORKFLOW_FILE, error: dispatch.error, status: dispatch.status })
    if (idsToMark.length) {
      const { data: campaigns } = await db.from('cos_campaign_queue').select('*').in('id', idsToMark)
      for (const campaign of campaigns || []) {
        const video = campaign?.metadata?.video || {}
        const metadata = {
          ...(campaign.metadata || {}),
          video: {
            ...video,
            governanceBrandDispatch: { at: now, ok: dispatch.ok, status: dispatch.status, error: dispatch.error, workflow: WORKFLOW_FILE, by: ctx.email || ctx.userId },
          },
        }
        await db.from('cos_campaign_queue').update({ metadata }).eq('id', campaign.id)
      }
    }
    result.notes.push('Brand overlay workflow dispatch was attempted from governance auto-apply.')
  }

  if (!result.attempted.length) {
    result.attempted.push({ action: 'preemptive_monitoring_noop' })
    result.success.push({ action: 'preemptive_monitoring_noop' })
    result.notes.push('No destructive action was needed. Governance logged a preemptive monitoring decision and kept fallback routing armed.')
  }

  return result
}

async function createEscalationPr(action: any, ctx: any, remediation?: any) {
  const targetId = String(action?.targetId || id('escalation'))
  const risk = String(action?.riskLevel || 'medium')
  const pipeline = String(action?.pipeline || 'primary')
  const objective = String(action?.objective || `COS governance escalation for ${pipeline}`)
  return proposeInfrastructurePr({
    provider: 'cos_governance',
    actionId: 'create_escalation_ticket',
    verb: 'create',
    title: objective.slice(0, 140),
    description: `Escalation generated by COS Governance Dashboard. Pipeline=${pipeline}; risk=${risk}; target=${targetId}. Review fallback alternatives and approve the next operational fix in PR Cockpit.`,
    payload: {
      targetId,
      pipeline,
      riskLevel: risk,
      intent: action?.intent || 'prevent_pipeline_failure',
      status: 'pending_review',
      approver: { role: ctx.role, email: ctx.email, userId: ctx.userId },
      fallbackAlternatives: ['apply throttling', 'reroute to backup', 'notify admin', 'schedule maintenance', 'manual worker restart'],
      telemetry: action?.telemetry || {},
      remediation: remediation || null,
      createdAt: NOW(),
    },
  }, { userId: ctx.userId, role: ctx.role })
}

async function logGovernanceAction(action: any, ctx: any, remediation?: any, pr?: any) {
  const db = getAdminSupabase()
  const now = NOW()
  const actionName = String(action?.action || 'governance_action')
  const targetId = String(action?.targetId || id('target'))
  const decisionId = id(`gov_${actionName}`, `${targetId}_${Date.now()}`)
  const objective = String(action?.objective || `COS governance action: ${actionName}`)
  const successful = remediation?.failed?.length ? false : true
  const status = actionName === 'override' ? 'rejected' : actionName === 'auto_apply' && successful ? 'executed' : 'logged'
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
    remediation: remediation || null,
    prCockpit: pr || null,
    createdAt: now,
  }

  const { error } = await db.from('cos_decisions').insert({
    decision_id: decisionId,
    user_id: ctx.userId,
    objective,
    channel: 'cos_governance',
    state: actionName === 'override' ? 'BLOCKED' : actionName === 'auto_apply' && successful ? 'EXECUTE' : 'PREPARE_AND_HOLD',
    required_source: 'live_governance_router',
    must_use_tool: true,
    proposes_action: true,
    required_approval: actionName !== 'auto_apply' || !successful,
    approval_reasons: [`pipeline=${payload.pipeline}`, `risk=${payload.riskLevel}`, `decision=${payload.decision}`],
    confidence: actionName === 'auto_apply' && successful ? 90 : 72,
    output: { report: objective, governance: payload },
    status,
    created_at: now,
  })

  if (error) return { ok: false, error: error.message, event: payload }
  return { ok: true, event: payload, remediation, pr }
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
        recommendation: gov.prCockpit?.ok ? `Escalated to PR Cockpit ${gov.prCockpit.pr_id}.` : `Recorded by ${gov.approver?.email || 'admin'} as ${gov.decision || row.status}.`,
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

  const primary = buildPipeline('primary', 'Primary COSA video pipeline', 'COS -> campaign queue -> render -> voice -> brand -> approval', {
    active: active.length,
    failed: failed.length,
    avgAgeMin: avg(activeAges),
    errorRate: videoCampaigns.length ? failed.length / Math.max(1, videoCampaigns.length) : 0,
    costBase: 12,
    costPerActive: 4.5,
    waitingFinal: waitingFinal.length,
    source: 'cos_campaign_queue',
  })
  const backup = buildPipeline('backup', 'Backup direct-to-COSA router', 'Concierge/COS direct router -> proposeCampaign -> queue', {
    active: campaigns.filter(c => String(c?.metadata?.source || '').includes('cos_chat')).length,
    failed: campaigns.filter(c => String(c?.metadata?.source || '').includes('cos_chat') && isFailed(c)).length,
    avgAgeMin: avg(campaigns.slice(0, 10).map(c => minutesSince(c.created_at) || 0)),
    errorRate: 0.06,
    costBase: 6,
    costPerActive: 2,
    source: 'concierge_direct_router',
  })
  const secondary = buildPipeline('secondary', 'Secondary PR Cockpit escalation', 'Governance hold -> admin decision -> PR/infrastructure cockpit', {
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
    alerts.push({ id: 'alert_primary_overload', pipeline: primary.id, severity: severity(primary.overloadRisk), title: `Primary pipeline overload risk: ${labelForSeverity(severity(primary.overloadRisk))}`, forecast: `Possible overload in ${minutes} minutes if ${active.length} active render(s) continue without completion.`, suggestedFix: primary.overloadRisk >= 70 ? 'Reroute new video requests to backup router and throttle non-critical jobs.' : 'Keep primary active, pre-warm backup router, and monitor latency.', telemetry: primary.telemetry })
  }
  if (waitingFinal.length > 0) {
    alerts.push({ id: 'alert_branding_backlog', pipeline: 'primary', severity: waitingFinal.length >= 3 ? 'high' : 'medium', title: 'Branding/voice stage backlog detected', forecast: `${waitingFinal.length} campaign(s) have base/video state but no final branded preview yet.`, suggestedFix: 'Kick branding worker, check GitHub Actions overlay worker, and hold approval until final preview is playable.', telemetry: { waitingFinal: waitingFinal.map(c => ({ id: c.id, title: c.title, video: campaignVideo(c) })) } })
  }
  if (failed.length > 0) {
    alerts.push({ id: 'alert_failed_video_jobs', pipeline: 'primary', severity: failed.length >= 3 ? 'critical' : 'high', title: 'Failed video job(s) require self-healing', forecast: `${failed.length} failed campaign(s) can block approval and publishing.`, suggestedFix: 'Reset failed video metadata, rerender, and escalate if a second attempt fails.', telemetry: { failed: failed.map(c => ({ id: c.id, title: c.title, video: campaignVideo(c) })) } })
  }
  if (secondary.overloadRisk >= 45) {
    alerts.push({ id: 'alert_escalation_pressure', pipeline: 'secondary', severity: severity(secondary.overloadRisk), title: 'Escalation queue pressure', forecast: `${unresolvedDecisions.length} COS decision(s) are still awaiting outcome labels.`, suggestedFix: 'Ask admin to approve, reject, execute, or measure decisions to keep the training set current.', telemetry: secondary.telemetry })
  }

  const fixes = alerts.map((alert, index) => {
    const canAutoApply = alert.severity === 'low' || alert.severity === 'medium'
    return { id: `fix_${alert.id}`, alertId: alert.id, pipeline: alert.pipeline, status: canAutoApply ? 'pending_auto_apply' : 'requires_approval', rootCause: alert.title, suggestedFix: alert.suggestedFix, action: canAutoApply ? 'auto_apply_preemptive_fix' : 'escalate_to_pr_cockpit', riskLevel: alert.severity, confidence: Math.max(62, 92 - index * 6), telemetry: alert.telemetry }
  })

  const escalations = fixes
    .filter(f => f.status === 'requires_approval' || f.riskLevel === 'high' || f.riskLevel === 'critical')
    .map(f => ({ id: `esc_${f.id}`, pipeline: f.pipeline, intent: 'prevent_pipeline_failure', riskLevel: f.riskLevel, status: 'pending', approver: guard.ctx.role, decision: 'awaiting_admin_decision', fallbackAlternatives: ['apply throttling', 'reroute to backup', 'notify admin', 'schedule maintenance', 'open PR Cockpit item'], created_at: NOW(), telemetry: f.telemetry }))

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

  return NextResponse.json({ ok: true, generatedAt: NOW(), mode: 'hybrid-dynamic-governed', pipelines, alerts, fixes, escalations, timeline, graph, automation: { autoApply: 'enabled_for_safe_remediations', escalationPrCockpit: 'enabled', fallbackRouting: primary.overloadRisk >= 45 ? 'armed' : 'standby' }, sourceErrors: { campaigns: campaignRes.error?.message || null, decisions: decisionRes.error?.message || null } })
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status || 403 })

  let body: any = {}
  try { body = await req.json() } catch { body = {} }
  const action = String(body?.action || '')
  if (!['auto_apply', 'override', 'escalate'].includes(action)) return NextResponse.json({ ok: false, error: 'action must be auto_apply, override, or escalate' }, { status: 400 })

  let remediation: any = null
  let pr: any = null
  if (action === 'auto_apply') {
    remediation = await executeAutoFix(body, guard.ctx)
    if (remediation?.failed?.length) pr = await createEscalationPr(body, guard.ctx, remediation)
  }
  if (action === 'escalate') pr = await createEscalationPr(body, guard.ctx, remediation)

  const result = await logGovernanceAction({ ...body, action }, guard.ctx, remediation, pr)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
