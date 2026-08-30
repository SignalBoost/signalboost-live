import type { BuilderToolTrace } from './contracts.ts'

export type BuilderRepairPhase = 'inspect' | 'reproduce' | 'repair' | 'verify' | 'complete'

const PROOF_COMMAND = /\b(?:test|spec)\b|node\s+--test|vitest|jest|mocha|\btap\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|\.(?:test|spec)\.[cm]?[jt]sx?\b|(?:^|[\s;&|])(?:npx\s+)?tsc(?:\s|$)|\bnext\s+build\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|type-check|build|prebuild)\b/i

const isChange = (item: BuilderToolTrace, initialPaths: ReadonlySet<string>) =>
  item.ok
  && (item.toolId === 'write_file' || item.toolId === 'edit_file')
  && typeof item.input.path === 'string'
  && initialPaths.has(item.input.path)

const proofCommand = (item: BuilderToolTrace) =>
  item.toolId === 'run' && typeof item.input.command === 'string'
    ? item.input.command.trim().replace(/\s+/g, ' ')
    : ''

const isProofCommand = (item: BuilderToolTrace) => {
  const command = proofCommand(item)
  return Boolean(command) && PROOF_COMMAND.test(command)
}

export function deriveRepairPhase(trace: readonly BuilderToolTrace[], initialPaths: ReadonlySet<string>): BuilderRepairPhase {
  if (!trace.some(item => item.ok && item.toolId === 'read_file')) return 'inspect'
  const failedProof = trace.findIndex(item => isProofCommand(item) && !item.ok)
  if (failedProof < 0) return 'reproduce'
  const failedCommand = proofCommand(trace[failedProof])
  const repairIndex = trace.findIndex((item, index) => index > failedProof && isChange(item, initialPaths))
  if (repairIndex < 0) return 'repair'
  const passedAfterRepair = trace
    .slice(repairIndex + 1)
    .some(item => isProofCommand(item) && item.ok && proofCommand(item) === failedCommand)
  return passedAfterRepair ? 'complete' : 'verify'
}

export function formatRepairPhase(phase: BuilderRepairPhase, recommendedTestCommand: string | null): string {
  const command = recommendedTestCommand ? ` Use \`${recommendedTestCommand}\` unless the reported failure supplies a narrower command.` : ''
  if (phase === 'inspect') return 'REPAIR PHASE: inspect. Read the reported source and the relevant test or manifest before changing code.'
  if (phase === 'reproduce') return `REPAIR PHASE: reproduce. Establish a failing test, typecheck, or build proof before changing source.${command}`
  if (phase === 'repair') return 'REPAIR PHASE: repair. The failure is reproduced. Make the smallest source change; do not weaken the proof.'
  if (phase === 'verify') return `REPAIR PHASE: verify. Rerun the same proof command after the source change and require exit 0.${command}`
  return 'REPAIR PHASE: complete. A failure was reproduced and the same proof passed after a source change.'
}
