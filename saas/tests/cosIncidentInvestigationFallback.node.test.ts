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
  assert.match(answer, /Message redelivery or replay without end-to-end idempotency/)
  assert.match(answer, /Revenue reports are 2% higher than bank deposits/)
  assert.match(answer, /No production records were inspected/)
  assert.doesNotMatch(answer, /To answer it properly I need|authoritative image/)
})

test('ordinary diagnosis and unrelated incident remain on general fallback', () => {
  assert.equal(incidentInvestigationFallback('Why did GEN-2 fail during the test?'), null)
  assert.equal(incidentInvestigationFallback('Investigate a Kubernetes outage and propose experiments.'), null)
})

test('unseen PostgreSQL growth incident gets a domain-specific forensic brief, not the payment answer', () => {
  const prompt = [
    'You are incident commander. Only investigate; do not write code or create files.',
    'A PostgreSQL database suddenly grows by 40% overnight.',
    'No deployments occurred. CPU usage is normal. Disk I/O doubled. Backup jobs succeeded.',
    'Identify root causes, rank causes, explain correlations, missing evidence, forensic plan, experiments, interacting faults, and most likely explanation.',
  ].join('\n')
  const answer = buildHonestRefusalReply({ prompt, language: 'en' })
  assert.match(answer, /Database-side amplification/)
  assert.match(answer, /Scheduled maintenance/)
  assert.match(answer, /WAL/)
  assert.match(answer, /1\. Plausible causes/)
  assert.match(answer, /8\. Single most likely working explanation/)
  assert.doesNotMatch(answer, /Kafka|bank deposits|PSP/)
})

test('incident-specific investigation is not fabricated for ordinary questions', () => {
  const answer = buildHonestRefusalReply({ prompt: 'What is PostgreSQL?', language: 'en' })
  assert.doesNotMatch(answer, /Incident investigation — preliminary/)
})
