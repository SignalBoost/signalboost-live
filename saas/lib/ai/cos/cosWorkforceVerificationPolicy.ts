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
// end of saas/lib/ai/cos/cosWorkforceVerificationPolicy.ts (if this line is missing, the paste was cut short)