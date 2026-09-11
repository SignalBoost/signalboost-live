import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  RepositoryWebhookAppendResult,
  RepositoryWebhookDurableState,
  RepositoryWebhookEvidenceStore,
} from '@/security-host/github-webhook-ingestion'
import type { SecurityEvidenceChainEntry } from '@/security-host/evidence'

const MAX_CHAIN_ENTRIES = 10_000

export class SupabaseRepositoryWebhookEvidenceStore implements RepositoryWebhookEvidenceStore {
  constructor(private readonly db: SupabaseClient) {}

  async loadState(params: { engagementId: string; repository: string; now: string }): Promise<RepositoryWebhookDurableState> {
    const minuteAgo = new Date(Date.parse(params.now) - 60_000).toISOString()
    const [chain, recent, targets, target] = await Promise.all([
      this.db.from('security_repository_evidence_chain')
        .select('evidence_entry').order('chain_index', { ascending: true }).limit(MAX_CHAIN_ENTRIES + 1),
      this.db.from('security_repository_evidence_chain')
        .select('*', { count: 'exact', head: true }).eq('engagement_id', params.engagementId).gte('recorded_at', minuteAgo),
      this.db.from('security_repository_evidence_chain')
        .select('repository').eq('engagement_id', params.engagementId).limit(MAX_CHAIN_ENTRIES),
      this.db.from('security_repository_evidence_chain')
        .select('*', { count: 'exact', head: true }).eq('engagement_id', params.engagementId).eq('repository', params.repository.toLowerCase()),
    ])
    for (const result of [chain, recent, targets, target]) if (result.error) throw result.error
    if ((chain.data?.length || 0) > MAX_CHAIN_ENTRIES) throw new Error('security_evidence_chain_limit_reached')
    const evidenceChain = (chain.data || []).map(row => row.evidence_entry) as SecurityEvidenceChainEntry[]
    const distinctTargetsTouched = new Set((targets.data || []).map(row => String(row.repository))).size
    return {
      evidenceChain,
      requestsInCurrentMinute: recent.count || 0,
      distinctTargetsTouched,
      targetAlreadyCounted: (target.count || 0) > 0,
    }
  }

  async append(params: Parameters<RepositoryWebhookEvidenceStore['append']>[0]): Promise<RepositoryWebhookAppendResult> {
    const { data, error } = await this.db.rpc('append_security_repository_evidence', {
      p_delivery_id: params.deliveryId,
      p_repository: params.repository,
      p_provider_event: params.providerEvent,
      p_payload_sha256: params.payloadSha256,
      p_engagement_id: params.engagementId,
      p_chain_index: params.entry.index,
      p_previous_hash: params.entry.previousHash,
      p_entry_hash: params.entry.hash,
      p_evidence_entry: params.entry,
      p_indicators: params.indicators,
      p_recorded_at: params.entry.event.recordedAt,
    })
    if (error) throw error
    if (data !== 'appended' && data !== 'duplicate' && data !== 'chain_conflict') throw new Error('security_evidence_append_invalid_result')
    return data
  }
}

