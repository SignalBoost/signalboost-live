/** Preserve assembly state when serializing a tool result for stored/public evidence. */
export function builderPendingWriteEvidence(output: unknown): { pending?: boolean } {
  const shape = output && typeof output === 'object' ? output as Record<string, unknown> : {}
  return typeof shape.pending === 'boolean' ? { pending: shape.pending } : {}
}

/** Outcomes are derived from host trace fields, never from model prose or overall job status. */
export function builderEvidenceEvents(trace: unknown) {
  return (Array.isArray(trace) ? trace : []).map((item, index) => {
    const entry = item && typeof item === 'object' ? item : {}
    const output = entry.output && typeof entry.output === 'object' ? entry.output : entry
    const error = typeof entry.error === 'string' ? entry.error : ''
    const hasExit = typeof output.exitCode === 'number' && Number.isInteger(output.exitCode)
    const blocked = /^builder_(?:repeated_tool_call|verification_order_required|run_budget_exhausted)/.test(error)
    // The host refusing a command (e.g. the repository-wide suite) returns exit 125 without executing it. That exit
    // code is policy, not a result: reporting it as exited_nonzero told the owner a refused npm test reproduced a failure.
    const refusedByHost = /^builder_repository_broad_test_blocked/.test(error)
    const outcome = entry.toolId === 'run'
      ? refusedByHost ? 'blocked_before_execution'
        : output.timedOut === true ? 'timed_out'
        : hasExit ? output.exitCode === 0 ? 'exited_zero' : 'exited_nonzero'
        : blocked ? 'blocked_before_execution' : 'execution_unconfirmed'
      : entry.toolId === 'edit_file' || entry.toolId === 'write_file'
        ? blocked ? 'blocked_before_mutation' : entry.ok === true
          ? output.pending === true ? 'assembly_pending' : 'mutation_recorded'
          : 'mutation_not_confirmed'
        : entry.ok === true ? 'tool_succeeded' : 'tool_not_successful'
    return { eventId: index + 1, toolId: entry.toolId, outcome, path: entry.path || entry.input?.path,
      command: entry.command || entry.input?.command, error: error || undefined,
      ...(hasExit ? { exitCode: output.exitCode } : {}),
    }
  })
}
