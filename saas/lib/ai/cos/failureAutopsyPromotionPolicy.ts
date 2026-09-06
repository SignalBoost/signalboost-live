import { createHash } from 'node:crypto'

export type AutopsyPromotionRow = {
  id: string
  problem_class: string
  primary_stage: string | null
  corrective_guidance: string | null
  falsifier: string | null
  retest_case_id: string | null
  retest_passed: boolean | null
  lesson_retained: boolean
  status: string
  updated_at: string
}

export type AutopsySkillCandidate = {
  skillKey: string
  problemClass: string
  stage: string
  guidance: string
  falsifier: string
  successRows: AutopsyPromotionRow[]
  failureRows: AutopsyPromotionRow[]
}

export const AUTOPSY_MIN_PRACTICE_ATTEMPTS = 2
export const AUTOPSY_MIN_PRACTICE_RATE = 0.8

function clean(value: unknown, max = 2400): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function skillKey(problemClass: string, stage: string, guidance: string): string {
  const digest = createHash('sha256').update(`${problemClass}\n${stage}\n${guidance}`).digest('hex').slice(0, 16)
  return `reasoning.failure_autopsy.${digest}.v1`
}

function rowTime(row: AutopsyPromotionRow): number {
  const parsed = Date.parse(row.updated_at)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * One controlled fixture can never become multiple pieces of independent evidence. If the same
 * retest case appears again, retain only its latest objective outcome for this exact guidance cohort.
 */
export function distinctLatestRetestRows(rows: readonly AutopsyPromotionRow[]): AutopsyPromotionRow[] {
  const latest = new Map<string, AutopsyPromotionRow>()
  for (const row of rows) {
    const caseId = clean(row.retest_case_id, 240)
    if (!caseId) continue
    const prior = latest.get(caseId)
    if (!prior || rowTime(row) >= rowTime(prior)) latest.set(caseId, row)
  }
  return [...latest.values()].sort((a, b) => rowTime(a) - rowTime(b))
}

export function autopsyPracticeRate(candidate: Pick<AutopsySkillCandidate, 'successRows' | 'failureRows'>): number | null {
  const attempts = candidate.successRows.length + candidate.failureRows.length
  return attempts ? candidate.successRows.length / attempts : null
}

export function autopsyPracticeReady(candidate: Pick<AutopsySkillCandidate, 'successRows' | 'failureRows'>): boolean {
  const attempts = candidate.successRows.length + candidate.failureRows.length
  const rate = autopsyPracticeRate(candidate)
  return attempts >= AUTOPSY_MIN_PRACTICE_ATTEMPTS && rate != null && rate >= AUTOPSY_MIN_PRACTICE_RATE
}

/**
 * Build exact problem-class/stage/guidance cohorts. These outcomes come only from the controlled,
 * non-held-out evidence-utilization suite. They are PRACTICE/SHADOW evidence only. They can prepare
 * a cognitive-skill candidate but can never populate holdout counters or make it live-eligible.
 */
export function deriveAutopsySkillCandidates(rows: readonly AutopsyPromotionRow[]): AutopsySkillCandidate[] {
  const groups = new Map<string, AutopsyPromotionRow[]>()
  for (const row of rows) {
    const problemClass = clean(row.problem_class, 320)
    const stage = clean(row.primary_stage, 120)
    const guidance = clean(row.corrective_guidance, 2400)
    if (!problemClass || !stage || !guidance) continue
    const key = `${problemClass}\u0000${stage}\u0000${guidance}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  return [...groups.values()].map(group => {
    const first = group[0]
    const problemClass = clean(first.problem_class, 320)
    const stage = clean(first.primary_stage, 120)
    const guidance = clean(first.corrective_guidance, 2400)
    const latestByCase = distinctLatestRetestRows(group)
    const successRows = latestByCase.filter(row => row.retest_passed === true && row.lesson_retained === true && row.status === 'retest_passed')
    const failureRows = latestByCase.filter(row => row.retest_passed === false || row.status === 'retest_failed')
    return {
      skillKey: skillKey(problemClass, stage, guidance),
      problemClass,
      stage,
      guidance,
      falsifier: clean(first.falsifier, 1200),
      successRows,
      failureRows,
    }
  })
}
