import type { SupabaseClient } from '@supabase/supabase-js'

export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed'
export type VideoJobType = 'transcode' | 'caption_burn' | 'export'

export type EnqueueVideoJobInput = {
  accountId: string
  userId: string
  sourceVideo: string
  jobType: VideoJobType
  captionsPath?: string | null
  provider?: 'ffmpeg' | 'mux' | 'shotstack' | 'creatomate' | 'remotion_lambda'
  metadata?: Record<string, unknown>
}

export async function enqueueVideoJob(supabase: SupabaseClient, input: EnqueueVideoJobInput) {
  const id = crypto.randomUUID()
  const payload = {
    id,
    account_id: input.accountId,
    user_id: input.userId,
    source_video: input.sourceVideo,
    job_type: input.jobType,
    status: 'queued' satisfies VideoJobStatus,
    captions_path: input.captionsPath ?? null,
    transcode_provider: input.provider ?? 'ffmpeg',
    metadata: input.metadata ?? {},
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase.from('video_jobs').insert(payload).select('*').single()
  if (error) throw new Error(`Could not enqueue video job: ${error.message}`)
  return data
}

export async function listVideoJobs(supabase: SupabaseClient, userId: string, limit = 20) {
  const { data, error } = await supabase
    .from('video_jobs')
    .select('id, source_video, status, job_type, result_url, error, created_at, updated_at, metadata, transcode_provider')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Could not list video jobs: ${error.message}`)
  return data ?? []
}
