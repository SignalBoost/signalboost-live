import assert from 'node:assert/strict'
import test from 'node:test'
import { tryCOSFirstAnswer } from '../lib/ai/cos/cosFirstAnswer'

const originalFetch = global.fetch
const originalBaseUrl = process.env.LOCAL_AI_BASE_URL
const originalModel = process.env.LOCAL_AI_MODEL
const originalThreshold = process.env.COS_LOCAL_CONFIDENCE_THRESHOLD

function configureLocal() {
  process.env.LOCAL_AI_BASE_URL = 'http://localhost:8000/v1'
  process.env.LOCAL_AI_MODEL = 'cos-test'
  process.env.COS_LOCAL_CONFIDENCE_THRESHOLD = '0.72'
}

function restore() {
  global.fetch = originalFetch
  if (originalBaseUrl === undefined) delete process.env.LOCAL_AI_BASE_URL
  else process.env.LOCAL_AI_BASE_URL = originalBaseUrl
  if (originalModel === undefined) delete process.env.LOCAL_AI_MODEL
  else process.env.LOCAL_AI_MODEL = originalModel
  if (originalThreshold === undefined) delete process.env.COS_LOCAL_CONFIDENCE_THRESHOLD
  else process.env.COS_LOCAL_CONFIDENCE_THRESHOLD = originalThreshold
}

test('COS returns a local answer before cloud fallback when confidence clears the gate', async () => {
  configureLocal()
  global.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ answer: 'Local COS answer', confidence: 0.77 }) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const result = await tryCOSFirstAnswer({ prompt: 'Explain database latency under load.', language: 'English' })
    assert.equal(result.handled, true)
    if (!result.handled) return
    assert.equal(result.reply, 'Local COS answer')
    assert.equal(result.provenance.externalAiInvoked, false)
    assert.equal(result.provenance.localModelInvoked, true)
    assert.equal(result.confidence, 0.77)
  } finally {
    restore()
  }
})

test('COS escalates rather than bluffing when local confidence is below threshold', async () => {
  configureLocal()
  global.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ answer: 'Uncertain local answer', confidence: 0.51 }) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })

  try {
    const result = await tryCOSFirstAnswer({ prompt: 'Solve an unfamiliar hard problem.', language: 'English' })
    assert.equal(result.handled, false)
    if (result.handled) return
    assert.equal(result.provenance.externalAiInvoked, false)
    assert.equal(result.provenance.localModelInvoked, true)
    assert.match(result.reason, /below escalation threshold/)
  } finally {
    restore()
  }
})
