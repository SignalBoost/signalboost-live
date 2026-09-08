import { createHash } from 'node:crypto'
import {
  COS_UNIVERSITY_SUBJECTS,
  cosUniversitySubjectById,
  type CosUniversityGrade,
  type CosUniversitySubjectId,
  type CosUniversityTranscriptEntry,
} from './cosUniversity.ts'
import {
  COS_PLATFORM_LANGUAGES,
  platformLanguageGraduationReady,
  type CosPlatformLanguage,
  type CosPlatformLanguageTranscriptEntry,
} from './cosUniversityLanguages.ts'
import type { CosUniversityAcademicState } from './cosUniversityAcademicState.ts'

export const COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE = 'cos_university_generalist_capstone_v1'
export const COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER = 'university-generalist-capstone-host-scorer-v1'
export const COS_UNIVERSITY_GENERALIST_CAPSTONE_MINIMUM_DISTINCT_PASSES = 2
export const COS_UNIVERSITY_GENERALIST_MINIMUM_GRADE: CosUniversityGrade = 'A'

export type CosUniversityGeneralistCapstoneProvenance = {
  localReasoning?: boolean
  externalAi?: boolean
  semanticCache?: boolean
  handled?: boolean
  turnId?: string | null
}

export type CosUniversityGeneralistCapstoneRunEvidence = {
  passed: boolean
  variantHash: string
  observedAt: string
}

export type CosUniversityGeneralistCapstoneRubric = Readonly<{
  requiredGroups: readonly (readonly string[])[]
  requiredHeadings: readonly string[]
  forbiddenTerms: readonly string[]
  maxWords: number
}>

export type CosUniversityGeneralistCapstoneExam = Readonly<{
  profile: typeof COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE
  scorerVersion: typeof COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER
  seed: string
  family: 'international_launch' | 'critical_recovery' | 'strategic_acquisition'
  project: string
  selectedSubjectIds: readonly CosUniversitySubjectId[]
  prompt: string
  rubric: CosUniversityGeneralistCapstoneRubric
  manifestHash: string
}>

export type CosUniversityGeneralistCapstoneScore = {
  passed: boolean
  reasons: string[]
}

export type CosUniversityGraduationBlocker = {
  id: string
  title: string
  grade: CosUniversityGrade | 'missing'
  required: 'A'
}

export type CosUniversityGeneralistGraduationStatus = {
  graduated: boolean
  standing: 'not_graduated' | 'A' | 'A+'
  prerequisitesReady: boolean
  advancedLearningEligible: boolean
  qualification: 'undergraduate_in_progress' | 'advanced_learning_eligible'
  continuingEducationRequired: true
  authorityExpanded: false
  subjectBlockers: CosUniversityGraduationBlocker[]
  languageBlockers: CosUniversityGraduationBlocker[]
  capstone: {
    passed: boolean
    requiredDistinctPasses: number
    distinctPassesSinceLatestFailure: number
  }
  semantics: 'derived_fresh_evidence_no_permanent_diploma'
}

const GRADE_RANK: Record<CosUniversityGrade, number> = {
  unassessed: -1,
  F: 0,
  D: 1,
  C: 2,
  B: 3,
  'A-': 4,
  A: 5,
  'A+': 6,
}

const DOMAIN_TERMS: Record<CosUniversitySubjectId, readonly string[]> = {
  computer_science: ['architecture', 'software', 'system', 'api', 'database'],
  mathematics: ['model', 'equation', 'optimization', 'constraint', 'quantitative'],
  statistics_data_science: ['uncertainty', 'sample', 'confidence', 'measurement', 'statistical'],
  physics_natural_sciences: ['physical', 'energy', 'material', 'scientific', 'experiment'],
  cybersecurity: ['security', 'threat', 'vulnerability', 'identity', 'containment'],
  politics_government_international_relations: ['government', 'policy', 'geopolitical', 'diplomatic', 'international'],
  social_behavioral_sciences: ['behavior', 'people', 'organization', 'human', 'stakeholder'],
  economics_finance: ['cost', 'budget', 'revenue', 'economic', 'financial'],
  business_operations: ['operations', 'customer', 'process', 'delivery', 'commercial'],
  law_regulation_governance: ['legal', 'regulatory', 'compliance', 'jurisdiction', 'governance'],
  language_communication: ['communication', 'language', 'localization', 'audience', 'message'],
  history_culture_philosophy_religion: ['historical', 'culture', 'ethical', 'religion', 'context'],
  reasoning_decision_science: ['evidence', 'uncertainty', 'trade-off', 'decision', 'assumption'],
}

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

