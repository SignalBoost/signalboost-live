import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { stripTypeScriptTypes } from 'node:module'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  executeBoundSoftwareCapstone, SOFTWARE_CAPSTONE_ROLE, SOFTWARE_CAPSTONE_RUNTIME,
  type AgentCapstoneRequest, type AgentCapstonePorts,
} from '../lib/ai/cos/cosUniversityAgentCapstone.ts'
import {
  executeUniversityPractice, universityPracticeExecutionFence, universityPracticeExecutionKey,
  BOUND_PRACTICE_VERSION,
} from '../lib/ai/cos/cosUniversityPracticeExecution.ts'

const request: AgentCapstoneRequest = {
  agentId: 'software-specialist', runId: 'a30f8d7c-9df8-4a8e-9307-37d97e4105d7',
  manifestHash: 'a'.repeat(64), prompt: 'Write the requested fact-preserving summary.',
}
const answer = JSON.stringify({ answer: 'The result is unknown; verify the supplied evidence.', confidence: 0.3 })
function ports(overrides: Partial<AgentCapstonePorts> = {}): AgentCapstonePorts {
  return {
    readRole: async () => SOFTWARE_CAPSTONE_ROLE, loadProcedures: async () => [],
    model: 'fixture-assigned-model', infer: async () => answer,
    commitSha: 'b'.repeat(40), deploymentId: 'fixture-deployment', ...overrides,
  }
}
const neverCos = async (): Promise<never> => assert.fail('a specialist must never execute through COS')

test('bound practice invokes only the registered specialist with non-credit framing and bounded output', async () => {
  let calls = 0
  const result = await executeUniversityPractice(request, {
    cos: neverCos,
    bound: input => executeBoundSoftwareCapstone(input, ports({ infer: async (input, model) => {
      calls += 1
      assert.equal(model, 'fixture-assigned-model')
      assert.equal(input.prompt, request.prompt)
      assert.equal(input.maxTokens, 1800)
      assert.match(input.systemPrompt, /registered Software Specialist software-specialist, not the COS generalist/)
      assert.match(input.systemPrompt, /non-credit training, not an independent exam/)
      assert.doesNotMatch(input.systemPrompt, /Complete this multidisciplinary undergraduate capstone/)
      return answer
    } })),
  })
  assert.equal(calls, 1)
  assert.equal(result?.responseSource, SOFTWARE_CAPSTONE_RUNTIME)
  assert.equal(result?.executionProvenance?.agentId, request.agentId)
  assert.equal(result?.executionProvenance?.runId, request.runId)
  assert.equal(result?.executionProvenance?.academicAuthority, 'none')
  assert.equal(result?.executionProvenance?.responseHash, createHash('sha256').update(answer).digest('hex'))
})

test('COS practice retains its own reasoner and never enters the specialist runtime', async () => {
  const cos = { text: answer, turnId: 'cos-turn', reasoner: { kind: 'local', label: 'cos-config' } }
  const result = await executeUniversityPractice({ ...request, agentId: 'cos' }, {
    cos: async () => cos, bound: async () => assert.fail('COS is not the specialist'),
  })
  assert.deepEqual(result, { ...cos, responseSource: 'cos_local_reasoner', executionProvenance: null })
  assert.equal(await executeUniversityPractice({ ...request, agentId: 'cos' }, {
    cos: async () => null, bound: async () => assert.fail('no fallback'),
  }), null)
})

test('unknown role, blank model, inference failure, and role change fail closed without COS fallback', async () => {
  for (const variant of [
    ports({ readRole: async () => null }),
    ports({ model: ' ' }),
    ports({ infer: async () => null }),
    ports({ infer: async () => { throw new Error('inference_unavailable') } }),
    (() => { let n = 0; return ports({ readRole: async () => ++n === 1 ? SOFTWARE_CAPSTONE_ROLE : null }) })(),
  ]) {
    await assert.rejects(executeUniversityPractice(request, {
      cos: neverCos, bound: input => executeBoundSoftwareCapstone(input, variant),
    }))
  }
})

