// saas/lib/builder/merge-watch-store.ts
//
// Storage for merges that were completed but not yet judged.
//
// The port is declared separately from the Supabase implementation so the cron's decision
// logic can be tested without a database — the decisions are what matter here, since one of
// them rolls production back.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type MergeWatchStatus = 'healthy' | 'rolled_back' | 'abandoned'

export type PendingMergeWatch = Readonly<{
  id: string
  workspaceId: string
  userId: string
  mergeCommitSha: string
  preMergeSnapshotId: string
  pullRequestNumber: number | null
  attempts: number
}>

export interface MergeWatchStore {
  /** Lease due rows. The lease is written by the same statement that returns them. */
  claim(limit: number, backoffSeconds: number): Promise<readonly PendingMergeWatch[]>
  close(id: string, status: MergeWatchStatus, detail: string): Promise<void>
  record(input: {
    workspaceId: string
    userId: string
    mergeCommitSha: string
    preMergeSnapshotId: string
    pullRequestNumber: number | null
  }): Promise<void>
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function row(value: any): PendingMergeWatch {
  return Object.freeze({
    id: String(value?.id || ''),
    workspaceId: String(value?.workspace_id || ''),
    userId: String(value?.user_id || ''),
    mergeCommitSha: String(value?.merge_commit_sha || ''),
    preMergeSnapshotId: String(value?.pre_merge_snapshot_id || ''),
    pullRequestNumber: typeof value?.pull_request_number === 'number' ? value.pull_request_number : null,
    attempts: Number(value?.attempts || 0),
  })
}

/** Null when storage is unconfigured, so callers degrade rather than throw mid-repair. */
export function createSupabaseMergeWatchStore(): MergeWatchStore | null {
  const db = serviceClient()
  if (!db) return null

  return {
    async claim(limit, backoffSeconds) {
      const { data, error } = await db.rpc('claim_builder_merge_watches', {
        p_limit: limit,
        p_backoff_seconds: backoffSeconds,
      })
      if (error) throw new Error('builder_merge_watch_claim_failed')
      return (Array.isArray(data) ? data : []).map(row)
    },

    async close(id, status, detail) {
      const { error } = await db.rpc('close_builder_merge_watch', {
        p_id: id,
        p_status: status,
        p_detail: detail,
      })
      if (error) throw new Error('builder_merge_watch_close_failed')
    },

    async record(input) {
      // A duplicate for the same commit hits the pending-unique index. That is the intended
      // outcome, not an error: one merge, one watcher.
      const { error } = await db.from('builder_merge_watches').insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        merge_commit_sha: input.mergeCommitSha.toLowerCase(),
        pre_merge_snapshot_id: input.preMergeSnapshotId,
        pull_request_number: input.pullRequestNumber,
      })
      if (error && error.code !== '23505') throw new Error('builder_merge_watch_record_failed')
    },
  }
}
