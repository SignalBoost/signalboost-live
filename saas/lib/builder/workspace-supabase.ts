import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BuilderFailureClass, BuilderFile, BuilderVerifiedRepairLesson, BuilderWorkspacePort } from './contracts.ts'
import type { BuilderCertificationAttempt } from './certification.ts'
import { assertPersistable, containsNullByte } from './storage-contract.ts'

const MAX_FILE_BYTES = 512 * 1024
const MAX_FILES = 100
const STORAGE_PREFIX = 'base64:'

function encodeStoredContent(value: string): string { return STORAGE_PREFIX + Buffer.from(value, 'utf8').toString('base64') }
function decodeStoredContent(value: string): string { return value.startsWith(STORAGE_PREFIX) ? Buffer.from(value.slice(STORAGE_PREFIX.length), 'base64').toString('utf8') : value }

function stripNulls(value: string): string {
  return String(value ?? '').replace(/\u0000|\\\\u0000|\\\\0/g, '')
}

function safePath(value: string): string {
  let path = stripNulls(value).replace(/\\/g, '/').replace(/^\/+/, '')
  if (path === 'workspace' || path.startsWith('workspace/')) path = path.replace(/^workspace\/?/, '')
  if (containsNullByte(path) || !path || path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('builder_invalid_path')
  }
  return path
}

function safeContent(value: string): string {
  const content = String(value ?? '')
  assertPersistable(content)
  if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) {
    throw new Error('builder_file_too_large')
  }
  return content
}

function toFile(row: any): BuilderFile {
  return Object.freeze({
    path: String(row.path),
    content: decodeStoredContent(String(row.content)),
    updatedAt: Date.parse(String(row.updated_at)) || Date.now(),
  })
}

export class SupabaseBuilderWorkspace implements BuilderWorkspacePort {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async ensureWorkspace(workspaceId: string): Promise<void> {
    const { data, error } = await this.db.from('builder_workspaces').select('id').eq('id', workspaceId).eq('user_id', this.userId).maybeSingle()
    if (error) throw new Error(`builder_workspace_lookup: ${error.message}`)
    if (data) return
    const { error: createError } = await this.db.from('builder_workspaces').insert({ id: workspaceId, user_id: this.userId })
    if (createError) throw new Error(`builder_workspace_not_found_or_unavailable: ${createError.message}`)
  }

  async listWorkspaces() {
    const { data, error } = await this.db.from('builder_workspaces')
      .select('id,objective,updated_at')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
      .limit(20)
    if (error) throw new Error(`builder_workspace_list: ${error.message}`)
    return Object.freeze((data ?? []).map(row => Object.freeze({
      id: String(row.id),
      objective: String(row.objective || ''),
      updatedAt: String(row.updated_at),
    })))
  }

  async setObjective(workspaceId: string, objective: string): Promise<void> {
    await this.ensureWorkspace(workspaceId)
    const updatedAt = new Date().toISOString()
    const { error } = await this.db.from('builder_workspaces')
      .update({ objective: String(objective).slice(0, 500), updated_at: updatedAt })
      .eq('id', workspaceId)
      .eq('user_id', this.userId)
    if (error) throw new Error(`builder_workspace_objective: ${error.message}`)
  }

  async listFiles(workspaceId: string) {
    await this.ensureWorkspace(workspaceId)
    const { data, error } = await this.db.from('builder_workspace_files')
      .select('path,updated_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', this.userId)
      .order('path')
    if (error) throw new Error(`builder_file_list: ${error.message}`)
    return Object.freeze((data ?? []).map(row => Object.freeze({
      path: String(row.path),
      updatedAt: Date.parse(String(row.updated_at)) || Date.now(),
    })))
  }

  async readFile(workspaceId: string, path: string) {
    await this.ensureWorkspace(workspaceId)
    const { data, error } = await this.db.from('builder_workspace_files')
      .select('path,content,updated_at')
      .eq('workspace_id', workspaceId)
      .eq('user_id', this.userId)
      .eq('path', safePath(path))
      .maybeSingle()
    if (error) throw new Error(`builder_file_read: ${error.message}`)
    return data ? toFile(data) : null
  }

