import assert from 'node:assert/strict'
import test from 'node:test'
import { decideSupportLocalPreflight } from '../lib/cos-core/layers/autonomy/supportPreflight'

/**
 * Independence acceptance gate.
 * These cases intentionally run without reading or requiring either external
 * provider key. They prove the normal deterministic/local support path remains
 * useful when OpenAI and Anthropic are unavailable.
 */
test('COS handles normal support work without external provider credentials', () => {
  const previousOpenAI = process.env.OPENAI_API_KEY
  const previousAnthropic = process.env.ANTHROPIC_API_KEY

  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  try {
    const cases = [
      ['How do I open the outreach dashboard?', 'Open Grow, then Outreach.'],
      ['Olá', 'Olá!'],
      ['Hola', '¡Hola!'],
      ['Cześć', 'Cześć!'],
      ['Привет', 'Привет!'],
    ] as const

    for (const [prompt, localReply] of cases) {
      const result = decideSupportLocalPreflight({
        prompt,
        localReply,
        isPrivileged: false,
      })

      assert.equal(result.handled, true, prompt)
      if (result.handled) {
        assert.equal((result.output as any).providerCalls, 0, prompt)
        assert.equal((result.output as any).source, 'cos-local-preflight', prompt)
      }
    }
  } finally {
    if (previousOpenAI === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousOpenAI
    if (previousAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = previousAnthropic
  }
})

test('provider independence does not weaken escalation safety', () => {
  delete process.env.OPENAI_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  const requests = [
    { prompt: 'What is our MRR today?', requiresLiveData: true, isPrivileged: true },
    { prompt: 'Analyze our market position and create a campaign', isPrivileged: false },
    { prompt: 'Help me fix the pipeline', isPrivileged: false },
  ]

  for (const request of requests) {
    const result = decideSupportLocalPreflight({
      ...request,
      localReply: 'Local answer',
    })
    assert.equal(result.handled, false, request.prompt)
  }
})
