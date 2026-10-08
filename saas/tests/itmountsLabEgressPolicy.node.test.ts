import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeLabEgress, type LabPrivacyTier, type LabEgressKind } from '../lib/ai/cos/itmountsLabEgressPolicy.ts'

const tiers: LabPrivacyTier[] = ['PRIVATE', 'AGGREGATE_METRICS', 'RESEARCH_OPT_IN']
const kinds: LabEgressKind[] = ['aggregate_metrics','research_dataset','raw_artifact','model_weights','training_records','provider_credentials','audit_logs']
const base = {
  verifiedByHarness: true as const,
  sourceOrganizationId: 'tenant-a',
  destinationOrganizationId: 'tenant-b',
  explicitResearchConsent: true,
  rightsCleared: true,
  aggregateOnly: true,
}

test('cross-tenant egress matrix defaults to denial for raw artifacts, weights, records, credentials and logs', () => {
  for (const tier of tiers) for (const kind of kinds) {
    const accepted = authorizeLabEgress(tier,kind,base)
    const expected = tier !== 'PRIVATE' && (kind === 'aggregate_metrics' || tier === 'RESEARCH_OPT_IN' && kind === 'research_dataset')
    assert.equal(accepted,expected,`${tier} / ${kind}`)
  }
})
test('research data needs explicit consent and rights clearance even for opted-in tier', () => {
  assert.equal(authorizeLabEgress('RESEARCH_OPT_IN','research_dataset',{...base,explicitResearchConsent:false}),false)
  assert.equal(authorizeLabEgress('RESEARCH_OPT_IN','research_dataset',{...base,rightsCleared:false}),false)
  assert.equal(authorizeLabEgress('AGGREGATE_METRICS','research_dataset',base),false)
})
test('aggregate sharing requires aggregate-only proof', () => {
  for (const tier of tiers) assert.equal(authorizeLabEgress(tier,'aggregate_metrics',{...base,aggregateOnly:false}),false)
})
test('missing harness verification or destination fails closed', () => {
  assert.equal(authorizeLabEgress('RESEARCH_OPT_IN','aggregate_metrics',{...base,verifiedByHarness:false as any}),false)
  assert.equal(authorizeLabEgress('RESEARCH_OPT_IN','aggregate_metrics',{...base,destinationOrganizationId:null}),false)
  assert.equal(authorizeLabEgress('RESEARCH_OPT_IN','aggregate_metrics',{...base,destinationOrganizationId:'tenant-a'}),false)
  assert.equal(authorizeLabEgress('UNRECOGNIZED' as LabPrivacyTier,'aggregate_metrics',base),false)
  assert.equal(authorizeLabEgress('RESEARCH_OPT_IN','unrecognized' as LabEgressKind,base),false)
})
