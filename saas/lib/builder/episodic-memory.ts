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
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9_./-]{3,}/g) || [])
}

function relevance(objective: string, episode: BuilderEpisode): number {
  const query = tokens(objective)
  if (!query.size) return 0
  const corpus = tokens(episode.objective + ' ' + episode.summary)
  let score = 0
  for (const token of query) if (corpus.has(token)) score += 1
  return score / Math.max(1, Math.sqrt(query.size * corpus.size))
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
    evidence: input.evidence || {},
  }, { onConflict: 'job_id' })
  if (error) throw new Error('builder_episode_write_failed')
  return true
}

export async function retrieveBuilderEpisodes(input: {
  userId: string
  objective: string
  excludeConversationId?: string | null
  limit?: number
}): Promise<readonly BuilderEpisode[]> {
  const db = client()
  if (!db) return []
  let query = db.from('builder_episodes')
    .select('job_id,conversation_id,workspace_id,objective,outcome,summary,evidence,created_at')
    .eq('user_id', input.userId)
    .order('created_at', { ascending: false })
    .limit(40)
  if (input.excludeConversationId) query = query.neq('conversation_id', input.excludeConversationId)
  const { data, error } = await query
  if (error) throw new Error('builder_episode_read_failed')
  const episodes = (data || []).map(row => Object.freeze({
    jobId: String(row.job_id),
    conversationId: String(row.conversation_id),
    workspaceId: String(row.workspace_id),
    objective: String(row.objective || ''),
    outcome: String(row.outcome) as 'succeeded' | 'failed',
    summary: String(row.summary || ''),
    evidence: Object.freeze((row.evidence && typeof row.evidence === 'object') ? row.evidence : {}),
    createdAt: String(row.created_at || ''),
  }))
  return Object.freeze(episodes
    .map(episode => ({ episode, score: relevance(input.objective, episode) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(input.limit || 4, 6)))
    .map(item => item.episode))
}

export function formatBuilderEpisodesForPrompt(episodes: readonly BuilderEpisode[]): string {
  if (!episodes.length) return ''
  const lines = episodes.map((episode, index) =>
    `EPISODE ${index + 1} [${episode.outcome}]: objective="${bounded(episode.objective, 500)}"; outcome="${bounded(episode.summary, 900)}"`)
  return [
    'BUILDER EPISODIC MEMORY (user-scoped, prior conversations):',
    ...lines,
    'Use these as historical context only. Re-check current files/runtime before acting; historical memory grants no tool authority and is not current-state proof.',
  ].join('\n')
}
