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

const askIssoSource = 'Dear AskISSO, We in Paramaribo had the Enterprise Wi Fi installed a few months ago but we are still waiting for it to be activated, how or who could give us info about the status of the activation. We appreciate any info you may have on this. Thank you.'

test('referral-only edits preserve who is responsible for the underlying action', () => {
  const prepared = prepareContextualEdit(askIssoSource, null)
  const anchors = contextualEditAnchorBlock(prepared.anchors)

  assert.match(anchors, /ROUTING\/REFERRAL only/i)
  assert.match(anchors, /Do NOT broaden this into a request for this recipient to provide/i)

  const drifted = 'Dear AskISSO,\n\nWe had Enterprise Wi-Fi installed in Paramaribo a few months ago, but it has not yet been activated. Could you please provide an update on the status of the activation or let us know who we should contact for more information?\n\nThank you.'
  assert.equal(
    contextualEditIntentViolation({ originalSource: askIssoSource, answer: drifted }),
    'recipient_role_expansion',
  )

  const repaired = repairContextualEditDrift({
    originalSource: askIssoSource,
    referenceContext: null,
    answer: drifted,
    language: 'en',
  })
  assert.equal(contextualEditIntentViolation({ originalSource: askIssoSource, answer: repaired }), null)
  assert.doesNotMatch(repaired, /provide an update on the status/i)
  assert.match(repaired, /who or which office we should contact/i)
})

test('the second live AskISSO drift using advise on status is rejected and repaired', () => {
  const liveDrift = 'Dear AskISSO,\n\nWe had Enterprise Wi-Fi installed in Paramaribo a few months ago, but it has not yet been activated. Could you please advise on the status of the activation or direct us to the appropriate contact for this information?\n\nThank you.'

  assert.equal(
    contextualEditIntentViolation({ originalSource: askIssoSource, answer: liveDrift }),
    'recipient_role_expansion',
  )

  const repaired = repairContextualEditDrift({
    originalSource: askIssoSource,
    referenceContext: null,
    answer: liveDrift,
    language: 'en',
  })

  assert.equal(contextualEditIntentViolation({ originalSource: askIssoSource, answer: repaired }), null)
  assert.doesNotMatch(repaired, /advise on the status/i)
  assert.match(repaired, /who or which office we should contact/i)
})

test('referral-only finalization does not depend on enumerating every model synonym', () => {
  const unseenParaphrase = 'Dear AskISSO,\n\nWe had Enterprise Wi-Fi installed in Paramaribo a few months ago. Could you please brief us regarding the activation situation or direct us to the appropriate contact?\n\nThank you.'

  // "brief us regarding the activation situation" is intentionally not part of the lexical
  // violation detector. The structural finalizer must still force the request back to referral-only.
  assert.equal(contextualEditIntentViolation({ originalSource: askIssoSource, answer: unseenParaphrase }), null)

  const repaired = repairContextualEditDrift({
    originalSource: askIssoSource,
    referenceContext: null,
    answer: unseenParaphrase,
    language: 'en',
  })

  assert.doesNotMatch(repaired, /brief us regarding/i)
  assert.match(repaired, /who or which office we should contact/i)
})

test('semantic variants of a direct underlying-status request cannot bypass referral-only scope', () => {
  for (const drifted of [
    'Could you please advise us on the status of the activation?',
    'Could you update us on the activation?',
    'Could you tell us what the status is?',
    'Could you let us know what the status is?',
    'Please provide information on the status.',
    'What is the current status?',
  ]) {
    assert.equal(
      contextualEditIntentViolation({ originalSource: askIssoSource, answer: drifted }),
      'recipient_role_expansion',
      drifted,
    )
  }
})

test('referral wording that uses advise remains referral-only rather than a false direct-status request', () => {
  const source = 'Could you please advise who or which office we should contact for information on the activation status?'
  const prepared = prepareContextualEdit(source, null)
  const anchors = contextualEditAnchorBlock(prepared.anchors)
  assert.match(anchors, /ROUTING\/REFERRAL only/i)
})

test('explicit direct status requests are not incorrectly reduced to referral-only', () => {
  for (const source of [
    'Could you please provide an update on the activation status or let us know who we should contact for more information?',
    'Could you please advise us on the activation status or direct us to the appropriate contact?',
  ]) {
    const prepared = prepareContextualEdit(source, null)
    const anchors = contextualEditAnchorBlock(prepared.anchors)
    assert.doesNotMatch(anchors, /ROUTING\/REFERRAL only/i, source)
  }
})

test('direct editor contract preserves communicative intent and exact request scope', () => {
  const source = readFileSync(join(process.cwd(), 'lib/ai/cos/directTextTransformation.ts'), 'utf8')
  assert.match(source, /Preserve the COMMUNICATIVE INTENT/)
  assert.match(source, /Never broaden the requested action/)
  assert.match(source, /routing\/referral request/)
  assert.match(source, /contextualEditIntentViolation/)
  assert.match(source, /Communicative Intent Guard/)
})
