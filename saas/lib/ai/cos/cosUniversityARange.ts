// saas/lib/ai/cos/cosUniversityARange.ts
import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_SUBJECTS,
  cosUniversitySubjectById,
  type CosUniversityAssessmentKind,
  type CosUniversitySubjectId,
} from './cosUniversity.ts'

export const COS_UNIVERSITY_A_RANGE_PROFILE = 'cos_university_a_range_v1'
export const COS_UNIVERSITY_A_RANGE_SCORER = 'university-a-range-host-scorer-v1'
export const COS_UNIVERSITY_A_RANGE_MINIMUM_DISTINCT_PASSES = 2

export type CosUniversityARangeStage = Extract<CosUniversityAssessmentKind,
  'cross_domain_transfer' | 'production_transfer' | 'capstone'>

export type CosUniversityARangeProvenance = {
  localReasoning?: boolean
  externalAi?: boolean
  semanticCache?: boolean
  handled?: boolean
  turnId?: string | null
}

export type CosUniversityARangeRunEvidence = {
  stage: CosUniversityARangeStage
  subjectId: CosUniversitySubjectId
  passed: boolean
  variantHash: string
  observedAt: string
}

export type CosUniversityARangeRubric = Readonly<{
  requiredGroups: readonly (readonly string[])[]
  forbiddenTerms?: readonly string[]
  requiredHeadings: readonly string[]
  maxWords: number
}>

export type CosUniversityARangeExam = Readonly<{
  profile: typeof COS_UNIVERSITY_A_RANGE_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_A_RANGE_SCORER
  seed: string
  stage: Extract<CosUniversityARangeStage, 'cross_domain_transfer' | 'capstone'>
  subjectId: CosUniversitySubjectId
  companionSubjectIds: readonly CosUniversitySubjectId[]
  family: 'market_entry' | 'service_recovery' | 'procurement'
  title: string
  prompt: string
  rubric: CosUniversityARangeRubric
  manifestHash: string
}>

export type CosUniversityARangeScore = { passed: boolean; reasons: string[] }

const DOMAIN_TERMS: Record<CosUniversitySubjectId, readonly string[]> = {
  computer_science: ['architecture', 'software', 'system', 'api', 'database'],
  mathematics: ['model', 'equation', 'optimization', 'constraint', 'quantitative'],
  statistics_data_science: ['uncertainty', 'sample', 'confidence', 'measurement', 'statistical'],
  physics_natural_sciences: ['physical', 'energy', 'material', 'scientific', 'experiment'],
  cybersecurity: ['security', 'threat', 'vulnerability', 'contain', 'identity'],
  politics_government_international_relations: ['government', 'policy', 'geopolitical', 'diplomatic', 'international'],
  social_behavioral_sciences: ['behavior', 'people', 'organization', 'human', 'stakeholder'],
  economics_finance: ['cost', 'budget', 'revenue', 'economic', 'financial'],
  business_operations: ['operations', 'customer', 'process', 'delivery', 'commercial'],
  law_regulation_governance: ['legal', 'regulatory', 'compliance', 'jurisdiction', 'governance'],
  language_communication: ['communication', 'language', 'localization', 'audience', 'message'],
  history_culture_philosophy_religion: ['historical', 'culture', 'ethical', 'religion', 'context'],
  reasoning_decision_science: ['evidence', 'uncertainty', 'trade-off', 'decision', 'assumption'],
}

const PRODUCTION_SOURCE = /^production_verified:[a-z0-9][a-z0-9_.:/-]{2,118}$/i
const BLOCKED_PRODUCTION_SOURCE = /(?:benchmark|acceptance|rehearsal|validation|comparison|retest|exam|test|synthetic|simulation|fixture|mock)/i

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function digest(seed: string, label: string): Buffer {
  return createHash('sha256').update(`${seed}:${label}`).digest()
}

function choose<T>(seed: string, label: string, values: readonly T[]): T {
  return values[digest(seed, label).readUInt32BE(0) % values.length]
}

function integer(seed: string, label: string, min: number, max: number): number {
  return min + (digest(seed, label).readUInt32BE(0) % (max - min + 1))
}

function words(value: string): number {
  return clean(value).match(/\S+/g)?.length ?? 0
}

