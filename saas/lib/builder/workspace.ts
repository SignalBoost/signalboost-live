import type { BuilderFile, BuilderWorkspacePort } from './contracts.ts'

const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 100

function safePath(value: string): string {
  const path = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!path || path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('builder_invalid_path')
  return path
}

function safeContent(value: string): string {
  const content = String(value ?? '')
  if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) throw new Error('builder_file_too_large')
  return content
}

/** In-memory reference store. Production persistence must provide the same per-user workspace port. */
export class InMemoryBuilderWorkspace implements BuilderWorkspacePort {
  private readonly workspaces = new Map<string, Map<string, BuilderFile>>()
  private readonly now: () => number

  constructor(now: () => number = Date.now) { this.now = now }

  private files(workspaceId: string): Map<string, BuilderFile> {
    if (!workspaceId.trim()) throw new Error('builder_workspace_required')
    let files = this.workspaces.get(workspaceId)
    if (!files) { files = new Map(); this.workspaces.set(workspaceId, files) }
    return files
  }

  async listFiles(workspaceId: string) {
    return Object.freeze([...this.files(workspaceId).values()]
      .map(file => Object.freeze({ path: file.path, updatedAt: file.updatedAt }))
      .sort((a, b) => a.path.localeCompare(b.path)))
  }

  async readFile(workspaceId: string, path: string) {
    return this.files(workspaceId).get(safePath(path)) ?? null
  }

  async writeFile(workspaceId: string, path: string, content: string) {
    const files = this.files(workspaceId), safe = safePath(path)
    if (!files.has(safe) && files.size >= MAX_FILES) throw new Error('builder_file_limit')
    const file: BuilderFile = Object.freeze({ path: safe, content: safeContent(content), updatedAt: this.now() })
    files.set(safe, file)
    return file
  }

  async editFile(workspaceId: string, path: string, search: string, replace: string) {
    const current = await this.readFile(workspaceId, path)
    if (!current) throw new Error('builder_file_not_found')
    if (!search || current.content.indexOf(search) < 0) throw new Error('builder_edit_target_not_found')
    if (current.content.indexOf(search) !== current.content.lastIndexOf(search)) throw new Error('builder_edit_target_ambiguous')
    return this.writeFile(workspaceId, current.path, current.content.replace(search, String(replace ?? '')))
  }
}
