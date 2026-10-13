// saas/lib/builder/regression-gate.ts
import type { BuilderToolTrace } from './contracts.ts'

export type RegressionVerdict = Readonly<{ satisfied: true }> | Readonly<{ satisfied: false; reason: string }>

const PROOF_COMMAND = /\b(?:test|spec)\b|node\s+--test|\bnode\s+[\w./-]+\.(?:c?js|mjs)\b|vitest|jest|mocha|\btap\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|\.(?:test|spec)\.[cm]?[jt]sx?\b|(?:^|[\s;&|])(?:npx\s+)?tsc(?:\s|$)|\bnext\s+build\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|type-check|build|prebuild)\b/i

export function isBuilderProvingCommand(command: unknown): boolean {
  return PROOF_COMMAND.test(String(command || '').trim())
}

// Stricter than PROOF_COMMAND: the command itself must invoke a test runner, a test file, a typecheck or a build.
// A passing run of this form is the only evidence that can say a defect is absent; `echo test`, `rg test src` or
// `node scripts/print-env.js` say nothing about it.
const TEST_RUNNER_COMMAND = /^(?:node(?:\s+(?:--(?:import|require|loader|experimental-loader)[=\s]\S+|-[\w-]+(?:=\S+)?))*\s+(?:--test\b|[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?(?:\s|$))|(?:npx\s+)?(?:vitest|jest|mocha|tap|tsc)\b|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|typecheck|type-check|build)\b|(?:npx\s+)?next\s+build\b)/i

export function isBuilderTestRunnerCommand(command: unknown): boolean {
  return TEST_RUNNER_COMMAND.test(String(command || '').trim())
}

const REPAIR_WORDS = /\b(?:fix(?:es|ed|ing)?|repair(?:s|ed|ing)?|correct(?:s|ed|ing)?|debug|bug|bugs|error|errors|failure|failures|broken|regression|regressions|crash(?:es|ed|ing)?|fail(?:s|ed|ing)?|defect|defects|misbehav(?:es|ing)?|malfunction(?:s|ing)?)\b/i

const CREATION_DIRECTIVE = /^(?:please\s+|can\s+you\s+|could\s+you\s+|i\s+need\s+(?:you\s+to\s+)?|i\s+want\s+(?:you\s+to\s+)?|help\s+me\s+)*(?:build|create|write|implement|generate|scaffold|produce|make|design)\b/i

const SUPPLIED_FAILURE_EVIDENCE = /(?:^|\n)\s*(?:[A-Z][A-Za-z]*Error\b|Traceback\b|npm ERR!|error TS\d+)|\bexit code [1-9]\b|\bstack trace\b|\b(?:still|again|keeps?|currently|now)\s+(?:fail(?:s|ing)?|break(?:s|ing)?|broken|crash(?:es|ing)?|erroring)\b|\b(?:this|that|the|my|our)\s+(?:bug|crash|regression|defect)\b|\bdoes(?:n't| not)\s+work\b|\bnot working\b/i

function openingDirective(objective: string): string {
  const line = String(objective || '').split(/\r?\n/).find(item => item.trim().length > 0)
  return line ? line.trim() : ''
}

export function isRepairObjective(objective: string): boolean {
  const value = String(objective || '')
  // Pasted failure evidence is a repair request on its own: a stack trace carries no
  // repair vocabulary ("TypeError" contains no word-boundary "error").
  if (SUPPLIED_FAILURE_EVIDENCE.test(value)) return true
  if (!REPAIR_WORDS.test(value)) return false
  // A creation directive owns the objective: acceptance criteria that mention fixing,
  // errors or failures describe the artifact to be built, not an existing defect.
  return !CREATION_DIRECTIVE.test(openingDirective(value))
}

function commandOf(trace: BuilderToolTrace): string {
  return typeof trace.input.command === 'string' ? trace.input.command : ''
}

/** A run refused as a repeat executed nothing; it is never evidence that a proof failed or passed. */
export function isExecutedBuilderRun(item: BuilderToolTrace): boolean {
  return item.toolId === 'run' && !/^(?:builder_repeated_tool_call:|builder_repository_broad_test_blocked)/.test(String(item.error || ''))
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
    .filter(({ item, command }) => isExecutedBuilderRun(item) && command && PROOF_COMMAND.test(command))
  const failed = proofRuns.find(({ item }) => !item.ok)
  if (!failed) return { satisfied: false, reason: 'run the narrowest relevant test, typecheck, or build proof before the repair and show it fails' }
  const repair = trace.findIndex((item, index) => index > failed.index && item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
  if (repair < 0) return { satisfied: false, reason: 'make the smallest source repair after the reproduced proof failure' }
  const passed = proofRuns.find(({ item, index, command }) => index > repair && item.ok && command === failed.command)
  if (!passed) return { satisfied: false, reason: 'rerun the same proof command after the repair and show it passes' }
  return { satisfied: true }
}