  async writeFile(workspaceId: string, path: string, content: string) {
    await this.ensureWorkspace(workspaceId)
    const safe = safePath(path)
    const body = safeContent(content)
    const { count, error: countError } = await this.db
      .from('builder_workspace_files')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('user_id', this.userId)
    if (countError) throw new Error(`builder_file_count: ${countError.message}`)
    const existing = await this.readFile(workspaceId, safe)
    if (!existing && Number(count || 0) >= MAX_FILES) throw new Error('builder_file_limit')
    const updatedAt = new Date().toISOString()
    const filePayload = { workspace_id: workspaceId, user_id: this.userId, path: safe, content: encodeStoredContent(body), updated_at: updatedAt }
    const { error } = existing
      ? await this.db.from('builder_workspace_files').update({ content: filePayload.content, updated_at: updatedAt }).eq('workspace_id', workspaceId).eq('user_id', this.userId).eq('path', safe)
      : await this.db.from('builder_workspace_files').insert(filePayload)
    if (error) {
      console.error('[builder_file_write_failed]', {
        message: error.message,
        workspaceIdHasNul: workspaceId.includes('\0'),
        userIdHasNul: this.userId.includes('\0'),
        pathHasNul: safe.includes('\0'),
        storedContentHasNul: encodeStoredContent(body).includes('\0'),
        pathLength: safe.length,
        storedContentLength: encodeStoredContent(body).length,
      })
      throw new Error(`builder_file_write: ${error.message}`)
    }
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

  async recordVerifiedRepairLesson(workspaceId: string, lesson: BuilderVerifiedRepairLesson): Promise<void> {
    const { error } = await this.db.from('builder_verified_repair_lessons').insert({
      workspace_id: workspaceId,
      user_id: this.userId,
      failure_class: lesson.failureClass,
      cause_evidence: lesson.causeEvidence,
      fix_summary: lesson.fixSummary,
      regression_command: lesson.regressionCommand,
      runtime: lesson.runtime,
    })
    if (error) throw new Error(`builder_lesson_write: ${error.message}`)
  }

  async fetchVerifiedRepairLessons(limit = 12): Promise<readonly BuilderVerifiedRepairLesson[]> {
    const { data, error } = await this.db.from('builder_verified_repair_lessons')
      .select('failure_class,cause_evidence,fix_summary,regression_command,runtime')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 20)))
    if (error) throw new Error(`builder_lesson_read: ${error.message}`)
    return Object.freeze((data ?? []).map(row => Object.freeze({
      failureClass: String(row.failure_class) as BuilderFailureClass,
      causeEvidence: String(row.cause_evidence || ''),
      fixSummary: String(row.fix_summary || ''),
      regressionCommand: String(row.regression_command || ''),
      runtime: 'node24-network-denied-ephemeral' as const,
    })))
  }

  async recordCertificationAttempt(workspaceId: string, attempt: BuilderCertificationAttempt): Promise<void> {
    const { error } = await this.db.from('builder_certification_attempts').insert({
      workspace_id: workspaceId,
      user_id: this.userId,
      case_id: attempt.caseId,
      passed: attempt.outcome.passed,
      reason_codes: attempt.outcome.reasons,
    })
    if (error) throw new Error(`builder_certification_write: ${error.message}`)
  }

  async certificationSummary() {
    const { data, error } = await this.db.from('builder_certification_attempts')
      .select('case_id,passed')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(`builder_certification_read: ${error.message}`)
    const passed = new Set((data ?? []).filter(row => row.passed === true).map(row => String(row.case_id)))
    const levels = ['create_and_run_javascript_v1', 'inspect_repair_and_run_v1', 'observe_failure_and_recover_v1']
    const earnedLevel = levels.reduce((level, caseId, index) => passed.has(caseId) ? index + 1 : level, 0)
    return Object.freeze({ earnedLevel, attempts: (data ?? []).length })
  }
}

export function createSupabaseBuilderWorkspace(userId: string): SupabaseBuilderWorkspace | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key || !userId) return null
  return new SupabaseBuilderWorkspace(createClient(url, key, { auth: { persistSession: false } }), userId)
}
