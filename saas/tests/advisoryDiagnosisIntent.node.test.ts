import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADVISORY_DIAGNOSIS_PROMPT_BLOCK,
  ADVISORY_PROVENANCE_TITLES_REPLY,
  detectAdvisoryDiagnosisIntent,
} from '../lib/ai/cos/advisoryDiagnosisIntent.ts'

test('number-free method prompt is advisory and suppresses freshness abort', () => {
  const prompt = `Advisory method only. No live data.
How should an operator discriminate GPU DVFS, ToR packet pacing, and checkpoint preemption when a dense row has a short power transient?
Hypothesis table, dependence map, next read-only measurements.
Last line: cannot stand behind a single cause.`
  const intent = detectAdvisoryDiagnosisIntent(prompt)
  assert.equal(intent.isAdvisoryDiagnosis, true)
  assert.equal(intent.suppressFreshnessAbort, true)
  assert.equal(intent.wantsProvenanceTitles, false)
})

test('original 1.2 MW vignette is advisory even with numbers', () => {
  const prompt = 'A 1.2 MW high-density compute row experiences a 15% transient spike in collective GPU power draw that threatens a PDU thermal breaker trip within 400 milliseconds. Explain the real-time telemetry control loop and the trade-offs between hardware-level DVFS throttling, packet pacing at the Top-of-Rack (ToR) switch, and preempting non-urgent checkpoint jobs to stabilize load without corrupting active model weights.'
  const intent = detectAdvisoryDiagnosisIntent(prompt)
  assert.equal(intent.isAdvisoryDiagnosis, true)
  assert.equal(intent.suppressFreshnessAbort, true)
})

test('cooling discrimination vignette is advisory', () => {
  const prompt = 'A direct-to-chip liquid cooling loop in a 100 kW per rack deployment shows a secondary supply loop pressure drop of 18 kPa alongside a 7°C Delta-T rise across cold plates in nodes 12–16. Differentiate between a localized flow-channel micro-blockage, a pump cavitational failure, and a CDA heat exchanger bypass malfunction using sensor telemetry.'
  const intent = detectAdvisoryDiagnosisIntent(prompt)
  assert.equal(intent.isAdvisoryDiagnosis, true)
})

test('injected-title question is provenance, not freshness', () => {
  const prompt = 'Which of the 6 injected corpus items were used? Name titles. If the owner advisory-diagnosis brief was injected, quote the section headings you followed.'
  const intent = detectAdvisoryDiagnosisIntent(prompt)
  assert.equal(intent.wantsProvenanceTitles, true)
  assert.equal(intent.suppressFreshnessAbort, true)
  assert.match(ADVISORY_PROVENANCE_TITLES_REPLY.en, /must not invent document titles/i)
})

test('real current-fact questions stay off this path', () => {
  assert.equal(detectAdvisoryDiagnosisIntent('are there direct flights from Paramaribo to Sao Paulo?').isAdvisoryDiagnosis, false)
  assert.equal(detectAdvisoryDiagnosisIntent("what is today's stock price for NVDA?").suppressFreshnessAbort, false)
})

test('prompt block forbids freshness abort and actuation', () => {
  assert.match(ADVISORY_DIAGNOSIS_PROMPT_BLOCK, /not a live current-fact lookup/i)
  assert.match(ADVISORY_DIAGNOSIS_PROMPT_BLOCK, /Do not abort for lack of a current primary source/i)
  assert.match(ADVISORY_DIAGNOSIS_PROMPT_BLOCK, /No facility actuation/i)
  assert.match(ADVISORY_DIAGNOSIS_PROMPT_BLOCK, /cannot stand behind a single cause/i)
})
