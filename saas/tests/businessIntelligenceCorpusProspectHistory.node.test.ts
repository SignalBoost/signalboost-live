import assert from 'node:assert/strict'
import test from 'node:test'
import { validateProspectHistoryObservations, type ProspectHistoryObservation } from '../lib/business-intelligence-corpus/prospect-history.ts'

const at = '2026-08-10T06:00:00.000Z'
const snippet = 'Example Cloud provides managed cloud infrastructure and support services for business customers.'

function observation(overrides: Partial<ProspectHistoryObservation> = {}): ProspectHistoryObservation {
  return {
    jobId: 'job-1',
    name: 'Example Cloud',
    url: 'https://examplecloud.com',
    snippet,
    outcome: 'skipped',
    observedAt: at,
    region: 'US',
    language: 'en',
    ...overrides,
  }
}

test('promotes repeated registrable-root company identity only with reusable profile evidence', () => {
  const candidates = validateProspectHistoryObservations([
    observation(),
    observation({ jobId: 'job-2', observedAt: '2026-08-10T07:00:00.000Z' }),
  ])

  assert.equal(candidates.length, 1)
  const candidate = candidates[0]
  assert.equal(candidate.record.canonicalDomain, 'examplecloud.com')
  assert.equal(candidate.record.companyName, 'Example Cloud')
  assert.equal(candidate.record.description, snippet)
  assert.equal(candidate.record.sourceType, 'learned')
  assert.equal(candidate.record.confidence, 0.8)
  assert.equal(candidate.distinctCampaignJobs, 2)
  assert.equal(candidate.descriptionEvidenceRows, 2)
  assert.equal(candidate.sameDomainContactEvidence, 0)
  assert.deepEqual(candidate.record.sourceIds, ['prospect_campaign_job:job-1', 'prospect_campaign_job:job-2'])
  assert.equal(candidate.record.attributes.externalProviderCalls, 0)
  assert.equal(candidate.record.attributes.externalAiCalls, 0)
})

test('does not count repeated identity-only sightings as ready corpus profiles', () => {
  const candidates = validateProspectHistoryObservations([
    observation({ snippet: null }),
    observation({ jobId: 'job-2', snippet: null }),
  ])
  assert.deepEqual(candidates, [])
})

test('allows one sighting when exact same-domain contact evidence establishes reusable business identity', () => {
  const accepted = validateProspectHistoryObservations([
    observation({
      name: 'Cloud.ru',
      url: 'https://cloud.ru',
      snippet: 'Cloud.ru provides cloud services and AI technology for business customers.',
      detail: 'info@cloud.ru',
      outcome: 'drafted',
      language: 'ru',
      region: 'Russia',
    }),
  ])
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].record.canonicalDomain, 'cloud.ru')
  assert.equal(accepted[0].record.confidence, 0.9)
  assert.deepEqual(accepted[0].record.contacts, [{ email: 'info@cloud.ru' }])

  const rejected = validateProspectHistoryObservations([
    observation({
      name: 'Cloud.ru',
      url: 'https://cloud.ru',
      snippet: null,
      detail: 'cloud@example.net',
      outcome: 'drafted',
    }),
  ])
  assert.equal(rejected.length, 0)
})

test('rejects page titles, subdomains, noncommercial roots, and weak single sightings', () => {
  const candidates = validateProspectHistoryObservations([
    observation({ jobId: 'title-1', name: 'Top Managed Cloud Companies 2026', url: 'https://cloudlist.com' }),
    observation({ jobId: 'title-2', name: 'Top Managed Cloud Companies 2026', url: 'https://cloudlist.com' }),
    observation({ jobId: 'sub-1', name: 'Microsoft Azure', url: 'https://azure.microsoft.com' }),
    observation({ jobId: 'sub-2', name: 'Microsoft Azure', url: 'https://azure.microsoft.com' }),
    observation({ jobId: 'org-1', name: 'Kubernetes', url: 'https://kubernetes.org' }),
    observation({ jobId: 'org-2', name: 'Kubernetes', url: 'https://kubernetes.org' }),
    observation({ jobId: 'weak-1', name: 'SoloCloud', url: 'https://solocloud.com' }),
    observation({ jobId: 'ru-page', name: 'Облачные решения', url: 'https://azone-it.ru', detail: 'info@azone-it.ru', outcome: 'drafted' }),
  ])
  assert.deepEqual(candidates, [])
})

test('deduplicates repeated observations and raises confidence with independent campaign evidence', () => {
  const candidates = validateProspectHistoryObservations(Array.from({ length: 10 }, (_, index) =>
    observation({
      jobId: `job-${index + 1}`,
      name: index === 0 ? 'Example Cloud' : 'ExampleCloud',
      observedAt: `2026-08-10T${String(index).padStart(2, '0')}:00:00.000Z`,
    }),
  ))
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].record.confidence, 0.9)
  assert.equal(candidates[0].distinctCampaignJobs, 10)
  assert.equal(candidates[0].record.companyName, 'ExampleCloud')
})
