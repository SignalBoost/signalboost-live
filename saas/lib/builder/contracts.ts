export type BuilderToolId = 'list_files' | 'read_file' | 'write_file' | 'edit_file' | 'run'
export type BuilderFailureClass = 'storage' | 'path' | 'runtime' | 'dependency' | 'test' | 'deployment' | 'unknown'

export type BuilderFile = Readonly<{ path: string; content: string; updatedAt: number }>

export interface BuilderWorkspacePort {
  listFiles(workspaceId: string): Promise<readonly Pick<BuilderFile, 'path' | 'updatedAt'>[]>
  readFile(workspaceId: string, path: string): Promise<BuilderFile | null>
  writeFile(workspaceId: string, path: string, content: string): Promise<BuilderFile>
  editFile(workspaceId: string, path: string, search: string, replace: string): Promise<BuilderFile>
}

export interface BuilderRunResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

/** The host owns code execution. Builder core never evaluates user code itself. */
export interface BuilderRunnerPort {
  run(input: { workspaceId: string; command: string; files: readonly BuilderFile[] }): Promise<BuilderRunResult>
}

export interface BuilderAiPort {
  generate(input: { systemPrompt: string; prompt: string; maxTokens: number }): Promise<string | null>
}

export type BuilderToolTrace = Readonly<{
  round: number
  toolId: BuilderToolId
  input: Record<string, unknown>
  ok: boolean
  output?: unknown
  error?: string
  failureClass?: BuilderFailureClass
  remediation?: string
}>

export type BuilderLoopResult =
  | Readonly<{ ok: true; answer: string; trace: readonly BuilderToolTrace[] }>
  | Readonly<{ ok: false; error: string; trace: readonly BuilderToolTrace[] }>
