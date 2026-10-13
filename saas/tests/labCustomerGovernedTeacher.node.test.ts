// saas/tests/labCustomerGovernedTeacher.node.test.ts
// Teacher calls on the customer's own key: governed by the Platform Harness (calls, concurrency, deadline, public
// endpoint), never priced, budgeted or reserved by the platform.
import assert from 'node:assert/strict'
import test from 'node:test'

const gov = await import('../lib/ai/cos/labCustomerGovernedTeacher.ts')
const prompts = Array.from({ length: 24 }, (_, i) => `Explain topic number ${i} in two sentences.`)
const teacher = { providerKind: 'openai', model: 'gpt-x', endpoint: null, apiKey: 'sk-' + 'k'.repeat(40) }
const harnessSpy = (log: any[]) => (async (h: any) => { log.push({ maxCalls: h.maxCalls, concurrency: h.concurrency, keys: Object.keys(h).sort() }); return h.operation({}, new AbortController().signal) }) as any

test('every prompt is one Harness-governed call on the customer key, capped in length, with no price input', async () => {
  const log: any[] = []
  const seen: any[] = []
  const out = await gov.runGovernedTeacher({
    organizationId: 'org', trainingRunId: 'run', teacher, prompts, harness: harnessSpy(log),
    generate: (async (input: any) => { seen.push(input); return { provider: 'openai', model: 'gpt-x', text: `Answer: ${input.request.prompt}`, inputTokens: 5, outputTokens: 5, requestId: null } }) as any,
  })
  assert.equal(out.rows.length, 24)
  assert.equal(out.failures, 0)
  assert.match(out.datasetHash, /^[a-f0-9]{64}$/)
  assert.deepEqual(log, [{ maxCalls: 24, concurrency: 4, keys: ['concurrency', 'maxCalls', 'operation', 'organizationId', 'providerKind', 'trainingRunId'] }])
  assert.equal(seen.length, 24)
  for (const call of seen) {
    assert.equal(call.request.maxOutputTokens, gov.LAB_TEACHER_MAX_OUTPUT_TOKENS)
    assert.equal(Object.values(call.env)[0], teacher.apiKey) // the customer's key, never process.env
    assert.equal('maxPriceUsdPerMTok' in call.request, false)
  }
})

test('failed calls are counted, not hidden; the Harness refusal stops the run', async () => {
  let n = 0
  const out = await gov.runGovernedTeacher({
    organizationId: 'org', trainingRunId: 'run', teacher, prompts, harness: harnessSpy([]),
    generate: (async (input: any) => { if (n++ % 4 === 0) throw new Error('provider_down'); return { text: `A ${input.request.prompt}` } }) as any,
  })
  assert.equal(out.failures, 6)
  assert.equal(out.rows.length, 18)
  await assert.rejects(gov.runGovernedTeacher({
    organizationId: 'org', trainingRunId: 'run', teacher, prompts,
    harness: (async () => { throw new Error('lab_teacher_harness_denied:limits') }) as any,
    generate: (async () => { throw new Error('must not be called') }) as any,
  }), /lab_teacher_harness_denied/)
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'org', trainingRunId: 'run', teacher, prompts: [], harness: harnessSpy([]) }), /lab_prompts_count_invalid/)
})
