import type { ExecutionStage, SandboxExecutionResult, SandboxStructuredError } from './contracts.ts'

export type SandboxFailureCategory = 'static_analysis' | 'syntax' | 'test_failure' | 'runtime' | 'timeout' | 'resource_limit' | 'sandbox_unavailable' | 'permission_denied' | 'invalid_request' | 'artifact_violation' | 'internal'
export interface ClassifiedSandboxFailure { category: SandboxFailureCategory; stage: ExecutionStage; retryable: boolean; safeSummary: string; diagnosticMessage: string; exitCode: number; timedOut: boolean }

const REDACT = /(api[_-]?key|authorization|bearer|cookie|password|secret|token|credential)\s*[:=]\s*[^\s,;]+/gi
function diagnostic(error: SandboxStructuredError | undefined): string {
  return (error?.message ?? 'Execution failed without a safe diagnostic.').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(REDACT, '$1=[redacted]').slice(0, 512)
}

export function classifySandboxFailure(result: Pick<SandboxExecutionResult, 'exitCode' | 'timedOut' | 'stderr' | 'error'>): ClassifiedSandboxFailure | null {
  if (!result.timedOut && result.exitCode === 0 && !result.error) return null
  const code = result.error?.code
  const category: SandboxFailureCategory = result.timedOut ? 'timeout' : code ?? (/\b(syntax|parse)error\b/i.test(result.stderr) ? 'syntax' : 'runtime')
  const stage = result.error?.stage ?? 'execution'
  const retryable = result.error?.retryable ?? (category === 'sandbox_unavailable' || category === 'timeout' || category === 'internal')
  return Object.freeze({ category, stage, retryable, safeSummary: `Sandbox ${category.replace(/_/g, ' ')}.`, diagnosticMessage: diagnostic(result.error), exitCode: result.exitCode, timedOut: result.timedOut })
}
