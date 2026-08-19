import { createClient } from '@supabase/supabase-js'

type Json = Record<string, unknown> | unknown[]
type FeedbackType = 'approval' | 'rejection' | 'rewrite' | 'minor_edit'

type OutcomeInput = {
  tenantId?: string | null
  campaignId: string
  cosVersion?: string
  predictedCtr?: number | null
  actualCtr?: number | null
  predictedCvr?: number | null
  actualCvr?: number | null
  predictedWatchTime?: number | null
  actualWatchTime?: number | null
  revenueGenerated?: number | null
  auditFlags?: Json
  metadata?: Record<string, unknown>
}

type FeedbackInput = {
  tenantId?: string | null
  campaignId?: string | null
  userId?: string | null
  originalOutput: string
  finalOutput: string
  editDiff?: Json
  feedbackType: FeedbackType
  notes?: string | null
  metadata?: Record<string, unknown>
}

type ProviderObservation = {
  tenantId?: string | null
  providerName: string
  taskKind?: string
  success: boolean
  renderTimeMs?: number | null
  qualityScore?: number | null
  metadata?: Record<string, unknown>
}

export type HeuristicScore = {
  ctrDelta: number
  cvrDelta: number
  watchDelta: number
  editPenalty: number
  auditPenalty: number
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('COS adaptive learning requires Supabase service-role configuration')
  return createClient(url, key, { auth: { persistSession: false } })
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const delta = (actual: unknown, predicted: unknown) => finite(actual) && finite(predicted) ? actual - predicted : 0
const clamp = (value: number, min = -1, max = 1) => Math.max(min, Math.min(max, value))

export async function writeCampaignOutcome(input: OutcomeInput) {
  const { error } = await db().from('cos_campaign_outcomes').insert({
    tenant_id: input.tenantId ?? null,
    campaign_id: input.campaignId,
    cos_version: input.cosVersion ?? 'unknown',
    predicted_ctr: input.predictedCtr ?? null,
    actual_ctr: input.actualCtr ?? null,
    predicted_cvr: input.predictedCvr ?? null,
    actual_cvr: input.actualCvr ?? null,
    predicted_watch_time: input.predictedWatchTime ?? null,
    actual_watch_time: input.actualWatchTime ?? null,
    revenue_generated: input.revenueGenerated ?? null,
    audit_flags: input.auditFlags ?? [],
    metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`COS outcome logging failed: ${error.message}`)
}

export async function writeHumanFeedback(input: FeedbackInput) {
  const { error } = await db().from('cos_human_feedback').insert({
    tenant_id: input.tenantId ?? null,
    campaign_id: input.campaignId ?? null,
    user_id: input.userId ?? null,
    original_output: input.originalOutput,
    final_output: input.finalOutput,
    edit_diff: input.editDiff ?? {},
    feedback_type: input.feedbackType,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`COS feedback logging failed: ${error.message}`)
}

export async function recordProviderObservation(input: ProviderObservation) {
  const client = db()
  const taskKind = input.taskKind ?? 'general'
  const { data: existing, error: readError } = await client
    .from('cos_provider_performance')
    .select('success_rate,failure_rate,avg_render_time,quality_score,sample_count,metadata')
    .is('tenant_id', input.tenantId ?? null)
    .eq('provider_name', input.providerName)
    .eq('task_kind', taskKind)
    .maybeSingle()

  if (readError) throw new Error(`COS provider metric read failed: ${readError.message}`)

  const n = Number(existing?.sample_count ?? 0)
  const nextN = n + 1
  const successRate = ((Number(existing?.success_rate ?? 0) * n) + (input.success ? 1 : 0)) / nextN
  const failureRate = 1 - successRate
  const avgRenderTime = finite(input.renderTimeMs)
    ? ((Number(existing?.avg_render_time ?? 0) * n) + input.renderTimeMs) / nextN
    : existing?.avg_render_time ?? null
  const qualityScore = finite(input.qualityScore)
    ? ((Number(existing?.quality_score ?? 0) * n) + input.qualityScore) / nextN
    : existing?.quality_score ?? null

  const { error } = await client.from('cos_provider_performance').upsert({
    tenant_id: input.tenantId ?? null,
    provider_name: input.providerName,
    task_kind: taskKind,
    success_rate: successRate,
    failure_rate: failureRate,
    avg_render_time: avgRenderTime,
    quality_score: qualityScore,
    sample_count: nextN,
    last_used: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { ...(existing?.metadata as Record<string, unknown> ?? {}), ...(input.metadata ?? {}) },
  }, { onConflict: 'tenant_id,provider_name,task_kind' })

  if (error) throw new Error(`COS provider metric write failed: ${error.message}`)
}

export async function scoreCampaign(campaignId: string, tenantId?: string | null): Promise<HeuristicScore> {
  const client = db()
  let outcomeQuery = client.from('cos_campaign_outcomes').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(1)
  let feedbackQuery = client.from('cos_human_feedback').select('feedback_type').eq('campaign_id', campaignId)
  if (tenantId) {
    outcomeQuery = outcomeQuery.eq('tenant_id', tenantId)
    feedbackQuery = feedbackQuery.eq('tenant_id', tenantId)
  } else {
    outcomeQuery = outcomeQuery.is('tenant_id', null)
    feedbackQuery = feedbackQuery.is('tenant_id', null)
  }

  const [{ data: outcomes, error: outcomeError }, { data: feedback, error: feedbackError }] = await Promise.all([outcomeQuery, feedbackQuery])
  if (outcomeError) throw new Error(`COS outcome scoring failed: ${outcomeError.message}`)
  if (feedbackError) throw new Error(`COS feedback scoring failed: ${feedbackError.message}`)
  const outcome = outcomes?.[0]
  if (!outcome) return { ctrDelta: 0, cvrDelta: 0, watchDelta: 0, editPenalty: 0, auditPenalty: 0 }

  const edits = (feedback ?? []).filter(item => item.feedback_type !== 'approval').length
  const flags = Array.isArray(outcome.audit_flags) ? outcome.audit_flags.length : 0
  return {
    ctrDelta: clamp(delta(outcome.actual_ctr, outcome.predicted_ctr)),
    cvrDelta: clamp(delta(outcome.actual_cvr, outcome.predicted_cvr)),
    watchDelta: clamp(delta(outcome.actual_watch_time, outcome.predicted_watch_time) / Math.max(1, Number(outcome.predicted_watch_time ?? 1))),
    editPenalty: clamp(edits * -0.1),
    auditPenalty: clamp(flags ? -0.5 : 0),
  }
}

export async function updateHeuristics(score: HeuristicScore, tenantId?: string | null, metadata: Record<string, unknown> = {}) {
  const client = db()
  const updates: Array<[string, number]> = [
    ['ctr_weight', score.ctrDelta],
    ['cvr_weight', score.cvrDelta],
    ['watch_time_weight', score.watchDelta],
    ['edit_penalty', score.editPenalty],
    ['audit_penalty', score.auditPenalty],
  ]
  for (const [name, value] of updates) {
    const { error } = await client.rpc('increment_cos_heuristic_weight', {
      p_tenant_id: tenantId ?? null,
      p_name: name,
      p_delta: value,
      p_metadata: metadata,
    })
    if (error) throw new Error(`COS heuristic update failed for ${name}: ${error.message}`)
  }
}

export async function shouldRetrain(tenantId?: string | null) {
  const client = db()
  let outcomes = client.from('cos_campaign_outcomes').select('id,audit_flags,actual_ctr', { count: 'exact' })
  let providers = client.from('cos_provider_performance').select('metadata')
  if (tenantId) {
    outcomes = outcomes.eq('tenant_id', tenantId)
    providers = providers.eq('tenant_id', tenantId)
  } else {
    outcomes = outcomes.is('tenant_id', null)
    providers = providers.is('tenant_id', null)
  }
  const [{ data: outcomeRows, count, error: outcomeError }, { data: providerRows, error: providerError }] = await Promise.all([outcomes, providers])
  if (outcomeError) throw new Error(`COS retraining check failed: ${outcomeError.message}`)
  if (providerError) throw new Error(`COS provider retraining check failed: ${providerError.message}`)
  const majorFailures = (outcomeRows ?? []).filter(row =>
    (finite(row.actual_ctr) && row.actual_ctr < 0.005) || (Array.isArray(row.audit_flags) && row.audit_flags.length > 0)
  ).length
  const newProviderDetected = (providerRows ?? []).some(row => (row.metadata as Record<string, unknown> | null)?.is_new === true)
  return { retrain: (count ?? 0) >= 10 || majorFailures >= 3 || newProviderDetected, outcomeCount: count ?? 0, majorFailures, newProviderDetected }
}

export async function retrainFromCampaign(campaignId: string, tenantId?: string | null) {
  const score = await scoreCampaign(campaignId, tenantId)
  await updateHeuristics(score, tenantId, { campaign_id: campaignId })
  const trigger = await shouldRetrain(tenantId)
  return { score, ...trigger }
}

export async function loadStrategyProfile(profileName = 'default', tenantId?: string | null) {
  const client = db()
  let query = client.from('cos_strategy_profiles').select('*').eq('profile_name', profileName)
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`COS strategy profile load failed: ${error.message}`)
  return data
}

export async function modifyStrategyProfile(profileName: string, score: HeuristicScore, tenantId?: string | null) {
  const profile = await loadStrategyProfile(profileName, tenantId)
  if (!profile) return null
  const intensity = (value: unknown, signal: number) => signal > 0.05 ? 'high' : signal < -0.05 ? 'low' : value
  const updated = {
    tone: { ...(profile.tone ?? {}), energy: intensity(profile.tone?.energy, score.ctrDelta) },
    pacing: { ...(profile.pacing ?? {}), sentence_length: intensity(profile.pacing?.sentence_length, score.watchDelta) },
    cta: { ...(profile.cta ?? {}), aggressiveness: intensity(profile.cta?.aggressiveness, score.cvrDelta + score.auditPenalty) },
    structure: { ...(profile.structure ?? {}), hook: intensity(profile.structure?.hook, score.ctrDelta) },
    weight: clamp(Number(profile.weight ?? 1) + score.ctrDelta + score.cvrDelta, -5, 5),
    last_updated: new Date().toISOString(),
  }
  let query = db().from('cos_strategy_profiles').update(updated).eq('profile_name', profileName)
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)
  const { error } = await query
  if (error) throw new Error(`COS strategy profile update failed: ${error.message}`)
  return { ...profile, ...updated }
}

export async function providerRouter(taskKind = 'general', tenantId?: string | null) {
  let query = db().from('cos_provider_performance').select('provider_name,success_rate,failure_rate,quality_score,avg_render_time,sample_count').eq('task_kind', taskKind)
  query = tenantId ? query.eq('tenant_id', tenantId) : query.is('tenant_id', null)
  const { data, error } = await query
  if (error) throw new Error(`COS provider routing failed: ${error.message}`)
  if (!data?.length) return null
  const scored = data.map(provider => ({
    provider: provider.provider_name,
    score: Number(provider.success_rate ?? 0) * 0.5 + Number(provider.quality_score ?? 0) * 0.3 - Number(provider.failure_rate ?? 0) * 0.2,
    sampleCount: Number(provider.sample_count ?? 0),
  })).sort((a, b) => b.score - a.score || b.sampleCount - a.sampleCount)
  return scored[0]
}

export async function captureOutcomeAndLearn(input: OutcomeInput) {
  await writeCampaignOutcome(input)
  const result = await retrainFromCampaign(input.campaignId, input.tenantId)
  await modifyStrategyProfile('default', result.score, input.tenantId)
  return result
}

export async function captureFeedbackAndLearn(input: FeedbackInput) {
  await writeHumanFeedback(input)
  if (!input.campaignId) return { learned: false, reason: 'feedback_without_campaign' as const }
  const result = await retrainFromCampaign(input.campaignId, input.tenantId)
  await modifyStrategyProfile('default', result.score, input.tenantId)
  return { learned: true, ...result }
}
