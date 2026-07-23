import type {
  CodeSandboxProvider,
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxSession,
  SandboxSessionInput,
  SandboxStructuredError,
} from '../contracts.ts'
import type { SandboxRuntimePolicy } from '../policy.ts'
import { truncateSandboxOutput } from '../policy.ts'
import { sanitizeSandboxArtifacts } from '../artifact-sanitizer.ts'
import type { AgentSandboxProviderConfig } from '../provider-config.ts'
import type {
  RemoteSandboxTransport,
  RemoteCreateSessionResponse,
  RemoteExecuteResponse,
} from './remote-provider-contract.ts'

const safeMessage = (value: unknown, token: string) =>
  String(value instanceof Error ? value.message : 'Remote sandbox request failed.')
    .replaceAll(token, '[REDACTED]')
    .slice(0, 256)

export class RemoteCodeSandboxProvider implements CodeSandboxProvider {
  readonly providerId = 'remote'
  private destroyed = new Set<string>()

  constructor(
    private readonly config: AgentSandboxProviderConfig,
    private readonly transport: RemoteSandboxTransport,
    private readonly policy: SandboxRuntimePolicy,
  ) {
    if (!config.enabled || !config.endpoint?.startsWith('https://') || !config.authenticationToken) {
      throw new Error('Remote sandbox provider requires explicit safe configuration.')
    }
  }

  private headers(requestId: string): Readonly<Record<string, string>> {
    return Object.freeze({
      Authorization: `Bearer ${this.config.authenticationToken}`,
      'Content-Type': 'application/json',
      'X-SignalBoost-Request-Id': requestId.slice(0, 128),
      'X-SignalBoost-Provider-Version': 'phase-4',
    })
  }

  async createSession(input: SandboxSessionInput): Promise<SandboxSession> {
    try {
      const response = await this.transport.request<RemoteCreateSessionResponse>({
        method: 'POST',
        url: `${this.config.endpoint}/sessions`,
        headers: this.headers(input.workspaceId),
        body: {
          workspaceId: input.workspaceId,
          capabilities: input.capabilities.filter(capability => capability === 'isolated_filesystem'),
        },
        timeoutMs: this.config.requestTimeoutMs,
      })

      if (
        !response ||
        response.providerId !== 'remote' ||
        typeof response.sessionId !== 'string' ||
        !response.sessionId ||
        response.sessionId.length > 128 ||
        typeof response.createdAt !== 'string'
      ) {
        throw new Error('Malformed remote session response.')
      }

      return Object.freeze({
        sessionId: response.sessionId,
        providerId: 'remote',
        workspaceId: input.workspaceId,
        createdAt: response.createdAt,
      })
    } catch (error) {
      throw new Error(safeMessage(error, this.config.authenticationToken!))
    }
  }

  async execute(
    session: SandboxSession,
    request: SandboxExecutionRequest,
  ): Promise<SandboxExecutionResult> {
    try {
      const response = await this.transport.request<RemoteExecuteResponse>({
        method: 'POST',
        url: `${this.config.endpoint}/sessions/${encodeURIComponent(session.sessionId)}/execute`,
        headers: this.headers(request.requestId),
        body: {
          language: request.language,
          stage: request.stage,
          source: request.source.slice(0, 100_000),
          ...(request.tests ? { tests: request.tests.slice(0, 100_000) } : {}),
          timeoutMs: Math.min(
            request.timeoutMs,
            this.config.requestTimeoutMs,
            this.policy.maximumCommandExecutionTimeMs,
          ),
        },
        timeoutMs: Math.min(request.timeoutMs, this.config.requestTimeoutMs),
      })

      if (
        !response ||
        response.providerId !== 'remote' ||
        !Number.isInteger(response.exitCode) ||
        response.exitCode < 0 ||
        response.exitCode > 255 ||
        !Number.isFinite(response.durationMs) ||
        response.durationMs < 0 ||
        typeof response.stdout !== 'string' ||
        typeof response.stderr !== 'string' ||
        !Array.isArray(response.artifacts)
      ) {
        throw new Error('Malformed remote execution response.')
      }

      const stdout = truncateSandboxOutput(response.stdout, this.policy.maximumStdoutBytes)
      const stderr = truncateSandboxOutput(response.stderr, this.policy.maximumStderrBytes)
      const metadata = sanitizeSandboxArtifacts(
        response.artifacts,
        request.workingDirectory,
        this.policy,
      )
      if (metadata.some(item => item.rejectionReason)) {
        throw new Error('Remote response contained unsafe artifacts.')
      }

      const error = response.error ? this.error(response.error, request.stage) : undefined
      return Object.freeze({
        stdout: stdout.value,
        stderr: stderr.value,
        exitCode: response.exitCode,
        signal: response.signal,
        timedOut: Boolean(response.timedOut),
        durationMs: response.durationMs,
        outputTruncated: stdout.truncated || stderr.truncated,
        artifacts: response.artifacts.map(artifact => ({ ...artifact })),
        ...(error ? { error } : {}),
      })
    } catch (error) {
      const structuredError: SandboxStructuredError = {
        code: 'sandbox_unavailable',
        stage: request.stage,
        message: safeMessage(error, this.config.authenticationToken!),
        retryable: false,
      }
      return Object.freeze({
        stdout: '',
        stderr: '',
        exitCode: 125,
        signal: null,
        timedOut: false,
        durationMs: 0,
        outputTruncated: false,
        artifacts: [],
        error: structuredError,
      })
    }
  }

  private error(
    error: RemoteExecuteResponse['error'],
    stage: SandboxExecutionRequest['stage'],
  ): SandboxStructuredError {
    if (!error || typeof error.message !== 'string' || typeof error.retryable !== 'boolean') {
      throw new Error('Malformed remote error response.')
    }
    const codes = new Set([
      'static_analysis',
      'syntax',
      'test_failure',
      'runtime',
      'sandbox_unavailable',
      'permission_denied',
      'invalid_request',
      'timeout',
      'resource_limit',
      'artifact_violation',
      'internal',
    ])
    return {
      code: codes.has(error.code) ? (error.code as SandboxStructuredError['code']) : 'internal',
      stage,
      message: safeMessage(error.message, this.config.authenticationToken!),
      retryable: error.retryable,
    }
  }

  async destroySession(session: SandboxSession): Promise<void> {
    if (this.destroyed.has(session.sessionId)) return
    this.destroyed.add(session.sessionId)
    try {
      await this.transport.request<unknown>({
        method: 'DELETE',
        url: `${this.config.endpoint}/sessions/${encodeURIComponent(session.sessionId)}`,
        headers: this.headers(session.sessionId),
        timeoutMs: this.config.requestTimeoutMs,
      })
    } catch {
      // Cleanup is deliberately best-effort and idempotent.
    }
  }
}
