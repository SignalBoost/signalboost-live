export interface SecurityEvidenceInput {
  readonly dependencyAuditPass: boolean
  readonly secretScanPass: boolean
  readonly authzRegressionPass: boolean
  readonly tenantIsolationPass: boolean
  readonly penetrationTestStatus: 'pass' | 'fail' | 'not_run'
  readonly criticalFindings: number
  readonly highFindings: number
}

export function evaluateSecurityEvidence(input: SecurityEvidenceInput) {
  if (![input.criticalFindings, input.highFindings].every(value => Number.isInteger(value) && value >= 0)) throw new Error('invalid_security_finding_count')
  const reasons: string[] = []
  if (!input.dependencyAuditPass) reasons.push('dependency_audit_failed')
  if (!input.secretScanPass) reasons.push('secret_scan_failed')
  if (!input.authzRegressionPass) reasons.push('authorization_regression_failed')
  if (!input.tenantIsolationPass) reasons.push('tenant_isolation_failed')
  if (input.penetrationTestStatus !== 'pass') reasons.push(input.penetrationTestStatus === 'not_run' ? 'penetration_test_not_run' : 'penetration_test_failed')
  if (input.criticalFindings > 0) reasons.push('critical_security_findings_open')
  if (input.highFindings > 0) reasons.push('high_security_findings_open')
  return Object.freeze({ pass: reasons.length === 0, reasons: Object.freeze(reasons.sort()) })
}