test('wrong learner, run, manifest, model, hashes, time or authority cannot become practice evidence', async () => {
  const valid = await executeBoundSoftwareCapstone({ ...request, purpose: 'practice' }, ports())
  for (const corruption of [
    { agentId: 'cos' }, { agentId: 'another-specialist' }, { runId: 'b30f8d7c-9df8-4a8e-9307-37d97e4105d7' },
    { manifestHash: 'c'.repeat(64) }, { turnId: 'not-a-trace' }, { model: ' ' },
    { runtime: 'cos_local_reasoner' }, { role: 'chief_of_staff_generalist' },
    { promptHash: '' }, { contextHash: '' }, { responseHash: 'd'.repeat(64) },
    { startedAt: 'invalid' }, { completedAt: '2999-01-01T00:00:00Z' }, { academicAuthority: 'granted' },
  ]) {
    await assert.rejects(executeUniversityPractice(request, {
      cos: neverCos,
      bound: async () => ({ ...valid, execution: { ...valid.execution, ...corruption } as typeof valid.execution }),
    }), /binding_invalid/)
  }
  await assert.rejects(executeUniversityPractice(request, {
    cos: neverCos, bound: async () => ({ ...valid, reply: answer + 'tampered' }),
  }), /binding_invalid/)
})

test('ordinary independent assessment framing and limits remain unchanged', async () => {
  await executeBoundSoftwareCapstone(request, ports({ infer: async input => {
    assert.equal(input.maxTokens, 4096)
    assert.match(input.systemPrompt, /Complete this multidisciplinary undergraduate capstone as yourself/)
    assert.doesNotMatch(input.systemPrompt, /non-credit training/)
    return answer
  } }))
  await assert.rejects(executeBoundSoftwareCapstone({ ...request, purpose: 'award' } as unknown as AgentCapstoneRequest, ports()), /invalid_agent_execution_purpose/)
})

test('new bound practice identities preserve COS keys and separate both learners and historical queues', () => {
  const key = 'f'.repeat(64)
  const first = universityPracticeExecutionKey('software-specialist', key)
  assert.equal(universityPracticeExecutionKey('cos', key), key)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, key)
  assert.notEqual(first, universityPracticeExecutionKey('another-specialist', key))
  assert.equal(first, universityPracticeExecutionKey('software-specialist', key))
  assert.deepEqual(universityPracticeExecutionFence('cos'), {})
  assert.deepEqual(universityPracticeExecutionFence('software-specialist'), { executionBinding: BOUND_PRACTICE_VERSION })
})

const runnerFile = process.env.UNIVERSITY_PRACTICE_RUNNER || path.resolve(import.meta.dirname, '../lib/ai/cos/cosUniversityDeliberatePracticeRunner.ts')
const source = fs.readFileSync(runnerFile, 'utf8')
const asRecord = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {}
const clean = (v: unknown, max = 4000) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
function actualFunction(name: string, nextName: string, dependencies: Record<string, unknown>) {
  const start = source.indexOf(`async function ${name}(`)
  const end = source.indexOf(nextName, start)
  assert.ok(start >= 0 && end > start)
  const js = stripTypeScriptTypes(source.slice(start, end), { mode: 'strip' })
  return new Function(...Object.keys(dependencies), `${js}\nreturn ${name}`)(...Object.values(dependencies))
}
function worker(options: { fence?: () => boolean; failInference?: boolean; failRpc?: boolean; gradePass?: boolean } = {}) {
  let cosCalls = 0, boundCalls = 0, graded = 0, deferred = 0, discarded = 0
  let written: Record<string, any> | null = null
  const fn = actualFunction('executePractice', '\nexport async function runCosUniversityDeliberatePractice', {
    asRecord, clean, ORIGIN: 'cos_university_deliberate_practice', PRACTICE_SYSTEM_PROMPT: 'original COS training prompt',
    COS_UNIVERSITY_PRACTICE_PROFILE: 'cos_university_deliberate_practice_v1',
    practiceFenceStillValid: async () => options.fence ? options.fence() : true,
    discardClaimedPractice: async () => { discarded += 1 },
    deferPractice: async () => { deferred += 1 },
    callCosReasoner: async () => { cosCalls += 1; return { text: answer, turnId: 'cos-turn', reasoner: { kind: 'local', label: 'cos' } } },
    executeUniversityPractice, universityPracticeExecutionFence,
    executeBoundAgentExam: async (req: AgentCapstoneRequest) => {
      boundCalls += 1
      if (options.failInference) throw new Error('inference_unavailable')
      return executeBoundSoftwareCapstone(req, ports())
    },
    parseLocalResult: (value: string) => JSON.parse(value),
    evaluateAnswerAgainstRubric: (reply: string, rubric: unknown) => {
      graded += 1
      assert.equal(reply, JSON.parse(answer).answer)
      assert.deepEqual(rubric, { fixture: 'hidden-rubric-never-in-prompt' })
      return { pass: options.gradePass !== false, score: 0.5, coverage: 0.5, reason: 'fixture_scoring' }
    },
    cosServiceDb: () => ({ rpc: async (name: string, input: Record<string, any>) => {
      assert.equal(name, 'cos_record_cognitive_practice_result'); written = input
      return { data: { queueStatus: options.gradePass === false ? 'failed' : 'passed' }, error: options.failRpc ? { message: 'storage_failed' } : null }
    } }),
    refreshCognitiveSkillStatus: async () => {},
  })
  const item = {
    id: request.runId, skill_key: 'skill', variant_key: 'variant', prompt: request.prompt,
    rubric: { fixture: 'hidden-rubric-never-in-prompt' },
    metadata: { agentId: request.agentId, origin: 'cos_university_deliberate_practice',
      universityPlanId: 'plan', universityPlanKey: 'plan-key', practiceRound: 2,
      manifestHash: request.manifestHash, executionBinding: BOUND_PRACTICE_VERSION },
  }
  return { run: () => fn(request.agentId, item), item, fn,
    state: () => ({ cosCalls, boundCalls, graded, deferred, discarded, written }) }
}

