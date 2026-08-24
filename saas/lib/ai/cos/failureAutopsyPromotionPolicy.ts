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

export const AUTOPSY_PRACTICE_SUCCESSES = 2
export const AUTOPSY_HOLDOUT_SUCCESSES = 3
export const AUTOPSY_TOTAL_CLEAN_RETESTS = AUTOPSY_PRACTICE_SUCCESSES + AUTOPSY_HOLDOUT_SUCCESSES

function clean(value: unknown, max = 2400): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function skillKey(problemClass: string, stage: string, guidance: string): string {
  const digest = createHash('sha256').update(`${problemClass}\n${stage}\n${guidance}`).digest('hex').slice(0, 16)
  return `reasoning.failure_autopsy.${digest}.v1`
}

/** Keep only one successful evidence row per independent controlled retest case. */
export function distinctSuccessfulRetestRows(rows: readonly AutopsyPromotionRow[]): AutopsyPromotionRow[] {
  const seen = new Set<string>()
  const out: AutopsyPromotionRow[] = []
  for (const row of [...rows].sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))) {
    const caseId = clean(row.retest_case_id, 240)
    if (!caseId || seen.has(caseId)) continue
    seen.add(caseId)
    out.push(row)
  }
  return out
}

/**
 * Build exact problem-class/stage/guidance cohorts. The original failed prompt is not part of the
 * key or output. Runtime promotion requires five DISTINCT clean independent retest cases and zero
 * failures for the exact cohort.
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
    const cleanSuccesses = group.filter(row => row.retest_passed === true && row.lesson_retained === true && row.status === 'retest_passed')
    const successRows = distinctSuccessfulRetestRows(cleanSuccesses)
    const failureRows = group.filter(row => row.retest_passed === false || row.status === 'retest_failed')
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