function manifestHash(input: Omit<CosUniversityGeneralistCapstoneExam, 'manifestHash'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function selectedSubjects(seed: string): CosUniversitySubjectId[] {
  const anchor: CosUniversitySubjectId = 'reasoning_decision_science'
  const candidates = COS_UNIVERSITY_SUBJECTS.map(subject => subject.id).filter(id => id !== anchor)
  const selected = candidates
    .map(id => ({ id, rank: digest(seed, `generalist:${id}`).toString('hex') }))
    .sort((a, b) => a.rank.localeCompare(b.rank))
    .slice(0, 7)
    .map(row => row.id)
  return [anchor, ...selected]
}

function family(seed: string): CosUniversityGeneralistCapstoneExam['family'] {
  return choose(seed, 'family', ['international_launch', 'critical_recovery', 'strategic_acquisition'] as const)
}

function scenario(seed: string, selectedFamily: CosUniversityGeneralistCapstoneExam['family']): {
  project: string
  packet: string
  requiredGroups: readonly (readonly string[])[]
} {
  const project = choose(seed, 'project', ['Orion', 'Atlas', 'Lumen', 'Cedar', 'Harbor'] as const)
  const budget = integer(seed, 'budget', 12, 36)
  const weeks = integer(seed, 'weeks', 6, 18)
  const regions = integer(seed, 'regions', 2, 5)
  const checks = integer(seed, 'checks', 37, 91)

  if (selectedFamily === 'critical_recovery') {
    return {
      project,
      packet: `${project} is recovering from a severe customer-facing service failure. ${checks} controlled pre-release checks now pass. A remediation build exists, but Production recovery, customer impact, final regulatory implications, and full financial exposure are explicitly unverified. Leadership has a ${budget}-million response envelope and wants an executable decision within ${weeks} hours across ${regions} affected regions.`,
      requiredGroups: [[project], [String(checks)], [String(budget)], [String(weeks)], [String(regions)], ['unverified', 'unknown', 'not verified']],
    }
  }

  if (selectedFamily === 'strategic_acquisition') {
    return {
      project,
      packet: `${project} is a proposed strategic technology acquisition with a ${budget}-million transaction ceiling and a ${weeks}-week decision window across ${regions} operating regions. Technical demonstrations are promising, but Production integration, security posture, regulatory exposure, workforce effects, and final economics remain explicitly unverified.`,
      requiredGroups: [[project], [String(budget)], [String(weeks)], [String(regions)], ['unverified', 'unknown', 'not verified']],
    }
  }

  return {
    project,
    packet: `${project} is considering a new international technology launch across ${regions} regions with a ${budget}-million first-year envelope and a ${weeks}-week launch window. ${checks} pre-release checks pass, but Production readiness, local regulatory clearance, security residual risk, final operating cost, and customer adoption remain explicitly unverified.`,
    requiredGroups: [[project], [String(regions)], [String(budget)], [String(weeks)], [String(checks)], ['unverified', 'unknown', 'not verified']],
  }
}

export function buildCosUniversityGeneralistCapstoneExam(seedInput: string): CosUniversityGeneralistCapstoneExam {
  const seed = clean(seedInput)
  if (!/^[0-9a-f-]{16,80}$/i.test(seed)) throw new Error('A stable server-side generalist capstone seed is required.')
  const selectedFamily = family(seed)
  const packet = scenario(seed, selectedFamily)
  const selectedSubjectIds = selectedSubjects(seed)
  const subjectTitles = selectedSubjectIds.map(id => cosUniversitySubjectById(id).title)
  const requiredHeadings = [
    'Executive decision',
    'Integrated analysis',
    'Cross-domain interactions',
    'Evidence limits',
    'Execution plan',
    'Verification',
  ] as const
  const requiredGroups: (readonly string[])[] = [
    ...packet.requiredGroups,
    ...selectedSubjectIds.map(id => DOMAIN_TERMS[id]),
  ]
  const prompt = `HOST-CONTROLLED COS UNIVERSITY GENERALIST GRADUATION CAPSTONE. Use only the supplied packet; do not use external facts. ${packet.packet} Integrate all of these University domains: ${subjectTitles.join('; ')}. A passing answer must make one executable recommendation, identify material interactions and trade-offs among the named domains, distinguish verified facts from unknowns, and define how the critical unknowns will be verified before irreversible action. Do not invent missing facts or claim Production/live status. Use exactly these headings: ${requiredHeadings.join('; ')}.`

  const base: Omit<CosUniversityGeneralistCapstoneExam, 'manifestHash'> = {
    profile: COS_UNIVERSITY_GENERALIST_CAPSTONE_PROFILE,
    scorerVersion: COS_UNIVERSITY_GENERALIST_CAPSTONE_SCORER,
    seed,
    family: selectedFamily,
    project: packet.project,
    selectedSubjectIds,
    prompt,
    rubric: {
      requiredGroups,
      requiredHeadings,
      forbiddenTerms: ['production is live', 'deployment succeeded', 'regulatory clearance is complete', 'all risks are resolved'],
      maxWords: 1500,
    },
  }
  return Object.freeze({ ...base, manifestHash: manifestHash(base) })
}

export function scoreCosUniversityGeneralistCapstoneExam(
  exam: CosUniversityGeneralistCapstoneExam,
  reply: string,
  provenance: CosUniversityGeneralistCapstoneProvenance,
): CosUniversityGeneralistCapstoneScore {
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
  for (const forbidden of exam.rubric.forbiddenTerms) {
    if (normalized.includes(forbidden.toLowerCase())) reasons.push(`forbidden:${forbidden}`)
  }
  if (words(text) > exam.rubric.maxWords) reasons.push('word_limit_exceeded')
  return { passed: reasons.length === 0, reasons }
}

export function generalistCapstonePassesSinceLatestFailure(rows: CosUniversityGeneralistCapstoneRunEvidence[]): number {
  const relevant = rows
    .filter(row => Number.isFinite(Date.parse(row.observedAt)))
    .slice()
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  let afterFailure: CosUniversityGeneralistCapstoneRunEvidence[] = []
  for (const row of relevant) {
    if (!row.passed) afterFailure = []
    else afterFailure.push(row)
  }
  return new Set(afterFailure.map(row => clean(row.variantHash)).filter(Boolean)).size
}

export function generalistCapstoneThresholdMet(rows: CosUniversityGeneralistCapstoneRunEvidence[]): boolean {
  return generalistCapstonePassesSinceLatestFailure(rows) >= COS_UNIVERSITY_GENERALIST_CAPSTONE_MINIMUM_DISTINCT_PASSES
}

function gradeMeets(grade: CosUniversityGrade, target: 'A' | 'A+'): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK[target]
}

