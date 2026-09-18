// saas/tests/cosUniversityExamLengthRevision.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createHash } from 'node:crypto'
import {
  countUniversityResponseWords, executeBoundSoftwareCapstone, isBoundSoftwareCapstoneEvidence,
  SOFTWARE_CAPSTONE_RUNTIME, type AgentCapstonePorts,
} from '../lib/ai/cos/cosUniversityAgentCapstone.ts'

const base = { agentId: 'software-specialist', runId: '11111111-2222-4333-8444-555555555555', manifestHash: 'a'.repeat(64), prompt: 'Analyze the case. Response limit: at most 20 words.' }
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const longDraft = Array(35).fill('reasoning').join(' ')
const shortFinal = Array(18).fill('concise').join(' ')
const ports = (infer: AgentCapstonePorts['infer']): AgentCapstonePorts => ({
  readRole: async () => 'software_engineering', loadProcedures: async () => [], model: 'configured-software-model',
  infer, commitSha: 'c'.repeat(40), deploymentId: 'deployment-test',
})
const file = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('word count is identical to the independent scorer count', () => {
  assert.equal(countUniversityResponseWords('  one\ntwo\t three  '), 3)
  assert.equal(countUniversityResponseWords('## Heading\n1. item'), 4)
  assert.match(file('lib/ai/cos/cosUniversityIndependentExam.ts'), /return String\(value \?\? ''\)\.trim\(\)\.match\(\/\\S\+\/g\)\?\.length \?\? 0/)
})

test('an over-limit draft gets exactly one self-edit by the same learner and model; the final text is what is bound', async () => {
  const calls: Array<{ prompt: string; systemPrompt: string; model: string }> = []
  const result = await executeBoundSoftwareCapstone({ ...base, responseWordLimit: 20 }, ports(async (input, model) => {
    calls.push({ ...input, model })
    return calls.length === 1 ? longDraft : shortFinal
  }))
  assert.equal(calls.length, 2)
  assert.equal(calls[1].model, calls[0].model)
  assert.equal(calls[1].systemPrompt, calls[0].systemPrompt)
  assert.match(calls[1].prompt, /has 35 words/)
  assert.match(calls[1].prompt, /at most 20 words/)
  assert.ok(calls[1].prompt.includes(longDraft))
  assert.equal(result.reply, shortFinal)
  assert.equal(result.execution.responseHash, sha(shortFinal))
  assert.deepEqual({ ...result.execution.lengthRevision, draftResponseHash: undefined, revisionPromptHash: undefined },
    { limit: 20, draftWords: 35, finalWords: 18, revisionApplied: true, draftResponseHash: undefined, revisionPromptHash: undefined })
  assert.equal(result.execution.lengthRevision?.draftResponseHash, sha(longDraft))
  assert.ok(isBoundSoftwareCapstoneEvidence(result.execution, {
    id: base.runId, agent_id: base.agentId, manifest_hash: base.manifestHash, turn_id: result.execution.turnId,
  }, 'software_engineering'))
  assert.equal(result.execution.runtime, SOFTWARE_CAPSTONE_RUNTIME)
})

test('a draft within the limit, or no limit at all, keeps the single call and adds no revision record', async () => {
  for (const request of [{ ...base, responseWordLimit: 40 }, base]) {
    let calls = 0
    const result = await executeBoundSoftwareCapstone(request, ports(async () => { calls++; return longDraft }))
    assert.equal(calls, 1)
    assert.equal(result.reply, longDraft)
    assert.equal('lengthRevision' in result.execution, false)
  }
})

test('a failed self-edit submits the original draft honestly; the scorer still decides', async () => {
  let calls = 0
  const result = await executeBoundSoftwareCapstone({ ...base, responseWordLimit: 20 }, ports(async () => (++calls === 1 ? longDraft : '')))
  assert.equal(calls, 2)
  assert.equal(result.reply, longDraft)
  assert.equal(result.execution.responseHash, sha(longDraft))
  assert.equal(result.execution.lengthRevision?.revisionApplied, false)
  assert.equal(result.execution.lengthRevision?.finalWords, 35)
})

test('practice never self-edits and malformed limits fail closed before inference', async () => {
  let calls = 0
  await assert.rejects(executeBoundSoftwareCapstone({ ...base, responseWordLimit: 0 }, ports(async () => { calls++; return longDraft })), /invalid_agent_response_word_limit/)
  await assert.rejects(executeBoundSoftwareCapstone({ ...base, responseWordLimit: 2.5 }, ports(async () => { calls++; return longDraft })), /invalid_agent_response_word_limit/)
  assert.equal(calls, 0)
  const source = file('lib/ai/cos/cosUniversityAgentCapstone.ts')
  assert.match(source, /const wordLimit = request\.purpose === 'practice' \? undefined : request\.responseWordLimit/)
})

test('the independent exam runner passes the already-disclosed public limit, not a private rubric value', () => {
  const runner = file('lib/ai/cos/cosUniversityIndependentExamRunner.ts')
  assert.match(runner, /responseWordLimit: universityExamResponseContract\(exam\)\?\.maxWords/)
  assert.match(runner, /prompt: universityIndependentLearnerPrompt\(exam\)/)
})
