// saas/tests/cosUniversityResidencyGapCurriculum.node.test.ts
//
// Owner go, 2026-10-06: Builder Residency skill failures must feed targeted Computer Science remediation instead of
// teaching the University nothing. Contracts:
//   1. seeds are deterministic, bounded, materially distinct, and only for known competencies;
//   2. no Residency case content (files, fixtures, variant ids, proving commands) can appear in a seed;
//   3. only `fail` competency evidence counts (written only for Harness agent_failure);
//   4. the installer reads class-level fields only, writes the standard failure_derived_curriculum shape, and is
//      idempotent; no failures means no writes;
//   5. curriculum replenishment runs it in both inventory states and reports it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  RESIDENCY_GAP_ITEMS_PER_COMPETENCY,
  RESIDENCY_GAP_FAILURES_PER_GENERATION,
  RESIDENCY_GAP_MAX_GENERATIONS,
  RESIDENCY_GAP_REMEDIATION_PROFILE,
  RESIDENCY_GAP_UNIVERSITY_SUBJECT,
  failedResidencyCompetencies,
  installResidencyGapDerivedCurriculum,
  residencyGapCurriculumHash,
  residencyGapGenerationForFailures,
  residencyGapPracticeSeed,
} from '../lib/ai/cos/cosUniversityResidencyGapCurriculum.ts'
import { BUILDER_RESIDENCY_V1_COMPETENCIES } from '../lib/ai/cos/cosUniversityResidency.ts'
import { BUILDER_RESIDENCY_CASES } from '../platform-harness/cases/builder-residency.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('every competency has a bounded, deterministic set of materially distinct seeds', () => {
  const hashes = new Set<string>()
  const summaries = new Set<string>()
  for (const competencyId of BUILDER_RESIDENCY_V1_COMPETENCIES) {
    for (let ordinal = 0; ordinal < RESIDENCY_GAP_ITEMS_PER_COMPETENCY; ordinal += 1) {
      const seed = residencyGapPracticeSeed({ competencyId, ordinal })
      assert.ok(seed, `${competencyId}#${ordinal}`)
      assert.equal(seed!.contentHash, residencyGapCurriculumHash({ competencyId, ordinal }))
      assert.match(seed!.contentHash, /^[a-f0-9]{64}$/)
      assert.equal(seed!.universitySubject, 'Computer Science & Coding')
      assert.match(seed!.title, /^Computer Science & Coding — Builder Residency competency remediation \d+$/)
      assert.match(seed!.summary, /self-contained expert teaching example/)
      assert.match(seed!.summary, /Do not reconstruct or quote any Residency case/)
      assert.doesNotMatch(seed!.summary, new RegExp(competencyId), 'the internal competency id is not training text')
      hashes.add(seed!.contentHash)
      summaries.add(seed!.summary)
    }
  }
  const expected = BUILDER_RESIDENCY_V1_COMPETENCIES.length * RESIDENCY_GAP_ITEMS_PER_COMPETENCY
  assert.equal(hashes.size, expected, 'every seed has its own hash')
  assert.equal(summaries.size, expected, 'every seed is materially distinct text, not a re-hashed copy')
  assert.equal(RESIDENCY_GAP_UNIVERSITY_SUBJECT, 'Computer Science & Coding')
  assert.equal(RESIDENCY_GAP_REMEDIATION_PROFILE, 'cos-university-residency-gap-remediation-v1')
})

test('unknown competencies and out-of-range ordinals cannot mint remediation', () => {
  assert.equal(residencyGapPracticeSeed({ competencyId: 'made_up_competency', ordinal: 0 }), null)
  assert.equal(residencyGapPracticeSeed({ competencyId: 'root_cause_diagnosis', ordinal: RESIDENCY_GAP_ITEMS_PER_COMPETENCY }), null)
  assert.equal(residencyGapPracticeSeed({ competencyId: 'root_cause_diagnosis', ordinal: -1 }), null)
  assert.equal(residencyGapPracticeSeed({ competencyId: 'root_cause_diagnosis', ordinal: 1.5 }), null)
})

