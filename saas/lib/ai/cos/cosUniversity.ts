// COS University: host-owned academic taxonomy, transcript grading, and study-target selection.
//
// This layer deliberately does NOT treat corpus volume, embeddings, self-confidence, or ordinary
// cognitive-skill lifecycle status as a university grade. Operational evidence may decide what COS
// should study next; grades require fresh, independent, host-controlled assessment evidence.

export type CosUniversitySubjectId =
  | 'computer_science'
  | 'mathematics'
  | 'statistics_data_science'
  | 'physics_natural_sciences'
  | 'cybersecurity'
  | 'politics_government_international_relations'
  | 'social_behavioral_sciences'
  | 'economics_finance'
  | 'business_operations'
  | 'law_regulation_governance'
  | 'language_communication'
  | 'history_culture_philosophy_religion'
  | 'reasoning_decision_science'

export type CosUniversitySubject = {
  id: CosUniversitySubjectId
  title: string
  objective: string
  studyThemes: readonly string[]
}

export const COS_UNIVERSITY_SUBJECTS: ReadonlyArray<CosUniversitySubject> = [
  {
    id: 'computer_science',
    title: 'Computer Science & Coding',
    objective: 'Design, implement, debug, test, and reason about software and computing systems.',
    studyThemes: ['programming and algorithms', 'data structures and databases', 'distributed systems and architecture', 'testing debugging and DevOps', 'AI engineering'],
  },
  {
    id: 'mathematics',
    title: 'Mathematics',
    objective: 'Use formal quantitative reasoning and mathematical models correctly.',
    studyThemes: ['algebra and discrete mathematics', 'calculus and linear algebra', 'optimization', 'numerical reasoning and modeling'],
  },
  {
    id: 'statistics_data_science',
    title: 'Statistics & Data Science',
    objective: 'Reason correctly from data under uncertainty and distinguish association from stronger causal claims.',
    studyThemes: ['statistical inference', 'probability and uncertainty', 'experimental design and causal reasoning', 'forecasting', 'measurement and data quality'],
  },
  {
    id: 'physics_natural_sciences',
    title: 'Physics & Natural Sciences',
    objective: 'Apply scientific method, physical reasoning, and evidence discipline across natural sciences and engineering fundamentals.',
    studyThemes: ['physics and mechanics', 'chemistry and biology fundamentals', 'scientific method', 'materials energy optics and sensing', 'scientific computing'],
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    objective: 'Reason defensively about security, vulnerabilities, threats, identity, incidents, and secure system design.',
    studyThemes: ['secure architecture and development', 'threat modeling', 'vulnerability analysis', 'incident response', 'identity cryptography and network security'],
  },
  {
    id: 'politics_government_international_relations',
    title: 'Politics, Government & International Relations',
    objective: 'Understand institutions, public policy, diplomacy, geopolitics, and state behavior using current evidence where required.',
    studyThemes: ['political systems and institutions', 'public policy', 'geopolitics', 'diplomacy and international organizations', 'international relations'],
  },
  {
    id: 'social_behavioral_sciences',
    title: 'Social & Behavioral Sciences',
    objective: 'Reason about people, groups, organizations, and social systems without inventing individual mental states.',
    studyThemes: ['psychology', 'sociology and anthropology', 'organizational behavior', 'human factors', 'behavioral decision-making'],
  },
  {
    id: 'economics_finance',
    title: 'Economics & Finance',
    objective: 'Reason about incentives, markets, accounting, finance, investment, policy, and risk.',
    studyThemes: ['microeconomics and macroeconomics', 'accounting', 'corporate finance', 'markets and investment', 'economic policy and risk'],
  },
  {
    id: 'business_operations',
    title: 'Business & Operations',
    objective: 'Plan and execute organizational work across strategy, operations, customers, projects, and commercial systems.',
    studyThemes: ['strategy and management', 'sales marketing and customer service', 'project and program management', 'operations and process design', 'procurement and commercial execution'],
  },
  {
    id: 'law_regulation_governance',
    title: 'Law, Regulation & Governance',
    objective: 'Reason within legal, regulatory, privacy, compliance, standards, and authority boundaries without fabricating legal certainty.',
    studyThemes: ['contracts and jurisdiction', 'privacy and data protection', 'regulatory reasoning', 'compliance and standards', 'governance and evidence boundaries'],
  },
  {
    id: 'language_communication',
    title: 'Language & Communication',
    objective: 'Communicate accurately and effectively across writing, languages, negotiation, explanation, and cross-cultural contexts.',
    studyThemes: ['writing and editing', 'multilingual communication', 'rhetoric and explanation', 'negotiation and persuasion', 'executive and customer communication'],
  },
  {
    id: 'history_culture_philosophy_religion',
    title: 'History, Culture, Philosophy & Religion',
    objective: 'Use historical, cultural, philosophical, and religious context where it materially improves understanding or decisions.',
    studyThemes: ['world history', 'cultural systems', 'philosophy and intellectual history', 'religion and institutions', 'historical context for current systems'],
  },
  {
    id: 'reasoning_decision_science',
    title: 'Reasoning & Decision Science',
    objective: 'Integrate evidence, uncertainty, planning, causal reasoning, prioritization, and truthful action across domains.',
    studyThemes: ['logic and evidence evaluation', 'uncertainty and calibration', 'causal and counterfactual reasoning', 'planning prioritization and heuristics', 'cross-domain synthesis and decision-making'],
  },
]

