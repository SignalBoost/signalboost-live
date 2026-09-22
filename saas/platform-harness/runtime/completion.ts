import type { HarnessManifest, HarnessRunResult } from '../core/types.ts'
import { persistHarnessEvidence, type HarnessEvidenceRecord, type HarnessEvidenceSink } from '../evidence/durable-evidence.ts'
import { routeCompletedHarnessRun, type HarnessOutcomeRoute } from '../adapters/outcome-router.ts'
import type { UniversityResidencyCaseContext } from '../adapters/university.ts'

export interface CompletedHarnessRun {
  evidence: HarnessEvidenceRecord
  route: HarnessOutcomeRoute
}

/**
 * Canonical completion boundary: persist metadata-only evidence first, then route the
 * already-classified outcome. Persistence grants no authority and routing executes no repair.
 */
export async function completeHarnessRun(input:{manifest:HarnessManifest;result:HarnessRunResult;evidenceSink:HarnessEvidenceSink;universityContext?:UniversityResidencyCaseContext}):Promise<CompletedHarnessRun>{
  const evidence=await persistHarnessEvidence({manifest:input.manifest,result:input.result,sink:input.evidenceSink})
  const route=routeCompletedHarnessRun({manifest:input.manifest,result:input.result,...(input.universityContext?{universityContext:input.universityContext}:{})})
  return Object.freeze({evidence,route})
}
