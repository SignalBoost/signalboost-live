import type { BuilderToolTrace } from './contracts.ts'

export type RegressionVerdict = Readonly<{ satisfied: true }> | Readonly<{ satisfied: false; reason: string }>

const PROOF_COMMAND = /\b(?:test|spec)\b|node\s+--test|\bnode\s+[\w./-]+\.(?:c?js|mjs)\b|vitest|jest|mocha|\btap\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|\.(?:test|spec)\.[cm]?[jt]sx?\b|(?:^|[\s;&|])(?:npx\s+)?tsc(?:\s|$)|\bnext\s+build\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|type-check|build|prebuild)\b/i

export function isRepairObjective(objective: string): boolean {
  // Conditional recovery instructions and error-handling requirements do not turn a new
  // build into an existing defect. Actual repair requests/claims still require proof.
  const request = String(objective || '').replace(/\bif\s+(?:any\s+)?(?:tests?|checks?)\s+fails?\b[^\n.]*\.?/gi, '')
  if (/\b(?:fix(?:ed)?|repair(?:ed)?|correct(?:ed)?|debug)\b/i.test(request)) return true
  if (/^\s*(?:please\s+)?(?:build|create|write|make)\b/i.test(request)) return false
  return /\b(?:bug|error|failure|broken|regression|crash(?:es|ed)?|failing|defect)\b/i.test(request)
}

function commandOf(trace: BuilderToolTrace): string {
  return typeof trace.input.command === 'string' ? trace.input.command : ''
}

function normalizedCommand(trace: BuilderToolTrace): string {
  return commandOf(trace).trim().replace(/\s+/g, ' ')
}

/**
 * A repair is accepted only with an observed proof failure, a later source change,
 * and a passing rerun of the same proof command. Proof may be a regression test or
 * the narrow typecheck/build command that reproduced a compiler or deployment failure.
 */
export function evaluateRegressionGate(objective: string, trace: readonly BuilderToolTrace[], forceRepair = false): RegressionVerdict {
  if (!forceRepair && !isRepairObjective(objective)) return { satisfied: true }
  const proofRuns = trace
    .map((item, index) => ({ item, index, command: normalizedCommand(item) }))
    .filter(({ item, command }) => item.toolId === 'run' && command && PROOF_COMMAND.test(command))
  const failed = proofRuns.find(({ item }) => !item.ok)
  if (!failed) return { satisfied: false, reason: 'run the narrowest relevant test, typecheck, or build proof before the repair and show it fails' }
  const repair = trace.findIndex((item, index) => index > failed.index && item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
  if (repair < 0) return { satisfied: false, reason: 'make the smallest source repair after the reproduced proof failure' }
  const passed = proofRuns.find(({ item, index, command }) => index > repair && item.ok && command === failed.command)
  if (!passed) return { satisfied: false, reason: 'rerun the same proof command after the repair and show it passes' }
  return { satisfied: true }
}
