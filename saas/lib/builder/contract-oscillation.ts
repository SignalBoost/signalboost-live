// saas/lib/builder/contract-oscillation.ts
import type { BuilderToolTrace } from './contracts.ts'

/**
 * Two consecutive failures of the same proof command where some assertions recovered and others
 * regressed are not partial progress. They mean the deliverables disagree about one contract
 * (field name, value type, or output shape) and each edit satisfies one side by breaking the other.
 * Editing the implementation again cannot converge; the contradiction has to be resolved once.
 */
export type ContractOscillation = Readonly<{
  command: string
  failures: number
  recovered: readonly string[]
  regressed: readonly string[]
}>

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const normalizedCommand = (item: BuilderToolTrace): string => text(item.input.command).trim().replace(/\s+/g, ' ')

function runOutput(item: BuilderToolTrace): string {
  const output = item.output as { stdout?: unknown; stderr?: unknown } | undefined
  return `${text(output?.stdout)}\n${text(output?.stderr)}`
}

/** Assertion names from a node:test run, split by outcome. Unknown formats yield empty sets. */
export function assertionOutcomes(output: string): { passed: Set<string>; failed: Set<string> } {
  const passed = new Set<string>()
  const failed = new Set<string>()
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*([\u2714\u2716])\s+(.+?)(?:\s+\([\d.]+m?s\))?\s*$/.exec(line)
    if (!match) continue
    const name = match[2].trim()
    if (!name) continue
    if (match[1] === '\u2714') passed.add(name)
    else failed.add(name)
  }
  return { passed, failed }
}

export function detectContractOscillation(trace: readonly BuilderToolTrace[]): ContractOscillation | null {
  const byCommand = new Map<string, BuilderToolTrace[]>()
  for (const item of trace) {
    if (item.toolId !== 'run' || item.ok) continue
    const command = normalizedCommand(item)
    if (!command) continue
    byCommand.set(command, [...(byCommand.get(command) || []), item])
  }

  for (const [command, failures] of byCommand) {
    if (failures.length < 2) continue
    const previous = assertionOutcomes(runOutput(failures[failures.length - 2]))
    const latest = assertionOutcomes(runOutput(failures[failures.length - 1]))
    const recovered = [...previous.failed].filter(name => latest.passed.has(name))
    const regressed = [...previous.passed].filter(name => latest.failed.has(name))
    if (recovered.length > 0 && regressed.length > 0) {
      return Object.freeze({ command, failures: failures.length, recovered: Object.freeze(recovered), regressed: Object.freeze(regressed) })
    }
  }
  return null
}

export function formatContractOscillation(signal: ContractOscillation | null): string {
  if (!signal) return ''
  return [
    `CONTRACT CONTRADICTION: \`${signal.command}\` has now failed ${signal.failures} times, and the failures moved instead of shrinking.`,
    `These assertions started passing: ${signal.recovered.join('; ')}.`,
    `These assertions stopped passing: ${signal.regressed.join('; ')}.`,
    'Assertions that trade places prove the deliverables disagree about one contract — a field name, a value type, or an output shape — so satisfying one side breaks the other. Another implementation edit cannot converge.',
    'Do this instead: read the failing expectations, decide the single contract they should share, and change whichever file is inconsistent with it — including the test file, which may be contradicting itself. State the contract you chose in your answer, then rerun the same command.',
  ].join(' ')
}
