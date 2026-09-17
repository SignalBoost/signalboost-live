// saas/lib/ai/cos/cosUniversityMassEvaluationServedModel.ts
// Approved canaries serve the adapter as `itmounts-mass-distilled-<hash12>-<runtimeKey>` (runpodMassDistilledProvisionV2), so the
// bare hash12 name 404s (Production 2026-09-17 00:44 UTC). The evaluator must call the exact name the passing canary proved on
// THIS endpoint for THIS artifact — never a guessed name, never the base model. No proof means fail closed.
export type CanaryEventRow = Readonly<{ verifier?: unknown; evidence?: any; observed_at?: unknown }>

export function servedCandidateModelFromCanary(
  events: readonly CanaryEventRow[],
  input: Readonly<{ candidateId: string; artifactHash: string; endpointId: string }>,
): string {
  const hash = input.artifactHash.toLowerCase()
  const prefix = `itmounts-mass-distilled-${hash.slice(0, 12)}`
  const proven = events
    .filter(event => event.verifier === 'host_controller'
      && event.evidence?.claim === 'local_distilled_runtime_canary_passed'
      && event.evidence?.exactArtifact === true
      && event.evidence?.candidateId === input.candidateId
      && String(event.evidence?.artifactHash || '').toLowerCase() === hash
      && event.evidence?.endpointId === input.endpointId)
    .sort((a, b) => Date.parse(String(b.observed_at || '')) - Date.parse(String(a.observed_at || '')))
    .map(event => String(event.evidence?.model || ''))
    .find(model => /^[a-z0-9-]{1,80}$/.test(model) && (model === prefix || model.startsWith(`${prefix}-`)))
  if (!proven) throw new Error('mass_distilled_evaluation_served_model_unproven')
  return proven
}
