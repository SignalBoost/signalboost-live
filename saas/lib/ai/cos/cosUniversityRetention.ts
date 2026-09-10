import type { CosUniversitySubjectId } from './cosUniversity.ts'

export const COS_UNIVERSITY_RETENTION_PROFILE = 'cos_university_delayed_retention_v1'
export const COS_UNIVERSITY_RETENTION_MIN_DELAY_DAYS = 14

export type CosUniversityRetentionSource = Readonly<{
  id: string
  subjectId: CosUniversitySubjectId
  seed: string
  manifestHash: string
  passed: boolean
  observedAt: string
}>

export function selectDueCosUniversityRetention(
  sources: readonly CosUniversityRetentionSource[],
  completedSourceRefs: ReadonlySet<string>,
  now: Date,
): CosUniversityRetentionSource | null {
  const cutoff = now.getTime() - COS_UNIVERSITY_RETENTION_MIN_DELAY_DAYS * 86_400_000
  return sources
    .filter(row => row.passed && !completedSourceRefs.has(row.id) && Date.parse(row.observedAt) <= cutoff)
    .filter(row => Boolean(row.seed) && Boolean(row.manifestHash) && Number.isFinite(Date.parse(row.observedAt)))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))[0] ?? null
}
