import type { HarnessManifest, HarnessRunResult } from '../core/types.ts'

export interface HarnessEvidenceRecord {
  runId:string
  profile:HarnessManifest['profile']
  environmentClass:HarnessManifest['environment']['class']
  agentId:string
  artifactId?:string
  artifactHash?:string
  authorityManifestRef:string
  outcomeStatus:HarnessRunResult['outcome']['status']
  verifierRef?:string
  evidenceHash?:string
  authorityExpanded:false
  productionMutationObserved:boolean
  trajectoryEvidenceRefs:readonly string[]
}

export interface HarnessEvidenceSink { append(record:HarnessEvidenceRecord):Promise<void> }

/** Metadata-only durable evidence. No objective, prompts, params, tool payloads, credentials, or hidden reasoning. */
export function createHarnessEvidenceRecord(manifest:HarnessManifest,result:HarnessRunResult):HarnessEvidenceRecord {
  if(result.runId!==manifest.runId||result.profile!==manifest.profile) throw new Error('harness_evidence_identity_mismatch')
  const refs=[...new Set(result.trajectory.flatMap(event=>event.evidenceRefs??[]).filter(Boolean))]
  return Object.freeze({runId:manifest.runId,profile:manifest.profile,environmentClass:manifest.environment.class,agentId:manifest.identity.agentId,...(manifest.identity.artifact?.artifactId?{artifactId:manifest.identity.artifact.artifactId}:{}),...(manifest.identity.artifact?.artifactHash?{artifactHash:manifest.identity.artifact.artifactHash}:{}),authorityManifestRef:manifest.authorityManifestRef,outcomeStatus:result.outcome.status,...(result.outcome.verifierRef?{verifierRef:result.outcome.verifierRef}:{}),...(result.outcome.evidenceHash?{evidenceHash:result.outcome.evidenceHash}:{}),authorityExpanded:false,productionMutationObserved:result.productionMutationObserved,trajectoryEvidenceRefs:Object.freeze(refs)})
}

export async function persistHarnessEvidence(input:{manifest:HarnessManifest;result:HarnessRunResult;sink:HarnessEvidenceSink}):Promise<HarnessEvidenceRecord>{
  const record=createHarnessEvidenceRecord(input.manifest,input.result)
  await input.sink.append(record)
  return record
}