function subjectBlockers(transcript: CosUniversityTranscriptEntry[]): CosUniversityGraduationBlocker[] {
  const byId = new Map(transcript.map(entry => [entry.subjectId, entry] as const))
  return COS_UNIVERSITY_SUBJECTS.flatMap(subject => {
    const entry = byId.get(subject.id)
    if (entry && gradeMeets(entry.grade, 'A')) return []
    return [{ id: subject.id, title: subject.title, grade: entry?.grade ?? 'missing', required: 'A' as const }]
  })
}

function languageBlockers(transcript: CosPlatformLanguageTranscriptEntry[]): CosUniversityGraduationBlocker[] {
  const byId = new Map(transcript.map(entry => [entry.language, entry] as const))
  return COS_PLATFORM_LANGUAGES.flatMap(language => {
    const entry = byId.get(language.id)
    if (entry && gradeMeets(entry.grade, 'A')) return []
    return [{ id: language.id, title: language.title, grade: entry?.grade ?? 'missing', required: 'A' as const }]
  })
}

function allSubjectsMeet(transcript: CosUniversityTranscriptEntry[], target: 'A' | 'A+'): boolean {
  const byId = new Map(transcript.map(entry => [entry.subjectId, entry] as const))
  return COS_UNIVERSITY_SUBJECTS.every(subject => {
    const entry = byId.get(subject.id)
    return Boolean(entry && gradeMeets(entry.grade, target))
  })
}

export function deriveCosUniversityGeneralistGraduation(args: {
  academicState: CosUniversityAcademicState
  capstoneRuns: CosUniversityGeneralistCapstoneRunEvidence[]
}): CosUniversityGeneralistGraduationStatus {
  const subjectFailures = subjectBlockers(args.academicState.subjectTranscript)
  const languageFailures = languageBlockers(args.academicState.languageTranscript)
  const subjectsReady = subjectFailures.length === 0
  const languagesReady = languageFailures.length === 0
    && platformLanguageGraduationReady(args.academicState.languageTranscript, 'A')
  const prerequisitesReady = subjectsReady && languagesReady
  const capstonePasses = generalistCapstonePassesSinceLatestFailure(args.capstoneRuns)
  const capstonePassed = capstonePasses >= COS_UNIVERSITY_GENERALIST_CAPSTONE_MINIMUM_DISTINCT_PASSES
  const graduated = prerequisitesReady && capstonePassed
  const aPlusReady = graduated
    && allSubjectsMeet(args.academicState.subjectTranscript, 'A+')
    && platformLanguageGraduationReady(args.academicState.languageTranscript, 'A+')
  const standing: CosUniversityGeneralistGraduationStatus['standing'] = aPlusReady ? 'A+' : graduated ? 'A' : 'not_graduated'

  return {
    graduated,
    standing,
    prerequisitesReady,
    advancedLearningEligible: graduated,
    qualification: graduated ? 'advanced_learning_eligible' : 'undergraduate_in_progress',
    continuingEducationRequired: true,
    authorityExpanded: false,
    subjectBlockers: subjectFailures,
    languageBlockers: languageFailures,
    capstone: {
      passed: capstonePassed,
      requiredDistinctPasses: COS_UNIVERSITY_GENERALIST_CAPSTONE_MINIMUM_DISTINCT_PASSES,
      distinctPassesSinceLatestFailure: capstonePasses,
    },
    semantics: 'derived_fresh_evidence_no_permanent_diploma',
  }
}
