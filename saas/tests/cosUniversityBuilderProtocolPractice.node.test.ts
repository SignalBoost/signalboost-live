// saas/tests/cosUniversityBuilderProtocolPractice.node.test.ts
//
// Builder protocol practice (owner go 2026-10-06): Computer Science artifacts are trained on worked rounds of the real
// Builder tool loop, recorded on practice tasks. This suite fails the build if
//   - a practice task does not really fail as seeded and pass after its plan, or a recorded command output differs by
//     one byte from what node prints when the plan is replayed in a real directory;
//   - any task reuses Residency exam material (files, objectives, or distinctive values);
//   - the real loop stops accepting a recorded trajectory, or a recorded reply is not a valid control object;
//   - the rows stop being deterministic, or the selection stops aiming at the competencies residents fail;
//   - the worker stops validating, rendering, or training the rows as the resident is served.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { BUILDER_RESIDENCY_CASES } from '../platform-harness/cases/builder-residency.ts'
import { BUILDER_RESIDENCY_V1_COMPETENCIES } from '../lib/ai/cos/cosUniversityResidency.ts'
import { BUILDER_PROTOCOL_PRACTICE_TASKS } from '../lib/ai/cos/cosUniversityBuilderProtocolTasks.ts'
import {
  BUILDER_PROTOCOL_PRACTICE_PROFILE,
  BUILDER_PROTOCOL_PRACTICE_TASKS_PER_RUN,
  buildBuilderProtocolPracticeSelection,
  builderProtocolPracticeForRun,
  recordBuilderProtocolTrajectory,
  selectBuilderProtocolPracticeTasks,
} from '../lib/ai/cos/cosUniversityBuilderProtocolPractice.ts'

const worker = readFileSync(new URL('../scripts/cos-university-hf-worker.py', import.meta.url), 'utf8')

