//
// "Is COS actually learning what we told it to learn?"
//
// Every signal that existed before this answered a weaker question. A green build proves the app
// compiles. A merged PR proves text changed. Rows in cos_continuous_learning prove SOMETHING was
// learned. None of them prove that the specific thing a person asked COS to study was ever studied
// — which is exactly how twelve declared curriculum tracks sat unlearned while every dashboard
// stayed green.
//
// This module answers the narrow question directly: for each DECLARED study subject, does the
// durable corpus contain evidence, how much, how recent, and from what source kinds. It is pure and
// model-free; the route supplies both sides (what was declared, what was retained) and this decides
// the verdict.

export type DeclaredStudySubject = {
  /** The subject string the learning cycle will use as its acquisition anchor. */
  subject: string
  /** Where it was declared: a curriculum track id, a gap-list name, a foundational domain. */
  declaredIn: string
}

export type RetainedSubjectRow = {
  subject?: string | null
  source_kind?: string | null
  observed_at?: string | null
  created_at?: string | null
}

export type CurriculumSubjectCoverage = {
  subject: string
  declaredIn: string[]
  documents: number
  sourceKinds: string[]
  lastObservedAt: string | null
  ageDays: number | null
  status: 'never_studied' | 'thin' | 'stale' | 'learned'
}

export type CurriculumCoverageReport = {
  generatedAt: string
  declaredSubjects: number
  neverStudied: number
  thin: number
  stale: number
  learned: number
  /** 0..1 — the single number to watch. 1 means every declared subject has real, current evidence. */
  coverageRate: number
  /** The actionable list: declared and never acquired even once. */
  neverStudiedSubjects: CurriculumSubjectCoverage[]
  subjects: CurriculumSubjectCoverage[]
  /** Subjects in the corpus that nothing declares — drift, junk, or a list this report cannot see. */
  undeclaredCorpusSubjects: Array<{ subject: string; documents: number; lastObservedAt: string | null }>
}

/** Below this a subject has been touched but not really studied. */
export const MINIMUM_DOCUMENTS_FOR_LEARNED = 3
/** Beyond this the evidence is old enough that "learned" is a claim about the past. */
export const MAXIMUM_EVIDENCE_AGE_DAYS = 45

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function key(value: unknown): string {
  return normalize(value).toLowerCase()
}

function timestampOf(row: RetainedSubjectRow): string | null {
  const raw = normalize(row.observed_at) || normalize(row.created_at)
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

function ageInDays(iso: string | null, now: number): number | null {
  if (!iso) return null
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round((now - parsed) / 86_400_000))
}

/**
 * Join what was declared against what was retained.
 *
 * Deliberately conservative about what counts as learned: presence of a single document is `thin`,
 * not `learned`, and evidence older than the freshness window is `stale`. A report that calls one
 * abstract from three months ago "learned" would recreate the original problem in a new place.
 */
export function computeCurriculumCoverage(
  declared: DeclaredStudySubject[],
  retained: RetainedSubjectRow[],
  options: { now?: Date; minimumDocuments?: number; maximumAgeDays?: number } = {},
): CurriculumCoverageReport {
  const now = options.now instanceof Date && Number.isFinite(options.now.getTime())
    ? options.now.getTime()
    : Date.now()
  const minimumDocuments = Math.max(1, Math.floor(options.minimumDocuments ?? MINIMUM_DOCUMENTS_FOR_LEARNED))
  const maximumAgeDays = Math.max(1, Math.floor(options.maximumAgeDays ?? MAXIMUM_EVIDENCE_AGE_DAYS))

  const corpus = new Map<string, { subject: string; documents: number; kinds: Set<string>; latest: string | null }>()
  for (const row of retained) {
    const subject = normalize(row?.subject)
    if (!subject) continue
    const entry = corpus.get(key(subject)) ?? { subject, documents: 0, kinds: new Set<string>(), latest: null }
    entry.documents += 1
    const kind = normalize(row?.source_kind)
    if (kind) entry.kinds.add(kind)
    const at = timestampOf(row)
    if (at && (!entry.latest || at > entry.latest)) entry.latest = at
    corpus.set(key(subject), entry)
  }

  const declaredByKey = new Map<string, CurriculumSubjectCoverage>()
  for (const item of declared) {
    const subject = normalize(item?.subject)
    if (!subject) continue
    const existing = declaredByKey.get(key(subject))
    const source = normalize(item?.declaredIn) || 'unknown'
    if (existing) {
      if (!existing.declaredIn.includes(source)) existing.declaredIn.push(source)
      continue
    }
    const found = corpus.get(key(subject))
    const lastObservedAt = found?.latest ?? null
    const age = ageInDays(lastObservedAt, now)
    const documents = found?.documents ?? 0

    let status: CurriculumSubjectCoverage['status']
    if (!documents) status = 'never_studied'
    else if (documents < minimumDocuments) status = 'thin'
    else if (age !== null && age > maximumAgeDays) status = 'stale'
    else status = 'learned'

    declaredByKey.set(key(subject), {
      subject,
      declaredIn: [source],
      documents,
      sourceKinds: [...(found?.kinds ?? [])].sort(),
      lastObservedAt,
      ageDays: age,
      status,
    })
  }

  const subjects = [...declaredByKey.values()].sort((a, b) =>
    a.documents - b.documents || a.subject.localeCompare(b.subject))

  const counts = { never_studied: 0, thin: 0, stale: 0, learned: 0 }
  for (const subject of subjects) counts[subject.status] += 1

  const undeclaredCorpusSubjects = [...corpus.entries()]
    .filter(([subjectKey]) => !declaredByKey.has(subjectKey))
    .map(([, entry]) => ({ subject: entry.subject, documents: entry.documents, lastObservedAt: entry.latest }))
    .sort((a, b) => b.documents - a.documents || a.subject.localeCompare(b.subject))

  return {
    generatedAt: new Date(now).toISOString(),
    declaredSubjects: subjects.length,
    neverStudied: counts.never_studied,
    thin: counts.thin,
    stale: counts.stale,
    learned: counts.learned,
    coverageRate: subjects.length ? Number((counts.learned / subjects.length).toFixed(4)) : 0,
    neverStudiedSubjects: subjects.filter(subject => subject.status === 'never_studied'),
    subjects,
    undeclaredCorpusSubjects,
  }
}
