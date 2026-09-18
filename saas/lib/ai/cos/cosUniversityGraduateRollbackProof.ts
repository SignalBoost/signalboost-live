// saas/lib/ai/cos/cosUniversityGraduateRollbackProof.ts
// Owner direction (2026-09-17, item 8): a promoted graduate must have a rollback path that is proven, not merely
// recorded. Today the only rollback check anywhere is "the string is not empty" (cosUniversityGraduateRuntime:
// graduate_runtime_rollback_missing), so an artifact could activate behind a rollback target that does not exist.
// This resolves the recorded reference against the provider and records what it found. It is read-only: no
// download, no training, no runtime, no traffic, no spend, and it never changes a graduate's status by itself.
export const GRADUATE_ROLLBACK_PROOF_PROFILE = 'cos-university-graduate-rollback-proof-v1' as const
export const GRADUATE_ROLLBACK_PROOF_CLAIM = 'graduate_rollback_reference_verified' as const

export type RollbackReference = Readonly<{ repoId: string; revision: string | null }>

const HF_REF = /^hf:\/\/models\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:@([a-f0-9]{40}))?$/i

/** Only the provider form the training worker writes is accepted; anything else is unproven, not "probably fine". */
export function parseRollbackReference(value: unknown): RollbackReference | null {
  const match = HF_REF.exec(String(value ?? '').trim())
  if (!match) return null
  return Object.freeze({ repoId: match[1], revision: match[2] ? match[2].toLowerCase() : null })
}

export type RollbackProof = Readonly<{
  ok: boolean
  reason: string
  repoId: string | null
  pinnedRevision: string | null
  resolvedRevision: string | null
  httpStatus: number | null
}>

export function classifyRollbackResolution(input: {
  reference: RollbackReference | null
  httpStatus: number | null
  resolvedRevision: string | null
}): RollbackProof {
  const base = { repoId: input.reference?.repoId ?? null, pinnedRevision: input.reference?.revision ?? null, resolvedRevision: input.resolvedRevision, httpStatus: input.httpStatus }
  if (!input.reference) return Object.freeze({ ...base, ok: false, reason: 'rollback_reference_unparseable' })
  if (input.httpStatus === 401 || input.httpStatus === 403) return Object.freeze({ ...base, ok: false, reason: 'rollback_reference_unauthorized' })
  if (input.httpStatus === 404) return Object.freeze({ ...base, ok: false, reason: 'rollback_reference_not_found' })
  if (input.httpStatus !== 200) return Object.freeze({ ...base, ok: false, reason: 'rollback_reference_unresolved' })
  if (!input.resolvedRevision) return Object.freeze({ ...base, ok: false, reason: 'rollback_revision_missing' })
  // A pinned reference must resolve to exactly that commit; an unpinned one is resolved and recorded, never assumed.
  if (input.reference.revision && input.reference.revision !== input.resolvedRevision.toLowerCase()) {
    return Object.freeze({ ...base, ok: false, reason: 'rollback_revision_mismatch' })
  }
  return Object.freeze({ ...base, ok: true, reason: input.reference.revision ? 'rollback_reference_resolved_pinned' : 'rollback_reference_resolved_unpinned' })
}

/** Read-only provider resolution of the rollback target. Never downloads weights and never mutates anything. */
export async function proveGraduateRollbackReference(input: { rollbackArtifactRef: unknown; token?: string; timeoutMs?: number }): Promise<RollbackProof> {
  const reference = parseRollbackReference(input.rollbackArtifactRef)
  if (!reference) return classifyRollbackResolution({ reference: null, httpStatus: null, resolvedRevision: null })
  const token = String(input.token ?? process.env.HF_TOKEN ?? '').trim()
  const path = reference.revision
    ? `https://huggingface.co/api/models/${reference.repoId}/revision/${reference.revision}`
    : `https://huggingface.co/api/models/${reference.repoId}`
  try {
    const response = await fetch(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(Math.max(1, Math.min(Number(input.timeoutMs) || 15_000, 30_000))),
    })
    const payload: any = response.ok ? await response.json().catch(() => null) : null
    return classifyRollbackResolution({
      reference,
      httpStatus: response.status,
      resolvedRevision: payload?.sha ? String(payload.sha).toLowerCase() : null,
    })
  } catch {
    return classifyRollbackResolution({ reference, httpStatus: null, resolvedRevision: null })
  }
}
