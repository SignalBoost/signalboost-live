import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

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

const MIN_PRACTICE_SUCCESSES = 2
const MIN_HOLDOUT_SUCCESSES = 3
const MIN_TOTAL_CLEAN_RETESTS = MIN_PRACTICE_SUCCESSES + MIN_HOLDOUT_SUCCESSES

function clean(value: unknown, max = 2400): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function skillKey(problemClass: string, stage: string, guidance: string): string {
  const digest = createHash('sha256').update(`${problemClass}\n${stage}\n${guidance}`).digest('hex').slice(0, 16)
  return `reasoning.failure_autopsy.${digest}.v1`
}

/**
 * Turn repeated independent autopsy retests into a normal cognitive-skill evidence cohort.
 * The original failed prompt is never copied into the skill. Five clean retests are required:
 * two are accounted as practice and three as independent holdout evidence. Any recorded failure
 * for the exact problem-class/stage cohort blocks promotion and weakens an existing skill.
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
    const successRows = group.filter(row => row.retest_passed === true && row.lesson_retained === true && row.status === 'retest_passed')
      .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))
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

async function writeEvidenceExperiences(db: any, candidate: AutopsySkillCandidate): Promise<void> {
  const selected = candidate.successRows.slice(0, MIN_TOTAL_CLEAN_RETESTS)
  for (let index = 0; index < selected.length; index += 1) {
    const row = selected[index]
    const kind = index < MIN_PRACTICE_SUCCESSES ? 'practice' : 'holdout'
    const experienceHash = createHash('sha256').update(`failure-autopsy:${candidate.skillKey}:${row.id}:${kind}`).digest('hex')
    const payload = {
      experience_hash: experienceHash,
      subject: candidate.problemClass,
      experience_kind: kind,
      skill_key: candidate.skillKey,
      variant_key: row.retest_case_id || row.id,
      source_kind: 'failure_autopsy_retest',
      source_ref: `cos_turn_failure_autopsies:${row.id}`,
      success: true,
      score: 1,
      evidence: {
        schemaVersion: 1,
        primaryStage: candidate.stage,
        autopsyId: row.id,
        retestCaseId: row.retest_case_id,
        semantics: 'independent_failure_autopsy_retest_no_original_prompt_storage',
      },
      last_observed_at: row.updated_at,
      updated_at: new Date().toISOString(),
    }
    await db.from('cos_cognitive_experiences').upsert(payload, { onConflict: 'experience_hash' })
  }
}

function procedure(candidate: AutopsySkillCandidate) {
  return {
    schemaVersion: 1,
    problemClass: candidate.problemClass,
    prerequisites: ['Apply only when the current problem matches this problem class; this is procedural guidance, not factual evidence.'],
    procedureSteps: [candidate.guidance],
    discriminatingSignals: [`Prior independently verified failures were classified at the ${candidate.stage} stage.`],
    tools: [],
    observables: candidate.falsifier ? [candidate.falsifier] : [],
    falsifiers: candidate.falsifier ? [candidate.falsifier] : [],
    commonFailureModes: [`Repeat of the ${candidate.stage} failure pattern despite relevant authorized evidence.`],
    prohibitedActions: [
      'Do not lower source-trust, tenant-scope, authorization, safety, financial, or approval gates to make an answer pass.',
      'Do not use benchmark fixture wording as factual evidence or disclose private held-out prompts.',
    ],
  }
}

export async function reconcileFailureAutopsySkills(): Promise<{
  inspected: number
  promoted: string[]
  weakened: string[]
  pending: Array<{ skillKey: string; cleanRetests: number; failures: number }>
}> {
  const db = cosServiceDb()
  if (!db) return { inspected: 0, promoted: [], weakened: [], pending: [] }

  const result = await db.from('cos_turn_failure_autopsies')
    .select('id,problem_class,primary_stage,corrective_guidance,falsifier,retest_case_id,retest_passed,lesson_retained,status,updated_at')
    .in('status', ['retest_passed', 'retest_failed'])
    .order('updated_at', { ascending: false })
    .limit(500)
  if (result.error) throw result.error

  const candidates = deriveAutopsySkillCandidates((result.data ?? []) as AutopsyPromotionRow[])
  const promoted: string[] = []
  const weakened: string[] = []
  const pending: Array<{ skillKey: string; cleanRetests: number; failures: number }> = []

  for (const candidate of candidates) {
    const existing = await db.from('cos_cognitive_skills').select('*').eq('skill_key', candidate.skillKey).maybeSingle()
    if (existing.error) throw existing.error

    if (candidate.failureRows.length > 0) {
      if (existing.data?.id && ['validated', 'learned', 'mastered'].includes(String(existing.data.status))) {
        const now = new Date().toISOString()
        const metadata = existing.data.metadata && typeof existing.data.metadata === 'object' ? existing.data.metadata : {}
        const update = await db.from('cos_cognitive_skills').update({
          weakened_at: now,
          status: 'weakened',
          failure_count: Math.max(Number(existing.data.failure_count || 0), candidate.failureRows.length),
          metadata: { ...metadata, failureAutopsyRollback: { at: now, failures: candidate.failureRows.length, policy: 'failure-autopsy-promotion-v1' } },
          updated_at: now,
        }).eq('id', existing.data.id)
        if (update.error) throw update.error
        weakened.push(candidate.skillKey)
      }
      pending.push({ skillKey: candidate.skillKey, cleanRetests: candidate.successRows.length, failures: candidate.failureRows.length })
      continue
    }

    if (candidate.successRows.length < MIN_TOTAL_CLEAN_RETESTS) {
      pending.push({ skillKey: candidate.skillKey, cleanRetests: candidate.successRows.length, failures: 0 })
      continue
    }

    const evidenceRows = candidate.successRows.slice(0, MIN_TOTAL_CLEAN_RETESTS)
    const lastValidatedAt = evidenceRows[evidenceRows.length - 1]?.updated_at || new Date().toISOString()
    const provenance = {
      origin: 'failure_autopsy_repeated_clean_retests',
      policy: 'failure-autopsy-promotion-v1',
      primary_stage: candidate.stage,
      autopsy_ids: evidenceRows.map(row => row.id),
      retest_case_ids: evidenceRows.map(row => row.retest_case_id).filter(Boolean),
      evidence_split: { practice: MIN_PRACTICE_SUCCESSES, holdout: MIN_HOLDOUT_SUCCESSES },
      original_prompt_stored: false,
    }
    const metadata = {
      activation_rule: 'validated procedural guidance only; never factual evidence',
      confidence_rule: 'skill lifecycle status must not increase answer confidence',
      automatic_repair: true,
      rollback_rule: 'any recorded failed retest for the exact cohort weakens the skill and removes it from live retrieval',
    }
    const payload = {
      subject: candidate.problemClass,
      title: `Self-healed ${candidate.stage.replace(/_/g, ' ')} discipline`,
      description: candidate.guidance,
      procedure: procedure(candidate),
      status: 'validated',
      evaluator_approved: true,
      understanding_approved: true,
      encounter_count: Math.max(MIN_TOTAL_CLEAN_RETESTS, Number(existing.data?.encounter_count || 0)),
      practice_attempts: MIN_PRACTICE_SUCCESSES,
      practice_successes: MIN_PRACTICE_SUCCESSES,
      holdout_attempts: MIN_HOLDOUT_SUCCESSES,
      holdout_successes: MIN_HOLDOUT_SUCCESSES,
      distinct_holdout_variants: MIN_HOLDOUT_SUCCESSES,
      last_practiced_at: evidenceRows[MIN_PRACTICE_SUCCESSES - 1]?.updated_at || lastValidatedAt,
      last_validated_at: lastValidatedAt,
      weakened_at: null,
      failure_count: 0,
      provenance,
      metadata,
      updated_at: new Date().toISOString(),
    }

    if (existing.data?.id) {
      const update = await db.from('cos_cognitive_skills').update(payload).eq('id', existing.data.id)
      if (update.error) throw update.error
    } else {
      const insert = await db.from('cos_cognitive_skills').insert({ skill_key: candidate.skillKey, ...payload })
      if (insert.error) throw insert.error
    }
    await writeEvidenceExperiences(db, candidate)
    promoted.push(candidate.skillKey)
  }

  return { inspected: candidates.length, promoted, weakened, pending }
}
