// saas/lib/ai/cos/cosUniversityMasters.ts
//
// COS University Master's layer: the specialist programs an agent may enter AFTER a host-issued
// undergraduate credential exists. This file owns the academic definition only — which tracks
// exist, which undergraduate subjects each one deepens, and what evidence a track demands.
// Enrollment timing lives in cosUniversityPrograms.ts; the admission decision lives in
// cosUniversityAdmission.ts. Nothing here grants anything.

import type { CosUniversitySubjectId } from './cosUniversity.ts'

export type CosUniversityMastersTrackId =
  | 'applied_ai_systems'
  | 'security_and_trust'
  | 'quantitative_decision_science'
  | 'enterprise_operations_and_governance'
  | 'scientific_and_physical_systems'

export type CosUniversityMastersTrack = Readonly<{
  id: CosUniversityMastersTrackId
  title: string
  objective: string
  /** Undergraduate subjects this track deepens. Order is significance order, strongest first. */
  coreSubjects: readonly CosUniversitySubjectId[]
  /** Subjects the track leans on but does not examine at Master's depth. */
  supportingSubjects: readonly CosUniversitySubjectId[]
  /** Distinct independent exam passes required at Master's depth before a thesis may be attempted. */
  requiredDepthPasses: number
}>

export const COS_UNIVERSITY_MASTERS_TRACKS: ReadonlyArray<CosUniversityMastersTrack> = Object.freeze([
  Object.freeze({
    id: 'applied_ai_systems',
    title: 'Applied AI Systems',
    objective: 'Design, evaluate, and operate AI systems end to end, including failure analysis and evaluation design.',
    coreSubjects: Object.freeze(['computer_science', 'statistics_data_science'] as const),
    supportingSubjects: Object.freeze(['mathematics', 'reasoning_decision_science'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'security_and_trust',
    title: 'Security & Trust Engineering',
    objective: 'Reason adversarially about systems, identity, and incidents, and defend designs under hostile assumptions.',
    coreSubjects: Object.freeze(['cybersecurity', 'computer_science'] as const),
    supportingSubjects: Object.freeze(['law_regulation_governance', 'reasoning_decision_science'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'quantitative_decision_science',
    title: 'Quantitative Decision Science',
    objective: 'Draw defensible conclusions from data under uncertainty and state what the evidence cannot support.',
    coreSubjects: Object.freeze(['statistics_data_science', 'mathematics'] as const),
    supportingSubjects: Object.freeze(['economics_finance', 'reasoning_decision_science'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'enterprise_operations_and_governance',
    title: 'Enterprise Operations & Governance',
    objective: 'Run and govern operating businesses: process, control, regulation, and accountable decision records.',
    coreSubjects: Object.freeze(['business_operations', 'law_regulation_governance'] as const),
    supportingSubjects: Object.freeze(['economics_finance', 'social_behavioral_sciences'] as const),
    requiredDepthPasses: 3,
  }),
  Object.freeze({
    id: 'scientific_and_physical_systems',
    title: 'Scientific & Physical Systems',
    objective: 'Apply scientific method and physical reasoning to instrumented real-world systems.',
    coreSubjects: Object.freeze(['physics_natural_sciences', 'mathematics'] as const),
    supportingSubjects: Object.freeze(['statistics_data_science', 'computer_science'] as const),
    requiredDepthPasses: 3,
  }),
])

export function cosUniversityMastersTrackById(id: string): CosUniversityMastersTrack | null {
  return COS_UNIVERSITY_MASTERS_TRACKS.find((track) => track.id === id) ?? null
}

/** Stable, explicit program key. A repeat or a second Master's must use a different key. */
export function cosUniversityMastersProgramKey(trackId: CosUniversityMastersTrackId): string {
  return `specialist_masters_${trackId}_v1`
}

export const COS_UNIVERSITY_MASTERS_PROGRAM_KEY_PREFIX = 'specialist_masters_'

/**
 * Rank tracks for a candidate by the undergraduate standing already demonstrated in their core
 * subjects. This selects WHICH specialization the host offers; it never decides WHETHER to admit.
 * Ties resolve by catalog order so the choice is deterministic and reproducible from evidence.
 */
export function rankCosUniversityMastersTracks(
  subjectStanding: ReadonlyMap<CosUniversitySubjectId, number>,
): ReadonlyArray<{ track: CosUniversityMastersTrack; score: number }> {
  return COS_UNIVERSITY_MASTERS_TRACKS
    .map((track, index) => {
      const core = track.coreSubjects.reduce((sum, id) => sum + (subjectStanding.get(id) ?? 0), 0)
      const supporting = track.supportingSubjects.reduce((sum, id) => sum + (subjectStanding.get(id) ?? 0), 0)
      const denominator = track.coreSubjects.length + track.supportingSubjects.length * 0.5
      const score = denominator > 0 ? (core + supporting * 0.5) / denominator : 0
      return { track, score, index }
    })
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ track, score }) => ({ track, score }))
}
