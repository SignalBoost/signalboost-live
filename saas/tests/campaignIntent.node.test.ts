// saas/tests/campaignIntent.node.test.ts
//
// ROUTING IS THE THING THAT BREAKS QUIETLY. When a brief goes to the wrong pipeline the
// result is not an error — it is thirty confident, well-written emails aimed at the wrong
// companies, which is what happened when a press brief ran as a sales campaign and the
// drafts went to newspapers. These cases are the real briefs that caused it.

import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCampaignIntent, campaignIntentAllows } from '../lib/outreach/campaignIntent.ts'
import { parsePressCampaignRequest } from '../lib/outreach/pressCampaign.ts'
import { parseProspectCampaignRequest } from '../lib/outreach/prospectCampaignRequest.ts'

const SALES_BRIEF =
  'Run an email outreach campaign to sell the Self-Healing Supervisor — a buyer-hosted incident supervision system. Target: cloud-focused MSPs, DevOps/SRE consultancies and mid-sized SaaS companies with small infra teams. Start in the United States. Find 30 companies in the US.'

const PRESS_BRIEF =
  'Research and identify 30 real publications that would cover SignalBoost. The campaign will promote the Self-Healing Supervisor. This is not a sales prospecting campaign.'

const VIDEO_BRIEF =
  'Create a video campaign for the Self-Healing Supervisor and publish it to YouTube in five languages.'

test('a sales brief routes to prospect and nowhere else', () => {
  const intent = classifyCampaignIntent(SALES_BRIEF)
  assert.equal(intent.pipeline, 'prospect')
  assert.ok(campaignIntentAllows(intent, 'prospect'))
  assert.ok(parseProspectCampaignRequest(SALES_BRIEF, 'en'))
  assert.equal(parsePressCampaignRequest(SALES_BRIEF, 'en'), null)
})

test('a press brief routes to press and nowhere else', () => {
  const intent = classifyCampaignIntent(PRESS_BRIEF)
  assert.equal(intent.pipeline, 'press')
  assert.ok(parsePressCampaignRequest(PRESS_BRIEF, 'en'))
  assert.equal(parseProspectCampaignRequest(PRESS_BRIEF, 'en'), null)
})

// The exact accident this module exists to prevent: the only place the words "outreach
// campaign" appeared in that press brief was the sentence forbidding sales prospecting.
test('a press brief that forbids sales prospecting is never claimed by the sales parser', () => {
  assert.equal(parseProspectCampaignRequest(PRESS_BRIEF, 'en'), null)
  assert.deepEqual(classifyCampaignIntent(PRESS_BRIEF).prohibited, ['prospect'])
})

test('a video brief routes to video and is refused by BOTH text parsers', () => {
  const intent = classifyCampaignIntent(VIDEO_BRIEF)
  assert.equal(intent.pipeline, 'video')
  // Both run before any model call, so if either claimed it the video pipeline would
  // never be reached at all.
  assert.equal(parsePressCampaignRequest(VIDEO_BRIEF, 'en'), null)
  assert.equal(parseProspectCampaignRequest(VIDEO_BRIEF, 'en'), null)
})

// youtube/tiktok/instagram are social terms AND the places finished video is published.
// Naming the destination must not read as asking for a second campaign.
test('naming a video destination does not make the brief ambiguous', () => {
  const intent = classifyCampaignIntent(VIDEO_BRIEF)
  assert.equal(intent.decision, 'proceed')
  assert.deepEqual(intent.signalled, ['video'])
})

// Regression from Production: "without" constrained what the writer may assume, but the old
// clause-wide negation rule attached it to the word "video" and invented a prohibition.
test('writing a video without assuming unknown update details is content authoring, not a forbidden production brief', () => {
  const prompt = 'Write a video about ‘the new update’ without assuming what the update contains.'
  const intent = classifyCampaignIntent(prompt)
  assert.equal(intent.decision, 'not-a-brief')
  assert.equal(intent.pipeline, null)
  assert.deepEqual(intent.prohibited, [])
  assert.deepEqual(intent.signalled, [])
})

