import assert from 'node:assert/strict'
import test from 'node:test'
import { looksLikeArtifactContinuation } from '../lib/ai/cos/artifactContinuationIntent.ts'
import {
  clearConversationArtifactContext,
  peekConversationArtifactContext,
} from '../lib/ai/cos/cosArtifactConversationContext.ts'
import { resolveFreshConversationContext } from '../lib/ai/cos/cosFreshConversationContext.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { detectDirectTextTransformation, splitQuotedEmailThread } from '../lib/ai/cos/textTransformationInput.ts'

const originalRequest = `edit - Dear AskISSO, We in Paramaribo had the Enterprise Wi Fi installed a few months ago but we are still wafting for it to be actived, how or who could give us info about the status of the activation. We appreciate any info you may have on this. Thank you.`

const editedEmail = `Dear AskISSO,

We had Enterprise Wi-Fi installed in Paramaribo a few months ago, but it is still not active. Could you please provide an update on the activation status or let us know who we should contact for more information?

We appreciate your assistance.

Thank you.`

const followup = 'what would be the subject line for this email?'

test('subject-line follow-up reuses the immediately preceding draft as an editable artifact', () => {
  clearConversationArtifactContext()
  const body = {
    messages: [
      { role: 'user', content: originalRequest },
      { role: 'assistant', content: editedEmail },
      { role: 'user', content: followup },
    ],
  }

  const resolution = resolveFreshConversationContext(body, followup)
  assert.equal(resolution.lookupInput, followup)
  assert.equal(resolution.contextUsed, false)
  assert.equal(requiresFreshExternalEvidence(followup), false)

  const captured = peekConversationArtifactContext(followup)
  assert.ok(captured)
  assert.equal(captured.assistantArtifact, editedEmail)
  assert.match(captured.previousUserText || '', /Enterprise Wi Fi/i)

  const transformation = detectDirectTextTransformation(followup)
  assert.ok(transformation)
  assert.equal(transformation.instruction, followup)

  const split = splitQuotedEmailThread(transformation.sourceText)
  assert.equal(split.editableSource, editedEmail)
  assert.match(split.referenceContext || '', /Original Message/i)
  assert.match(split.referenceContext || '', /Enterprise Wi Fi/i)
  clearConversationArtifactContext()
})

test('terse style follow-up works even when the new prompt contains no source text', () => {
  clearConversationArtifactContext()
  const body = {
    messages: [
      { role: 'user', content: 'Draft a short email asking for an activation update.' },
      { role: 'assistant', content: 'Could you please provide an update on the activation?' },
      { role: 'user', content: 'shorter' },
    ],
  }

  resolveFreshConversationContext(body, 'shorter')
  const transformation = detectDirectTextTransformation('shorter')
  assert.ok(transformation)
  assert.equal(transformation.instruction, 'shorter')
  assert.match(transformation.sourceText, /provide an update/i)
  clearConversationArtifactContext()
})

test('artifact continuation never searches past an intervening user turn for an older draft', () => {
  clearConversationArtifactContext()
  const body = {
    messages: [
      { role: 'user', content: originalRequest },
      { role: 'assistant', content: editedEmail },
      { role: 'user', content: 'Let us switch topics and discuss the network inventory.' },
      { role: 'user', content: followup },
    ],
  }

  resolveFreshConversationContext(body, followup)
  assert.equal(peekConversationArtifactContext(followup), null)
  assert.equal(detectDirectTextTransformation(followup), null)
  clearConversationArtifactContext()
})

test('a new inline draft is never replaced by the preceding assistant artifact', () => {
  clearConversationArtifactContext()
  const newEdit = 'edit - Hi John, please send me the updated report by Friday. Thank you.'
  const body = {
    messages: [
      { role: 'user', content: originalRequest },
      { role: 'assistant', content: editedEmail },
      { role: 'user', content: newEdit },
    ],
  }

  resolveFreshConversationContext(body, newEdit)
  assert.equal(peekConversationArtifactContext(newEdit), null)
  const transformation = detectDirectTextTransformation(newEdit)
  assert.ok(transformation)
  assert.match(transformation.sourceText, /Hi John/i)
  assert.doesNotMatch(transformation.sourceText, /Enterprise Wi-Fi/i)
  clearConversationArtifactContext()
})

test('explicit factual verification is not converted into artifact editing', () => {
  clearConversationArtifactContext()
  const input = 'verify the current law mentioned in this email'
  assert.equal(looksLikeArtifactContinuation(input), false)

  const body = {
    messages: [
      { role: 'user', content: 'Edit this email about a legal requirement.' },
      { role: 'assistant', content: 'A prior draft containing an unverified legal claim.' },
      { role: 'user', content: input },
    ],
  }
  resolveFreshConversationContext(body, input)
  assert.equal(peekConversationArtifactContext(input), null)
  assert.equal(detectDirectTextTransformation(input), null)
  clearConversationArtifactContext()
})

test('merely referring to an email does not automatically make the turn an editing request', () => {
  assert.equal(looksLikeArtifactContinuation('what is the current status of this email?'), false)
  assert.equal(looksLikeArtifactContinuation(followup), true)
})

test('live or current headline lookups remain factual requests', () => {
  const input = 'what is the latest headline today?'
  assert.equal(looksLikeArtifactContinuation(input), false)
  assert.equal(requiresFreshExternalEvidence(input), true)
})
