// saas/tests/cosUniversityAcademicExecutionPolicy.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE,
  cosUniversityAcademicExecutionBlocker,
} from '../lib/ai/cos/cosUniversityAcademicExecutionPolicy.ts'
import './cosUniversityExamSchema.node.test.ts'

const file = (relative: string) => fs.readFileSync(path.resolve(import.meta.dirname, '..', relative), 'utf8')

test('only COS has a bound academic executor; every other agent fails closed', () => {
  assert.equal(cosUniversityAcademicExecutionBlocker('cos'), null)
  assert.equal(cosUniversityAcademicExecutionBlocker('software-specialist'), COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE)
  assert.equal(cosUniversityAcademicExecutionBlocker('any-future-agent'), COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE)
  assert.equal(cosUniversityAcademicExecutionBlocker('  '), 'agent_id_required')
})

const RUNNERS: Array<{ file: string; blockAt: RegExp; firstWork: string }> = [
]

test('every credit-bearing runner that answers through the COS reasoner blocks other agents before any evidence work', () => {
  for (const runner of RUNNERS) {
    const source = file(runner.file)
    assert.match(source, /tryCOSFirstAnswer\(/, `${runner.file} still answers through the COS reasoner`)
    assert.match(source, /cosUniversityAcademicExecutionBlocker\(agentId\)/, `${runner.file} must consult the execution policy`)
    const blockMatch = runner.blockAt.exec(source)
    assert.ok(blockMatch, `${runner.file} must return a blocked result`)
    const workAt = source.indexOf(runner.firstWork, source.indexOf('cosUniversityAcademicExecutionBlocker(agentId)'))
    assert.ok(workAt > blockMatch.index, `${runner.file} must block before loading or creating academic evidence`)
    const ends = [source.indexOf('semantics:', blockMatch.index), source.indexOf('blocked }', blockMatch.index)].filter(at => at > 0)
    const blockedReturn = source.slice(blockMatch.index, Math.min(...ends))
    assert.doesNotMatch(blockedReturn, /errors: \[['"]/, 'a policy block is an explicit outcome, not a lane failure')
  }
})

test('independent exams are unblocked only for an agent with its own bound executor, and are answered by it', () => {
  const runner = file('lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  assert.match(runner, /if \(blocked && await hasBoundAcademicExecutor\(agentId\)\.catch\(\(\) => false\)\) blocked = null/)
  assert.match(runner, /if \(agentId !== DEFAULT_AGENT_ID\) \{\s*return executeBoundExam\(agentId, row, target, exam, started\)/)
  const boundAt = runner.indexOf('async function executeBoundExam(')
  const cosAt = runner.indexOf('async function executeExam(')
  assert.ok(boundAt > 0 && cosAt > boundAt)
  const boundBody = runner.slice(boundAt, cosAt)
  assert.doesNotMatch(boundBody, /tryCOSFirstAnswer\(/)
  assert.match(boundBody, /execution\.agentId !== agentId \|\| execution\.runId !== row\.id \|\| execution\.manifestHash !== exam\.manifestHash/)
  assert.match(boundBody, /return fail\(\['agent_execution_identity_mismatch'\]\)/)
  assert.match(boundBody, /execution_provenance: execution/)
  assert.match(boundBody, /response_source: SOFTWARE_CAPSTONE_RUNTIME/)
})

test('the bound exam runtime reuses the host capstone executor and the agent\'s own assigned model', () => {
  const runtime = file('lib/ai/cos/cosUniversityAgentExamRuntime.ts')
  assert.match(runtime, /executeBoundSoftwareCapstone\(request, \{/)
  assert.match(runtime, /requireBuilderCodingModel\(\)/)
  assert.match(runtime, /isSoftwareCapstoneIdentity\(agentId, await readCosUniversityAgentRole\(agentId\)\)/)
  assert.doesNotMatch(runtime, /tryCOSFirstAnswer/)
  const migration = file('supabase/migrations/20260911235500_university_agent_exam_execution.sql')
  assert.match(migration, /ALTER TABLE public\.cos_university_exam_runs/)
  assert.match(migration, /execution_provenance IS NULL AND \(agent_id = 'cos' OR fresh_execution IS NOT TRUE\)/)
  assert.match(migration, /execution_provenance->>'runId' = id::text/)
  assert.match(migration, /NOT VALID/, 'historical rows are never granted fresh provenance')
})

test('subject A-range is unblocked only for an agent with its own bound executor, and is answered by it', () => {
  const runner = file('lib/ai/cos/cosUniversityARangeRunner.ts')
  assert.match(runner, /if \(blocked && await hasBoundAcademicExecutor\(agentId\)\.catch\(\(\) => false\)\) blocked = null/)
  const boundAt = runner.indexOf('if (agentId !== AGENT_ID) {')
  const cosAt = runner.indexOf('} else {', boundAt)
  assert.ok(boundAt > 0 && cosAt > boundAt)
  const boundBody = runner.slice(boundAt, cosAt)
  assert.doesNotMatch(boundBody, /tryCOSFirstAnswer\(/)
  assert.match(boundBody, /executeBoundAgentExam\(\s*\{ agentId, runId: row\.id, manifestHash: exam\.manifestHash, prompt: exam\.prompt \},\s*\{ subjectId: row\.subject_id \},\s*\)/)
  assert.match(boundBody, /execution\.agentId !== agentId \|\| execution\.runId !== row\.id \|\| execution\.manifestHash !== exam\.manifestHash/)
  assert.match(boundBody, /return failRun\(\['agent_execution_identity_mismatch'\]\)/)
  assert.match(runner, /execution_provenance: executionProvenance/)
  assert.match(runner, /const freshExecution = Boolean\(handled && localModelInvoked && !externalAiInvoked && !semanticCache && turnId\)/)
  assert.match(runner.slice(cosAt), /tryCOSFirstAnswer\(\{ prompt: exam\.prompt, language: 'en', privileged: true, disableCache: true \}\)/)
})

test('the A-range execution binding matches the exam and capstone bindings', () => {
  const migration = file('supabase/migrations/20260912001500_university_agent_a_range_execution.sql')
  assert.match(migration, /ALTER TABLE public\.cos_university_a_range_runs/)
  assert.match(migration, /execution_provenance IS NULL AND \(agent_id = 'cos' OR fresh_execution IS NOT TRUE\)/)
  assert.match(migration, /execution_provenance->>'runId' = id::text/)
  assert.match(migration, /response_source = 'university_software_specialist_v1'/)
  assert.match(migration, /NOT VALID/, 'historical rows are never granted fresh provenance')
})

test('language A-range is unblocked only for an agent with its own bound executor, and is answered by it', () => {
  const runner = file('lib/ai/cos/cosUniversityLanguageARangeRunner.ts')
  assert.match(runner, /if \(blocked && await hasBoundAcademicExecutor\(agentId\)\.catch\(\(\) => false\)\) blocked = null/)
  const bridgeAt = runner.indexOf('await syncVerifiedLanguageProductionOutcomes(agentId, now)')
  const blockAt = runner.indexOf('let blocked = cosUniversityAcademicExecutionBlocker(agentId)')
  assert.ok(bridgeAt > 0 && blockAt > bridgeAt, 'the Production bridge runs before the exam block')
  const boundAt = runner.indexOf('if (agentId !== AGENT_ID) {')
  const cosAt = runner.indexOf('} else {', boundAt)
  assert.ok(boundAt > 0 && cosAt > boundAt)
  const boundBody = runner.slice(boundAt, cosAt)
  assert.doesNotMatch(boundBody, /tryCOSFirstAnswer\(/)
  assert.match(boundBody, /executeBoundAgentExam\(\s*\{ agentId, runId: row\.id, manifestHash: exam\.manifestHash, prompt: exam\.prompt \},\s*\{ domain: 'generalist' \},\s*\)/)
  assert.match(boundBody, /return failRun\(\['agent_execution_identity_mismatch'\]\)/)
  assert.match(runner, /execution_provenance: executionProvenance/)
  assert.match(runner.slice(cosAt), /tryCOSFirstAnswer\(\{ prompt: exam\.prompt, language: row\.language_code, privileged: true, disableCache: true \}\)/)
  assert.match(runner, /const freshExecution = Boolean\(handled && localModelInvoked && !externalAiInvoked && !semanticCache && turnId\)/)
})

test('delayed retention is unblocked only for an agent with its own bound executor, and is answered by it', () => {
  const runner = file('lib/ai/cos/cosUniversityRetentionRunner.ts')
  assert.match(runner, /if \(blocked && await hasBoundAcademicExecutor\(agentId\)\.catch\(\(\) => false\)\) blocked = null/)
  const boundAt = runner.indexOf('if (agentId !== DEFAULT_AGENT_ID) {')
  const cosAt = runner.indexOf('} else {', boundAt)
  assert.ok(boundAt > 0 && cosAt > boundAt)
  const boundBody = runner.slice(boundAt, cosAt)
  assert.doesNotMatch(boundBody, /tryCOSFirstAnswer\(/)
  assert.match(boundBody, /executeBoundAgentExam\(\s*\{ agentId, runId: inserted\.data\.id, manifestHash: source\.manifestHash, prompt: exam\.prompt \},\s*\{ subjectId: source\.subjectId \},\s*\)/)
  assert.match(boundBody, /throw new Error\('agent_execution_identity_mismatch'\)/)
  assert.match(runner, /execution_provenance: executionProvenance/)
  assert.match(runner.slice(cosAt), /tryCOSFirstAnswer\(\{ prompt: exam\.prompt, language: 'en', privileged: true, disableCache: true \}\)/)
  assert.match(runner, /const fresh = Boolean\(handled && localModelInvoked && !externalAiInvoked && !semanticCache && turnId\)/)
})

test('every credit-bearing University lane now has an execution binding in the database', () => {
  const bindings = [
    ['supabase/migrations/20260911201757_university_agent_capstone_execution.sql', 'cos_university_generalist_capstone_runs'],
    ['supabase/migrations/20260911235500_university_agent_exam_execution.sql', 'cos_university_exam_runs'],
    ['supabase/migrations/20260912001500_university_agent_a_range_execution.sql', 'cos_university_a_range_runs'],
    ['supabase/migrations/20260912013000_university_agent_retention_execution.sql', 'cos_university_retention_runs'],
  ] as const
  for (const [migration, table] of bindings) {
    const sql = file(migration)
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table}`))
    assert.match(sql, /execution_provenance->>'agentId' = agent_id/)
    assert.match(sql, /execution_provenance->>'runId' = id::text/)
    assert.match(sql, /execution_provenance->>'academicAuthority' = 'none'/)
    assert.match(sql, /NOT VALID/, `${migration}: historical rows are never granted fresh provenance`)
  }
})
