/**
 * Level 4 Builder V2 certification evidence gate.
 * This module does NOT grant certification or enqueue live jobs. Callers must
 * supply host-authenticated receipts, workspace inventory, and publication proof.
 */
import { builderV2Acceptance, type BuilderV2Checkpoint } from './agent-v2.ts'
import type { BuilderV2Receipt } from './agent-v2-dispatcher.ts'

export const BUILDER_LEVEL4_OBJECTIVE = [
  'Create these files:',
  'package.json',
  'src/catalog.js',
  'src/orders.js',
  'test/catalog.test.js',
  'test/orders.test.js',
  'Run:',
  'npm test',
  'node --test test/*.test.js',
  'At least 4 tests must pass.',
].join('\n')

export type BuilderLevel4Evidence = Readonly<{
  workspaceFiles: readonly string[]
  receipts: readonly BuilderV2Receipt[]
  checkpointBefore?: BuilderV2Checkpoint
  checkpointAfter?: BuilderV2Checkpoint
  publication?: Readonly<{ pullRequestUrl: string; verifiedRevision: number }>
}>

export function evaluateBuilderLevel4(evidence: BuilderLevel4Evidence) {
  const reasons: string[] = []
  const acceptance = builderV2Acceptance(BUILDER_LEVEL4_OBJECTIVE, evidence.workspaceFiles, evidence.receipts)
  if (!acceptance.satisfied) reasons.push('multi_file_acceptance_unverified')
  const lastEdit = evidence.receipts.findLastIndex(item => item.changed)
  const failedTest = evidence.receipts.findIndex(item => item.tool === 'run_tests' && !item.ok)
  if (failedTest < 0 || failedTest >= lastEdit) reasons.push('failure_repair_not_observed')
  const before = evidence.checkpointBefore
  const after = evidence.checkpointAfter
  if (!before || !after || before.workspaceId !== after.workspaceId ||
    before.objectiveDigest !== after.objectiveDigest ||
    after.steps.length <= before.steps.length ||
    after.revision < before.revision) reasons.push('checkpoint_continuation_unverified')
  const pr = evidence.publication
  if (!pr || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(pr.pullRequestUrl) ||
    !after || pr.verifiedRevision !== after.revision ||
    after.verifiedRevision !== after.revision) reasons.push('verified_pull_request_unavailable')
  return Object.freeze({ passed: reasons.length === 0, reasons: Object.freeze(reasons), acceptance })
}
