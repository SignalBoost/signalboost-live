import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { formatConciergeTranscript, transcriptMessages } from '../lib/homepageConciergeTranscript.ts'
import {
  conciergePromptWithScenarioRule,
  looksLikePrivateDataRefusal,
  shouldClarifyUserSuppliedScenario,
} from '../lib/homepageConciergePolicy.ts'

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

test('financing and governance scenarios are recognized as user-supplied task premises', () => {
  const financing = `The company has 4 months of runway. Investor A offers a $5M bridge note with board vetoes; Investor B offers a down-round. Structure the decision matrix comparing dilution, governance control, employee retention, and solvency.`
  assert.equal(shouldClarifyUserSuppliedScenario(financing), true)
  assert.equal(shouldClarifyUserSuppliedScenario('Where did you get the answer from?'), false)

  const transport = conciergePromptWithScenarioRule(financing)
  assert.match(transport, /user-provided task premises/i)
  assert.match(transport, /Do not refuse merely because the scenario describes a private company/i)
  assert.match(transport, /USER REQUEST:/)
})

test('observed private-data refusal wording triggers one bounded corrective retry', () => {
  const refusal = `The specific financial metrics are not public information. As a public-facing assistant, I do not have access to the company's private financial records. Therefore, I cannot provide a factual analysis of this specific scenario without private data.`
  assert.equal(looksLikePrivateDataRefusal(refusal), true)
  assert.equal(looksLikePrivateDataRefusal('I would compare dilution, governance control, retention, and solvency using the supplied terms.'), false)
})

test('homepage restores a welcome-first front door and retains the assistant-style conversation shell', () => {
  const source = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /max-width:1280px/)
  assert.match(source, /className="welcome-card"/)
  assert.match(source, /copy\.welcomeQuestion/)
  assert.match(source, /copy\.platformHome/)
  assert.match(source, /href="\/home"/)
  assert.match(source, /className="assistant-header"/)
  assert.match(source, /className="thread"/)
  assert.match(source, /className="message-row user-row"/)
  assert.match(source, /className="message-row assistant-row"/)
  assert.match(source, /transcriptMessages\(turns, transportPrompt\)/)
  assert.match(source, /shouldClarifyUserSuppliedScenario\(displayContent\)/)
  assert.match(source, /looksLikePrivateDataRefusal\(reply\)/)
  assert.match(source, /formatConciergeTranscript\(turns/)
  assert.match(source, /copy\.copyFull/)
  assert.match(source, /copy\.copyQuestion/)
  assert.match(source, /copy\.copyResponse/)
  assert.match(source, /function startNewChat\(\)/)
  assert.match(source, /fetch\('\/api\/concierge'/)
  assert.doesNotMatch(source, /setSentPrompt/)
  assert.doesNotMatch(source, /Hello — I’m COS/)
})
