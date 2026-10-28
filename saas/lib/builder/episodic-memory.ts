import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { BuilderJobRecord } from './job-store.ts'

export type BuilderEpisode = Readonly<{
  jobId: string
  conversationId: string
  workspaceId: string
  objective: string
  outcome: 'succeeded' | 'failed'
  summary: string
  evidence: Readonly<Record<string, unknown>>
  createdAt: string
}>

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

function bounded(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, '[credential-redacted]')
    .replace(/[A-Za-z0-9_\-]{40,}/g, '[opaque-redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function sanitizedEvidence(value: Record<string, unknown> | undefined): Readonly<Record<string, unknown>> {
  if (!value) return Object.freeze({})
  const safe: Record<string, unknown> = {}
  if (typeof value.error === 'string') safe.error = bounded(value.error, 240)
  if (Array.isArray(value.files)) safe.files = value.files.filter(item => typeof item === 'string').map(item => bounded(item, 240)).slice(0, 30)
  if (typeof value.successfulRuns === 'number' && Number.isFinite(value.successfulRuns)) safe.successfulRuns = Math.max(0, Math.floor(value.successfulRuns))
  if (typeof value.verification === 'string') safe.verification = bounded(value.verification, 300)
  if (typeof value.mergeCommitSha === 'string') safe.mergeCommitSha = /^[0-9a-f]{40}$/i.test(value.mergeCommitSha) ? value.mergeCommitSha : undefined
  if (typeof value.pullRequestNumber === 'number' && Number.isInteger(value.pullRequestNumber)) safe.pullRequestNumber = value.pullRequestNumber
  if (typeof value.productionAcceptancePassed === 'boolean') safe.productionAcceptancePassed = value.productionAcceptancePassed
  return Object.freeze(Object.fromEntries(Object.entries(safe).filter(([, item]) => item !== undefined)))
}

export async function recordBuilderEpisode(input: {
  job: BuilderJobRecord
  outcome: 'succeeded' | 'failed'
  summary: string
  evidence?: Record<string, unknown>
}): Promise<boolean> {
  const db = client()
  if (!db) return false
  const summary = bounded(input.summary, 4000)
  const objective = bounded(input.job.objective, 2000)
  if (!summary || !objective) return false
  const { error } = await db.from('builder_episodes').upsert({
    user_id: input.job.userId,
    conversation_id: input.job.conversationId,
    workspace_id: input.job.workspaceId,
    job_id: input.job.id,
    objective,
    outcome: input.outcome,
    summary,
    evidence: sanitizedEvidence(input.evidence),
  }, { onConflict: 'job_id' })
  if (error) throw new Error('builder_episode_write_failed')
  return true
}