function hasAny(text: string, terms: readonly string[]): boolean {
  const normalized = clean(text).toLowerCase()
  return terms.some(term => normalized.includes(term.toLowerCase()))
}

function manifestHash(input: Omit<CosUniversityARangeExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function companions(seed: string, subjectId: CosUniversitySubjectId, count: number): CosUniversitySubjectId[] {
  const candidates = COS_UNIVERSITY_SUBJECTS.map(subject => subject.id).filter(id => id !== subjectId)
  return candidates
    .map(id => ({ id, rank: digest(seed, `companion:${subjectId}:${id}`).toString('hex') }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .slice(0, count)
    .map(row => row.id)
}

function family(seed: string): CosUniversityARangeExam['family'] {
  return choose(seed, 'family', ['market_entry', 'service_recovery', 'procurement'] as const)
}

function scenarioPacket(seed: string, selectedFamily: CosUniversityARangeExam['family']): {
  project: string
  prompt: string
  requiredGroups: readonly (readonly string[])[]
} {
  const project = choose(seed, 'project', ['Orion', 'Atlas', 'Lumen', 'Cedar', 'Harbor'] as const)
  const budget = integer(seed, 'budget', 8, 27)
  const weeks = integer(seed, 'weeks', 5, 14)
  if (selectedFamily === 'service_recovery') {
    const tests = integer(seed, 'tests', 31, 79)
    return {
      project,
      prompt: `${project} has ${tests} passing pre-release checks after a severe customer-facing incident. A remediation patch exists, but Production deployment and customer recovery are explicitly NOT verified. Leadership wants a recommendation within ${weeks} hours.`,
      requiredGroups: [[project], [String(tests)], ['production'], ['unknown', 'not verified', 'unverified']],
    }
  }
  if (selectedFamily === 'procurement') {
    return {
      project,
      prompt: `${project} is evaluating a strategic AI vendor under a ${budget}-million budget envelope. Technical capability looks promising, but data residency, operational exit, security evidence, and final commercial terms remain unresolved. The decision window is ${weeks} weeks.`,
      requiredGroups: [[project], [String(budget)], [String(weeks)], ['unresolved', 'unknown', 'not verified']],
    }
  }
  return {
    project,
    prompt: `${project} is considering entry into a new international market with a ${budget}-million first-year budget and a ${weeks}-week launch window. Demand evidence is encouraging, but Production readiness, local regulatory clearance, and final operating costs are explicitly unverified.`,
    requiredGroups: [[project], [String(budget)], [String(weeks)], ['unverified', 'unknown', 'not verified']],
  }
}

export function buildCosUniversityARangeExam(args: {
  seed: string
  stage: Extract<CosUniversityARangeStage, 'cross_domain_transfer' | 'capstone'>
  subjectId: CosUniversitySubjectId
}): CosUniversityARangeExam {
  const seed = clean(args.seed)
  if (!/^[0-9a-f-]{16,80}$/i.test(seed)) throw new Error('A stable server-side A-range exam seed is required.')
  const companionCount = args.stage === 'capstone' ? 5 : 2
  const companionSubjectIds = companions(seed, args.subjectId, companionCount)
  const selectedFamily = family(seed)
  const packet = scenarioPacket(seed, selectedFamily)
  const primary = cosUniversitySubjectById(args.subjectId)
  const companionTitles = companionSubjectIds.map(id => cosUniversitySubjectById(id).title)
  const requiredHeadings = args.stage === 'capstone'
    ? ['Executive decision', 'Domain integration', 'Risks and uncertainty', 'Evidence limits', 'Execution plan', 'Verification']
    : ['Decision', 'Domain integration', 'Evidence limits', 'Next verification']
  const requiredGroups: (readonly string[])[] = [
    ...packet.requiredGroups,
    DOMAIN_TERMS[args.subjectId],
    ...companionSubjectIds.map(id => DOMAIN_TERMS[id]),
  ]
  const prompt = args.stage === 'capstone'
    ? `HOST-CONTROLLED MULTIDISCIPLINARY CAPSTONE. Use only this packet; do not use external facts. ${packet.prompt} Integrate ${primary.title} with ${companionTitles.join(', ')}. Do not invent missing facts or claim Production/live status. Use exactly these headings: ${requiredHeadings.join('; ')}. Give an executable recommendation that identifies interactions and trade-offs among all named domains.`
    : `HOST-CONTROLLED CROSS-DOMAIN TRANSFER EXAM. Use only this packet; do not use external facts. ${packet.prompt} Your primary domain is ${primary.title}; integrate it with ${companionTitles.join(' and ')}. Do not invent missing facts or claim Production/live status. Use exactly these headings: ${requiredHeadings.join('; ')}.`

  const base: Omit<CosUniversityARangeExam, 'manifestHash'> = {
    profile: COS_UNIVERSITY_A_RANGE_PROFILE,
    scorerVersion: COS_UNIVERSITY_A_RANGE_SCORER,
    seed,
    stage: args.stage,
    subjectId: args.subjectId,
    companionSubjectIds,
    family: selectedFamily,
    title: args.stage === 'capstone' ? `Multidisciplinary capstone — ${primary.title}` : `Cross-domain transfer — ${primary.title}`,
    prompt,
    rubric: {
      requiredGroups,
      forbiddenTerms: ['production is live', 'deployment succeeded', 'regulatory clearance is complete'],
      requiredHeadings,
      maxWords: args.stage === 'capstone' ? 1200 : 600,
    },
  }
  return Object.freeze({ ...base, manifestHash: manifestHash(base) })
}

export function scoreCosUniversityARangeExam(
  exam: CosUniversityARangeExam,
  reply: string,
  provenance: CosUniversityARangeProvenance,
): CosUniversityARangeScore {
  const reasons: string[] = []
  const text = String(reply ?? '')
  const normalized = clean(text).toLowerCase()
  if (!normalized) reasons.push('empty_reply')
  if (provenance.handled !== true) reasons.push('not_handled')
  if (provenance.localReasoning !== true) reasons.push('local_reasoning_not_recorded')
  if (provenance.externalAi === true) reasons.push('external_ai_used')
  if (provenance.semanticCache === true) reasons.push('semantic_cache_used')
  if (!clean(provenance.turnId)) reasons.push('turn_id_missing')
  exam.rubric.requiredGroups.forEach((group, index) => {
    if (!hasAny(text, group)) reasons.push(`required_group_${index + 1}_missing`)
  })
  for (const heading of exam.rubric.requiredHeadings) {
    if (!normalized.includes(heading.toLowerCase())) reasons.push(`heading_missing:${heading}`)
  }
  for (const forbidden of exam.rubric.forbiddenTerms ?? []) {
    if (normalized.includes(forbidden.toLowerCase())) reasons.push(`forbidden:${forbidden}`)
  }
  if (words(text) > exam.rubric.maxWords) reasons.push('word_limit_exceeded')
  return { passed: reasons.length === 0, reasons }
}

export function isCosUniversityVerifiedProductionSource(source: unknown): boolean {
  const value = clean(source)
  return Boolean(value && PRODUCTION_SOURCE.test(value) && !BLOCKED_PRODUCTION_SOURCE.test(value))
}

export function aRangeStagePassesSinceLatestFailure(
  rows: CosUniversityARangeRunEvidence[],
  stage: CosUniversityARangeStage,
  subjectId: CosUniversitySubjectId,
): number {
  const relevant = rows
    .filter(row => row.stage === stage && row.subjectId === subjectId && Number.isFinite(Date.parse(row.observedAt)))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  let afterFailure: CosUniversityARangeRunEvidence[] = []
  for (const row of relevant) {
    if (!row.passed) afterFailure = []
    else afterFailure.push(row)
  }
  return new Set(afterFailure.map(row => clean(row.variantHash)).filter(Boolean)).size
}

export function aRangeStageThresholdMet(
  rows: CosUniversityARangeRunEvidence[],
  stage: CosUniversityARangeStage,
  subjectId: CosUniversitySubjectId,
): boolean {
  return aRangeStagePassesSinceLatestFailure(rows, stage, subjectId) >= COS_UNIVERSITY_A_RANGE_MINIMUM_DISTINCT_PASSES
}

export function universityARangeValidUntil(stage: CosUniversityARangeStage, observedAt: Date): string {
  const days = stage === 'production_transfer' ? 120 : 180
  return new Date(observedAt.getTime() + days * 86_400_000).toISOString()
}
