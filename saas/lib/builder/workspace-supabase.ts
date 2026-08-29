import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BuilderFile, BuilderWorkspacePort } from './contracts.ts'

const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 100

function safePath(value: string): string {
  const path = String(value || '').replace(/\u0000/g, '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!path || path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('builder_invalid_path')
  return path
}

function safeContent(value: string): string {
  // Some local-model control outputs contain a literal NUL despite valid surrounding JSON.
  // PostgreSQL cannot store NUL in text; remove that transport artifact before persistence.
  const content = String(value ?? '').replace(/\u0000/g, '')
  if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) throw new Error('builder_file_too_large')
  return content
}

function toFile(row: any): BuilderFile {
  return Object.freeze({ path: String(row.path), content: String(row.content), updatedAt: Date.parse(String(row.updated_at)) || Date.now() })
}

/** Service-role persistence, scoped by the authenticated user at construction. */
export class SupabaseBuilderWorkspace implements BuilderWorkspacePort {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async ensureWorkspace(workspaceId: string): Promise<void> {
    const { data, error } = await this.db.from('builder_workspaces').select('id').eq('id', workspaceId).eq('user_id', this.userId).maybeSingle()
    if (error) throw new Error(`builder_workspace_lookup: ${error.message}`)
    if (data) return
    const { error: createError } = await this.db.from('builder_workspaces').insert({ id: workspaceId, user_id: this.userId })
    if (createError) throw new Error('builder_workspace_not_found_or_unavailable')
  }

  async listWorkspaces() {
    const { data, error } = await this.db.from('builder_workspaces')
      .select('id,objective,updated_at')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(`builder_workspace_list: ${error.message}`)
    return Object.freeze((data ?? []).map(row => Object.freeze({ id: String(row.id), objective: String(row.objective || ''), updatedAt: String(row.updated_at) })))
  }

  async setObjective(workspaceId: string, objective: string): Promise<void> {
    await this.ensureWorkspace(workspaceId)
    const updatedAt = new Date().toISOString()
    const { error } = await this.db.from('builder_workspaces').update({ objective: String(objective).slice(0, 500), updated_at: updatedAt }).eq('id', workspaceId).eq('user_id', this.userId)
    if (error) throw new Error(`builder_workspace_objective: ${error.message}`)
  }

  async listFiles(workspaceId: string) {
    await this.ensureWorkspace(workspaceId)
    const { data, error } = await this.db.from('builder_workspace_files').select('path,updated_at').eq('workspace_id', workspaceId).eq('user_id', this.userId).order('path')
    if (error) throw new Error(`builder_file_list: ${error.message}`)
    return Object.freeze((data ?? []).map(row => Object.freeze({ path: String(row.path), updatedAt: Date.parse(String(row.updated_at)) || Date.now() })))
  }

  async readFile(workspaceId: string, path: string) {
    await this.ensureWorkspace(workspaceId)
    const { data, error } = await this.db.from('builder_workspace_files').select('path,content,updated_at').eq('workspace_id', workspaceId).eq('user_id', this.userId).eq('path', safePath(path)).maybeSingle()
    if (error) throw new Error(`builder_file_read: ${error.message}`)
    return data ? toFile(data) : null
  }

  async writeFile(workspaceId: string, path: string, content: string) {
    await this.ensureWorkspace(workspaceId)
    const safe = safePath(path), body = safeContent(content)
    const { count, error: countError } = await this.db.from('builder_workspace_files').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('user_id', this.userId)
    if (countError) throw new Error(`builder_file_count: ${countError.message}`)
    const existing = await this.readFile(workspaceId, safe)
    if (!existing && Number(count || 0) >= MAX_FILES) throw new Error('builder_file_limit')
    const updatedAt = new Date().toISOString()
    const { error } = await this.db.from('builder_workspace_files').upsert({ workspace_id: workspaceId, user_id: this.userId, path: safe, content: body, updated_at: updatedAt }, { onConflict: 'workspace_id,path' })
    if (error) throw new Error(`builder_file_write: ${error.message}`)
    await this.db.from('builder_workspaces').update({ updated_at: updatedAt }).eq('id', workspaceId).eq('user_id', this.userId)
    return Object.freeze({ path: safe, content: body, updatedAt: Date.parse(updatedAt) })
  }

  async editFile(workspaceId: string, path: string, search: string, replace: string) {
    const current = await this.readFile(workspaceId, path)
    if (!current) throw new Error('builder_file_not_found')
    if (!search || current.content.indexOf(search) < 0) throw new Error('builder_edit_target_not_found')
    if (current.content.indexOf(search) !== current.content.lastIndexOf(search)) throw new Error('builder_edit_target_ambiguous')
    return this.writeFile(workspaceId, current.path, current.content.replace(search, String(replace ?? '')))
  }
}

export function createSupabaseBuilderWorkspace(userId: string): SupabaseBuilderWorkspace | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key || !userId) return null
  return new SupabaseBuilderWorkspace(createClient(url, key, { auth: { persistSession: false } }), userId)
}
