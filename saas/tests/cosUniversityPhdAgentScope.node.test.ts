import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DEFAULT_PHD_AGENT_ID, requirePhdAgentId, rotatePhdAgents } from '../lib/ai/cos/cosUniversityPhdAgentScope.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test('PhD agent identity is explicit, validated, and preserves COS as the compatibility default', () => {
  assert.equal(DEFAULT_PHD_AGENT_ID, 'cos')
  assert.equal(requirePhdAgentId('software-specialist'), 'software-specialist')
  assert.throws(() => requirePhdAgentId(''), /invalid_phd_agent_id/)
  assert.throws(() => requirePhdAgentId('../cos'), /invalid_phd_agent_id/)
})

test('PhD scheduler rotates registered learners without changing their identities', () => {
  const agents = [{ agentId: 'cos' }, { agentId: 'software-specialist' }, { agentId: 'quantum-specialist' }]
  const a = rotatePhdAgents(agents, new Date('2026-09-13T20:00:00.000Z'))
  const b = rotatePhdAgents(agents, new Date('2026-09-13T21:00:00.000Z'))
  assert.deepEqual(new Set(a.map(row => row.agentId)), new Set(agents.map(row => row.agentId)))
  assert.deepEqual(new Set(b.map(row => row.agentId)), new Set(agents.map(row => row.agentId)))
  assert.notEqual(a[0]?.agentId, b[0]?.agentId)
})

test('PhD runtime is learner-scoped all the way through Master’s admission, ledgers, and credential identity', () => {
  const runtime = file('lib/ai/cos/cosUniversityPhdRuntime.ts')
  assert.match(runtime, /readCosUniversityPhdRuntimeStatus\([\s\S]*agentId: string = DEFAULT_PHD_AGENT_ID/)
  assert.match(runtime, /readCosUniversityMastersRuntimeStatus\(program\.mastersPrerequisite, now, undefined, agentId\)/)
  assert.match(runtime, /\.eq\('agent_id', agentId\)/)
  assert.match(runtime, /cosUniversityPhdCredentialKey\(agentId, programId\)/)
  assert.doesNotMatch(runtime, /const AGENT_ID = 'cos'/)
})

test('PhD methodology and research runners no longer execute every candidate as COS', () => {
  const methodology = file('lib/ai/cos/cosUniversityPhdMethodologyExamRunner.ts')
  const research = file('lib/ai/cos/cosUniversityPhdResearchRunner.ts')
  for (const source of [methodology, research]) {
    assert.doesNotMatch(source, /const AGENT_ID = 'cos'/)
    assert.match(source, /agentId/)
    assert.match(source, /hasBoundAcademicExecutor/)
    assert.match(source, /executeBoundAgentExam/)
  }
})

test('PhD cron routes use the registered-agent registry and bounded learner rotation', () => {
  for (const relative of [
    'app/api/cron/cos-university-phd-methodology-exam/route.ts',
    'app/api/cron/cos-university-phd-research/route.ts',
    'app/api/cron/cos-university-phd-admission/route.ts',
    'app/api/cron/cos-university-phd-progress/route.ts',
  ]) {
    const route = file(relative)
    assert.match(route, /listCosUniversityRegisteredAgents\(\)/)
    assert.match(route, /rotatePhdAgents\(/)
  }
})
