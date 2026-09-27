// saas/lib/ai/cos/runpodEndpointCleanupPlan.ts
//
// Pure selection policy for retiring idle RunPod serverless endpoints left behind by the mass-distilled
// canary/evaluation lanes. Nothing in those lanes ever deletes an endpoint, so by 2026-09-27 the account held
// ~400 endpoints (393 idle `itmounts-mass-distilled-*` at 0/0 workers) and RunPod's endpoint listing began
// returning "HTTP 500: failed to list endpoints" on every evaluation attempt.
//
// This module only DECIDES. It deletes nothing and calls no provider. An endpoint is eligible only when every
// artifact that ever referenced it is terminal (quarantined), it is not referenced by any non-terminal or
// non-mass artifact, it is not named by the graduate runtime or the graduate registry, and it has not been
// referenced recently. Anything uncertain is kept.

export type EndpointReference = Readonly<{
  endpointId: string
  candidateId: string
  subjectId: string | null
  observedAt: string
  /** True for our own deletion record; a retired endpoint is never selected again. */
  retired?: boolean
}>

export type CleanupCandidate = Readonly<{
  endpointId: string
  candidateIds: readonly string[]
  subjectId: string | null
  lastReferencedAt: string
}>

export type CleanupPlan = Readonly<{
  eligible: readonly CleanupCandidate[]
  kept: Readonly<Record<string, number>>
  totalReferencedEndpoints: number
}>

export const CLEANUP_RECENT_REFERENCE_HOURS = 6
const ENDPOINT_ID = /^[a-z0-9]{8,40}$/i

export function planMassEndpointCleanup(input: {
  references: readonly EndpointReference[]
  artifactStatusByCandidate: ReadonlyMap<string, string>
  protectedText: readonly string[]
  now: Date
}): CleanupPlan {
  const protectedBlob = input.protectedText.join('\n').toLowerCase()
  const recentCutoff = input.now.getTime() - CLEANUP_RECENT_REFERENCE_HOURS * 3_600_000
  const byEndpoint = new Map<string, EndpointReference[]>()
  for (const ref of input.references) {
    const id = String(ref.endpointId || '').trim()
    if (!ENDPOINT_ID.test(id)) continue
    const list = byEndpoint.get(id) ?? []
    list.push(ref)
    byEndpoint.set(id, list)
  }

  const kept: Record<string, number> = {}
  const keep = (reason: string) => { kept[reason] = (kept[reason] ?? 0) + 1 }
  const eligible: CleanupCandidate[] = []

  for (const [endpointId, refs] of byEndpoint) {
    const candidateIds = [...new Set(refs.map(ref => ref.candidateId))]
    const lastMs = Math.max(...refs.map(ref => Date.parse(ref.observedAt)).filter(Number.isFinite))
    if (refs.some(ref => ref.retired === true)) { keep('already_retired'); continue }
    if (protectedBlob.includes(endpointId.toLowerCase())) { keep('protected_runtime_or_registry'); continue }
    if (candidateIds.some(id => !id.startsWith('mass:'))) { keep('referenced_by_non_mass_candidate'); continue }
    if (candidateIds.some(id => input.artifactStatusByCandidate.get(id) !== 'quarantined')) { keep('referenced_by_non_terminal_artifact'); continue }
    if (!Number.isFinite(lastMs) || lastMs > recentCutoff) { keep('referenced_recently'); continue }
    eligible.push(Object.freeze({
      endpointId,
      candidateIds: Object.freeze(candidateIds),
      subjectId: refs.find(ref => ref.subjectId)?.subjectId ?? null,
      lastReferencedAt: new Date(lastMs).toISOString(),
    }))
  }

  eligible.sort((a, b) => Date.parse(a.lastReferencedAt) - Date.parse(b.lastReferencedAt))
  return Object.freeze({ eligible: Object.freeze(eligible), kept: Object.freeze(kept), totalReferencedEndpoints: byEndpoint.size })
}

/** A live endpoint may be deleted only when RunPod itself confirms it is ours, mass-distilled, and has no workers. */
export function liveEndpointDeletable(endpoint: { name?: unknown; workersMin?: unknown; workersMax?: unknown } | null | undefined): boolean {
  if (!endpoint) return false
  const name = String(endpoint.name ?? '')
  return name.startsWith('itmounts-mass-distilled')
    && Number(endpoint.workersMin ?? 0) === 0
    && Number(endpoint.workersMax ?? 0) === 0
}
