import test from 'node:test'
import assert from 'node:assert/strict'

import * as publicCampaign from '../lib/outreach/prospectCampaign.ts'
import * as coreCampaign from '../lib/outreach/prospectCampaignCore.ts'

test('public prospect campaign surface delegates directly to the proven core worker', () => {
  assert.equal(publicCampaign.createProspectCampaignJob, coreCampaign.createProspectCampaignJob)
  assert.equal(publicCampaign.advanceProspectCampaigns, coreCampaign.advanceProspectCampaigns)
  assert.equal(publicCampaign.getProspectCampaignJob, coreCampaign.getProspectCampaignJob)
})
