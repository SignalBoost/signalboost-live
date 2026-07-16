export class SandboxExecutionError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.name = 'SandboxExecutionError'; this.code = code }
}
