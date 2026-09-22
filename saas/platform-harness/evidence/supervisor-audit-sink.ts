import type { HarnessEvidenceRecord, HarnessEvidenceSink } from './durable-evidence.ts'

type InsertResult={error?:{message?:string}|null}
type AuditDb={from(table:string):{insert(value:unknown):Promise<InsertResult>}}

/** Persist the already-sanitized Harness record into the existing immutable supervisor audit trail. */
export function createSupervisorAuditHarnessEvidenceSink(db:AuditDb):HarnessEvidenceSink {
  return Object.freeze({
    async append(record:HarnessEvidenceRecord):Promise<void>{
      const eventId='platform-harness-'+record.runId
      const {error}=await db.from('supervisor_audit_events').insert({
        event_id:eventId,
        execution_id:record.runId,
        incident_id:record.runId,
        event_type:'platform_harness_run_completed',
        occurred_at:new Date().toISOString(),
        payload:{
          profile:record.profile,
          environmentClass:record.environmentClass,
          agentId:record.agentId,
          ...(record.artifactId?{artifactId:record.artifactId}:{}),
          ...(record.artifactHash?{artifactHash:record.artifactHash}:{}),
          authorityManifestRef:record.authorityManifestRef,
          outcomeStatus:record.outcomeStatus,
          ...(record.verifierRef?{verifierRef:record.verifierRef}:{}),
          ...(record.evidenceHash?{evidenceHash:record.evidenceHash}:{}),
          authorityExpanded:false,
          productionMutationObserved:record.productionMutationObserved,
          trajectoryEvidenceRefs:[...record.trajectoryEvidenceRefs],
        },
        schema_version:'platform-harness-evidence-v1',
      })
      if(error) throw new Error('platform_harness_evidence_persist_failed')
    },
  })
}
