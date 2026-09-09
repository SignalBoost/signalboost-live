import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveConciergeVisualObjective } from '../lib/visuals/conversationIntent.ts'
import { publicConciergeIdentityReply } from '../lib/ai/cos/publicConciergeIdentity.ts'

test('the reported iTMounts logo conversation remains in the visual lane', () => {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  const turns = [
    'design the new lname and logo for the plaftorm itmounts',
    'design a new logo for the platform - the new name name is itmounts',
    'the new name of the platform is itmounts - how would you design the new name?',
    'thnak you for suggestion, but your design is not very creative, can you do something better than that?',
    'i did not ask for your suggestions, i want the design',
  ]

  for (const turn of turns) {
    messages.push({ role: 'user', content: turn })
    const objective = resolveConciergeVisualObjective(messages, turn)
    assert.ok(objective, `expected visual objective for: ${turn}`)
    assert.match(objective, /logo/i)
    messages.push({ role: 'assistant', content: 'model prose must not control routing' })
  }

  const employer = 'what is the name of your employer?'
  messages.push({ role: 'user', content: employer })
  assert.equal(resolveConciergeVisualObjective(messages, employer), null)
})

test('public employer questions cannot reach a model hallucination', () => {
  assert.deepEqual(publicConciergeIdentityReply('what is the name of your employer?'), {
    reply: 'I’m iTMounts Concierge, an AI assistant—not a person—so I do not have an employer.',
    source: 'concierge-public-identity',
  })
  assert.equal(publicConciergeIdentityReply('Who employs the Department of State?'), null)
})

test('visual success copy is blocked without a renderable preview', async () => {
  const source = await readFile(new URL('../app/api/cos-browser/route.ts', import.meta.url), 'utf8')
  assert.match(source, /visual_delivery_unverified/)
  assert.match(source, /I will not claim it was delivered/)
  assert.match(source, /existingPreview/)
})
