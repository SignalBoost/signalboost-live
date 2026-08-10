export interface RecoveryEvidenceInput {
  readonly backupVerifiedAt: string
  readonly restoreVerifiedAt: string
  readonly failoverVerifiedAt: string
  readonly recoveryPointMinutes: number
  readonly recoveryTimeMinutes: number
  readonly maxRecoveryPointMinutes: number
  readonly maxRecoveryTimeMinutes: number
}

export interface RecoveryEvidenceResult {
  readonly pass: boolean
  readonly reasons: readonly string[]
}

export function evaluateRecoveryEvidence(input: RecoveryEvidenceInput): RecoveryEvidenceResult {
  const reasons: string[] = []
  for (const [name, value] of Object.entries({
    backupVerifiedAt: input.backupVerifiedAt,
    restoreVerifiedAt: input.restoreVerifiedAt,
    failoverVerifiedAt: input.failoverVerifiedAt,
  })) {
    if (!Number.isFinite(Date.parse(value))) reasons.push(`${name}_invalid`)
  }

  for (const value of [input.recoveryPointMinutes, input.recoveryTimeMinutes, input.maxRecoveryPointMinutes, input.maxRecoveryTimeMinutes]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('invalid_recovery_metric')
  }

  if (input.recoveryPointMinutes > input.maxRecoveryPointMinutes) reasons.push('recovery_point_objective_exceeded')
  if (input.recoveryTimeMinutes > input.maxRecoveryTimeMinutes) reasons.push('recovery_time_objective_exceeded')

  return Object.freeze({ pass: reasons.length === 0, reasons: Object.freeze(reasons.sort()) })
}
