import assert from 'node:assert/strict'
import test from 'node:test'
import { domainCompatibleContext, foundationalDomainMatches } from '../lib/ai/cos/contextRelevance.ts'

const incident = 'Production is healthy according to Vercel, but customers report intermittent 500 errors. There were no deployments in the last six hours. Give me an investigation plan that minimizes the risk of making the incident worse.'

test('unknown-domain query no longer makes every candidate relevant', () => {
  assert.equal(foundationalDomainMatches(incident).length, 0)
  assert.equal(
    domainCompatibleContext(incident, 'Randomized clinical trial of cardiovascular biomarkers and patient mortality outcomes.'),
    false,
  )
})

test('unknown-domain query can still admit evidence with meaningful lexical anchors', () => {
  assert.equal(
    domainCompatibleContext(incident, 'Vercel production incident: intermittent 500 errors were isolated by endpoint and deployment state.'),
    true,
  )
})

test('known SRE domain still admits same-domain operational evidence', () => {
  const query = 'How should an SRE diagnose tenant-specific tail latency without production mutation?'
  const candidate = 'Site reliability engineering incident diagnosis uses traces, RED metrics and tenant segmentation for tail latency.'
  assert.ok(foundationalDomainMatches(query).some(match => match.id === 'sre'))
  assert.equal(domainCompatibleContext(query, candidate), true)
})
