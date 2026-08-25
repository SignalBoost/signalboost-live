// saas/tests/learnedEvidencePolicy.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  learnedEvidenceMateriallyMatchesPrompt,
  learnedEvidenceUseRequired,
} from '../lib/ai/cos/learnedEvidencePolicy.ts'

const LEARNED_METADATA_ONLY = ['[CL1] video metadata pointer, no retrieved body']
const WIFI_STRONG = [
  '[CL1] Enterprise Wi-Fi activation delays: controller provisioning, certificate enrollment, VLAN handoff and site activation sequencing. [retrieved content; confidence 0.91; similarity 0.83; official_documentation https://example.test/wifi]',
]
const H100_WEAK = [
  '[CL1] General LLM prompting, retrieval augmented generation and agent orchestration patterns. [retrieved content; confidence 0.88; similarity 0.57; scientific_journal https://example.test/ai]',
]
const H100_STRONG = [
  '[CL1] Distributed training checkpoint synchronization must persist optimizer state, gradient accumulation position and checkpoint generation metadata before cross-region resume. [retrieved content; confidence 0.91; similarity 0.86; scientific_journal https://example.test/checkpoint]',
]

const H100_PROMPT = 'An LLM pretraining job running across 512 H100s needs to be migrated from US-East to EU-North to take advantage of zero-marginal-cost hydro curtailment. Calculate the break-even data egress and network checkpoint synchronization overhead versus power cost savings ($0.11/kWh vs $0.03/kWh), and define the exact state-checkpoint consistency protocol needed to prevent gradient loss.'

test('the exact production failure shape is exempt: an email edit never owes a corpus citation', () => {
  const prompt = 'edit - Dear AskISSO, We in Paramaribo had the Enterprise Wi Fi installed a few months ago but we are still wafting for it to be actived, how or who could give us info about the status of the activation. We appreciate any info you may have on this. Thank you.'
  assert.equal(learnedEvidenceUseRequired(prompt, WIFI_STRONG), false)
})

test('script and draft requests are exempt too', () => {
  for (const prompt of [
    'Write a script that is humorous but also strictly professional, avoids slang, uses short sentences, and maintains compliance tone.',
    'summarize this text for a customer update',
    'translate this paragraph to Spanish',
  ]) {
    assert.equal(learnedEvidenceUseRequired(prompt, WIFI_STRONG), false, prompt)
  }
})

test('strongly matching full-content knowledge evidence still owes a citation', () => {
  assert.equal(learnedEvidenceMateriallyMatchesPrompt('What are the main causes of enterprise Wi-Fi activation delays?', WIFI_STRONG[0]), true)
  assert.equal(learnedEvidenceUseRequired('What are the main causes of enterprise Wi-Fi activation delays?', WIFI_STRONG), true)
})

test('loosely related full-content evidence cannot veto the exact H100 reasoning task', () => {
  assert.equal(learnedEvidenceMateriallyMatchesPrompt(H100_PROMPT, H100_WEAK[0]), false)
  assert.equal(learnedEvidenceUseRequired(H100_PROMPT, H100_WEAK), false)
})

test('genuinely material checkpoint evidence remains mandatory for the H100 task', () => {
  assert.equal(learnedEvidenceMateriallyMatchesPrompt(H100_PROMPT, H100_STRONG[0]), true)
  assert.equal(learnedEvidenceUseRequired(H100_PROMPT, H100_STRONG), true)
})

test('metadata-only learned context never requires citation, for any prompt', () => {
  assert.equal(learnedEvidenceUseRequired('What are the main causes of enterprise Wi-Fi activation delays?', LEARNED_METADATA_ONLY), false)
  assert.equal(learnedEvidenceUseRequired('edit - this email please', []), false)
})
