import assert from 'node:assert/strict'
import test from 'node:test'
import { decideSupportLocalPreflight } from '../lib/cos-core/layers/autonomy/supportPreflight'

test('simple concierge help can stay local with zero provider calls', () => {
  const result = decideSupportLocalPreflight({
    prompt: 'How do I open the outreach dashboard?',
    localReply: 'Open Grow, then Outreach.',
    isPrivileged: false,
  })
  assert.equal(result.handled, true)
  if (result.handled) {
    assert.equal((result.output as any).source, 'cos-local-preflight')
    assert.equal((result.output as any).providerCalls, 0)
  }
})

test('supported-language greetings can stay local', () => {
  for (const prompt of ['Olá', 'Hola', 'Cześć', 'Привет']) {
    assert.equal(decideSupportLocalPreflight({
      prompt,
      localReply: 'local',
      isPrivileged: false,
    }).handled, true, prompt)
  }
})

test('live-data and privileged requests always escalate', () => {
  assert.equal(decideSupportLocalPreflight({
    prompt: 'What is our MRR today?',
    localReply: 'Local answer',
    isPrivileged: true,
    requiresLiveData: true,
  }).handled, false)

  assert.equal(decideSupportLocalPreflight({
    prompt: 'Hello',
    localReply: 'Hello!',
    isPrivileged: true,
  }).handled, false)
})

test('action-shaped requests never use the zero-provider shortcut', () => {
  for (const prompt of [
    'Help create a campaign',
    'Show me pricing',
    'How do I find companies for outreach?',
    'Help me fix the pipeline',
  ]) {
    assert.equal(decideSupportLocalPreflight({
      prompt,
      localReply: 'Local answer',
      isPrivileged: false,
    }).handled, false, prompt)
  }
})

test('nontrivial requests do not get incorrectly answered locally', () => {
  const result = decideSupportLocalPreflight({
    prompt: 'Analyze our market position and create a campaign',
    localReply: 'I can help.',
    isPrivileged: false,
  })
  assert.equal(result.handled, false)
})