const SUBJECT_BY_ID = new Map(COS_UNIVERSITY_SUBJECTS.map(subject => [subject.id, subject] as const))

export function cosUniversitySubjectById(id: CosUniversitySubjectId): CosUniversitySubject {
  const subject = SUBJECT_BY_ID.get(id)
  if (!subject) throw new Error(`Unknown COS University subject: ${id}`)
  return subject
}

const SUBJECT_RULES: ReadonlyArray<{ id: CosUniversitySubjectId; match: RegExp }> = [
  { id: 'computer_science', match: /\b(code|coding|software|program(?:ming)?|algorithm|data structure|database|distributed system|operating system|api|devops|debug|typescript|javascript|python|next\.?js|architecture|latenc|observability|computer science)\b/i },
  { id: 'mathematics', match: /\b(algebra|calculus|linear algebra|discrete math|optimization|numerical|equation|geometry|matrix|vector|mathematics?)\b/i },
  { id: 'statistics_data_science', match: /\b(statistic|statistics|probability|inference|experiment(?:al)?|forecast|causal|data science|regression|distribution|percentile|p50|p90|p95|p99|measurement)\b/i },
  { id: 'physics_natural_sciences', match: /\b(physics|chemistry|biology|scientific method|mechanics?|gravity|optics?|semiconductor|quantum|energy|astronomy|astrophysics|space science|materials?|photonics?|natural science)\b/i },
  { id: 'cybersecurity', match: /\b(cyber|cybersecurity|security|vulnerab|threat|incident response|cryptograph|authentication|authorization|secure coding|network security|identity security)\b/i },
  { id: 'politics_government_international_relations', match: /\b(politic|government|geopolit|diplom|international relation|public policy|state behavior|election|foreign policy|international organization)\b/i },
  { id: 'social_behavioral_sciences', match: /\b(psycholog|sociolog|anthropolog|behavioral|organisational behavior|organizational behavior|social system|group behavior|human factors|cognitive science)\b/i },
  { id: 'economics_finance', match: /\b(economic|economics|finance|financial|accounting|investment|market|macroeconomic|microeconomic|portfolio|capital|fiscal|monetary)\b/i },
  { id: 'business_operations', match: /\b(business|strategy|management|sales|marketing|customer service|procurement|project management|program management|operations|process design|crm|revenue|pricing|pipeline|renewal|commercial)\b/i },
  { id: 'law_regulation_governance', match: /\b(law|legal|regulat|contract|privacy|compliance|jurisdiction|governance|gdpr|dpa|soc ?2|iso ?27|audit|standard|subprocessor|export control)\b/i },
  { id: 'language_communication', match: /\b(writing|editing|language|communication|rhetoric|negotiat|persuasion|multilingual|cross-cultural|executive communication|customer communication|translation)\b/i },
  { id: 'history_culture_philosophy_religion', match: /\b(history|historical|culture|cultural|philosoph|religion|religious|intellectual history|ethics)\b/i },
  { id: 'reasoning_decision_science', match: /\b(reasoning|logic|evidence|uncertainty|planning|heuristic|decision|counterfactual|priorit|synthesis|ambiguity|context resolution|truthful reporting|follow-through|root cause|falsif|judgment)\b/i },
]

/**
 * A real failure can span several university subjects. Return every bounded match rather than
 * forcing a false single-label answer. Unknown text returns [] and remains explicitly unclassified.
 */
export function classifyCosUniversitySubjects(text: unknown): CosUniversitySubjectId[] {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return []
  return SUBJECT_RULES.filter(rule => rule.match.test(value)).map(rule => rule.id)
}

export function cosUniversityEvidenceLines(text: unknown): string[] {
  return classifyCosUniversitySubjects(text).map(id => `university_subject=${id}`)
}