test('actual practice worker dispatches the specialist and records its binding before reporting success', async () => {
  const h = worker(); const result = await h.run(); const s = h.state()
  assert.equal(s.cosCalls, 0)
  assert.equal(s.boundCalls, 1)
  assert.equal(s.graded, 1)
  assert.equal(result.status, 'passed')
  assert.equal(s.written?.p_evidence.responseSource, SOFTWARE_CAPSTONE_RUNTIME)
  assert.equal(s.written?.p_evidence.executionProvenance.agentId, request.agentId)
  assert.equal(s.written?.p_evidence.academicCredit, false)
  assert.equal(s.written?.p_evidence.externalEscalationAllowed, false)
})

test('actual worker defers infrastructure failures without grading or invoking COS', async () => {
  const h = worker({ failInference: true }); const result = await h.run(); const s = h.state()
  assert.equal(result.status, 'deferred'); assert.equal(result.passed, null)
  assert.equal(s.graded, 0); assert.equal(s.cosCalls, 0); assert.equal(s.written, null); assert.equal(s.deferred, 1)
})

test('actual worker rejects wrong queue ownership and revoked study proof before grading', async () => {
  const wrong = worker(); wrong.item.metadata.agentId = 'other-agent'
  assert.equal((await wrong.run()).status, 'blocked')
  assert.equal(wrong.state().boundCalls, 0)
  let checks = 0
  const revoked = worker({ fence: () => ++checks === 1 })
  assert.equal((await revoked.run()).status, 'blocked')
  assert.equal(revoked.state().boundCalls, 1)
  assert.equal(revoked.state().graded, 0)
  assert.equal(revoked.state().written, null)
})

test('actual worker preserves rubric failure and refuses success when persistence fails', async () => {
  const failed = worker({ gradePass: false })
  assert.equal((await failed.run()).status, 'failed')
  assert.equal(failed.state().written?.p_success, false)
  const storage = worker({ failRpc: true })
  assert.equal((await storage.run()).status, 'deferred')
  assert.equal(storage.state().deferred, 1)
})

test('practice selection, reconciliation and procedure reads share the new identity fence', () => {
  const root = path.resolve(import.meta.dirname, '../lib/ai/cos')
  const runtime = fs.readFileSync(path.join(root, 'cosUniversityAgentExamRuntime.ts'), 'utf8')
  const remediation = fs.readFileSync(path.join(root, 'cosUniversityPracticeFailureRemediation.ts'), 'utf8')
  assert.match(source, /practiceFenceMetadata\(agentId, planId, practiceRound\)/)
  assert.match(source, /cosUniversityPracticeSkillKey\(universityPracticeExecutionKey\(agentId, plan\.plan_key\)\)/)
  assert.match(source, /planKey: universityPracticeExecutionKey\(agentId, plan\.plan_key\)/)
  assert.match(source, /if \(agentId !== 'cos' && !\(await hasBoundAcademicExecutor\(agentId\)\)\)/)
  assert.match(runtime, /contains\('metadata', .*universityPracticeExecutionFence\(agentId\)/)
  assert.match(runtime, /contains\('provenance', .*universityPracticeExecutionFence\(agentId\)/)
  assert.match(remediation, /loadUniversityPracticeRows\(agentId\)/)
  assert.match(remediation, /agentId, \.\.\.universityPracticeExecutionFence\(agentId\)/)
  assert.doesNotMatch(source, /recordCosUniversityAssessment/)
})
