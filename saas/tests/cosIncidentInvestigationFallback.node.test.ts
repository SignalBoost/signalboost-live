import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildHonestRefusalReply, incidentInvestigationFallback } from '../lib/ai/cos/honestRefusalReply.ts'

const incident = readFileSync(new URL('./fixtures/cos-incident-analysis-brief.txt', import.meta.url), 'utf8')

test('exact production payment incident receives all eight investigation tasks even on fallback', () => {
  const answer = buildHonestRefusalReply({ prompt: incident, language: 'en' })
  for (const section of [
    '1. Plausible causes:', '2. Ranked working hypotheses',
    '3. Correlation versus causation:', '4. Missing evidence:',
    '5. Forensic plan:', '6. Controlled experiments',
    '7. Combined-fault pathway:', '8. Single most likely working explanation:',
  ]) assert.ok(answer.includes(section), section)
  assert.match(answer, /Kafka at-least-once replay/)
  assert.match(answer, /Revenue reports are 2% higher than bank deposits/)
  assert.match(answer, /No production records were inspected/)
  assert.doesNotMatch(answer, /To answer it properly I need|authoritative image/)
})

test('ordinary diagnosis and unrelated incident remain on general fallback', () => {
  assert.equal(incidentInvestigationFallback('Why did GEN-2 fail during the test?'), null)
  assert.equal(incidentInvestigationFallback('Investigate a Kubernetes outage and propose experiments.'), null)
})
