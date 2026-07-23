export interface SandboxRuntimePolicy {
  maximumCorrectionAttempts: number
  maximumCommandExecutionTimeMs: number
  maximumWorkflowTimeMs: number
  maximumStdoutBytes: number
  maximumStderrBytes: number
  maximumArtifactCount: number
  maximumArtifactSizeBytes: number
  maximumTotalArtifactSizeBytes: number
  outboundNetwork: boolean
  inheritEnvironment: boolean
  hostFilesystemAccess: boolean
  privilegedExecution: boolean
  dockerSocketAccess: boolean
  repositoryWrites: boolean
  automaticDeployment: boolean
  automaticMerge: boolean
}

export const DEFAULT_SANDBOX_RUNTIME_POLICY: Readonly<SandboxRuntimePolicy> = Object.freeze({
  maximumCorrectionAttempts: 3,
  maximumCommandExecutionTimeMs: 30_000,
  maximumWorkflowTimeMs: 90_000,
  maximumStdoutBytes: 64 * 1024,
  maximumStderrBytes: 64 * 1024,
  maximumArtifactCount: 20,
  maximumArtifactSizeBytes: 1024 * 1024,
  maximumTotalArtifactSizeBytes: 5 * 1024 * 1024,
  outboundNetwork: false,
  inheritEnvironment: false,
  hostFilesystemAccess: false,
  privilegedExecution: false,
  dockerSocketAccess: false,
  repositoryWrites: false,
  automaticDeployment: false,
  automaticMerge: false,
})

export interface PolicyValidationIssue { field: keyof SandboxRuntimePolicy; reason: string }
export class SandboxPolicyValidationError extends Error {
  constructor(public readonly issues: readonly PolicyValidationIssue[]) {
    super(`Unsafe sandbox policy: ${issues.map(issue => issue.field).join(', ')}`)
    this.name = 'SandboxPolicyValidationError'
  }
}

const LIMITS: readonly (keyof SandboxRuntimePolicy)[] = [
  'maximumCorrectionAttempts', 'maximumCommandExecutionTimeMs', 'maximumWorkflowTimeMs',
  'maximumStdoutBytes', 'maximumStderrBytes', 'maximumArtifactCount',
  'maximumArtifactSizeBytes', 'maximumTotalArtifactSizeBytes',
]

export function validateSandboxRuntimePolicy(policy: SandboxRuntimePolicy, allowNetworkOverride = false): readonly PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = []
  for (const field of LIMITS) if (!Number.isFinite(policy[field] as number) || (policy[field] as number) < 0) issues.push({ field, reason: 'must_be_a_non_negative_finite_number' })
  if (policy.maximumCommandExecutionTimeMs === 0) issues.push({ field: 'maximumCommandExecutionTimeMs', reason: 'must_not_be_zero' })
  if (policy.maximumWorkflowTimeMs === 0) issues.push({ field: 'maximumWorkflowTimeMs', reason: 'must_not_be_zero' })
  if (policy.maximumCorrectionAttempts > 3) issues.push({ field: 'maximumCorrectionAttempts', reason: 'exceeds_conservative_maximum' })
  if (policy.maximumWorkflowTimeMs < policy.maximumCommandExecutionTimeMs) issues.push({ field: 'maximumWorkflowTimeMs', reason: 'must_cover_command_timeout' })
  if (policy.maximumArtifactSizeBytes > policy.maximumTotalArtifactSizeBytes) issues.push({ field: 'maximumArtifactSizeBytes', reason: 'must_not_exceed_total_artifact_limit' })
  if (policy.outboundNetwork && !allowNetworkOverride) issues.push({ field: 'outboundNetwork', reason: 'requires_explicit_override' })
  for (const field of ['hostFilesystemAccess', 'privilegedExecution', 'dockerSocketAccess', 'repositoryWrites', 'automaticDeployment', 'automaticMerge'] as const) {
    if (policy[field]) issues.push({ field, reason: 'not_permitted_in_foundation_policy' })
  }
  return Object.freeze(issues)
}

export function assertSafeSandboxRuntimePolicy(policy: SandboxRuntimePolicy, allowNetworkOverride = false): Readonly<SandboxRuntimePolicy> {
  const issues = validateSandboxRuntimePolicy(policy, allowNetworkOverride)
  if (issues.length) throw new SandboxPolicyValidationError(issues)
  return Object.freeze({ ...policy })
}

export function truncateSandboxOutput(value: string, maximumBytes: number): { value: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(value)
  if (encoded.byteLength <= maximumBytes) return { value, truncated: false }
  return { value: new TextDecoder().decode(encoded.slice(0, maximumBytes)), truncated: true }
}