export type CosUniversityGrade = 'A+' | 'A' | 'A-' | 'B' | 'C' | 'D' | 'F' | 'unassessed'
export type CosUniversityAssessmentKind =
  | 'diagnostic'
  | 'practice_checkpoint'
  | 'unseen_subject_exam'
  | 'cross_domain_transfer'
  | 'production_transfer'
  | 'capstone'

export type CosUniversityAssessmentEvidence = {
  assessmentId: string
  subjectId: CosUniversitySubjectId
  kind: CosUniversityAssessmentKind
  passed: boolean
  independentScorer: boolean
  fresh: boolean
  scorerVersion: string
  observedAt: string
}

export type CosUniversityTranscriptEntry = {
  subjectId: CosUniversitySubjectId
  title: string
  grade: CosUniversityGrade
  evidenceCount: number
  latestAssessmentAt: string | null
  reasons: string[]
}

function validAssessment(row: CosUniversityAssessmentEvidence): boolean {
  return Boolean(
    String(row.assessmentId || '').trim()
    && String(row.scorerVersion || '').trim()
    && row.independentScorer === true
    && row.fresh === true,
  )
}

function latestForKind(
  rows: CosUniversityAssessmentEvidence[],
  kind: CosUniversityAssessmentKind,
): CosUniversityAssessmentEvidence | null {
  return rows
    .filter(row => row.kind === kind)
    .slice()
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0] ?? null
}

function stagePassed(rows: CosUniversityAssessmentEvidence[], kind: CosUniversityAssessmentKind): boolean {
  return latestForKind(rows, kind)?.passed === true
}

/**
 * Grades are evidence gates, not averages. The progression intentionally requires qualitatively
 * stronger evidence rather than invented numeric cutoffs:
 *
 * practice checkpoint -> C
 * fresh unseen independent subject exam -> B
 * cross-domain transfer -> A-
 * verified Production transfer -> A
 * multidisciplinary capstone -> A+
 *
 * A later failure at a required stage invalidates that stage until a newer independent retest
 * passes it. Study volume, embeddings, source counts, and self-reported confidence are absent from
 * the function by design and therefore cannot raise a grade.
 */
