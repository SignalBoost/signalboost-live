// saas/tests/cosUniversityMastersAgentAware.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const runner = fs.readFileSync(path.join(process.cwd(), 'lib/ai/cos/cosUniversityMastersExamRunner.ts'), 'utf8')
const route = fs.readFileSync(path.join(process.cwd(), 'app/api/cron/cos-university-masters-exam/route.ts'), 'utf8')
const migrations = path.join(process.cwd(), 'supabase/migrations')

test('every graduate read and write is scoped to the learner, not pinned to COS', () => {
  assert.match(runner, /async function activeProgramId\(agentId: string\)/)
  assert.match(runner, /async function courseworkStudyPlan\(target: CosUniversityMastersExamTarget, agentId: string\)/)
  assert.match(runner, /async function createOrFindRun\(target: CosUniversityMastersExamTarget, now: Date, agentId: string\)/)
  // The only remaining AGENT_ID uses are the default identity and the comparisons against it.
  assert.ok(!/\.eq\('agent_id', AGENT_ID\)/.test(runner), 'a read is still pinned to COS')
  assert.ok(!/agent_id: AGENT_ID,/.test(runner), 'the insert is still pinned to COS')
})

test('COS keeps its historical run key and other learners are namespaced', () => {
  assert.match(runner, /agentId === AGENT_ID\s*\n?\s*\?\s*`\$\{COS_UNIVERSITY_MASTERS_EXAM_PROFILE\}:\$\{hourKey\(now\)\}/)
  assert.match(runner, /:\s*`\$\{COS_UNIVERSITY_MASTERS_EXAM_PROFILE\}:\$\{agentId\}:\$\{hourKey\(now\)\}/)
})

test('a specialist answers through its own bound executor, never the COS reasoner', () => {
  assert.match(runner, /if \(agentId !== AGENT_ID\) \{\s*\n\s*return executeBoundRun\(/)
  assert.match(runner, /hasBoundAcademicExecutor\(agentId\)/)
  assert.match(runner, /executeBoundAgentExam\(/)
  // The bound branch is taken before any COS inference is prepared.
  assert.ok(runner.indexOf('return executeBoundRun(') < runner.indexOf('beginEvidenceSourceUseTurn()\n  let result'),
    'the bound branch must precede COS reasoner setup')
})

test('bound graduate evidence carries its execution provenance and its own runtime', () => {
  assert.match(runner, /execution_provenance: execution,/)
  assert.match(runner, /response_source: execution\.runtime,/)
  assert.match(runner, /local_model_invoked: true,\s*\n\s*external_ai_invoked: false,/)
  assert.match(runner, /execution\.agentId !== agentId \|\| execution\.runId !== row\.id \|\| execution\.manifestHash !== exam\.manifestHash/)
})

test('an agent without a bound executor never reaches inference', () => {
  const guard = runner.indexOf('hasBoundAcademicExecutor(agentId)')
  const call = runner.indexOf('executeBoundAgentExam(')
  assert.ok(guard > 0 && guard < call, 'the executor check must precede the model call')
  assert.match(runner, /agent_capstone_runtime_unavailable/)
})

test('the cron gives every registered agent a turn, one per tick', () => {
  assert.match(route, /listCosUniversityRegisteredAgents\(\)/)
  assert.match(route, /runCosUniversityMastersExam\(\{ agentId \}\)/)
  assert.match(route, /getUTCHours\(\) % identities\.length/)
  assert.match(route, /agents\.length \? agents\.map\(agent => agent\.agentId\) : \['cos'\]/)
  assert.match(route, /Bearer \$\{secret\}/, 'the lane stays cron-authenticated')
})

test('the graduate ledger has an execution binding before any specialist can write to it', () => {
  const binding = fs.readdirSync(migrations).find(name => name.includes('masters_execution_binding'))
  assert.ok(binding, 'the Master\'s binding migration is missing')
  const sql = fs.readFileSync(path.join(migrations, binding as string), 'utf8')
  assert.match(sql, /cos_university_masters_execution_binding_v1/)
  assert.match(sql, /execution_provenance->>'agentId' = agent_id/)
  assert.match(sql, /not valid/)
})
