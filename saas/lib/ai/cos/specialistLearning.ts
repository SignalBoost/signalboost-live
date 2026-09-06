import type { CognitiveSkillStatus } from './cognitiveLearningLifecycle.ts'

export type SpecialistFamily = 'software'

export type SoftwareCurriculumTrack =
  | 'software.development'
  | 'software.debugging'
  | 'software.testing'
  | 'software.architecture'
  | 'software.delivery'
  | 'software.security'
  | 'software.technical-writing'

export type SpecialistLearningRoute = {
  schemaVersion: 1
  orchestrator: 'cos'
  specialistFamily: SpecialistFamily | null
  curriculumTracks: SoftwareCurriculumTrack[]
  routingBasis: 'deterministic_topic_intent' | 'cos_general_study'
  authorityGranted: false
}

const TRACK_PATTERNS: ReadonlyArray<[SoftwareCurriculumTrack, RegExp]> = [
  ['software.debugging', /\b(debug|debugging|defect|bug|failure|exception|stack trace|root cause|repair|fix)\b/i],
  ['software.testing', /\b(test|testing|assertion|unit test|integration test|e2e|regression|verification|quality assurance|qa)\b/i],
  ['software.architecture', /\b(architecture|system design|distributed system|design pattern|api design|database schema|microservice)\b/i],
  ['software.delivery', /\b(devops|ci\/?cd|deployment|deploy|container|docker|kubernetes|observability|production release)\b/i],
  ['software.security', /\b(secure coding|application security|cybersecurity|vulnerability|threat model|authentication|authorization|owasp)\b/i],
  ['software.technical-writing', /\b(technical writing|documentation|readme|api reference|runbook|code comment|developer guide)\b/i],
  ['software.development', /\b(code|coding|software|programming|developer|typescript|javascript|python|java|rust|golang|react|next\.js|algorithm|transformer|machine learning|language model|llm)\b/i],
]

/**
 * Route study material without granting tools, execution authority, or mastery. COS always remains
 * the learning owner; a specialist route only requests deeper curriculum and scoped telemetry.
 */
export function routeSpecialistLearning(input: { topic?: unknown; studyIntent?: unknown; text?: unknown }): SpecialistLearningRoute {
  const searchable = `${String(input.topic ?? '')} ${String(input.studyIntent ?? '')} ${String(input.text ?? '').slice(0, 4000)}`
  const curriculumTracks = TRACK_PATTERNS.filter(([, pattern]) => pattern.test(searchable)).map(([track]) => track)
  return {
    schemaVersion: 1,
    orchestrator: 'cos',
    specialistFamily: curriculumTracks.length ? 'software' : null,
    curriculumTracks,
    routingBasis: curriculumTracks.length ? 'deterministic_topic_intent' : 'cos_general_study',
    authorityGranted: false,
  }
}

export function specialistLearningEvidence(route: SpecialistLearningRoute): string[] {
  return [
    'learning_router:v1',
    'learning_orchestrator:cos',
    `specialist_family:${route.specialistFamily ?? 'none'}`,
    ...route.curriculumTracks.map(track => `specialist_curriculum:${track}`),
    'specialist_authority_granted:false',
  ]
}

export type SpecialistSkillTelemetryRow = {
  status?: CognitiveSkillStatus | string | null
  procedure?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  last_validated_at?: string | null
  updated_at?: string | null
}

export type DirectedSoftwareLessonTelemetryRow = {
  status?: string | null
  repeat_count?: number | null
  metadata?: Record<string, unknown> | null
}

export type DirectedSoftwareApplicationProgress = {
  sources: number
  queued: number
  candidates: number
  validated: number
  rejected: number
  reinforcements: number
}

export type SpecialistCompetencySnapshot = {
  specialistFamily: SpecialistFamily
  totalSkills: number
  lifecycleCounts: Record<CognitiveSkillStatus, number>
  curriculumCounts: Partial<Record<SoftwareCurriculumTrack, number>>
  freshValidatedSkills: number
  staleValidatedSkills: number
}

const STATUSES: CognitiveSkillStatus[] = ['encountered', 'evaluated', 'understood', 'practiced', 'validated', 'learned', 'mastered', 'weakened', 'quarantined']
const STRONG = new Set<CognitiveSkillStatus>(['validated', 'learned', 'mastered'])

export function directedSoftwareApplicationProgress(
  lessons: DirectedSoftwareLessonTelemetryRow[],
  skills: SpecialistSkillTelemetryRow[],
): DirectedSoftwareApplicationProgress {
  return {
    sources: new Set(lessons.map(row => String(record(row.metadata).sourceUri || '').trim()).filter(Boolean)).size,
    queued: lessons.filter(row => row.status === 'captured').length,
    candidates: skills.length,
    validated: skills.filter(row => STRONG.has(String(row.status || '') as CognitiveSkillStatus)).length,
    rejected: lessons.filter(row => row.status === 'rejected').length
      + skills.filter(row => row.status === 'quarantined').length,
    reinforcements: lessons.reduce((total, row) => total + Math.max(0, Number(row.repeat_count || 1) - 1), 0),
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function familyOf(row: SpecialistSkillTelemetryRow): string {
  return String(record(row.metadata).specialistFamily || record(row.procedure).specialistFamily || '')
}

function tracksOf(row: SpecialistSkillTelemetryRow): SoftwareCurriculumTrack[] {
  const value = record(row.metadata).curriculumTracks ?? record(row.procedure).curriculumTracks
  return Array.isArray(value) ? value.filter((track): track is SoftwareCurriculumTrack => TRACK_PATTERNS.some(([known]) => known === track)) : []
}

export function specialistCompetencySnapshot(
  family: SpecialistFamily,
  rows: SpecialistSkillTelemetryRow[],
  options: { nowMs?: number; freshnessDays?: number } = {},
): SpecialistCompetencySnapshot {
  const lifecycleCounts = Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<CognitiveSkillStatus, number>
  const curriculumCounts: Partial<Record<SoftwareCurriculumTrack, number>> = {}
  const relevant = rows.filter(row => familyOf(row) === family)
  const nowMs = options.nowMs ?? Date.now()
  const freshnessMs = Math.max(1, options.freshnessDays ?? 30) * 86_400_000
  let freshValidatedSkills = 0
  let staleValidatedSkills = 0

  for (const row of relevant) {
    const status = String(row.status || 'encountered') as CognitiveSkillStatus
    if (STATUSES.includes(status)) lifecycleCounts[status] += 1
    for (const track of tracksOf(row)) curriculumCounts[track] = (curriculumCounts[track] ?? 0) + 1
    if (STRONG.has(status)) {
      const validatedAt = Date.parse(String(row.last_validated_at || ''))
      if (Number.isFinite(validatedAt) && nowMs - validatedAt <= freshnessMs) freshValidatedSkills += 1
      else staleValidatedSkills += 1
    }
  }

  return { specialistFamily: family, totalSkills: relevant.length, lifecycleCounts, curriculumCounts, freshValidatedSkills, staleValidatedSkills }
}
