import type { BuilderToolTrace } from './contracts.ts'

export type RegressionVerdict = Readonly<{ satisfied: true }> | Readonly<{ satisfied: false; reason: string }>

const TEST_COMMAND = /\b(?:test|spec)\b|node\s+--test|vitest|jest|mocha|\btap\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|\.(?:test|spec)\.[cm]?[jt]sx?\b/i

export function isRepairObjective(objective: string): boolean {
  return /\b(?:fix|repair|bug|error|failure|broken|regression|crash|failing|defect)\b/i.test(String(objective || ''))
}

function commandOf(trace: BuilderToolTrace): string {
  return typeof trace.input.command === 'string' ? trace.input.command : ''
}

/**
 * A repair is accepted only with an observed regression failure, a source change,
 * and a later passing regression command. Existing test files may be used; Builder
 * writes a new test only when the workspace has no suitable reproducer.
 */
export function evaluateRegressionGate(objective: string, trace: readonly BuilderToolTrace[]): RegressionVerdict {
  if (!isRepairObjective(objective)) return { satisfied: true }
  const testRuns = trace.map((item, index) => ({ item, index })).filter(({ item }) => item.toolId === 'run' && TEST_COMMAND.test(commandOf(item)))
  const failed = testRuns.find(({ item }) => !item.ok)
  if (!failed) return { satisfied: false, reason: 'run an existing or new regression test before the repair and show it fails' }
  const repair = trace.findIndex((item, index) => index > failed.index && item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
  if (repair < 0) return { satisfied: false, reason: 'make the smallest source repair after the reproduced test failure' }
  const passed = testRuns.find(({ item, index }) => index > repair && item.ok)
  if (!passed) return { satisfied: false, reason: 'rerun the regression test after the repair and show it passes' }
  return { satisfied: true }
}
