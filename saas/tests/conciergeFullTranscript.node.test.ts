import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { formatConciergeTranscript, transcriptMessages } from '../lib/homepageConciergeTranscript.ts'

const turns = [
  { request: 'Original provider-control-plane question', response: 'Return an explicit degraded execution state.' },
  { request: 'Where did you get the answer from?', response: 'Recorded provenance: Qwen on DeepInfra.' },
]

test('follow-up transport retains the complete preceding Concierge exchange', () => {
  const messages = transcriptMessages(turns.slice(0, 1), turns[1].request)
  assert.deepEqual(messages, [
    { role: 'user', content: turns[0].request },
    { role: 'assistant', content: turns[0].response },
    { role: 'user', content: turns[1].request },
  ])
})

test('full transcript export preserves every request and response in order', () => {
  const transcript = formatConciergeTranscript(turns, { request: 'QUESTION', response: 'ANSWER' })
  assert.ok(transcript.indexOf(turns[0].request) < transcript.indexOf(turns[0].response))
  assert.ok(transcript.indexOf(turns[0].response) < transcript.indexOf(turns[1].request))
  assert.ok(transcript.indexOf(turns[1].request) < transcript.indexOf(turns[1].response))
  assert.match(transcript, /QUESTION 1/)
  assert.match(transcript, /ANSWER 2/)
})

test('homepage uses the assistant-style conversation shell without losing transcript controls', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /max-width:1280px/)
  assert.match(source, /className="assistant-header"/)
  assert.match(source, /className="thread"/)
  assert.match(source, /className="message-row user-row"/)
  assert.match(source, /className="message-row assistant-row"/)
  assert.match(source, /transcriptCopy\.chatTitle/)
  assert.match(source, /transcriptMessages\(turns, displayContent\)/)
  assert.match(source, /formatConciergeTranscript\(turns/)
  assert.match(source, /transcriptCopy\.copyFull/)
  assert.match(source, /transcriptCopy\.copyQuestion/)
  assert.match(source, /transcriptCopy\.copyResponse/)
  assert.match(source, /function startNewChat\(\)/)
  assert.match(source, /fetch\('\/api\/concierge'/)
  assert.doesNotMatch(source, /setSentPrompt/)
  assert.doesNotMatch(source, /Hello — I’m COS/)
})
