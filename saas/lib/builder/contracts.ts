export type BuilderToolId = 'list_files' | 'read_file' | 'search_files' | 'write_file' | 'edit_file' | 'run' | 'model_control'
export type BuilderFailureClass = 'storage' | 'path' | 'runtime' | 'dependency' | 'test' | 'deployment' | 'unknown'

export type BuilderFile = Readonly<{ path: string; content: string; updatedAt: number }>

export interface BuilderWorkspacePort {
  listFiles(workspaceId: string): Promise<readonly Pick<BuilderFile, 'path' | 'updatedAt'>[]>
  readFile(workspaceId: string, path: string): Promise<BuilderFile | null>
  /**
   * Optional literal search across the workspace, returning matching paths.
   *
   * Optional on purpose: only the repository lane can answer it, because only that lane has a
   * real checkout to grep. Workspaces without a searchable backing store omit it, and the tool
   * loop withholds search_files from the model rather than offering a capability that cannot
   * be served. A workspace that implements it must apply the SAME path rules its readFile
   * applies — no traversal, no secret-like paths, no dependency trees or build output.
   */
  searchFiles?(workspaceId: string, query: string): Promise<readonly string[]>
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
  | Readonly<{ ok: false; error: string; trace: readonly BuilderToolTrace[]; checkpoint?: import('./checkpoint.ts').BuilderLoopCheckpoint }>

/** A lesson is admitted only when a failure is followed by a successful proving command. */
export type BuilderVerifiedRepairLesson = Readonly<{
  failureClass: BuilderFailureClass
  causeEvidence: string
  fixSummary: string
  regressionCommand: string
  runtime: 'node24-network-denied-ephemeral'
}>
