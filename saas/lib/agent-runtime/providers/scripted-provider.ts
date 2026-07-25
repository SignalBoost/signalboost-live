// saas/lib/agent-runtime/providers/scripted-provider.ts
import type { CodeSandboxProvider, SandboxExecutionRequest, SandboxExecutionResult, SandboxSession, SandboxSessionInput } from '../contracts.ts'

export type ScriptedProviderStep = { stage: SandboxExecutionRequest['stage']; result?: SandboxExecutionResult; error?: unknown }
/** Deterministic test double only. It returns preconfigured data and never evaluates candidate content. */
export class ScriptedCodeSandboxProvider implements CodeSandboxProvider {
  readonly providerId = 'scripted-test-double'; readonly createdSessions: SandboxSession[] = []; readonly executeCalls: { session: SandboxSession; request: SandboxExecutionRequest }[] = []; readonly destroyCalls: SandboxSession[] = []
  private cursor = 0; private destroyed = new Set<string>()
  private readonly script: readonly ScriptedProviderStep[]; private readonly destroyError?: unknown; constructor(script: readonly ScriptedProviderStep[], destroyError?: unknown) { this.script = script; this.destroyError = destroyError }
  async createSession(input: SandboxSessionInput): Promise<SandboxSession> { const session = Object.freeze({ sessionId: `scripted:${this.createdSessions.length + 1}`, providerId: this.providerId, workspaceId: input.workspaceId, createdAt: '1970-01-01T00:00:00.000Z' }); this.createdSessions.push(session); return session }
  async execute(session: SandboxSession, request: SandboxExecutionRequest): Promise<SandboxExecutionResult> { this.executeCalls.push(Object.freeze({ session, request: Object.freeze({ ...request }) })); const step = this.script[this.cursor++]; if (!step) throw new Error('Scripted provider script exhausted.'); if (step.stage !== request.stage) throw new Error(`Scripted provider stage mismatch: expected ${step.stage}, received ${request.stage}.`); if (step.error) throw step.error; if (!step.result) throw new Error('Scripted provider step has no result.'); return Object.freeze({ ...step.result, artifacts: [...step.result.artifacts] }) }
  async destroySession(session: SandboxSession): Promise<void> { if (this.destroyed.has(session.sessionId)) return; this.destroyed.add(session.sessionId); this.destroyCalls.push(session); if (this.destroyError) throw this.destroyError }
}
