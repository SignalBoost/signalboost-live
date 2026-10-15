import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FAST_EDIT_AUTHOR_INSTRUCTIONS,
  FAST_EDIT_REVIEW_INSTRUCTIONS,
  parseFastEditReview,
  runSelfReviewedEdit,
} from '../lib/ai/cos/selfReviewTextEdit.ts'

const contexts = [
  {
    request: 'edit - Thanks Riley, could I send the document to you so you can forward it?\\n\\nRiley\\nSenior Director\\nPhone: 555-0100\\n\\nFrom: Reviewer\\nSubject: Request\\nPlease review this document.',
    first: 'Thanks Riley, could I send the document to you so you can forward it? Riley Senior Director Phone: 555-0100',
    corrected: 'Hi Riley,\\n\\nCould I send you the document to forward to the reviewer?\\n\\nThank you.',
  },
  {
    request: 'polish - hey team i want to say the meeting tomorrow maybe we can start later\\n\\n--- Original Message ---\\nPlease confirm the meeting schedule.',
    first: 'hey team i want to say the meeting tomorrow maybe we can start later',
    corrected: 'Hi team,\\n\\nWould it be possible to start tomorrow’s meeting a little later?',
  },
  {
    request: 'rewrite - the file is there and i checked it but if the server needs be reset ask me first.',
    first: 'The file is there. I checked it, and I will reset the server.',
    corrected: 'I confirmed that the file is present. Please ask me before resetting the server.',
  },
]

test('COS model-driven reviewer can correct scope, contamination and poor language in diverse text edits', async () => {
  for (const example of contexts) {
    let reviewedPrompt = ''
    const result = await runSelfReviewedEdit({
      userRequest: example.request,
      draft: async () => example.first,
      review: async ({ userRequest, candidate }) => {
        reviewedPrompt = userRequest
        assert.equal(candidate, example.first)
        return JSON.stringify({ verdict: 'repaired', answer: example.corrected })
      },
    })
    assert.equal(reviewedPrompt, example.request)
    assert.deepEqual(result, { verdict: 'repaired', answer: example.corrected })
  }
})

test('unverified, malformed or unresolved neural reviews cannot be released as successful edits', async () => {
  for (const response of [null, '', 'not JSON', '{"verdict":"unresolved","answer":"Guess"}', '{"verdict":"pass","answer":""}', '{"verdict":"pass","answer":45}']) {
    assert.equal(parseFastEditReview(response), null)
    let called = false
    const result = await runSelfReviewedEdit({
      userRequest: 'proofread - Example text to edit.',
      draft: async () => 'Example text to edit.',
      review: async () => { called = true; return response },
    })
    assert.equal(called, true)
    assert.equal(result, null)
  }
})

test('valid approved edits are retained, while a missing first draft never starts review', async () => {
  assert.deepEqual(parseFastEditReview('{"verdict":"pass","answer":"Complete edit."}'),
    { verdict: 'pass', answer: 'Complete edit.' })
  let reviewCalled = false
  assert.equal(await runSelfReviewedEdit({
    userRequest: 'edit - any message',
    draft: async () => null,
    review: async () => { reviewCalled = true; return '{"verdict":"pass","answer":"No"}' },
  }), null)
  assert.equal(reviewCalled, false)
})

test('generic semantic and editorial quality contract is model-led, not tied to one email or sender', () => {
  assert.match(FAST_EDIT_AUTHOR_INSTRUCTIONS, /Interpret the entire user request/)
  assert.match(FAST_EDIT_AUTHOR_INSTRUCTIONS, /Edit ONLY the material the user is asking to edit/)
  assert.match(FAST_EDIT_REVIEW_INSTRUCTIONS, /evaluate and if necessary REPAIR/)
  assert.match(FAST_EDIT_REVIEW_INSTRUCTIONS, /substantive/)
  // Owner report 2026-10-15: the edit kept the replied-to person's sentence that followed the draft on
  // the same line and invented a sign-off. Authorship is decided by who writes to whom.
  assert.match(FAST_EDIT_AUTHOR_INSTRUCTIONS, /can end in the middle of a line/)
  assert.match(FAST_EDIT_AUTHOR_INSTRUCTIONS, /Add no greeting, sign-off, name or signature/)
  assert.match(FAST_EDIT_REVIEW_INSTRUCTIONS, /text addressed to the user that followed their draft on the same line/)
  const source = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const fast = source.slice(source.indexOf('async function runFastTextTransform('), source.indexOf('export const FAST_AUTHORING_TIMEOUT_MS'))
  assert.match(fast, /runSelfReviewedEdit\(/)
  assert.match(fast, /prompt:input,/)
  assert.match(fast, /fast_editor_quality_review/)
  assert.doesNotMatch(fast, /return\\{reply:parsed\\.answer|const fastPrompt=fastTextTransformPrompt/)
  assert.match(fast, /return null/)
})
