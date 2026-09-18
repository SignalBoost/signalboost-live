// saas/lib/ai/cos/cosUniversityDistillationSourceAttribution.ts
// Owner direction (2026-09-17): tuning the distillation recipe is guesswork until each trained artifact records
// WHICH source mix produced it. Two verdicts so far (0.550 vs 0.683 baseline, and 0.900 vs 0.900) say nothing about
// whether real, failure-derived or teacher-synthetic material helped. This classifies a prepared batch's own source
// hashes and reports the mix. It reads nothing outside the batch, decides no policy and authorizes no spend.
import { failureDerivedOrdinalForHash, syntheticOrdinalForHash, type HybridDistillationOrigin } from './cosUniversityHybridDistillation.ts'

export const DISTILLATION_SOURCE_ATTRIBUTION_PROFILE = 'cos-university-distillation-source-attribution-v1' as const
export const DISTILLATION_SOURCE_ATTRIBUTION_CLAIM = 'distillation_source_attribution_recorded' as const

export type DistillationSourceAttribution = Readonly<{
  profile: typeof DISTILLATION_SOURCE_ATTRIBUTION_PROFILE
  total: number
  counts: Readonly<Record<HybridDistillationOrigin, number>>
  percentages: Readonly<Record<HybridDistillationOrigin, number>>
  unclassified: number
}>

const HEX64 = /^[a-f0-9]{64}$/i
const ORIGINS: readonly HybridDistillationOrigin[] = ['real_source', 'failure_derived', 'teacher_synthetic']

/**
 * A source hash is teacher-synthetic when it reproduces the planner's own deterministic hash for this subject,
 * and failure-derived when the batch recorded that origin for it. Everything else stays real_source: an unknown
 * hash is never credited to a synthetic or failure origin it cannot prove.
 */
export function classifyDistillationSource(input: {
  subjectId: string
  sourceHash: string
  declaredOrigins?: Readonly<Record<string, string>>
}): HybridDistillationOrigin | null {
  const sourceHash = String(input.sourceHash || '').trim().toLowerCase()
  if (!HEX64.test(sourceHash)) return null
  const declared = String(input.declaredOrigins?.[sourceHash] || '').trim()
  if ((ORIGINS as readonly string[]).includes(declared)) return declared as HybridDistillationOrigin
  if (failureDerivedOrdinalForHash(String(input.subjectId || ''), sourceHash) !== null) return 'failure_derived'
  if (syntheticOrdinalForHash(String(input.subjectId || ''), sourceHash) !== null) return 'teacher_synthetic'
  return 'real_source'
}

export function attributeDistillationSources(input: {
  subjectId: string
  sourceHashes: readonly string[]
  declaredOrigins?: Readonly<Record<string, string>>
}): DistillationSourceAttribution {
  const counts: Record<HybridDistillationOrigin, number> = { real_source: 0, failure_derived: 0, teacher_synthetic: 0 }
  let unclassified = 0
  for (const sourceHash of input.sourceHashes || []) {
    const origin = classifyDistillationSource({ subjectId: input.subjectId, sourceHash, declaredOrigins: input.declaredOrigins })
    if (!origin) { unclassified += 1; continue }
    counts[origin] += 1
  }
  const total = counts.real_source + counts.failure_derived + counts.teacher_synthetic
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 1000) / 10 : 0)
  return Object.freeze({
    profile: DISTILLATION_SOURCE_ATTRIBUTION_PROFILE,
    total,
    counts: Object.freeze({ ...counts }),
    percentages: Object.freeze({
      real_source: share(counts.real_source),
      failure_derived: share(counts.failure_derived),
      teacher_synthetic: share(counts.teacher_synthetic),
    }),
    unclassified,
  })
}
