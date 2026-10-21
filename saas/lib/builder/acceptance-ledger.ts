import type { BuilderV2Receipt } from './agent-v2-dispatcher.ts'

export type BuilderCommandEvidence = Readonly<{
  command: string
  passed: boolean
  receiptIndex: number
  exitCode: number | null
}>

export type BuilderAcceptanceLedger = Readonly<{
  applicable: boolean
  passed: boolean
  failureCode: string | null
  commands: readonly BuilderCommandEvidence[]
  latestSourceChangeIndex: number
  initialFailureReproduced: boolean
}>

/**
 * Verify separately requested test commands against host receipts, not model prose.
 * The successful command receipts must follow the last source edit.
 */
export function builderAcceptanceLedger(
  objective: string,
  receipts: readonly BuilderV2Receipt[],
): BuilderAcceptanceLedger {
  const requested = [
    { name: 'npm test', pattern: /\bnpm\s+test\b/i },
    { name: 'node --test test/*.test.js', pattern: /\bnode\s+--test\s+test\/\*\.test\.js\b/i },
  ].filter(command => command.pattern.test(objective))
  const applicable = requested.length > 0
  const latestSourceChangeIndex = receipts.reduce((latest, receipt, index) =>
    receipt.ok && receipt.changed && (receipt.tool === 'write_file' || receipt.tool === 'edit_file')
      ? index : latest, -1)
  const runs = receipts.flatMap((receipt, index) => {
    if (receipt.tool !== 'run_tests') return []
    const output = receipt.output as Record<string, unknown> | null | undefined
    const command = String(output?.requestedCommand || '')
    if (!command) return []
    return [{
      command: command.replace(/\s+/g, ' ').trim(),
      passed: receipt.ok === true && output?.exitCode === 0 && output?.timedOut !== true,
      receiptIndex: index,
      exitCode: typeof output?.exitCode === 'number' ? output.exitCode : null,
    }]
  })
  const commands: BuilderCommandEvidence[] = requested.map(command => {
    const matching = runs.filter(run => command.pattern.test(run.command) && run.receiptIndex > latestSourceChangeIndex)
    const passed = matching.filter(run => run.passed).at(-1)
    return passed ?? matching.at(-1) ?? {
      command: command.name,
      passed: false,
      receiptIndex: -1,
      exitCode: null,
    }
  })
  const initialFailureReproduced = runs.some(run => !run.passed && run.receiptIndex < latestSourceChangeIndex)
  const requiresBugReproduction = /\b(?:introduce|initially implement)\b[\s\S]{0,180}\b(?:bug|defective|incorrect)\b/i.test(objective)
  const passed = commands.every(command => command.passed) && (!requiresBugReproduction || initialFailureReproduced)
  const failureCode = !passed
    ? commands.some(command => !command.passed) ? 'builder_acceptance_required_command_unverified'
      : 'builder_acceptance_initial_bug_not_reproduced'
    : null
  return {
    applicable,
    passed: !applicable || passed,
    failureCode: applicable ? failureCode : null,
    commands,
    latestSourceChangeIndex,
    initialFailureReproduced,
  }
}
