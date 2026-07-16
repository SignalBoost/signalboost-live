import type { BrowserRuntimeDryRunPackage } from './browser-runtime-dry-run-schema.ts'
import { SandboxExecutionError } from './sandbox-execution-errors.ts'

export const sandboxBrowserExecutionSchemaVersion = 'sandbox-browser-execution-v1'
export type SandboxExecutionMode = 'sandbox_execute'
export interface SandboxBrowserExecutionRequest {
  dryRunPackage: BrowserRuntimeDryRunPackage
  packageFingerprint: string
  dispatchId: string
  incidentId: string
  planId: string
  sandboxOrigin: string
  browserTaskApprovalToken: string
  continuationApprovalToken?: string
  executionMode: SandboxExecutionMode
  requestedAt: string
  schemaVersion: typeof sandboxBrowserExecutionSchemaVersion
}

function text(v: unknown, f: string): string { if (typeof v !== 'string' || !v.trim()) throw new SandboxExecutionError('invalid_sandbox_request', `${f} is required.`); return v }
export function parseSandboxBrowserExecutionRequest(v: unknown): SandboxBrowserExecutionRequest {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) throw new SandboxExecutionError('invalid_sandbox_request', 'Sandbox execution request must be a plain object.')
  const r = v as SandboxBrowserExecutionRequest
  if (r.executionMode !== 'sandbox_execute') throw new SandboxExecutionError('invalid_execution_mode', 'Sandbox execution mode must be sandbox_execute.')
  if (r.schemaVersion !== sandboxBrowserExecutionSchemaVersion) throw new SandboxExecutionError('invalid_sandbox_schema', 'Unsupported sandbox execution schema version.')
  if (!r.dryRunPackage || typeof r.dryRunPackage !== 'object') throw new SandboxExecutionError('missing_dry_run_package', 'dryRunPackage is required.')
  for (const f of ['packageFingerprint','dispatchId','incidentId','planId','sandboxOrigin','browserTaskApprovalToken','requestedAt'] as const) text(r[f], f)
  if (Number.isNaN(Date.parse(r.requestedAt))) throw new SandboxExecutionError('invalid_requested_at', 'requestedAt must be a valid timestamp.')
  if (r.continuationApprovalToken !== undefined) text(r.continuationApprovalToken, 'continuationApprovalToken')
  return r
}
