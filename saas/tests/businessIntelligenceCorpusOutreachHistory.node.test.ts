import assert from 'node:assert/strict'
import test from 'node:test'
import { outreachRowToCorpusRecord } from '../lib/business-intelligence-corpus/outreach-history.ts'

test('existing outreach intelligence becomes reusable corpus knowledge without provider calls', () => {
  const record = outreachRowToCorpusRecord({
    id: 'queue-1',
    business_id: 'business-1',
    source_platform: 'cos',
    business_name: 'Example Cloud',
    business_url: 'https://www.examplecloud.com/services',
    contact_email: 'ops@examplecloud.com',
    status: 'sent',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
    analyzer_summary: {
      industry: 'Cloud Services',
      country: 'US',
      employee_count: 250,
      technologies: ['AWS', 'Kubernetes'],
      confidence_score: 91,
    },
    business_model_profile: { description: 'Managed cloud services' },
    predictive_needs: { likelyNeed: 'incident automation' },
    website_json: { technologies: ['Terraform'] },
    review_strategy: {},
    social_plan: {},
    promo_plan: {},
  })

  assert.ok(record)
  assert.equal(record?.canonicalDomain, 'examplecloud.com')
  assert.equal(record?.companyName, 'Example Cloud')
  assert.equal(record?.confidence, 0.91)
  assert.equal(record?.sourceType, 'learned')
  assert.deepEqual(record?.sourceIds, ['queue-1'])
  assert.deepEqual(record?.contacts, [{ email: 'ops@examplecloud.com' }])
  assert.deepEqual(record?.technologies, ['AWS', 'Kubernetes', 'Terraform'])
  assert.equal(record?.attributes.previouslyResearched, true)
  assert.equal(record?.attributes.paidDiscoveryReuse, true)
})

test('rows without a reusable company domain are skipped instead of triggering enrichment', () => {
  const record = outreachRowToCorpusRecord({ id: 'bad', business_name: 'Unknown', business_url: '' })
  assert.equal(record, null)
})
