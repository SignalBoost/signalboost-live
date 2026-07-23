/** Provider-neutral, non-executing contracts for future agent sandboxes. */
export type RuntimeLanguage = 'python' | 'typescript' | 'javascript' | 'shell'
export type ExecutionStage = 'validation' | 'static_analysis' | 'execution' | 'artifact_collection' | 'cleanup'
export type SandboxCapability = 'isolated_filesystem' | 'outbound_network' | 'environment_inheritance' | 'repository_write' | 'privileged_execution'

export interface SandboxSessionInput {
  workspaceId: string
  declaredWorkspacePath: string
  capabilities: readonly SandboxCapability[]
}

export interface SandboxSession {
  sessionId: string
  providerId: string
  workspaceId: string
  createdAt: string
}

export interface SandboxExecutionRequest {
  requestId: string
  language: RuntimeLanguage
  stage: ExecutionStage
  source: string
  workingDirectory: string
  timeoutMs: number
}

export interface SandboxArtifact {
  path: string
  sizeBytes: number
  mediaType?: string
  sha256?: string
  truncated?: boolean
  kind?: 'file' | 'directory' | 'symbolic_link' | 'device' | 'pipe' | 'socket'
  content?: Uint8Array
}

export interface SanitizedArtifactMetadata {
  relativePath: string
  sizeBytes: number
  mediaType?: string
  sha256?: string
  truncated: boolean
  rejectionReason?: string
}

export type SandboxErrorCode =
  | 'static_analysis' | 'syntax' | 'test_failure' | 'runtime' | 'sandbox_unavailable'
  | 'permission_denied' | 'invalid_request' | 'timeout' | 'resource_limit'
  | 'artifact_violation' | 'internal'

export interface SandboxStructuredError {
  code: SandboxErrorCode
  stage: ExecutionStage
  message: string
  retryable: boolean
}

export interface SandboxExecutionResult {
  stdout: string
  stderr: string
  exitCode: number
  signal: string | null
  timedOut: boolean
  durationMs: number
  outputTruncated: boolean
  artifacts: SandboxArtifact[]
  error?: SandboxStructuredError
}

export interface CodeSandboxProvider {
  createSession(input: SandboxSessionInput): Promise<SandboxSession>
  execute(session: SandboxSession, request: SandboxExecutionRequest): Promise<SandboxExecutionResult>
  destroySession(session: SandboxSession): Promise<void>
}