function replay(task: (typeof BUILDER_PROTOCOL_PRACTICE_TASKS)[number]) {
  const dir = mkdtempSync(join(tmpdir(), 'builder-protocol-'))
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  try {
    for (const file of task.seedFiles) write(file.path, file.content)
    const observed: { exitCode: number | null; stdout: string; stderr: string }[] = []
    for (const step of task.plan) {
      if (step.tool === 'write_file') write(step.path, step.content)
      if (step.tool === 'edit_file') {
        const current = readFileSync(join(dir, step.path), 'utf8')
        assert.equal(current.split(step.search).length, 2, `${task.taskId}: edit search must match exactly once in ${step.path}`)
        write(step.path, current.replace(step.search, step.replace))
      }
      if (step.tool === 'run') {
        const [command, ...args] = task.provingCommand.split(' ')
        assert.equal(command, 'node', `${task.taskId}: proving commands are local node scripts`)
        const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', timeout: 20_000 })
        observed.push({ exitCode: result.status, stdout: result.stdout, stderr: result.stderr })
      }
    }
    return observed
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('three practice tasks for every Residency competency, with unique ids', () => {
  assert.equal(BUILDER_PROTOCOL_PRACTICE_TASKS.length, 39)
  assert.equal(new Set(BUILDER_PROTOCOL_PRACTICE_TASKS.map(item => item.taskId)).size, 39)
  for (const competencyId of BUILDER_RESIDENCY_V1_COMPETENCIES) {
    assert.equal(BUILDER_PROTOCOL_PRACTICE_TASKS.filter(item => item.competencyId === competencyId).length, 3, competencyId)
  }
})

for (const task of BUILDER_PROTOCOL_PRACTICE_TASKS) {
  test(`${task.taskId}: fails as seeded, passes after its plan, and every recorded output is exact`, () => {
    const observed = replay(task)
    assert.equal(observed.length, task.runs.length, `${task.taskId}: one recorded output per run step`)
    assert.notEqual(observed[0].exitCode, 0, `${task.taskId}: the first proof must fail, or a pass proves nothing`)
    assert.equal(observed.at(-1)!.exitCode, 0, `${task.taskId}: the plan must end with a passing proof`)
    observed.forEach((run, index) => assert.deepEqual(run, task.runs[index], `${task.taskId}: run ${index + 1} differs from node`))
  })
}

test('no practice task reuses Residency exam material', () => {
  const caseFiles = new Set(BUILDER_RESIDENCY_CASES.flatMap(item => item.seedFiles.map(file => file.content)))
  const words = (value: string) => value.toLowerCase().match(/[a-z0-9_.-]+/g) || []
  const grams = (value: string, size: number) => {
    const list = words(value)
    return new Set(list.slice(0, Math.max(0, list.length - size + 1)).map((_, index) => list.slice(index, index + size).join(' ')))
  }
  const caseObjectiveGrams = new Set(BUILDER_RESIDENCY_CASES.flatMap(item => [...grams(item.objective, 6)]))
  // Distinctive values from the exam fixtures: release ids, capabilities, specialists, secrets, columns and paths.
  const examMarkers = [
    'good-1', 'bad-2', 'r41', 'r42', 'r7', 'repo.read', 'github.pulls', 'github.issue', 'guardian', 'privacy', 'billing',
    'payments_api_secret', 'display_name', 'auth.uid', 'engines', 'app.jss', 'brand-logo', 'evil.example', 'notes',
    'average', 'clamp', 'tail', 'slug', 'tax', 'money', 'parsecsv', 'counter', 'header', 'owner', 'anonymous',
    'format-report', 'defaults.json', 'release.json', 'rollback.json', 'selection.json', 'decision.json',
    'escalation.json', 'incident.json', 'routing.json', 'verify.js', 'devtools.txt', 'vercel.log', 'error.log',
  ]
  for (const task of BUILDER_PROTOCOL_PRACTICE_TASKS) {
    const files = [...task.seedFiles.map(file => file.content), ...task.plan.flatMap(step => step.tool === 'write_file' ? [step.content] : [])]
    for (const content of files) assert.ok(!caseFiles.has(content), `${task.taskId}: reuses a Residency case file verbatim`)
    for (const gram of grams(task.objective, 6)) assert.ok(!caseObjectiveGrams.has(gram), `${task.taskId}: objective reuses Residency wording "${gram}"`)
    const everything = [
      task.objective,
      task.provingCommand,
      ...task.seedFiles.flatMap(file => [file.path, file.content]),
      ...task.plan.flatMap(step => step.tool === 'run' ? [] : step.tool === 'edit_file' ? [step.path, step.search, step.replace] : step.tool === 'write_file' ? [step.path, step.content] : [step.path]),
    ].join('\n').toLowerCase()
    const tokens = new Set(everything.match(/[a-z0-9_.-]+/g) || [])
    for (const marker of examMarkers) assert.ok(!tokens.has(marker), `${task.taskId}: uses Residency exam marker ${marker}`)
  }
})

test('the real Builder loop accepts every recorded trajectory, and every reply is one valid control object', async () => {
  let rows = 0
  for (const task of BUILDER_PROTOCOL_PRACTICE_TASKS) {
    const recorded = await recordBuilderProtocolTrajectory(task)
    assert.ok(recorded.length >= 2, `${task.taskId}: a worked example needs at least a proof and a repair`)
    rows += recorded.length
    for (const row of recorded) {
      assert.match(row.system, /^You are COS Builder\./, `${task.taskId}: the system prompt is the loop's own`)
      assert.ok(row.prompt.includes(`OBJECTIVE:\n${task.objective}`), `${task.taskId}: the round prompt is the loop's own`)
      const control = JSON.parse(row.response)
      assert.equal(control.type, 'tool')
      assert.ok(['read_file', 'edit_file', 'write_file', 'run'].includes(control.toolId), row.response)
      assert.equal(typeof control.input, 'object')
    }
    // A worked example ends by proving the repair.
    assert.equal(JSON.parse(recorded.at(-1)!.response).toolId, 'run', `${task.taskId}: the last round is the proving run`)
  }
  assert.ok(rows >= 100, `expected a substantial practice set, recorded ${rows} rows`)
})

test('a solver never asks for a file the prompt already shows in full', async () => {
  const task = BUILDER_PROTOCOL_PRACTICE_TASKS.find(item => item.taskId === 'rcd-low-stock-comparison')!
  const recorded = await recordBuilderProtocolTrajectory(task)
  assert.deepEqual(recorded.map(row => JSON.parse(row.response).toolId), ['run', 'edit_file', 'run'])
})

test('rows are deterministic: the same failures always produce the same rows and hash', async () => {
  const input = { priorityCompetencies: ['rollback_judgment', 'supabase_diagnosis'], maxTasks: BUILDER_PROTOCOL_PRACTICE_TASKS_PER_RUN }
  const first = await buildBuilderProtocolPracticeSelection(input)
  const second = await buildBuilderProtocolPracticeSelection(input)
  assert.equal(first.rowsHash, second.rowsHash)
  assert.equal(first.profile, BUILDER_PROTOCOL_PRACTICE_PROFILE)
  assert.equal(first.taskIds.length, BUILDER_PROTOCOL_PRACTICE_TASKS_PER_RUN)
})

test('selection aims at failing competencies breadth first, then covers the rest', () => {
  const chosen = selectBuilderProtocolPracticeTasks({ priorityCompetencies: ['supabase_diagnosis', 'rollback_judgment', 'not_a_competency'], maxTasks: 10 })
  assert.deepEqual(chosen.slice(0, 2).map(item => item.competencyId), ['supabase_diagnosis', 'rollback_judgment'])
  assert.deepEqual(chosen.slice(2, 4).map(item => item.competencyId), ['supabase_diagnosis', 'rollback_judgment'])
  assert.deepEqual(chosen.slice(4, 6).map(item => item.competencyId), ['supabase_diagnosis', 'rollback_judgment'])
  assert.equal(new Set(chosen.map(item => item.taskId)).size, 10)
  const none = selectBuilderProtocolPracticeTasks({ priorityCompetencies: [], maxTasks: 13 })
  assert.deepEqual([...new Set(none.map(item => item.competencyId))].sort(), [...BUILDER_RESIDENCY_V1_COMPETENCIES].sort())
})

test('only Computer Science runs carry practice, aimed at skill failures from Residency evidence', async () => {
  assert.equal(await builderProtocolPracticeForRun({ subjectId: 'Mathematics', db: null }), null)
  await assert.rejects(builderProtocolPracticeForRun({ subjectId: 'Computer Science & Coding', db: null }), /builder_protocol_practice_store_unavailable/)
  const reads: string[] = []
  const db = {
    from(table: string) {
      reads.push(table)
      return {
        select: (columns: string) => ({
          eq: async (column: string, value: string) => {
            assert.equal(columns, 'competency_id,outcome')
            assert.deepEqual([column, value], ['outcome', 'fail'])
            return { data: [
              { competency_id: 'chrome_devtools_evidence', outcome: 'fail' },
              { competency_id: 'chrome_devtools_evidence', outcome: 'fail' },
              { competency_id: 'rollback_judgment', outcome: 'fail' },
            ], error: null }
          },
        }),
      }
    },
  }
  const practice = await builderProtocolPracticeForRun({ subjectId: 'Computer Science & Coding', db })
  assert.ok(practice)
  assert.deepEqual(reads, ['cos_university_residency_competency_evidence'])
  assert.deepEqual(practice.priorityCompetencies, ['chrome_devtools_evidence', 'rollback_judgment'])
  assert.ok(practice.taskIds[0].startsWith('cde-') && practice.taskIds[1].startsWith('rj-'))
  const maxRows = Number(worker.match(/^BUILDER_PROTOCOL_PRACTICE_MAX_ROWS = (\d+)$/m)?.[1])
  assert.ok(practice.envelope.rows.length >= 1 && practice.envelope.rows.length <= maxRows, `rows ${practice.envelope.rows.length} must fit the worker limit ${maxRows}`)
  // The worker request is capped at 1.4 MB before compression.
  assert.ok(Buffer.byteLength(JSON.stringify(practice.envelope)) < 700_000)
})

test('the worker validates, renders and trains the rows as the resident is served', () => {
  assert.ok(worker.includes(`BUILDER_PROTOCOL_PRACTICE_PROFILE = "${BUILDER_PROTOCOL_PRACTICE_PROFILE}"`))
  assert.match(worker, /def _builder_protocol_practice\(envelope/)
  assert.ok(worker.includes('worker_builder_protocol_practice_hash_mismatch'), 'rows are integrity-checked against the controller hash')
  assert.ok(worker.includes('worker_builder_protocol_practice_reply_not_json'), 'every reply must be a JSON control object')
  // Rendered with system + user and thinking disabled, exactly like the Residency inference request.
  assert.ok(worker.includes('conversation = [{"role": "system", "content": row["system"]}, {"role": "user", "content": row["prompt"]}]'))
  assert.match(worker, /prompt = _render_chat\(tokenizer, conversation\)/)
  assert.ok(worker.includes('completion_only_loss=True'), 'loss falls on the reply only')
  // Over-length rows are dropped, never truncated into malformed JSON.
  assert.ok(worker.includes('dropped += 1'))
  // Order: failure-derived replay, then protocol practice, then the reasoning ballast stays last.
  const replay = worker.indexOf('itmounts_failure_derived_replay:')
  const protocol = worker.indexOf('itmounts_builder_protocol_practice:')
  const ballast = worker.indexOf('itmounts_general_reasoning_ballast:')
  assert.ok(replay > 0 && protocol > replay && ballast > protocol)
})
// end of saas/tests/cosUniversityBuilderProtocolPractice.node.test.ts (if this line is missing, the paste was cut short)
