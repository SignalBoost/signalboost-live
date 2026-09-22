import type { SupabaseClient } from '@supabase/supabase-js'
import type { HarnessEvidenceRecord, HarnessEvidenceSink } from './durable-evidence.ts'

export function createSupabaseHarnessEvidenceSink(db:SupabaseClient):HarnessEvidenceSink{
  return Object.freeze({
    async append(record:HarnessEvidenceRecord):Promise<void>{
      const {error}=await db.from('platform_harness_evidence').insert({
        run_id:record.runId,
        profile:record.profile,
        environment_class:record.environmentClass,
        agent_id:record.agentId,
        artifact_id:record.artifactId??null,
        artifact_hash:record.artifactHash??null,
        authority_manifest_ref:record.authorityManifestRef,
        outcome_status:record.outcomeStatus,
        verifier_ref:record.verifierRef??null,
        evidence_hash:record.evidenceHash??null,
        authority_expanded:false,
        production_mutation_observed:record.productionMutationObserved,
        trajectory_evidence_refs:[...record.trajectoryEvidenceRefs],
      })
      if(error) throw error
    },
  })
}
