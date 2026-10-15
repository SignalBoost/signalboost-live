import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fastTextTransformPrompt, isFastTextTransform } from '../lib/ai/cos/fastTextTransformIntent.ts'
import { splitQuotedEmailThread } from '../lib/ai/cos/quotedEmailThread.ts'
import { fastTextEditReplyIsClean } from '../lib/ai/cos/fastTextEditQuality.ts'

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
  assert.match(primary, /FAST_TEXT_TRANSFORM_ATTEMPT_MS = 9_000/)
  assert.match(primary, /FAST_TEXT_TRANSFORM_TIMEOUT_MS = 18_000/)
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

test('the fast editor edits only the draft and receives the thread as read-only context', () => {
  const prompt = fastTextTransformPrompt(QUOTED_THREAD_EDIT)
  const [draft, rest] = prompt.split('REFERENCE CONTEXT')
  assert.match(draft, /^edit - Thank you Sam/)
  assert.doesNotMatch(draft, /From: Reviewer/)
  assert.match(rest, /never edit, quote, summarize, or include it in the answer/)
  assert.match(rest, /<<<CONTEXT\nFrom: Reviewer, Alex/)
  assert.match(rest, /Please let us know if you have any questions or concerns\.\nCONTEXT$/)
  // A draft without a quoted thread is sent unchanged.
  assert.equal(fastTextTransformPrompt('edit - they came last week.'), 'edit - they came last week.')
  // The primary fast lane sends the structured prompt, never the raw thread.
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  assert.match(primary, /const fastPrompt=fastTextTransformPrompt\(input\)/)
  assert.match(primary, /prompt:fastPrompt,/)
  assert.doesNotMatch(primary, /feature:'cos_fast_text_transform'[\s\S]{0,900}prompt:input,/)
})

const COPIED_SIGNATURE_EDIT = [
  'edit - Thank you Morgan, because the office contacted my supervisors, can I send you the authorization for forwarding? The costs were taxis during my assignment. Please see the correspondence below.',
  '',
  '',
  'Morgan',
  '',
  'Morgan A. Example',
  'Regional Technology Lead',
  'Operations/Regional Center',
  'Teams: +1 202 555 0101',
  'image',
  '',
  'SBU - PRIVACY OR PII',
  'From: Reviewer, Taylor <reviewer@example.org>',
  'Sent: Thursday, October 15, 2026 9:32 AM',
  'To: Morgan <morgan@example.org>',
  'Subject: FW: Clarification needed',
  '',
  'Hello Morgan,',
  '',
  'Can you please follow up about these expenses?',
].join('\\n')

test('copied sender signature and confidentiality footer are read-only, not editable source', () => {
  const split = splitQuotedEmailThread(COPIED_SIGNATURE_EDIT)
  assert.match(split.editableSource, /Thank you Morgan/)
  assert.match(split.editableSource, /taxis during my assignment/)
  assert.doesNotMatch(split.editableSource, /Morgan A\\. Example|Teams:|PRIVACY OR PII|From:/)
  assert.match(split.referenceContext || '', /^Morgan\\s*\\n/)
  assert.match(split.referenceContext || '', /Morgan A\\. Example/)
  assert.match(split.referenceContext || '', /From: Reviewer/)
  const fast = fastTextTransformPrompt(COPIED_SIGNATURE_EDIT)
  assert.doesNotMatch(fast.split('REFERENCE CONTEXT')[0], /Regional Technology Lead|Teams:/)
  assert.match(fast, /REFERENCE CONTEXT/)
  assert.equal(isFastTextTransform(COPIED_SIGNATURE_EDIT), true)
})

test('ordinary user-authored sign-off remains editable even when quoting a thread', () => {
  const source = [
    'edit - Hi Morgan, please find the attached draft.',
    '',
    'Best regards,',
    'Jordan',
    '',
    'From: Reviewer, Taylor <reviewer@example.org>',
    'Sent: October 15, 2026',
    'To: Jordan <jordan@example.org>',
    'Subject: Attached draft',
  ].join('\\n')
  const split = splitQuotedEmailThread(source)
  assert.match(split.editableSource, /Best regards,\\nJordan$/)
  assert.doesNotMatch(split.editableSource, /From: Reviewer/)
})

test('COS fast answer rejects copied headers and prior sender signature, accepts clean rewrite', () => {
  const clean = 'Hi Morgan,\\n\\nSince the office contacted my supervisors, may I send you the travel authorization to forward? The taxi expenses were incurred during my assignment.'
  const contaminated = 'Thank you Morgan. Morgan A. Example Regional Technology Lead Teams: +1 202 555 0101 SBU - PRIVACY OR PII'
  assert.equal(fastTextEditReplyIsClean({originalPrompt:COPIED_SIGNATURE_EDIT,reply:clean}),true)
  assert.equal(fastTextEditReplyIsClean({originalPrompt:COPIED_SIGNATURE_EDIT,reply:contaminated}),false)
  assert.equal(fastTextEditReplyIsClean({originalPrompt:COPIED_SIGNATURE_EDIT,reply:'From: Taylor\\nSent: 2026-10-15'}),false)
  assert.equal(fastTextEditReplyIsClean({originalPrompt:COPIED_SIGNATURE_EDIT,reply:'Edited message. Morgan A. Example'}),false)
})

test('fast editor requires substantive business prose and validates model output before release', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'),'utf8')
  assert.match(primary, /skilled professional editor, not a transcription or minimal-spelling-correction service/)
  assert.match(primary, /fastTextEditReplyIsClean\\(\\{originalPrompt:input,reply\\}\\)/)
  assert.match(primary, /restoreCorrespondenceLayout\\(reply,reply\\)/)
})