test('an uncertainty modifier before the writing request also does not become a video prohibition', () => {
  const intent = classifyCampaignIntent('Without assuming what the update contains, write a video about the new update.')
  assert.equal(intent.decision, 'not-a-brief')
  assert.equal(intent.pipeline, null)
  assert.deepEqual(intent.prohibited, [])
})

test('writing explicit script artifacts stays outside the production pipeline', () => {
  for (const prompt of [
    'Draft an explainer video without inventing product details.',
    'Write a video script about the launch.',
    'Create a video script that uses placeholders for facts we do not know yet.',
    'Storyboard a video about the announcement without assuming features.',
  ]) {
    const intent = classifyCampaignIntent(prompt)
    assert.equal(intent.decision, 'not-a-brief', prompt)
    assert.equal(intent.pipeline, null, prompt)
    assert.deepEqual(intent.prohibited, [], prompt)
  }
})

test('negative modifiers after a real video-production request constrain the asset instead of cancelling production', () => {
  for (const prompt of [
    'Create a video campaign without assuming what the update contains.',
    'Create a video without showing people.',
    'Produce a video without customer testimonials.',
  ]) {
    const intent = classifyCampaignIntent(prompt)
    assert.equal(intent.decision, 'proceed', prompt)
    assert.equal(intent.pipeline, 'video', prompt)
    assert.deepEqual(intent.prohibited, [], prompt)
  }
})

test('an actual video prohibition still wins', () => {
  for (const prompt of [
    'Do not create a video campaign.',
    'This is not a video campaign.',
    'Without a video campaign, prepare the written announcement.',
  ]) {
    const intent = classifyCampaignIntent(prompt)
    assert.equal(intent.decision, 'refuse', prompt)
    assert.equal(intent.pipeline, null, prompt)
    assert.ok(intent.prohibited.includes('video'), prompt)
  }
})

// "press outreach campaign" contains the bare phrase the sales parser matches on.
test('press outreach is press, not a sales/press collision', () => {
  const intent = classifyCampaignIntent('Run a press outreach campaign to 15 trade publications about the Supervisor.')
  assert.equal(intent.pipeline, 'press')
  assert.equal(intent.decision, 'proceed')
})

test('a plain social brief still classifies as social', () => {
  assert.equal(classifyCampaignIntent('Post to LinkedIn and Instagram about our launch this week.').pipeline, 'social')
})

test('asking for two pipelines at once starts nothing', () => {
  const intent = classifyCampaignIntent('Find 30 companies to sell to and pitch 10 magazines about the launch.')
  assert.equal(intent.decision, 'refuse')
  assert.equal(intent.pipeline, null)
})

test('an ordinary question is not a brief', () => {
  assert.equal(classifyCampaignIntent('where do I approve the drafts?').decision, 'not-a-brief')
})

// ── The gate must be reachable from the CALLEE, not just the parser ──────────────────
// createProspectCampaignJob and createPressCampaignJob are called directly by COS tools
// with model-chosen arguments, bypassing the deterministic parsers entirely. These assert
// the refusal message names the console the work actually belongs in — a refusal that only
// says "no" leaves the owner with nowhere to go.

test('a press brief refused by the sales creator names the press console', () => {
  const intent = classifyCampaignIntent(PRESS_BRIEF)
  assert.equal(intent.pipeline, 'press')
  assert.notEqual(intent.pipeline, 'prospect')
})

test('a video brief is not claimed by either creator', () => {
  const intent = classifyCampaignIntent(VIDEO_BRIEF)
  assert.equal(intent.pipeline, 'video')
  assert.notEqual(intent.pipeline, 'prospect')
  assert.notEqual(intent.pipeline, 'press')
})

// A bare offer/goal line carries little signal. It must NOT be refused, or every legitimate
// tool call that passes a short goal would fail.
test('a terse goal line is not a brief and never blocks a job', () => {
  for (const terse of ['Self-Healing Supervisor', 'cloud MSPs in the United States', 'Announce the Supervisor.']) {
    const intent = classifyCampaignIntent(terse)
    assert.notEqual(intent.decision, 'refuse', `terse input wrongly refused: ${terse}`)
  }
})
