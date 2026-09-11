import type { SupabaseClient } from '@supabase/supabase-js'
import {
  verifySecurityEvidenceChain,
  type DurableRepositoryPatrolStore,
  type SecurityEvidenceChainEntry,
} from '@/security-host/index'

export function createSupabaseRepositoryPatrolStore(db: SupabaseClient): DurableRepositoryPatrolStore {
  return Object.freeze({
    async loadEvidenceChain(engagementId: string) {
      const result = await db
        .from('security_repository_patrol_evidence')
        .select('evidence_entry')
        .eq('engagement_id', engagementId)
        .order('chain_index', { ascending: true })
      if (result.error) throw result.error
      const chain = (result.data ?? []).map(row => row.evidence_entry as SecurityEvidenceChainEntry)
      if (!verifySecurityEvidenceChain(chain)) throw new Error('security_evidence_chain_invalid')
      return chain
    },

    async appendEvidence(params) {
      const result = await db.rpc('append_security_repository_patrol_evidence', {
        p_engagement_id: params.entry.event.engagementId,
        p_event_id: params.entry.event.eventId,
        p_delivery_id: params.deliveryId,
        p_repository: params.repository.toLowerCase(),
        p_event_type: params.eventType,
        p_chain_index: params.entry.index,
        p_previous_hash: params.entry.previousHash,
        p_entry_hash: params.entry.hash,
        p_evidence_entry: params.entry,
      })
      if (result.error) throw result.error
      const outcome = String(result.data || '')
      if (outcome === 'inserted' || outcome === 'duplicate' || outcome === 'conflict') return outcome
      throw new Error('security_evidence_append_outcome_invalid')
    },
  })
}
