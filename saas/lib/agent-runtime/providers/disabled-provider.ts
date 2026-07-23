import type { CodeSandboxProvider, SandboxExecutionRequest, SandboxExecutionResult, SandboxSession, SandboxSessionInput } from '../contracts.ts'

/** Safe default: records no state beyond an inert session descriptor and never executes. */
export class DisabledCodeSandboxProvider implements CodeSandboxProvider {
  readonly providerId = 'disabled'
  async createSession(input: SandboxSessionInput): Promise<SandboxSession> {
    return Object.freeze({ sessionId: `disabled:${input.workspaceId}`, providerId: this.providerId, workspaceId: input.workspaceId, createdAt: '1970-01-01T00:00:00.000Z' })
  }
  async execute(_session: SandboxSession, _request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const result: SandboxExecutionResult = { stdout: '', stderr: 'Code sandbox execution is disabled.', exitCode: 125, signal: null, timedOut: false, durationMs: 0, outputTruncated: false, artifacts: [], error: { code: 'sandbox_unavailable', stage: 'execution', message: 'Code sandbox execution is disabled.', retryable: false } }
    return Object.freeze(result)
  }
  async destroySession(_session: SandboxSession): Promise<void> { /* intentionally inert and idempotent */ }
}

export const disabledCodeSandboxProvider = Object.freeze(new DisabledCodeSandboxProvider())
