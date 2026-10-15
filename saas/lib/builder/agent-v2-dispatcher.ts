import type { BuilderFile, BuilderRunnerPort, BuilderWorkspacePort } from './contracts.ts'

/**
 * Model-independent tool execution for Builder V2. No model-generated result can
 * mark a command verified; the host runner's actual exit status is authoritative.
 * A higher-level agent owns planning, checkpoints and tool scheduling.
 */
export type BuilderV2Action =
  | Readonly<{ tool: 'list_files' }>
  | Readonly<{ tool: 'read_file'; path: string }>
  | Readonly<{ tool: 'search_files'; query: string }>
  | Readonly<{ tool: 'write_file'; path: string; content: string }>
  | Readonly<{ tool: 'edit_file'; path: string; search: string; replace: string }>
  | Readonly<{ tool: 'run_tests'; command: string }>

export type BuilderV2Receipt = Readonly<{
  tool: BuilderV2Action['tool']
  ok: boolean
  changed: boolean
  output?: unknown
  error?: string
  next?: readonly BuilderV2Action['tool'][]
}>

export class BuilderV2Dispatcher {
  private readonly locks = new Map<string, Promise<void>>()
  constructor(
    private readonly workspace: BuilderWorkspacePort,
    private readonly runner: BuilderRunnerPort,
  ) {}

  // Serialize every tool operation per workspace, so two overlapping jobs cannot
  // compare and write the same file against different uncommitted versions.
  private async serialized<T>(workspaceId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(workspaceId) ?? Promise.resolve()
    let release!: () => void
    const next = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => next)
    this.locks.set(workspaceId, tail)
    await previous
    try { return await operation() } finally {
      release()
      if (this.locks.get(workspaceId) === tail) this.locks.delete(workspaceId)
    }
  }

  async dispatch(workspaceId: string, action: BuilderV2Action): Promise<BuilderV2Receipt> {
    if (!workspaceId.trim()) return { tool: action.tool, ok: false, changed: false, error: 'builder_workspace_required' }
    return this.serialized(workspaceId, async () => {
      try {
        if (action.tool === 'list_files') {
          return { tool: action.tool, ok: true, changed: false, output: await this.workspace.listFiles(workspaceId) }
        }
        if (action.tool === 'read_file') {
          const file = await this.workspace.readFile(workspaceId, action.path)
          return file
            ? { tool: action.tool, ok: true, changed: false, output: file }
            : { tool: action.tool, ok: false, changed: false, error: 'builder_file_not_found', next: ['list_files', 'search_files'] }
        }
        if (action.tool === 'search_files') {
          if (!this.workspace.searchFiles) return { tool: action.tool, ok: false, changed: false, error: 'builder_search_unavailable', next: ['list_files', 'read_file'] }
          return { tool: action.tool, ok: true, changed: false, output: await this.workspace.searchFiles(workspaceId, action.query) }
        }
        if (action.tool === 'write_file') {
          const current = await this.workspace.readFile(workspaceId, action.path)
          if (current?.content === action.content) return {
            tool: action.tool, ok: true, changed: false,
            output: { path: current.path, alreadyApplied: true }, next: ['run_tests', 'read_file', 'edit_file'],
          }
          // Existing files are never silently overwritten by a stale model proposal.
          if (current) return {
            tool: action.tool, ok: false, changed: false, error: 'builder_write_content_conflict',
            output: { path: current.path, currentContent: current.content },
            next: ['read_file', 'edit_file', 'run_tests'],
          }
          const created = await this.workspace.writeFile(workspaceId, action.path, action.content)
          return { tool: action.tool, ok: true, changed: true, output: { path: created.path } }
        }
        if (action.tool === 'edit_file') {
          const current = await this.workspace.readFile(workspaceId, action.path)
          if (!current) return { tool: action.tool, ok: false, changed: false, error: 'builder_file_not_found', next: ['list_files', 'read_file'] }
          if (action.search && !current.content.includes(action.search) && current.content.includes(action.replace)) return {
            tool: action.tool, ok: true, changed: false,
            output: { path: current.path, alreadyApplied: true }, next: ['run_tests', 'read_file'],
          }
          const edited = await this.workspace.editFile(workspaceId, action.path, action.search, action.replace)
          return { tool: action.tool, ok: true, changed: true, output: { path: edited.path }, next: ['run_tests', 'read_file'] }
        }
        const listed = await this.workspace.listFiles(workspaceId)
        const files = (await Promise.all(listed.map(item => this.workspace.readFile(workspaceId, item.path))))
          .filter((file): file is BuilderFile => file !== null)
        const result = await this.runner.run({ workspaceId, command: action.command, files })
        return {
          tool: action.tool, ok: result.exitCode === 0 && !result.timedOut, changed: false,
          output: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut, executedCommand: result.executedCommand ?? action.command, requestedCommand: action.command },
          ...((result.exitCode !== 0 || result.timedOut) ? {
            error: result.timedOut ? 'builder_test_timeout' : 'builder_tests_failed',
            next: ['read_file', 'edit_file', 'run_tests'] as const,
          } : { next: ['read_file', 'run_tests'] as const }),
        }
      } catch (error) {
        return { tool: action.tool, ok: false, changed: false,
          error: error instanceof Error ? error.message : 'builder_tool_error',
          next: ['read_file', 'list_files', 'run_tests'] }
      }
    })
  }
}
