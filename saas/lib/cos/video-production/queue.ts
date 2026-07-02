import { getAdminSupabase } from '@/utils/supabase/server'
import { buildVideoProductionJob } from './planner'
import type { VideoProductionInput, VideoProductionJob } from './types'

const TABLE = 'cos_video_production_jobs'

export type QueueVideoProductionOptions = {
  queueImmediately?: boolean
  conceptApproved?: boolean
}

export type QueueVideoProductionResult = {
  ok: boolean
  persisted: boolean
  job: VideoProductionJob | any
  id?: string
  status?: string
  warning?: string
  error?: string
}

function toDbJob(job: VideoProductionJob) {
  return {
    title: job.title,
    status: job.status,
    production_tier: job.production_tier,
    platforms: job.platforms,
    hook: job.hook,
    audience: job.audience,
    render_spec: job.render_spec,
    search_package: job.search_package,
    approval_state: job.approval_state,
    output_url: job.output_url,
    thumbnail_url: job.thumbnail_url,
    error: job.error,
  }
}

export async function queueVideoProductionJob(
  input: VideoProductionInput,
  options: QueueVideoProductionOptions = {},
): Promise<QueueVideoProductionResult> {
  const planned = buildVideoProductionJob(input || {})

  if (options.queueImmediately) planned.status = 'queued'
  if (options.conceptApproved || options.queueImmediately) planned.approval_state.concept_approved = true

  try {
    const supabase = getAdminSupabase()
    const { data, error } = await supabase.from(TABLE).insert(toDbJob(planned)).select('*').single()
    if (error) {
      return {
        ok: false,
        persisted: false,
        job: planned,
        status: planned.status,
        error: error.message,
      }
    }
    return {
      ok: true,
      persisted: true,
      job: data,
      id: data?.id,
      status: data?.status,
    }
  } catch (error) {
    return {
      ok: false,
      persisted: false,
      job: planned,
      status: planned.status,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
