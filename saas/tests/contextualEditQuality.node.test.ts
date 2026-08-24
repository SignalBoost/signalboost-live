import assert from 'node:assert/strict'
import test from 'node:test'
import {
  contextualEditAnchorBlock,
  prepareContextualEdit,
  repairContextualEditDrift,
} from '../lib/ai/cos/contextualEditQuality.ts'

const draft = [
  'Hi Dwight, thank you for let me know and for your concern - if you are thinking about cancelling it because of me, do not worry.',
  'At the end of the day, this is at the moment a person post, if I do not do it you will have to do it.',
  'We do what we have to do, and it is whatever is need to support the mission.',
  '',
  'Regards,',
  'Luis de Andrade',
].join('\n')

const context = [
  'From: Dwight <dwight@example.com>',
  'Wanted to check in with you to see if you still wanted to support the outbound flight on Thursday morning.',
  'Supporting this late night/early morning flight will be tough and even tougher with having to be onsite as the only DT person on Thursday.',
  'Let me know if you want me to cancel the outbound shipment for this month and hold it for next month.',
].join('\n')

test('Dwight-style rough draft is semantically normalized before model editing', () => {
  const prepared = prepareContextualEdit(draft, context)
  assert.match(prepared.editableSource, /one-person post/i)
  assert.doesNotMatch(prepared.editableSource, /a person post/i)
  const block = contextualEditAnchorBlock(prepared.anchors)
  assert.match(block, /NOT "personal post"/i)
  assert.match(block, /outbound shipment/i)
  assert.match(block, /must state that answer explicitly/i)
})

test('final edit guard repairs personal-post drift and vague cancellation wording', () => {
  const poorCosAnswer = [
    'Hi Dwight,',
    '',
    'Thank you for letting me know and for your concern. If you are considering cancelling this because of me, please do not worry. At the moment, this is a personal post; if I do not handle it, you will need to do it. We simply do what is necessary to support the mission.',
    '',
    'Best regards,',
    'Luis de Andrade',
  ].join('\n')

  const repaired = repairContextualEditDrift({
    originalSource: draft,
    referenceContext: context,
    answer: poorCosAnswer,
    language: 'en',
  })

  assert.match(repaired, /one-person post/i)
  assert.doesNotMatch(repaired, /personal post/i)
  assert.match(repaired, /cancell(?:ing|ing) the outbound shipment/i)
  assert.match(repaired, /I’m fine supporting the outbound flight on Thursday morning\./i)
  assert.match(repaired, /Best regards,/i)
})
