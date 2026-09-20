// saas/lib/ai/cos/cosUniversityMassDistillationTerminalCleanup.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE = 'cos-university-mass-distillation-terminal-cleanup-v1' as const

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Terminalize orphaned nonterminal runs whose parent campaign has already ended.
 *
 * This used to look at `failed` campaigns only. A campaign that ends as `expired` (its window closed
 * with partial progress) or `cancelled` keeps every run that never finished - teacher_pending,
 * preparation_pending, training_pending, or a *_dispatching claim - sitting nonterminal forever:
 * the consumer only claims campaigns that are still authorized/active AND unexpired, and the stalled
 * dispatch recovery carries the same unexpired filter, so nothing in the system can ever reach those
 * rows again. They are reported as pending work that no tick will ever pick up.
 *
 * Batch quarantine and campaign capacity release stay scoped to `failed` campaigns exactly as before.
 * That distinction is deliberate: a failed parent terminally consumes its batch identity, while an
 * expired campaign's prepared batches are still good curriculum and must stay reusable.
 *
 * This is cleanup only: it retries nothing, dispatches nothing, authorizes no spend, and does not
 * touch a campaign that is still inside its own window.
 */
const CLEANUP_CAMPAIGN_STATUSES = Object.freeze(['failed', 'expired', 'cancelled'])
export async function terminalizeFailedMassDistillationCampaignRuns(input: { maxCampaigns?: number } = {}) {
  const db = cosServiceDb()
  if (!db) return Object.freeze({
    ok: true as const,
    skipped: true as const,
    reason: 'service_database_unavailable',
    campaignsInspected: 0,
    terminalizedRuns: 0,
    runs: [] as unknown[],
  })

  const campaigns = await db.from('cos_university_mass_distillation_campaigns')
    .select('id,status')
    .in('status', CLEANUP_CAMPAIGN_STATUSES)
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, Math.min(input.maxCampaigns ?? 20, 100)))
  if (campaigns.error) throw campaigns.error

  const campaignStatusById = new Map<string, string>()
  for (const row of (campaigns.data || []) as any[]) {
    const id = String(row.id || '')
    if (id) campaignStatusById.set(id, String(row.status || ''))
  }
  const campaignIds = [...campaignStatusById.keys()]
  // Batch quarantine and capacity release keep their original failed-only scope.
  const failedCampaignIds = campaignIds.filter(id => campaignStatusById.get(id) === 'failed')
  if (!campaignIds.length) return Object.freeze({
    ok: true as const,
    skipped: true as const,
    reason: 'no_terminal_campaign',
    campaignsInspected: 0,
    terminalizedRuns: 0,
    runs: [] as unknown[],
  })

  const pending = await db.from('cos_university_mass_distillation_batch_runs')
    .select('id,campaign_id,batch_key,candidate_id,subject_id,stage')
    .in('campaign_id', campaignIds)
    .not('stage', 'in', '("complete","failed")')
    .order('updated_at', { ascending: true })
    .limit(200)
  if (pending.error) throw pending.error

  const terminalized: Array<{ runId: string; campaignId: string; candidateId: string; subjectId: string; priorStage: string }> = []
  for (const raw of pending.data || []) {
    const row: any = raw
    const now = new Date().toISOString()
    const parentStatus = campaignStatusById.get(String(row.campaign_id)) || 'failed'
    const reason = `parent_campaign_${parentStatus}_terminal_cleanup`
    const updated = await db.from('cos_university_mass_distillation_batch_runs')
      .update({
        stage: 'failed',
        failure_reason: reason,
        stage_reserved_cost_usd: 0,
        stage_idempotency_key: null,
        claimed_at: null,
        updated_at: now,
      })
      .eq('id', row.id)
      .eq('campaign_id', row.campaign_id)
      .not('stage', 'in', '("complete","failed")')
      .select('id')
      .maybeSingle()
    if (updated.error) throw updated.error
    if (!updated.data) continue

    const evidence = {
      profile: MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE,
      claim: 'mass_distillation_terminal_run_cleanup',
      campaignId: String(row.campaign_id),
      runId: String(row.id),
      candidateId: String(row.candidate_id || ''),
      priorStage: String(row.stage || ''),
      reason,
      retryAuthorized: false,
      dispatchAuthorized: false,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
    }
    const evidenceHash = hash(evidence)
    const eventKey = hash([MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE, row.id, evidenceHash])
    const recorded = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: eventKey,
      event_type: 'fine_tune',
      subject_id: String(row.subject_id || ''),
      candidate_id: String(row.candidate_id || ''),
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'host_controller',
      observed_at: now,
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (recorded.error) throw recorded.error

    terminalized.push({
      runId: String(row.id),
      campaignId: String(row.campaign_id),
      candidateId: String(row.candidate_id || ''),
      subjectId: String(row.subject_id || ''),
      priorStage: String(row.stage || ''),
    })
  }

  // A failed parent campaign terminally consumes its batch identity. Keeping that batch marked
  // "prepared" is misleading and can make inventory/monitoring report stock that rolling
  // authorization is forbidden to reuse. Quarantine every still-prepared batch whose run is
  // already terminal-failed under a failed campaign.
  const failedRuns = failedCampaignIds.length ? await db.from('cos_university_mass_distillation_batch_runs')
    .select('id,campaign_id,batch_key,candidate_id,subject_id,stage,failure_reason')
    .in('campaign_id', failedCampaignIds)
    .eq('stage', 'failed')
    .limit(500) : { data: [] as any[], error: null }
  if (failedRuns.error) throw failedRuns.error

  const quarantinedBatches: Array<{ batchKey: string; runId: string; campaignId: string }> = []
  for (const raw of failedRuns.data || []) {
    const row: any = raw
    const batchKey = String(row.batch_key || '')
    if (!batchKey) continue
    const now = new Date().toISOString()
    const quarantined = await db.from('cos_university_distillation_curriculum_batches')
      .update({ status: 'quarantined', updated_at: now })
      .eq('batch_key', batchKey)
      .eq('status', 'prepared')
      .eq('dispatch_authorized', false)
      .eq('authority_expanded', false)
      .select('batch_key')
      .maybeSingle()
    if (quarantined.error) throw quarantined.error
    if (!quarantined.data) continue

    const evidence = {
      profile: MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE,
      claim: 'mass_distillation_failed_batch_quarantined',
      campaignId: String(row.campaign_id),
      runId: String(row.id),
      batchKey,
      candidateId: String(row.candidate_id || ''),
      reason: String(row.failure_reason || 'terminal_failed_campaign_batch_consumed'),
      retryAuthorized: false,
      dispatchAuthorized: false,
      productionTrafficAuthorized: false,
      reusablePreparedInventory: false,
      authorityExpanded: false,
    }
    const evidenceHash = hash(evidence)
    const eventKey = hash([MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE, 'failed-batch-quarantine', batchKey, evidenceHash])
    const recorded = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: eventKey,
      event_type: 'fine_tune',
      subject_id: String(row.subject_id || ''),
      candidate_id: String(row.candidate_id || ''),
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'host_controller',
      observed_at: now,
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (recorded.error) throw recorded.error

    quarantinedBatches.push({
      batchKey,
      runId: String(row.id),
      campaignId: String(row.campaign_id),
    })
  }

  // A failed campaign with only terminal runs and no unsettled provider job is fully terminal.
  // Marking completed_at releases the rolling admission slot; otherwise the database correctly
  // fences it as an in-flight failed campaign and can deadlock all four dynamic campaign slots.
  const remainingNonterminal = failedCampaignIds.length ? await db.from('cos_university_mass_distillation_batch_runs')
    .select('campaign_id')
    .in('campaign_id', failedCampaignIds)
    .not('stage', 'in', '("complete","failed")')
    .limit(500) : { data: [] as any[], error: null }
  if (remainingNonterminal.error) throw remainingNonterminal.error

  const unsettledJobs = failedCampaignIds.length ? await db.from('cos_university_mass_distillation_provider_jobs')
    .select('campaign_id')
    .in('campaign_id', failedCampaignIds)
    .is('settled_at', null)
    .limit(500) : { data: [] as any[], error: null }
  if (unsettledJobs.error) throw unsettledJobs.error

  const blockedCampaigns = new Set<string>([
    ...(remainingNonterminal.data || []).map((row: any) => String(row.campaign_id || '')),
    ...(unsettledJobs.data || []).map((row: any) => String(row.campaign_id || '')),
  ].filter(Boolean))
  const completedCampaigns: string[] = []

  for (const campaignId of failedCampaignIds) {
    if (blockedCampaigns.has(campaignId)) continue
    const now = new Date().toISOString()
    const completed = await db.from('cos_university_mass_distillation_campaigns')
      .update({ completed_at: now, updated_at: now })
      .eq('id', campaignId)
      .eq('status', 'failed')
      .is('completed_at', null)
      .select('id')
      .maybeSingle()
    if (completed.error) throw completed.error
    if (!completed.data) continue

    const evidence = {
      profile: MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE,
      claim: 'mass_distillation_failed_campaign_completed',
      campaignId,
      reason: 'all_runs_terminal_and_provider_jobs_settled',
      retryAuthorized: false,
      dispatchAuthorized: false,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
    }
    const evidenceHash = hash(evidence)
    const eventKey = hash([MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE, 'failed-campaign-completed', campaignId])
    const recorded = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: eventKey,
      event_type: 'fine_tune',
      subject_id: 'distillation_campaign',
      candidate_id: `mass-campaign:${campaignId}`,
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'host_controller',
      observed_at: now,
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (recorded.error) throw recorded.error
    completedCampaigns.push(campaignId)
  }

  return Object.freeze({
    ok: true as const,
    skipped: terminalized.length === 0 && quarantinedBatches.length === 0 && completedCampaigns.length === 0,
    reason: terminalized.length === 0 && quarantinedBatches.length === 0 && completedCampaigns.length === 0
      ? 'no_orphaned_nonterminal_terminal_campaign_run'
      : null,
    campaignsInspected: campaignIds.length,
    terminalizedRuns: terminalized.length,
    runs: Object.freeze(terminalized),
    quarantinedBatches: quarantinedBatches.length,
    batchQuarantines: Object.freeze(quarantinedBatches),
    completedCampaigns: completedCampaigns.length,
    completedCampaignIds: Object.freeze(completedCampaigns),
    retryAuthorized: false,
    dispatchAuthorized: false,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  })
}
