import { runBuilderPlaywrightCliLiveAcceptance } from './playwright-cli-live-acceptance.ts'
import type { StateSnapshotPort, StateSnapshotRef } from '../portable/state-snapshot-port.ts'

export type BuilderProductionAcceptanceOutcome = Readonly<{
  outcome: 'accepted' | 'rolled_back' | 'unresolved'
  detail: string
}>

function rollbackTarget(snapshotId: string): StateSnapshotRef {
  return Object.freeze({
    snapshotId,
    scope: 'deployment',
    provider: 'vercel',
    capturedAt: new Date().toISOString(),
    restorable: true,
  })
}

/**
 * A READY deployment is necessary but not sufficient proof that Builder fixed Production.
 * Run the real browser acceptance before a repository repair can become terminal success.
 * If acceptance fails, restore the exact pre-merge deployment when possible.
 */
export async function acceptBuilderProductionRepair(input: {
  preMergeSnapshotId: string
  snapshotPort: StateSnapshotPort | null
  runAcceptance?: typeof runBuilderPlaywrightCliLiveAcceptance
}): Promise<BuilderProductionAcceptanceOutcome> {
  const runAcceptance = input.runAcceptance ?? runBuilderPlaywrightCliLiveAcceptance
  let acceptance: Awaited<ReturnType<typeof runBuilderPlaywrightCliLiveAcceptance>>
  try {
    acceptance = await runAcceptance()
  } catch (error) {
    return Object.freeze({ outcome: 'unresolved', detail: 'Builder Production verifier could not execute. No rollback was attempted.' })
  }

  if (acceptance.ok) {
    return Object.freeze({
      outcome: 'accepted',
      detail: 'The merged deployment reached READY and passed Builder Playwright live Production acceptance.',
    })
  }

  const failedChecks = Array.isArray(acceptance.checks)
    ? acceptance.checks.filter((check: any) => !check?.passed).map((check: any) => String(check?.name || 'unknown')).slice(0, 6)
    : []
  const evidence = failedChecks.length ? ` Failed checks: ${failedChecks.join(', ')}.` : ''

  if (!input.snapshotPort || !input.preMergeSnapshotId) {
    return Object.freeze({
      outcome: 'unresolved',
      detail: `Builder Playwright live Production acceptance failed.${evidence} No rollback checkpoint was available.`,
    })
  }

  const restore = await Promise.resolve(input.snapshotPort.restore(rollbackTarget(input.preMergeSnapshotId)))
    .catch(error => ({ ok: false, error: error instanceof Error ? error.message : 'unknown' }))

  if (!restore.ok) {
    return Object.freeze({
      outcome: 'unresolved',
      detail: `Builder Playwright live Production acceptance failed.${evidence} Automatic rollback also failed (${restore.error || 'no detail'}).`,
    })
  }

  return Object.freeze({
    outcome: 'rolled_back',
    detail: `Builder Playwright live Production acceptance failed.${evidence} Production was rolled back to ${input.preMergeSnapshotId}.`,
  })
}
