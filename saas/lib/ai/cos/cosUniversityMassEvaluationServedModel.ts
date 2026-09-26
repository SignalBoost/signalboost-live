// saas/lib/ai/cos/cosUniversityMassEvaluationServedModel.ts
// Approved canaries serve the adapter as `itmounts-mass-distilled-<hash12>-<runtimeKey>` (runpodMassDistilledProvisionV2), so the
// bare hash12 name 404s (Production 2026-09-17 00:44 UTC). The evaluator must call the exact name the passing canary proved on
// THIS endpoint for THIS artifact — never a guessed name, never the base model. No proof means fail closed.
export type CanaryEventRow = Readonly<{ verifier?: unknown; evidence?: any; observed_at?: unknown }>

export function servedCandidateModelFromCanary(
  events: readonly CanaryEventRow[],
  input: Readonly<{ candidateId: string; artifactHash: string; endpointId: string; attentionArchitecture?: string; xsaProfile?: string }>,
): string {
  const hash = input.artifactHash.toLowerCase()
  const prefix = `itmounts-mass-distilled-${hash.slice(0, 12)}`
  const matching = events
    .filter(event => event.verifier === 'host_controller'
      && event.evidence?.candidateId === input.candidateId
      && String(event.evidence?.artifactHash || '').toLowerCase() === hash
      && event.evidence?.endpointId === input.endpointId)
    .sort((a, b) => Date.parse(String(b.observed_at || '')) - Date.parse(String(a.observed_at || '')))

  const provenEvent = matching.find(event => event.evidence?.claim === 'local_distilled_runtime_canary_passed'
    && event.evidence?.exactArtifact === true
    && String(event.evidence?.attentionArchitecture || 'standard_attention') === String(input.attentionArchitecture || 'standard_attention')
    && (input.attentionArchitecture !== 'exclusive_self_attention_v1' || (event.evidence?.xsaProfile === input.xsaProfile && event.evidence?.servingRuntime === 'transformers_xsa'))
    && (() => {
      const model = String(event.evidence?.model || '')
      return /^[a-z0-9-]{1,80}$/.test(model) && (model === prefix || model.startsWith(`${prefix}-`))
    })())
  if (!provenEvent) throw new Error('mass_distilled_evaluation_served_model_unproven')

  const provenAt = Date.parse(String(provenEvent.observed_at || ''))
  const invalidated = matching.some(event => event.evidence?.claim === 'local_distilled_runtime_canary_failed'
    && Date.parse(String(event.observed_at || '')) > provenAt)
  if (invalidated) throw new Error('mass_distilled_evaluation_served_model_unproven')

  return String(provenEvent.evidence?.model || '')
}
