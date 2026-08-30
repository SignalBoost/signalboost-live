import type { BuilderLoopResult, BuilderToolTrace } from './contracts.ts'

export type BuilderCertificationCaseId = 'create_and_run_javascript_v1' | 'inspect_repair_and_run_v1' | 'observe_failure_and_recover_v1'

export type BuilderCertificationCase = Readonly<{
  id: BuilderCertificationCaseId
  level: 1 | 2 | 3
  purpose: string
}>

export const BUILDER_CERTIFICATION_CASES: readonly BuilderCertificationCase[] = Object.freeze([
  { id: 'create_and_run_javascript_v1', level: 1, purpose: 'Create a user file and prove it runs.' },
  { id: 'inspect_repair_and_run_v1', level: 2, purpose: 'Inspect a supplied broken file, make one repair, and prove it runs.' },
  { id: 'observe_failure_and_recover_v1', level: 3, purpose: 'Observe a real failure, diagnose it, repair or correct the command, and prove recovery.' },
])

export type BuilderCertificationOutcome = Readonly<{ passed: boolean; reasons: readonly string[] }>

function successfulRun(trace: BuilderToolTrace): boolean {
  return trace.toolId === 'run' && trace.ok && Number((trace.output as { exitCode?: unknown } | undefined)?.exitCode) === 0
}

function indexOfSuccessfulRunAfter(trace: readonly BuilderToolTrace[], index: number): number {
  return trace.findIndex((item, itemIndex) => itemIndex > index && successfulRun(item))
}

/**
 * This is a graduation gate, not model training. A case passes only with recorded
 * workspace/tool evidence; answer text and model self-report have no authority.
 */
export function evaluateBuilderCertification(caseId: BuilderCertificationCaseId, result: BuilderLoopResult): BuilderCertificationOutcome {
  const reasons: string[] = []
  if (!result.ok) reasons.push('builder_turn_not_completed')
  const trace = result.trace
  if (!trace.some(successfulRun)) reasons.push('no_successful_proving_command')

  if (caseId === 'create_and_run_javascript_v1') {
    if (!trace.some(item => item.toolId === 'write_file' && item.ok)) reasons.push('no_verified_file_creation')
  }

  if (caseId === 'inspect_repair_and_run_v1') {
    const readAt = trace.findIndex(item => item.toolId === 'read_file' && item.ok)
    const repairAt = trace.findIndex(item => (item.toolId === 'write_file' || item.toolId === 'edit_file') && item.ok)
    if (readAt < 0) reasons.push('no_verified_file_inspection')
    if (repairAt < 0) reasons.push('no_verified_repair')
    if (readAt >= 0 && repairAt >= 0 && repairAt < readAt) reasons.push('repair_preceded_inspection')
    if (repairAt >= 0 && indexOfSuccessfulRunAfter(trace, repairAt) < 0) reasons.push('repair_not_proved_by_later_command')
  }

  if (caseId === 'observe_failure_and_recover_v1') {
    const failureAt = trace.findIndex(item => !item.ok && Boolean(item.failureClass))
    if (failureAt < 0) reasons.push('no_classified_failure_observed')
    if (failureAt >= 0 && indexOfSuccessfulRunAfter(trace, failureAt) < 0) reasons.push('no_proved_recovery_after_failure')
  }

  return Object.freeze({ passed: reasons.length === 0, reasons: Object.freeze(reasons) })
}