test('repeated class-level failures unlock one bounded remediation generation instead of flooding every retry', () => {
  assert.equal(RESIDENCY_GAP_FAILURES_PER_GENERATION, 10)
  assert.equal(RESIDENCY_GAP_MAX_GENERATIONS, 4)
  assert.equal(residencyGapGenerationForFailures(1), 0)
  assert.equal(residencyGapGenerationForFailures(9), 0)
  assert.equal(residencyGapGenerationForFailures(10), 0)
  assert.equal(residencyGapGenerationForFailures(11), 1)
  assert.equal(residencyGapGenerationForFailures(20), 1)
  assert.equal(residencyGapGenerationForFailures(21), 2)
  assert.equal(residencyGapGenerationForFailures(999), 3)
  const base = residencyGapPracticeSeed({ competencyId: 'test_and_regression_construction', ordinal: 0, generation: 0 })!
  const next = residencyGapPracticeSeed({ competencyId: 'test_and_regression_construction', ordinal: 0, generation: 1 })!
  assert.notEqual(base.contentHash, next.contentHash)
  assert.notEqual(base.summary, next.summary)
  assert.match(next.title, /G2\.1$/)
  assert.match(next.summary, /plausible but wrong repair/)
  assert.equal(residencyGapPracticeSeed({ competencyId: 'test_and_regression_construction', ordinal: 0, generation: RESIDENCY_GAP_MAX_GENERATIONS }), null)
})

test('no Residency case content can leak into a seed', () => {
  const seeds = BUILDER_RESIDENCY_V1_COMPETENCIES.flatMap(competencyId =>
    Array.from({ length: RESIDENCY_GAP_ITEMS_PER_COMPETENCY }, (_, ordinal) => residencyGapPracticeSeed({ competencyId, ordinal })!.summary))
  const text = seeds.join('\n')
  for (const item of BUILDER_RESIDENCY_CASES) {
    assert.ok(!text.includes(item.variantId), `variant id ${item.variantId} leaked`)
    assert.ok(!text.includes(item.caseFamily), `case family ${item.caseFamily} leaked`)
    assert.ok(!text.includes(item.provingCommand), `proving command of ${item.variantId} leaked`)
    for (const file of item.seedFiles) {
      assert.ok(!text.includes(file.path), `file ${file.path} of ${item.variantId} leaked`)
      for (const line of file.content.split('\n').map(value => value.trim()).filter(value => value.length >= 24)) {
        assert.ok(!text.includes(line), `fixture line of ${item.variantId} leaked: ${line}`)
      }
    }
  }
})

test('only fail evidence for known competencies counts, most-failed first', () => {
  const failed = failedResidencyCompetencies([
    { competency_id: 'rollback_judgment', outcome: 'fail' },
    { competency_id: 'root_cause_diagnosis', outcome: 'fail' },
    { competency_id: 'root_cause_diagnosis', outcome: 'fail' },
    { competency_id: 'root_cause_diagnosis', outcome: 'pass' },
    { competency_id: 'supabase_diagnosis', outcome: 'pass' },
    { competency_id: 'not_a_competency', outcome: 'fail' },
  ])
  assert.deepEqual(failed.map(row => ({ ...row })), [
    { competencyId: 'root_cause_diagnosis', failures: 2 },
    { competencyId: 'rollback_judgment', failures: 1 },
  ])
})

