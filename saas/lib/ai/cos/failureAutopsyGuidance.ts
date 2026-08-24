import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'

export type FailureAutopsyGuidanceRow = {
  id?: string | null
  problem_class?: string | null
  primary_stage?: string | null
  corrective_guidance?: string | null
  falsifier?: string | null
  status?: string | null
  retest_passed?: boolean | null
  lesson_retained?: boolean | null
  updated_at?: string | null
}

export type FailureAutopsyGuidanceItem = {
  stage: string
  successfulRetests: number
  line: string
}

export type FailureAutopsyGuidanceResult = {
  problemClass: string
  retrieved: number
  relevant: number
  selected: number
  items: FailureAutopsyGuidanceItem[]
}

const MIN_CLEAN_RETESTS = 2
const MAX_SELECTED_STAGES = 2

function clean(value: unknown, max = 2200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Failure-autopsy guidance is procedural, not factual evidence. One passing retest is not enough to
 * change live reasoning. Reuse requires two clean independent retests for the exact problem class
 * and causal stage, with zero recorded failures for that same cohort. Any failure suppresses reuse.
 */
export function selectReusableFailureAutopsyGuidance(
  rows: readonly FailureAutopsyGuidanceRow[],
  problemClass: string,
): FailureAutopsyGuidanceResult {
  const exact = rows.filter(row => clean(row.problem_class, 320) === clean(problemClass, 320))
  const byStage = new Map<string, FailureAutopsyGuidanceRow[]>()
  for (const row of exact) {
    const stage = clean(row.primary_stage, 120)
    if (!stage) continue
    const group = byStage.get(stage) ?? []
    group.push(row)
    byStage.set(stage, group)
  }

  const eligible = [...byStage.entries()].flatMap(([stage, group]) => {
    const failures = group.filter(row => row.retest_passed === false || clean(row.status, 80) === 'retest_failed')
    const successes = group.filter(row => row.retest_passed === true && row.lesson_retained === true && clean(row.corrective_guidance, 2200))
    if (failures.length > 0 || successes.length < MIN_CLEAN_RETESTS) return []

    const newest = [...successes].sort((a, b) => timestamp(b.updated_at) - timestamp(a.updated_at))[0]
    const guidance = clean(newest.corrective_guidance, 2200)
    const falsifier = clean(newest.falsifier, 900)
    if (!guidance) return []
    return [{
      stage,
      successfulRetests: successes.length,
      updatedAt: timestamp(newest.updated_at),
      guidance,
      falsifier,
    }]
  }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SELECTED_STAGES)

  return {
    problemClass: clean(problemClass, 320),
    retrieved: rows.length,
    relevant: exact.length,
    selected: eligible.length,
    items: eligible.map((item, index) => ({
      stage: item.stage,
      successfulRetests: item.successfulRetests,
      line: `[RG${index + 1}] ${item.guidance}${item.falsifier ? ` Falsifier: ${item.falsifier}` : ''} [problem class ${clean(problemClass, 240)}; stage ${item.stage}; ${item.successfulRetests} clean independent retests; procedural remediation guidance only, not factual evidence]`,
    })),
  }
}

export async function retrieveValidatedFailureAutopsyGuidance(prompt: string): Promise<FailureAutopsyGuidanceResult> {
  const problemClass = classifyProblemClass(prompt)
  const empty: FailureAutopsyGuidanceResult = { problemClass, retrieved: 0, relevant: 0, selected: 0, items: [] }
  const db = cosServiceDb()
  if (!db) return empty

  const result = await db.from('cos_turn_failure_autopsies')
    .select('id,problem_class,primary_stage,corrective_guidance,falsifier,status,retest_passed,lesson_retained,updated_at')
    .eq('problem_class', problemClass)
    .in('status', ['retest_passed', 'retest_failed'])
    .order('updated_at', { ascending: false })
    .limit(80)
  if (result.error) {
    console.warn('[cos-failure-autopsy-guidance] retrieval failed', result.error)
    return empty
  }
  return selectReusableFailureAutopsyGuidance((result.data ?? []) as FailureAutopsyGuidanceRow[], problemClass)
}
