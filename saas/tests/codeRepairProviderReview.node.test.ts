import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ProviderBackedCodeRepairPatchGenerator,
  createCodeRepairPatchProposal,
  independentlyReviewCodeRepair,
} from '../lib/code-repair/index.ts'
import type {
  CodeRepairModelProvider,
  CodeRepairPlan,
  CodeRepairPatchValidationReport,
} from '../lib/code-repair/index.ts'

const plan: CodeRepairPlan = {
  planId: 'repair-plan:test', incidentId: 'incident:test', diagnosisFingerprint: 'fingerprint',
  problem: 'Incorrect addition', rationale: 'The implementation subtracts instead of adding.', riskLevel: 'low',
  filesToInspect: ['src/math.ts'], filesAllowedToModify: ['src/math.ts'], testsToRun: ['npm test'],
  steps: [], requiresHumanApproval: true, patchGenerationAllowed: false, patchApplicationAllowed: false, mergeAllowed: false,
}

const diff = 'diff --git a/src/math.ts b/src/math.ts\n--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1 +1 @@\n-export const add = (a:number,b:number) => a - b\n+export const add = (a:number,b:number) => a + b\n'

function provider(content: string, finishReason: 'stop' | 'length' | 'refusal' | 'error' = 'stop'): CodeRepairModelProvider {
  return { complete: async () => ({ provider: 'test-provider', model: 'test-model', content, finishReason }) }
}

test('provider-backed generator returns only the unified diff', async () => {
  const generator = new ProviderBackedCodeRepairPatchGenerator(provider(`Here is the patch:\n\`\`\`diff\n${diff}\`\`\``))
  const generated = await generator.generate({ plan, baseCommitSha: 'abc123', fileContents: { 'src/math.ts': 'export const add = (a:number,b:number) => a - b\n', 'src/secret.ts': 'hidden' } })
  assert.equal(generated, diff)
  const proposal = createCodeRepairPatchProposal(plan, 'abc123', generated)
  assert.deepEqual(proposal.files.map(file => file.path), ['src/math.ts'])
  assert.equal(proposal.applicationAllowed, false)
})

test('provider-backed generator fails closed on refusal and missing diff', async () => {
  const refused = new ProviderBackedCodeRepairPatchGenerator(provider('', 'refusal'))
  await assert.rejects(() => refused.generate({ plan, baseCommitSha: 'abc123', fileContents: {} }), /did not complete successfully/)
  const prose = new ProviderBackedCodeRepairPatchGenerator(provider('No patch available.'))
  await assert.rejects(() => prose.generate({ plan, baseCommitSha: 'abc123', fileContents: {} }), /did not return a unified diff/)
})

test('independent reviewer approves only when validation passed', async () => {
  const proposal = createCodeRepairPatchProposal(plan, 'abc123', diff)
  const validation: CodeRepairPatchValidationReport = {
    proposalId: proposal.proposalId, validated: true, results: [], cleanupSucceeded: true,
    repositoryModified: false, networkAccessAllowed: false,
  }
  const review = await independentlyReviewCodeRepair(provider(JSON.stringify({ verdict: 'approve', confidence: 0.91, summary: 'Scoped fix is supported.', findings: [] })), { plan, proposal, validation })
  assert.equal(review.verdict, 'approve')
  assert.equal(review.validationPassed, true)
  assert.equal(review.requiresHumanApproval, true)
  assert.equal(review.applicationAllowed, false)
  assert.equal(review.mergeAllowed, false)
})

test('independent reviewer overrides approval when validation failed', async () => {
  const proposal = createCodeRepairPatchProposal(plan, 'abc123', diff)
  const validation: CodeRepairPatchValidationReport = {
    proposalId: proposal.proposalId, validated: false, results: [], cleanupSucceeded: true,
    repositoryModified: false, networkAccessAllowed: false,
  }
  const review = await independentlyReviewCodeRepair(provider(JSON.stringify({ verdict: 'approve', confidence: 0.99, summary: 'Looks good.', findings: [] })), { plan, proposal, validation })
  assert.equal(review.verdict, 'reject')
  assert.equal(review.validationPassed, false)
  assert.match(review.summary, /Validation did not pass/)
})
