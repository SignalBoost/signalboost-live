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

test('nontrivial requests do not get incorrectly answered locally', () => {
  const result = decideSupportLocalPreflight({
    prompt: 'Analyze our market position and create a campaign',
    localReply: 'I can help.',
    isPrivileged: false,
  })
  assert.equal(result.handled, false)
})