/** Minimal PostgREST-shaped store: supports exact head counts and idempotent curriculum upserts. */
function fakeDb(evidence: Array<{ competency_id: string; outcome: string; observed_at: string }>) {
  const curriculum = new Map<string, any>()
  const selects: string[] = []
  const evidenceFilters: string[] = []
  const db = {
    from(table: string) {
      if (table === 'cos_university_residency_competency_evidence') {
        let rows = [...evidence]
        let head = false
        let exactCount = false
        const q: any = {
          select(columns: string, options?: { count?: string; head?: boolean }) {
            selects.push(`${table}:${columns}:${options?.count || 'none'}:${options?.head === true ? 'head' : 'rows'}`)
            head = options?.head === true
            exactCount = options?.count === 'exact'
            return q
          },
          eq(column: string, value: string) { evidenceFilters.push(`${column}=${value}`); rows = rows.filter(row => (row as any)[column] === value); return q },
          then(resolve: (v: unknown) => unknown) {
            return Promise.resolve({ data: head ? null : rows, count: exactCount ? rows.length : null, error: null }).then(resolve)
          },
        }
        return q
      }
      if (table === 'cos_continuous_learning') {
        return {
          upsert(row: any, options: any) {
            assert.equal(options.onConflict, 'content_hash')
            assert.equal(options.ignoreDuplicates, true)
            const isNew = !curriculum.has(row.content_hash)
            if (isNew) curriculum.set(row.content_hash, row)
            return { select: () => Promise.resolve({ data: isNew ? [{ content_hash: row.content_hash }] : [], error: null }) }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db: db as any, curriculum, selects, evidenceFilters }
}

const NOW = new Date('2026-10-06T16:00:00Z')

test('the installer writes the standard remediation shape per failed competency and is idempotent', async () => {
  const store = fakeDb([
    { competency_id: 'root_cause_diagnosis', outcome: 'fail', observed_at: '2026-10-06T10:00:00Z' },
    { competency_id: 'root_cause_diagnosis', outcome: 'fail', observed_at: '2026-10-06T11:00:00Z' },
    { competency_id: 'rollback_judgment', outcome: 'fail', observed_at: '2026-10-06T12:00:00Z' },
    { competency_id: 'supabase_diagnosis', outcome: 'pass', observed_at: '2026-10-06T12:00:00Z' },
  ])
  const first = await installResidencyGapDerivedCurriculum({ db: store.db, now: NOW })
  assert.equal(first.failedCompetencies, 2)
  assert.equal(first.inserted, 2 * RESIDENCY_GAP_ITEMS_PER_COMPETENCY)
  assert.deepEqual([...first.competencies], ['root_cause_diagnosis', 'rollback_judgment'])
  assert.equal(store.selects.length, BUILDER_RESIDENCY_V1_COMPETENCIES.length)
  assert.ok(store.selects.every(value => value === 'cos_university_residency_competency_evidence:competency_id:exact:head'))
  assert.equal(store.evidenceFilters.filter(value => value === 'outcome=fail').length, BUILDER_RESIDENCY_V1_COMPETENCIES.length)
  assert.equal(store.evidenceFilters.filter(value => value.startsWith('competency_id=')).length, BUILDER_RESIDENCY_V1_COMPETENCIES.length)
  for (const row of store.curriculum.values()) {
    assert.equal(row.source_kind, 'failure_derived_curriculum')
    assert.equal(row.subject, 'Computer Science & Coding')
    assert.equal(row.license, 'synthetic-benchmark-fixture')
    assert.equal(row.confidence, 1)
    assert.equal(row.observed_at, NOW.toISOString())
    assert.equal(row.facts[0].profile, RESIDENCY_GAP_REMEDIATION_PROFILE)
    assert.equal(row.facts[0].sourceDetailsCopied, false)
    assert.equal(row.evidence[0].residencyCompetencyGap, true)
    assert.equal(row.evidence[0].authorityExpanded, false)
    assert.ok(!('supabase_diagnosis' === row.evidence[0].residencyCompetency), 'a passed-only competency gets no remediation')
  }
  const second = await installResidencyGapDerivedCurriculum({ db: store.db, now: NOW })
  assert.equal(second.inserted, 0, 'repeated runs never duplicate remediation')
  assert.equal(store.curriculum.size, 2 * RESIDENCY_GAP_ITEMS_PER_COMPETENCY)
})

test('an eleventh failure backfills the base generation plus exactly one new generation and is idempotent afterward', async () => {
  const evidence = Array.from({ length: 11 }, (_, i) => ({
    competency_id: 'test_and_regression_construction',
    outcome: 'fail',
    observed_at: `2026-10-06T${String(i + 1).padStart(2, '0')}:00:00Z`,
  }))
  const store = fakeDb(evidence)
  const first = await installResidencyGapDerivedCurriculum({ db: store.db, now: NOW })
  assert.equal(first.inserted, 2 * RESIDENCY_GAP_ITEMS_PER_COMPETENCY)
  const generations = new Set([...store.curriculum.values()].map(row => row.facts[0].remediationGeneration))
  assert.deepEqual([...generations].sort(), [0, 1])
  for (const row of store.curriculum.values()) {
    assert.equal(row.facts[0].classFailureCountAtGeneration, 11)
    if (row.facts[0].remediationGeneration === 1) assert.match(row.source_uri, /\/g1\//)
  }
  const second = await installResidencyGapDerivedCurriculum({ db: store.db, now: NOW })
  assert.equal(second.inserted, 0)
  assert.equal(store.curriculum.size, 2 * RESIDENCY_GAP_ITEMS_PER_COMPETENCY)
})

test('historical failures backfill every unlocked bounded generation without gaps', async () => {
  const evidence = Array.from({ length: 31 }, (_, i) => ({
    competency_id: 'root_cause_diagnosis',
    outcome: 'fail',
    observed_at: `2026-10-06T${String((i % 23) + 1).padStart(2, '0')}:00:00Z`,
  }))
  const store = fakeDb(evidence)
  const result = await installResidencyGapDerivedCurriculum({ db: store.db, now: NOW })
  assert.equal(result.inserted, 4 * RESIDENCY_GAP_ITEMS_PER_COMPETENCY)
  const generations = new Set([...store.curriculum.values()].map(row => row.facts[0].remediationGeneration))
  assert.deepEqual([...generations].sort(), [0, 1, 2, 3])
})

test('a missing store fails closed instead of silently skipping remediation', async () => {
  await assert.rejects(installResidencyGapDerivedCurriculum({ db: null, now: NOW }), /persistent_learning_store_unavailable/)
})

test('no Residency failures means no curriculum writes', async () => {
  const store = fakeDb([{ competency_id: 'root_cause_diagnosis', outcome: 'pass', observed_at: '2026-10-06T10:00:00Z' }])
  const result = await installResidencyGapDerivedCurriculum({ db: store.db, now: NOW })
  assert.equal(result.inserted, 0)
  assert.equal(result.failedCompetencies, 0)
  assert.equal(store.curriculum.size, 0)
})

test('the installer reads class-level evidence only and never case, trajectory or answer material', () => {
  const source = read('../lib/ai/cos/cosUniversityResidencyGapCurriculum.ts')
  assert.match(source, /select\('competency_id', \{ count: 'exact', head: true \}\)/)
  assert.doesNotMatch(source, /select\([^)]*(variant_hash|trajectory_hash|evidence_hash|case_run_id|case_family|residency_id|seedFiles|objective)/)
  assert.doesNotMatch(source, /builder-residency\.ts/, 'the case catalog is never imported by the curriculum generator')
  assert.match(source, /sourceDetailsCopied: false/)
  assert.match(source, /authorityExpanded: false/)
})

test('curriculum replenishment runs Residency remediation in both inventory states and reports it', () => {
  const replenishment = read('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.equal((replenishment.match(/installResidencyGapDerivedCurriculum\(\{ db, now \}\)/g) || []).length, 2)
  assert.equal((replenishment.match(/residencyGapDerivedInserted: residencyGapDerived\.inserted/g) || []).length, 2)
})

test('a full prepared buffer still installs Residency remediation and rebuilds batches for it (Codex on #3700)', () => {
  const workflow = read('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  const fullBuffer = workflow.slice(workflow.indexOf('if (preparedBeforeReplenishment >= preparedBufferTarget)'), workflow.indexOf('shortfall_replenishment_active'))
  assert.match(fullBuffer, /installResidencyGapDerivedCurriculum\(\{ db: cosServiceDb\(\), now \}\)/)
  assert.match(fullBuffer, /const remediationInserted = failureDerived\.inserted \+ residencyGapDerived\.inserted/)
  assert.match(fullBuffer, /skipped: remediationInserted === 0/)
  assert.match(fullBuffer, /if \(remediationInserted > 0\) \{\s*curriculum = \{ ok: true, \.\.\.\(await prepareUniversityMassDistillationCurriculum/)
  assert.match(fullBuffer, /const remediationSubjects = new Set\(\[[\s\S]*residencyGapDerived\.inserted > 0 \? \[RESIDENCY_GAP_UNIVERSITY_SUBJECT\] : \[\][\s\S]*\]\)/, 'a subject seeded this tick joins the same-tick corrective pass (Codex on #3701)')
  assert.match(fullBuffer, /const correctiveMaterialInserted = \[[^\]]*curriculumReplenishment\.residencyGapDerivedInserted/)
  const shortfall = workflow.slice(workflow.indexOf('shortfall_replenishment_active'))
  assert.match(shortfall, /const replenishmentMaterialInserted = \[[^\]]*curriculumReplenishment\.residencyGapDerivedInserted/)
  const replenishment = read('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts')
  assert.match(replenishment, /skipped: failureDerived\.inserted === 0 && residencyGapDerived\.inserted === 0/)
})

test('competency fail evidence is written only for a Harness agent_failure', () => {
  const adapter = read('../platform-harness/adapters/university.ts')
  assert.match(adapter, /if \(!\['success', 'agent_failure'\]\.includes\(result\.outcome\.status\)\)/)
  assert.match(adapter, /const remediation = result\.outcome\.status === 'agent_failure'/)
  const runner = read('../platform-harness/residency/builder-case-runner.ts')
  assert.match(runner, /const outcome:'pass'\|'fail'=adapted\.route==='remediation'\?'fail':'pass'/)
})
// end of saas/tests/cosUniversityResidencyGapCurriculum.node.test.ts (if this line is missing, the paste was cut short)