export function deriveCosUniversityGrade(
  subjectId: CosUniversitySubjectId,
  evidence: CosUniversityAssessmentEvidence[],
): CosUniversityTranscriptEntry {
  const rows = evidence.filter(row => row.subjectId === subjectId && validAssessment(row))
  const title = cosUniversitySubjectById(subjectId).title
  const latestAssessmentAt = rows
    .map(row => Date.parse(row.observedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]
  const latestIso = Number.isFinite(latestAssessmentAt) ? new Date(latestAssessmentAt as number).toISOString() : null
  const reasons: string[] = []

  if (!rows.length) {
    return { subjectId, title, grade: 'unassessed', evidenceCount: 0, latestAssessmentAt: null, reasons: ['No fresh independent subject-level assessment evidence.'] }
  }

  const diagnostic = latestForKind(rows, 'diagnostic')
  const practice = stagePassed(rows, 'practice_checkpoint')
  const unseen = stagePassed(rows, 'unseen_subject_exam')
  const transfer = unseen && stagePassed(rows, 'cross_domain_transfer')
  const production = transfer && stagePassed(rows, 'production_transfer')
  const capstone = production && stagePassed(rows, 'capstone')

  let grade: CosUniversityGrade
  if (capstone) {
    grade = 'A+'
    reasons.push('Fresh independent unseen exam, cross-domain transfer, Production transfer, and capstone are all passed.')
  } else if (production) {
    grade = 'A'
    reasons.push('Fresh independent unseen exam, cross-domain transfer, and verified Production transfer are passed.')
  } else if (transfer) {
    grade = 'A-'
    reasons.push('Fresh independent unseen exam and cross-domain transfer are passed; Production transfer is not yet passed.')
  } else if (unseen) {
    grade = 'B'
    reasons.push('Fresh independent unseen subject exam is passed; transfer evidence is not yet sufficient for an A-range grade.')
  } else if (practice) {
    grade = 'C'
    reasons.push('Fresh independent practice checkpoint is passed; unseen subject examination is not yet passed.')
  } else if (diagnostic?.passed === false) {
    grade = 'F'
    reasons.push('Latest fresh independent diagnostic is failed and no stronger passed stage supersedes it.')
  } else {
    grade = 'D'
    reasons.push('Some fresh independent assessment evidence exists, but no passed practice checkpoint or stronger stage is established.')
  }

  return { subjectId, title, grade, evidenceCount: rows.length, latestAssessmentAt: latestIso, reasons }
}

export function buildCosUniversityTranscript(
  evidence: CosUniversityAssessmentEvidence[],
): CosUniversityTranscriptEntry[] {
  return COS_UNIVERSITY_SUBJECTS.map(subject => deriveCosUniversityGrade(subject.id, evidence))
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

export type CosUniversityStudySignal = {
  sourceSubject: string
  attempts?: number
  externalDependencies?: number
  negativeFeedback?: number
  userCorrections?: number
  productionFailures?: number
}

export type CosUniversityStudyTarget = {
  subjectId: CosUniversitySubjectId
  title: string
  currentGrade: CosUniversityGrade
  targetGrade: 'A' | 'A+'
  reasons: string[]
  operational: {
    productionFailures: number
    userCorrections: number
    negativeFeedback: number
    externalDependencies: number
    attempts: number
  }
}

function count(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

/**
 * Choose WHAT to study next with a transparent lexicographic policy. Verified Production failures
 * outrank user corrections, which outrank negative feedback, which outrank external dependency;
 * only then do academic grade gap and observed work volume break ties. This avoids an opaque score
 * that COS could learn to game. If no operational weakness exists, the first not-yet-target-grade
 * subject in the canonical curriculum becomes the continuing-education target.
 */
export function selectNextCosUniversityStudyTarget(args: {
  transcript: CosUniversityTranscriptEntry[]
  signals?: CosUniversityStudySignal[]
  targetGrade?: 'A' | 'A+'
}): CosUniversityStudyTarget | null {
  const targetGrade = args.targetGrade ?? 'A'
  const bySubject = new Map<CosUniversitySubjectId, CosUniversityStudyTarget['operational']>()
  for (const subject of COS_UNIVERSITY_SUBJECTS) {
    bySubject.set(subject.id, { productionFailures: 0, userCorrections: 0, negativeFeedback: 0, externalDependencies: 0, attempts: 0 })
  }

  for (const signal of args.signals ?? []) {
    const ids = classifyCosUniversitySubjects(signal.sourceSubject)
    for (const id of ids) {
      const bucket = bySubject.get(id)!
      bucket.productionFailures += count(signal.productionFailures)
      bucket.userCorrections += count(signal.userCorrections)
      bucket.negativeFeedback += count(signal.negativeFeedback)
      bucket.externalDependencies += count(signal.externalDependencies)
      bucket.attempts += count(signal.attempts)
    }
  }

  const transcriptById = new Map(args.transcript.map(entry => [entry.subjectId, entry] as const))
  const targetRank = GRADE_RANK[targetGrade]
  const candidates = COS_UNIVERSITY_SUBJECTS.map((subject, curriculumIndex) => {
    const entry = transcriptById.get(subject.id) ?? deriveCosUniversityGrade(subject.id, [])
    const operational = bySubject.get(subject.id)!
    return {
      subject,
      entry,
      operational,
      curriculumIndex,
      gradeGap: Math.max(0, targetRank - GRADE_RANK[entry.grade]),
    }
  }).filter(candidate => candidate.gradeGap > 0 || candidate.operational.productionFailures > 0 || candidate.operational.userCorrections > 0)

  candidates.sort((a, b) =>
    b.operational.productionFailures - a.operational.productionFailures
    || b.operational.userCorrections - a.operational.userCorrections
    || b.operational.negativeFeedback - a.operational.negativeFeedback
    || b.operational.externalDependencies - a.operational.externalDependencies
    || b.gradeGap - a.gradeGap
    || b.operational.attempts - a.operational.attempts
    || a.curriculumIndex - b.curriculumIndex,
  )

  const selected = candidates[0]
  if (!selected) return null
  const reasons: string[] = []
  const op = selected.operational
  if (op.productionFailures) reasons.push(`verified_production_failures=${op.productionFailures}`)
  if (op.userCorrections) reasons.push(`user_corrections=${op.userCorrections}`)
  if (op.negativeFeedback) reasons.push(`negative_feedback=${op.negativeFeedback}`)
  if (op.externalDependencies) reasons.push(`external_dependencies=${op.externalDependencies}`)
  if (!reasons.length) reasons.push(`academic_gap=${selected.entry.grade}->${targetGrade}`)
  else if (selected.gradeGap > 0) reasons.push(`academic_gap=${selected.entry.grade}->${targetGrade}`)

  return {
    subjectId: selected.subject.id,
    title: selected.subject.title,
    currentGrade: selected.entry.grade,
    targetGrade,
    reasons,
    operational: op,
  }
}
