// saas/lib/ai/cos/cosUniversityMassDistillationTerminalCleanup.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const MASS_DISTILLATION_TERMINAL_CLEANUP_PROFILE = 'cos-university-mass-distillation-terminal-cleanup-v1' as const

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Terminalize orphaned nonterminal runs whose parent campaign is already failed.
 *
 * This is cleanup only: it retries nothing, dispatches nothing, authorizes no spend, and does not
 * touch active/authorized campaigns. It closes stale run-state left behind when a campaign reaches
 * a failed terminal state before every child row was itself terminalized.
 */
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
    .select('id')
    .eq('status', 'failed')
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, Math.min(input.maxCampaigns ?? 20, 100)))
  if (campaigns.error) throw campaigns.error

  const campaignIds = (campaigns.data || []).map((row: any) => String(row.id || '')).filter(Boolean)
  if (!campaignIds.length) return Object.freeze({
    ok: true as const,
    skipped: true as const,
    reason: 'no_failed_campaign',
    campaignsInspected: 0,
    terminalizedRuns: 0,
    runs: [] as unknown[],
  })

  const pending = await db.from('cos_university_mass_distillation_batch_runs')
    .select('id,campaign_id,candidate_id,subject_id,stage')
    .in('campaign_id', campaignIds)
    .not('stage', 'in', '("complete","failed")')
    .order('updated_at', { ascending: true })
    .limit(200)
  if (pending.error) throw pending.error

  const terminalized: Array<{ runId: string; campaignId: string; candidateId: string; subjectId: string; priorStage: string }> = []
  for (const raw of pending.data || []) {
    const row: any = raw
    const now = new Date().toISOString()
    const reason = 'parent_campaign_failed_terminal_cleanup'
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

  return Object.freeze({
    ok: true as const,
    skipped: terminalized.length === 0,
    reason: terminalized.length === 0 ? 'no_orphaned_nonterminal_failed_campaign_run' : null,
    campaignsInspected: campaignIds.length,
    terminalizedRuns: terminalized.length,
    runs: Object.freeze(terminalized),
    retryAuthorized: false,
    dispatchAuthorized: false,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  })
}
