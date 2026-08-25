import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  contextualEditAnchorBlock,
  contextualEditIntentViolation,
  prepareContextualEdit,
  repairContextualEditDrift,
} from '../lib/ai/cos/contextualEditQuality.ts'

test('referral-only edits preserve who is responsible for the underlying action', () => {
  const source = 'Dear AskISSO, We in Paramaribo had the Enterprise Wi Fi installed a few months ago but we are still waiting for it to be activated, how or who could give us info about the status of the activation. We appreciate any info you may have on this. Thank you.'
  const prepared = prepareContextualEdit(source, null)
  const anchors = contextualEditAnchorBlock(prepared.anchors)

  assert.match(anchors, /ROUTING\/REFERRAL only/i)
  assert.match(anchors, /Do NOT broaden this into a request for this recipient to provide/i)

  const drifted = 'Dear AskISSO,\n\nWe had Enterprise Wi-Fi installed in Paramaribo a few months ago, but it has not yet been activated. Could you please provide an update on the status of the activation or let us know who we should contact for more information?\n\nThank you.'
  assert.equal(
    contextualEditIntentViolation({ originalSource: source, answer: drifted }),
    'recipient_role_expansion',
  )

  const repaired = repairContextualEditDrift({
    originalSource: source,
    referenceContext: null,
    answer: drifted,
    language: 'en',
  })
  assert.equal(contextualEditIntentViolation({ originalSource: source, answer: repaired }), null)
  assert.doesNotMatch(repaired, /provide an update on the status/i)
  assert.match(repaired, /who or which office we should contact/i)
})

test('explicit direct status requests are not incorrectly reduced to referral-only', () => {
  const source = 'Could you please provide an update on the activation status or let us know who we should contact for more information?'
  const prepared = prepareContextualEdit(source, null)
  const anchors = contextualEditAnchorBlock(prepared.anchors)
  assert.doesNotMatch(anchors, /ROUTING\/REFERRAL only/i)
})

test('direct editor contract preserves communicative intent and exact request scope', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /Preserve the COMMUNICATIVE INTENT/)
  assert.match(source, /Never broaden the requested action/)
  assert.match(source, /routing\/referral request/)
  assert.match(source, /contextualEditIntentViolation/)
  assert.match(source, /Communicative Intent Guard/)
})
