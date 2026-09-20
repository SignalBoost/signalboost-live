// saas/lib/ai/cos/cosUniversityGraduateArtifactSync.ts
//
// Two ledgers describe the same trained model and nothing kept them in agreement.
//
// `cos_university_graduate_model_registry` moves pending_runtime -> active when activateGraduateRuntime proves
// health, identity and rollback. `cos_local_distillation_artifacts` moves evaluation_pending -> runtime_pending
// when the evaluation passes. Neither registration nor activation ever writes back to the artifact row, so an
// activated graduate leaves its artifact at runtime_pending permanently - which is exactly the state the
// Reasoning & Decision Science graduate is in: active in the registry, runtime_pending in the artifact ledger.
//
// That is not only cosmetic. registerNextMassGraduate selects the oldest 50 runtime_pending artifacts, so every
// already-activated artifact that never advanced consumes a slot in the window that finds the NEXT graduate.
//
// This module decides the write; it never performs one. The direction is deliberately narrow: an artifact only
// advances when its own registry row proves a runtime is live, and only from runtime_pending, so a quarantined,
// retired or still-evaluating artifact is never touched. Registry states that mean "not yet live" (pending_runtime,
// canary) and states that mean "no longer live" (quarantined, retired) are left to the paths that own them -
// retirement in particular must stay with rollback, which has evidence this module does not see.

export type GraduateRegistryRow = Readonly<{
  candidateId: string
  artifactHash: string
  status: string
}>

export type DistillationArtifactRow = Readonly<{
  candidateId: string
  artifactHash: string
  status: string
}>

export type GraduateArtifactLifecycleSync = Readonly<{
  candidateId: string
  artifactHash: string
  fromStatus: 'runtime_pending'
  toStatus: 'active'
  reason: 'graduate_runtime_active'
}>

const HEX64 = /^[a-f0-9]{64}$/

function key(candidateId: string, artifactHash: string): string {
  return `${candidateId}:${artifactHash.toLowerCase()}`
}

function usable(row: { candidateId?: unknown; artifactHash?: unknown }): boolean {
  const candidateId = String(row.candidateId ?? '').trim()
  const artifactHash = String(row.artifactHash ?? '').trim().toLowerCase()
  return Boolean(candidateId) && HEX64.test(artifactHash)
}

/**
 * Pairs each artifact with its own registry row by candidate AND artifact hash - never by candidate alone,
 * because one candidate can hold several trained artifacts and only the activated one may advance.
 */
export function decideGraduateArtifactLifecycleSync(input: {
  registry: readonly GraduateRegistryRow[]
  artifacts: readonly DistillationArtifactRow[]
}): readonly GraduateArtifactLifecycleSync[] {
  const activeGraduates = new Set<string>()
  for (const row of input.registry) {
    if (!usable(row)) continue
    if (String(row.status || '').trim() !== 'active') continue
    activeGraduates.add(key(String(row.candidateId).trim(), String(row.artifactHash).trim()))
  }
  if (!activeGraduates.size) return Object.freeze([])

  const seen = new Set<string>()
  const sync: GraduateArtifactLifecycleSync[] = []
  for (const row of input.artifacts) {
    if (!usable(row)) continue
    if (String(row.status || '').trim() !== 'runtime_pending') continue
    const candidateId = String(row.candidateId).trim()
    const artifactHash = String(row.artifactHash).trim().toLowerCase()
    const pair = key(candidateId, artifactHash)
    if (!activeGraduates.has(pair) || seen.has(pair)) continue
    seen.add(pair)
    sync.push(Object.freeze({
      candidateId,
      artifactHash,
      fromStatus: 'runtime_pending' as const,
      toStatus: 'active' as const,
      reason: 'graduate_runtime_active' as const,
    }))
  }
  return Object.freeze(sync)
}
