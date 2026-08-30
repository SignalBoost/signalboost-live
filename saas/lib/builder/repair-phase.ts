import type { BuilderToolTrace } from './contracts.ts'

export type BuilderRepairPhase = 'inspect' | 'reproduce' | 'repair' | 'verify' | 'complete'

const isChange = (item: BuilderToolTrace, initialPaths: ReadonlySet<string>) =>
  item.ok
  && (item.toolId === 'write_file' || item.toolId === 'edit_file')
  && typeof item.input.path === 'string'
  && initialPaths.has(item.input.path)

const isTestCommand = (item: BuilderToolTrace) =>
  item.toolId === 'run'
  && typeof item.input.command === 'string'
  && /\b(?:test|spec)\b|node\s+--test|vitest|jest|mocha|\btap\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test/i.test(item.input.command)

export function deriveRepairPhase(trace: readonly BuilderToolTrace[], initialPaths: ReadonlySet<string>): BuilderRepairPhase {
  if (!trace.some(item => item.ok && item.toolId === 'read_file')) return 'inspect'
  const failedTest = trace.findIndex(item => isTestCommand(item) && !item.ok)
  if (failedTest < 0) return 'reproduce'
  const repairIndex = trace.findIndex(item => isChange(item, initialPaths))
  if (repairIndex < 0) return 'repair'
  const passedAfterRepair = trace.slice(repairIndex + 1).some(item => isTestCommand(item) && item.ok)
  return passedAfterRepair ? 'complete' : 'verify'
}

export function formatRepairPhase(phase: BuilderRepairPhase, recommendedTestCommand: string | null): string {
  const command = recommendedTestCommand ? ` Use \`${recommendedTestCommand}\` unless the reported failure supplies a narrower command.` : ''
  if (phase === 'inspect') return 'REPAIR PHASE: inspect. Read the reported source and the relevant test or manifest before changing code.'
  if (phase === 'reproduce') return `REPAIR PHASE: reproduce. Establish a failing regression test before changing source.${command}`
  if (phase === 'repair') return 'REPAIR PHASE: repair. The failure is reproduced. Make the smallest source change; do not weaken the test.'
  if (phase === 'verify') return `REPAIR PHASE: verify. Rerun the same regression command after the source change and require exit 0.${command}`
  return 'REPAIR PHASE: complete. A failure was reproduced and the same proof passed after a source change.'
}
