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

test('legacy COS-only policy remains fail-closed until a registered bound executor explicitly clears it', () => {
  assert.equal(cosUniversityAcademicExecutionBlocker('cos'), null)
  assert.equal(cosUniversityAcademicExecutionBlocker('software-specialist'), COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE)
  assert.equal(cosUniversityAcademicExecutionBlocker('any-future-agent'), COS_UNIVERSITY_ACADEMIC_EXECUTOR_UNAVAILABLE)
  assert.equal(cosUniversityAcademicExecutionBlocker('  '), 'agent_id_required')
})

const RUNNERS: Array<{ file: string; blockAt: RegExp; firstWork: string }> = []

test('every credit-bearing runner that still answers through COS blocks other agents before evidence work', () => {
  for (const runner of RUNNERS) {
    const source = file(runner.file)
    assert.match(source, /tryCOSFirstAnswer\(/, `${runner.file} still answers through the COS reasoner`)
    assert.match(source, /cosUniversityAcademicExecutionBlocker\(agentId\)/, `${runner.file} must consult the execution policy`)
    const blockMatch = runner.blockAt.exec(source)
    assert.ok(blockMatch, `${runner.file} must return a blocked result`)
    const workAt = source.indexOf(runner.firstWork, source.indexOf('cosUniversityAcademicExecutionBlocker(agentId)'))
    assert.ok(workAt > blockMatch.index, `${runner.file} must block before loading or creating academic evidence`)
  }
})

test('independent exams admit only a registered bound executor and persist its exact runtime', () => {
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
  assert.match(boundBody, /response_source: execution\.runtime/)
  assert.match(boundBody, /responseSource: execution\.runtime/)
})

test('the bound exam runtime is role-generic, fail-closed, and keeps software legacy identity', () => {
  const runtime = file('lib/ai/cos/cosUniversityAgentExamRuntime.ts')
  assert.match(runtime, /executeBoundRegisteredSpecialist\(request, \{/)
  assert.match(runtime, /isRegisteredSpecialistIdentity\(id, await readCosUniversityAgentRole\(id\)\)/)
  assert.match(runtime, /COS_UNIVERSITY_ROLE_MODELS_SETTING_KEY = 'cos_university_role_models'/)
  assert.match(runtime, /if \(role === SOFTWARE_CAPSTONE_ROLE\) return requireBuilderCodingModel\(\)/)
  assert.match(runtime, /university_role_model_not_configured:/)
  assert.doesNotMatch(runtime, /tryCOSFirstAnswer/)
  const generic = file('lib/ai/cos/cosUniversityRegisteredSpecialistExecutor.ts')
  assert.match(generic, /if \(role === SOFTWARE_CAPSTONE_ROLE\) return executeBoundSoftwareCapstone\(request, ports\)/)
  assert.match(generic, /REGISTERED_SPECIALIST_RUNTIME = 'university_registered_specialist_v1'/)
})

test('subject A-range uses the registered learner and persists the exact returned runtime', () => {
  const runner = file('lib/ai/cos/cosUniversityARangeRunner.ts')
  assert.match(runner, /if \(blocked && await hasBoundAcademicExecutor\(agentId\)\.catch\(\(\) => false\)\) blocked = null/)
  const boundAt = runner.indexOf('if (agentId !== AGENT_ID) {')
  const cosAt = runner.indexOf('} else {', boundAt)
  assert.ok(boundAt > 0 && cosAt > boundAt)
  const boundBody = runner.slice(boundAt, cosAt)
  assert.doesNotMatch(boundBody, /tryCOSFirstAnswer\(/)
  assert.match(boundBody, /executeBoundAgentExam\(\s*\{ agentId, runId: row\.id, manifestHash: exam\.manifestHash, prompt: exam\.prompt \},\s*\{ subjectId: row\.subject_id \},\s*\)/)
  assert.match(boundBody, /responseSource = execution\.runtime/)
  assert.match(runner, /execution_provenance: executionProvenance/)
})

test('live database binding migrations accept only exact role-bound runtime evidence', () => {
  const apply = file('supabase/migrations/20260912030000_university_agent_execution_binding_apply.sql')
  assert.match(apply, /execution_provenance->>'runtime' ~ '\^university_/)
  assert.match(apply, /execution_provenance->>'role' in \(/)
  assert.match(apply, /execution_provenance->>'agentId' = agent_id/)
  assert.match(apply, /execution_provenance->>'runId' = id::text/)
  assert.match(apply, /response_source = execution_provenance->>'runtime'/)
  assert.match(apply, /NOT VALID/, 'historical rows are never retroactively promoted')
})

test('language A-range uses generalist work routing but preserves specialist execution identity', () => {
  const runner = file('lib/ai/cos/cosUniversityLanguageARangeRunner.ts')
  assert.match(runner, /if \(blocked && await hasBoundAcademicExecutor\(agentId\)\.catch\(\(\) => false\)\) blocked = null/)
  const boundAt = runner.indexOf('if (agentId !== AGENT_ID) {')
  const cosAt = runner.indexOf('} else {', boundAt)
  assert.ok(boundAt > 0 && cosAt > boundAt)
  const boundBody = runner.slice(boundAt, cosAt)
  assert.doesNotMatch(boundBody, /tryCOSFirstAnswer\(/)
  assert.match(boundBody, /executeBoundAgentExam\(\s*\{ agentId, runId: row\.id, manifestHash: exam\.manifestHash, prompt: exam\.prompt \},\s*\{ domain: 'generalist' \},\s*\)/)
  assert.match(boundBody, /responseSource = execution\.runtime/)
  assert.match(runner, /execution_provenance: executionProvenance/)
})

test('delayed retention remains learner-scoped and preserves returned execution provenance', () => {
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
})

test('every credit-bearing University lane has a database execution binding', () => {
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
