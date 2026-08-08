import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseProspectCampaignRequest,
  prospectCampaignQueuedReply,
  prospectCampaignQueueError,
} from '../lib/outreach/prospectCampaignRequest.ts'

test('parses the owner Self-Healing Supervisor campaign into a durable job', () => {
  const parsed = parseProspectCampaignRequest(`You are my AI Chief of Staff for SignalBoost. Run an email outreach campaign to sell the Self-Healing Supervisor — a buyer-hosted incident supervision and controlled remediation system. It diagnoses operational failures, executes only approved actions, requires human approval for every consequential change, keeps customer data inside the buyer’s own environment, and creates signed audit evidence integrated with the buyer’s SIEM.

Target: cloud-focused MSPs, DevOps/SRE consultancies, managed cloud-service providers, and mid-sized SaaS companies with small infra teams — managing AWS/Azure/GCP/Kubernetes, no competing automated-remediation product of their own. Start in the United States. Find 10.`, 'en')

  assert.ok(parsed)
  assert.equal(parsed.requestedCount, 10)
  assert.equal(parsed.region, 'the United States')
  assert.equal(parsed.language, 'en')
  assert.match(parsed.offer, /^the Self-Healing Supervisor/)
  assert.match(parsed.offer, /signed audit evidence/)
  assert.match(parsed.targetCriteria, /^cloud-focused MSPs/)
  assert.match(parsed.targetCriteria, /no competing automated-remediation product/)
  assert.doesNotMatch(parsed.targetCriteria, /Find 10|Start in/)
})

test('campaign brief language overrides the dashboard language', () => {
  const parsed = parseProspectCampaignRequest(`Run an email outreach campaign to sell SignalBoost.
Target: cloud consultancies and MSPs.
Region: Poland — Language: Polish — Find 10 companies.`, 'en')
  assert.ok(parsed)
  assert.equal(parsed.region, 'Poland')
  assert.equal(parsed.language, 'pl')
})

test('natural email-language instruction is honored', () => {
  const parsed = parseProspectCampaignRequest('Run an email outreach campaign to sell SignalBoost. Target: cloud MSPs. The emails should be in Russian. Region: Russia. Find 10 companies.', 'en')
  assert.ok(parsed)
  assert.equal(parsed.language, 'ru')
})

test('target market supplies the language when a brief omits it', () => {
  const brazil = parseProspectCampaignRequest('Run an email outreach campaign to sell SignalBoost. Target: cloud MSPs. Region: Brazil. Find 10 companies.', 'en')
  const mexico = parseProspectCampaignRequest('Run an email outreach campaign to sell SignalBoost. Target: cloud MSPs. Region: Mexico. Find 10 companies.', 'en')
  assert.equal(brazil?.language, 'pt')
  assert.equal(mexico?.language, 'es')
})

test('does not turn a read-only prospect list into an outreach campaign', () => {
  const parsed = parseProspectCampaignRequest('Find 20 strong potential buyers in the United States. Do not contact anyone. Only produce the researched prospect list for my review.', 'en')
  assert.equal(parsed, null)
})

test('safety language that forbids sending still permits pending-draft creation', () => {
  const parsed = parseProspectCampaignRequest('Run an email outreach campaign to sell SignalBoost. Target: cloud MSPs. Find 5. Do not contact anyone or send anything without my approval.', 'en')
  assert.ok(parsed)
  assert.equal(parsed.requestedCount, 5)
})

test('an explicit instruction not to create the campaign is respected', () => {
  const parsed = parseProspectCampaignRequest('Do not run an email outreach campaign. Find 10 MSPs for research only.', 'en')
  assert.equal(parsed, null)
})

test('parser preserves requested campaign size; worker owns the sanity bound', () => {
  const parsed = parseProspectCampaignRequest('Build an outreach campaign to sell SignalBoost. Target: cloud consultancies. Find 100 companies.', 'en')
  assert.ok(parsed)
  assert.equal(parsed.requestedCount, 100)
})

test('queue replies are explicit that no external action occurred', () => {
  const reply = prospectCampaignQueuedReply({
    jobId: 'job-123',
    requestedCount: 10,
    region: 'United States',
    language: 'en',
  })
  assert.match(reply, /job job-123/)
  assert.match(reply, /Nothing has been sent/)
  assert.match(reply, /no company has been contacted/)
  assert.match(reply, /approval/)
})

test('queue errors replace the generic transport failure with an owner diagnostic', () => {
  const reply = prospectCampaignQueueError('relation prospect_campaign_jobs does not exist', 'en')
  assert.match(reply, /could not queue the job/)
  assert.match(reply, /Nothing was sent/)
  assert.match(reply, /prospect_campaign_jobs/)
})
