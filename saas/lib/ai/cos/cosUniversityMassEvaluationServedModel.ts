// saas/lib/ai/cos/cosUniversityMassEvaluationServedModel.ts
// Approved canaries serve the adapter as `itmounts-mass-distilled-<hash12>-<runtimeKey>` (runpodMassDistilledProvisionV2), so the
// bare hash12 name 404s (Production 2026-09-17 00:44 UTC). The evaluator must call the exact name the passing canary proved on
// THIS endpoint for THIS artifact — never a guessed name, never the base model. No proof means fail closed.
export type CanaryEventRow = Readonly<{ verifier?: unknown; evidence?: any; observed_at?: unknown }>

const CANARY_COMPANION_WINDOW_MS = 10 * 60_000

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

  // The canary lane writes the serving architecture on its companion `production_canary_healthy` record (same endpoint,
  // same artifact, written in the same step), not on `local_distilled_runtime_canary_passed`. Before 2026-09-27 the
  // evaluator read it only from the passed record, so every exclusive-self-attention artifact read as a standard-attention
  // canary and failed `served_model_unproven` three times before any question was asked (mass:dabe6783, 19:57-20:01 UTC).
  // Architecture proof may come from either record; the companion must be host-production-verified, on this endpoint, for
  // this exact artifact, and recorded within minutes of the passing canary.
  const architectureOf = (event: CanaryEventRow) => {
    const own = event.evidence || {}
    if (own.attentionArchitecture) return { attentionArchitecture: own.attentionArchitecture, xsaProfile: own.xsaProfile, servingRuntime: own.servingRuntime }
    const passedAt = Date.parse(String(event.observed_at || ''))
    const companion = events.find(row => row.verifier === 'host_production_verifier'
      && row.evidence?.claim === 'production_canary_healthy'
      && row.evidence?.exactArtifact === true
      && row.evidence?.candidateId === input.candidateId
      && String(row.evidence?.artifactHash || '').toLowerCase() === hash
      && row.evidence?.endpointId === input.endpointId
      && Math.abs(Date.parse(String(row.observed_at || '')) - passedAt) <= CANARY_COMPANION_WINDOW_MS)
    const proof = companion?.evidence || {}
    return { attentionArchitecture: proof.attentionArchitecture, xsaProfile: proof.xsaProfile, servingRuntime: proof.servingRuntime }
  }

  const provenEvent = matching.find(event => event.evidence?.claim === 'local_distilled_runtime_canary_passed'
    && event.evidence?.exactArtifact === true
    && (() => {
      const architecture = architectureOf(event)
      return String(architecture.attentionArchitecture || 'standard_attention') === String(input.attentionArchitecture || 'standard_attention')
        && (input.attentionArchitecture !== 'exclusive_self_attention_v1'
          || (architecture.xsaProfile === input.xsaProfile && architecture.servingRuntime === 'transformers_xsa'))
    })()
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
