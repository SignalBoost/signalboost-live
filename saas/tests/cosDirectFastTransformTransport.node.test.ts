import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isFastTextTransform } from '../lib/ai/cos/fastTextTransformIntent.ts'
import { splitQuotedEmailThread } from '../lib/ai/cos/quotedEmailThread.ts'

test('middleware fast edits delegate to the canonical COS editor', () => {
  const fast = readFileSync(join(process.cwd(), 'app/api/cos-fast-transform/route.ts'), 'utf8')
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')

  assert.match(fast, /provenanceBrowserPost/)
  assert.match(fast, /headers\.delete\('x-signalboost-fast-transform-attempted'\)/)
  assert.doesNotMatch(fast, /runDirectFastTextEdit/)
  assert.doesNotMatch(fast, /cos-fast-text-edit-direct/)

  assert.match(primary, /!fastEditAlreadyAttempted&&isFastTextTransform\(input/)
  assert.match(primary, /feature:'cos_fast_text_transform'/)
  assert.match(primary, /deepseek-ai\/DeepSeek-V4-Flash-0731/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_ATTEMPT_MS = 7_000/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 15_000/)
})


test('middleware uses the shared contextual classifier', () => {
  const proxy = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8')
  assert.match(proxy, /fastTextTransformRequest\(req\)/)
  assert.match(proxy, /isFastTextTransform\(latestUser, \{ previousAssistant \}\)/)
  assert.match(proxy, /target\.pathname = '\/api\/cos-fast-transform'/)
  assert.doesNotMatch(proxy, /DIRECT_FAST_TEXT_TRANSFORM/)
})

test('edit prefix cannot swallow a factual CAP question', () => {
  assert.equal(
    isFastTextTransform('edit - can you explain what CAPs are and who is allowed to open them?'),
    false,
  )
  assert.equal(
    isFastTextTransform('edit - I see, sorry, they came last week. I think they are called CAPs. They come unclassified and must be opened by cleared Americans.'),
    true,
  )
  assert.equal(
    isFastTextTransform('fix grammar of the following: they came last week and must be opened by cleared Americans.'),
    true,
  )
})

test('terse edit continuation requires a real prior draft', () => {
  assert.equal(isFastTextTransform('shorten', { previousAssistant: 'This is a usable draft that can be shortened.' }), true)
  assert.equal(isFastTextTransform('edit', { previousAssistant: 'COS could not complete this text edit within the fast-path deadline.' }), false)
})

// Regression (owner report 2026-10-15): "edit - <reply>" followed by a pasted Outlook thread whose
// quoted messages ask questions was classified as a NEW QUESTION, skipped the fast edit lane, and the
// page stopped waiting before COS answered. Only the user's own draft decides whether it is a question.
const QUOTED_THREAD_EDIT = [
  'edit - Thank you Sam, since they contacted my supervisors, shall i send yo the TA and you forward to them? - as those are taxi expenses during my trip. See below.',
  '',
  'Sam',
  '',
  'From: Reviewer, Alex <alex@example.org>',
  'Sent: Thursday, October 15, 2026 9:32 AM',
  'To: Sam Example <sam@example.org>',
  'Subject: FW: Transactions requiring clarification',
  '',
  'Hi Sam,',
  '',
  'Can you please check with the traveler about these transactions? It looks like a travel authorization is needed.',
  '',
  'From: Program Office <office@example.org>',
  'Sent: Thursday, October 15, 2026 7:15 AM',
  'To: Reviewer, Alex <alex@example.org>',
  'Subject: Transactions requiring clarification',
  '',
  'Please let us know if you have any questions or concerns.',
].join('\n')

test('questions inside a pasted email thread do not turn an edit into a new question', () => {
  assert.equal(isFastTextTransform(QUOTED_THREAD_EDIT), true)
  // The user's own question is still a question even when a thread follows it.
  assert.equal(
    isFastTextTransform(`edit - can you explain what a travel authorization is?\n\n${QUOTED_THREAD_EDIT.split('\n').slice(4).join('\n')}`),
    false,
  )
})

test('the fast lane gives COS the complete request, without rule-based draft extraction', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(primary, /userRequest:input/)
  assert.match(primary, /prompt:input,/)
  assert.doesNotMatch(primary, /fastTextTransformPrompt/)
})

// Owner report 2026-10-15 ("it did a terrible editing"): the edit returned the replied-to person's
// message, signature and the SBU banner as if the owner had written them.
test('a handling banner above a quoted header belongs to the thread, not the draft', () => {
  const pasted = [
    'edit - thanks, i will send it today - as discussed. See below. Please send the form.',
    '',
    'Sam',
    'Sam Example',
    'Office Chief',
    '',
    'SBU - PRIVACY OR PII',
    'From: Reviewer, Alex <alex@example.org>',
    'Sent: Thursday, October 15, 2026 9:32 AM',
    'To: Sam Example <sam@example.org>',
    'Subject: Form',
    '',
    'Hi Sam, please send the form.',
  ].join('\n')
  const split = splitQuotedEmailThread(pasted)
  assert.doesNotMatch(split.editableSource, /SBU - PRIVACY OR PII/)
  assert.match(String(split.referenceContext), /^SBU - PRIVACY OR PII\nFrom: Reviewer, Alex/)
  // A user's own sentence is never mistaken for a banner when no quoted header follows it.
  assert.equal(splitQuotedEmailThread('edit - Confidential matters aside, thanks.').referenceContext, null)
})

test('the fast editor drafts and is independently reviewed against the whole request', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(primary, /systemPrompt:FAST_EDIT_AUTHOR_INSTRUCTIONS,/)
  assert.match(primary, /systemPrompt:FAST_EDIT_REVIEW_INSTRUCTIONS,/)
  assert.match(primary, /runSelfReviewedEdit\(/)
})
