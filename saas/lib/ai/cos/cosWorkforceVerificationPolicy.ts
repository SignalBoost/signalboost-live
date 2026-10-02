// saas/lib/ai/cos/cosWorkforceVerificationPolicy.ts
// Pure Workforce verification policy (no imports, no I/O) so the rule is provable with real inputs.
// Only a governed Production outcome (outcome_source in the 'production_verified:' namespace, verified_success
// decided) on the exact turn a graduate delivered can verify or fail that graduate's work.

export const WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE = 'production_verified:' as const

export type WorkforceTurnOutcome = Readonly<{
  turn_id: unknown
  verified_success: unknown
  outcome_source: unknown
  outcome_at?: unknown
}>

export type WorkforceVerificationDecision = Readonly<
  | { decided: false; reason: 'no_outcome' | 'not_production_verified' | 'outcome_undecided' }
  | { decided: true; status: 'verified' | 'remediation'; lifecycleEvent: 'verified_outcome' | 'remediation_started' }
>

export function decideWorkforceVerification(outcome: WorkforceTurnOutcome | null | undefined): WorkforceVerificationDecision {
  if (!outcome) return Object.freeze({ decided: false as const, reason: 'no_outcome' as const })
  const source = String(outcome.outcome_source ?? '').trim()
  if (!source.startsWith(WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE)) {
    return Object.freeze({ decided: false as const, reason: 'not_production_verified' as const })
  }
  if (outcome.verified_success === true) {
    return Object.freeze({ decided: true as const, status: 'verified' as const, lifecycleEvent: 'verified_outcome' as const })
  }
  if (outcome.verified_success === false) {
    return Object.freeze({ decided: true as const, status: 'remediation' as const, lifecycleEvent: 'remediation_started' as const })
  }
  return Object.freeze({ decided: false as const, reason: 'outcome_undecided' as const })
}

/**
 * TERMINAL FROM EVIDENCE (2026-10-02). Production trace of 39 assignments closed as 'no_terminal_recorded': 37 had a
 * recorded failed attempt (25 timeout, 12 empty, all at the ~15s deadline) and 1 had a recorded success. Every one of
 * those terminal writes had been rejected by the old status rule and the rejection was ignored. The serving-attempt
 * log is the authoritative record of what the graduate call did, so an assignment's terminal state is derived from it.
 */
export type ServingAttemptEvidence = Readonly<{ phase: unknown; outcome?: unknown; error_class?: unknown; latency_ms?: unknown }>

export type AssignmentTerminalDecision = Readonly<
  | { close: false; reason: 'still_open_within_window' }
  | { close: true; status: 'served'; failureReason: null }
  | { close: true; status: 'runtime_failed'; failureReason: string }
>

export function decideAssignmentTerminal(input: {
  evidence: readonly ServingAttemptEvidence[]
  openedAtMs: number
  nowMs: number
  maxOpenMs: number
}): AssignmentTerminalDecision {
  const phases = input.evidence.map(row => String(row.phase ?? ''))
  if (phases.includes('attempt_succeeded')) return Object.freeze({ close: true as const, status: 'served' as const, failureReason: null })
  const failed = input.evidence.find(row => String(row.phase ?? '') === 'attempt_failed')
  if (failed) {
    const reason = String(failed.error_class ?? '').trim() || String(failed.outcome ?? '').trim() || 'runtime_failed_unclassified'
    return Object.freeze({ close: true as const, status: 'runtime_failed' as const, failureReason: reason.slice(0, 120) })
  }
  const old = !Number.isFinite(input.openedAtMs) || input.nowMs - input.openedAtMs >= input.maxOpenMs
  if (!old) return Object.freeze({ close: false as const, reason: 'still_open_within_window' as const })
  return Object.freeze({
    close: true as const,
    status: 'runtime_failed' as const,
    failureReason: phases.includes('attempt_started') ? 'process_ended_mid_call' : 'no_serving_record',
  })
}
// end of saas/lib/ai/cos/cosWorkforceVerificationPolicy.ts (if this line is missing, the paste was cut short)
