// saas/platform-harness/adapters/self-healing.ts
//
// Failure handoff only. This adapter does not execute a repair and therefore does
// not grant Self-Healing new authority; the existing supervisor/Governed Socket
// remains responsible for any repair action.

import type {
  HarnessManifest,
  HarnessRunResult,
} from '../core/types.ts'

export interface HarnessSelfHealingHandoff {
  runId: string
  environmentId: string
  environmentClass: HarnessManifest['environment']['class']
  authorityManifestRef: string
  failureCode: string
  evidenceRefs: readonly string[]
}

function evidenceRefs(result: HarnessRunResult): readonly string[] {
  const refs = result.trajectory.flatMap(event => event.evidenceRefs ?? [])
  return Object.freeze([...new Set(refs)])
}

export function createSelfHealingHandoff(
  manifest: HarnessManifest,
  result: HarnessRunResult,
): HarnessSelfHealingHandoff | null {
  if (result.outcome.status !== 'infrastructure_failure') return null

  return Object.freeze({
    runId: result.runId,
    environmentId: manifest.environment.environmentId,
    environmentClass: manifest.environment.class,
    authorityManifestRef: manifest.authorityManifestRef,
    failureCode: result.outcome.failureCode ?? 'harness_infrastructure_failure',
    evidenceRefs: evidenceRefs(result),
  })
}
