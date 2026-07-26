// saas/lib/supervisor/executors/browser/sandbox-package-promoter.ts
import type { BrowserTask, BrowserTaskStep } from '../../../browser-runtime/contracts.ts'
import { verifyBrowserRuntimeDryRunPackage } from './browser-runtime-adapter.ts'
import type { BrowserRuntimeDryRunPackage } from './browser-runtime-dry-run-schema.ts'
import { SANDBOX_ADAPTER_ID } from '../../../browser-runtime/sandbox-adapter.ts'
import { SandboxExecutionError } from './sandbox-execution-errors.ts'
import { assertSandboxOriginAllowed, assertSandboxUrlAllowed, type SandboxOriginPolicy } from './sandbox-origin-policy.ts'
import type { SandboxBrowserExecutionRequest } from './sandbox-execution-schema.ts'

export interface PromotedSandboxPackage { task: BrowserTask; approvedStepIds: string[]; checkpointStepId: string; preCheckpointStepIds: string[]; postCheckpointStepIds: string[]; metadata: { packageId: string; packageFingerprint: string; dispatchId: string; sandboxOrigin: string } }
const supported = new Set<BrowserTaskStep['kind']>(['navigate','click','fill','wait_for','screenshot','checkpoint'])
const secretLiteral = /(bearer\s+|sk-[a-z0-9]|password\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=])/i

function assertNoSecrets(value: unknown, path = 'package'): void {
  if (Array.isArray(value)) value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value as Record<string, unknown>)) { if (/(password|apiKey|api_key|secret|token|authorization|cookie)/i.test(k) && !/(Ref|approvalToken|approvalTokenCreated|preApprovalTokenDigest)$/.test(k) && !path.endsWith('expectedEvidenceByStepId')) throw new SandboxExecutionError('secret_literal_rejected', `${path}.${k} is forbidden.`); assertNoSecrets(v, `${path}.${k}`) }
  else if (typeof value === 'string' && secretLiteral.test(value)) throw new SandboxExecutionError('secret_literal_rejected', `${path} contains a forbidden secret literal.`)
}

function assertSteps(task: BrowserTask, origin: string, policy: SandboxOriginPolicy) {
  const ids = task.steps.map(s => s.id)
  if (new Set(ids).size !== ids.length) throw new SandboxExecutionError('duplicate_browser_step', 'Browser task step IDs must be unique.')
  const checkpoints = task.steps.filter(s => s.kind === 'checkpoint')
  if (checkpoints.length !== 1) throw new SandboxExecutionError('invalid_checkpoint_structure', 'Sandbox execution requires exactly one checkpoint.')
  const checkpointIndex = task.steps.findIndex(s => s.kind === 'checkpoint')
  if (checkpointIndex <= 0 || checkpointIndex >= task.steps.length - 1) throw new SandboxExecutionError('invalid_checkpoint_structure', 'Sandbox checkpoint must split pre and post approval steps.')
  for (const step of task.steps) {
    if (!supported.has(step.kind)) throw new SandboxExecutionError('unsupported_browser_action', 'Sandbox package contains an unsupported action.')
    if (step.kind === 'navigate') assertSandboxUrlAllowed(step.url, policy)
    if ('selector' in step && /xpath=|\*|password-manager|chrome|extension/i.test(String(step.selector))) throw new SandboxExecutionError('unsupported_selector', 'Sandbox package contains an unsupported selector.')
    if (step.kind === 'fill' && !String(step.valueRef).startsWith('sandbox://')) throw new SandboxExecutionError('secret_resolution_rejected', 'Sandbox fills must use sandbox:// references only.')
  }
  if (JSON.stringify(task.allowedOrigins) !== JSON.stringify([origin])) throw new SandboxExecutionError('origin_scope_mismatch', 'Browser task allowed origins must match sandbox origin exactly.')
}

export function promoteSandboxPackage(request: SandboxBrowserExecutionRequest, policy: SandboxOriginPolicy): PromotedSandboxPackage {
  const verified = verifyBrowserRuntimeDryRunPackage(request.dryRunPackage as BrowserRuntimeDryRunPackage)
  if (verified.fingerprint !== request.packageFingerprint) throw new SandboxExecutionError('fingerprint_mismatch', 'Request fingerprint does not match dry-run package.')
  const pkg = request.dryRunPackage
  if (pkg.packageFingerprint !== request.packageFingerprint) throw new SandboxExecutionError('fingerprint_mismatch', 'Package fingerprint mismatch.')
  if (pkg.dispatchId !== request.dispatchId || pkg.incidentId !== request.incidentId || pkg.planId !== request.planId) throw new SandboxExecutionError('identity_mismatch', 'Sandbox request identity does not match package.')
  if (pkg.targetEnvironment !== 'sandbox') throw new SandboxExecutionError('non_sandbox_environment', 'Only sandbox targetEnvironment may execute.')
  const origin = assertSandboxOriginAllowed(request.sandboxOrigin, policy)
  if (assertSandboxOriginAllowed(pkg.targetOrigin, policy) !== origin) throw new SandboxExecutionError('origin_mismatch', 'Dry-run target origin does not match sandbox origin.')
  assertNoSecrets(pkg)
  const task: BrowserTask = { ...pkg.browserTask, provider: 'sandbox', adapterId: SANDBOX_ADAPTER_ID, allowedOrigins: [origin], approvalToken: request.browserTaskApprovalToken, metadata: { ...(pkg.browserTask.metadata ?? {}), sandboxExecution: true, dryRunPackageId: pkg.packageId, packageFingerprint: pkg.packageFingerprint } }
  assertSteps(task, origin, policy)
  if (Date.parse(task.expiresAt) <= Date.parse(request.requestedAt)) throw new SandboxExecutionError('package_expired', 'Sandbox package task expiry has passed.')
  const checkpointIndex = task.steps.findIndex(s => s.kind === 'checkpoint')
  return { task, approvedStepIds: pkg.approvedStepIds, checkpointStepId: task.steps[checkpointIndex].id, preCheckpointStepIds: task.steps.slice(0, checkpointIndex + 1).map(s => s.id), postCheckpointStepIds: task.steps.slice(checkpointIndex + 1).map(s => s.id), metadata: { packageId: pkg.packageId, packageFingerprint: pkg.packageFingerprint, dispatchId: pkg.dispatchId, sandboxOrigin: origin } }
}
