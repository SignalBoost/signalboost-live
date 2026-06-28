import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildVideoProductionJob } from '@/lib/cos/video-production'
import { getAdminSupabase } from '@/utils/supabase/server'
import type { VideoProductionInput, VideoProductionStatus } from '@/lib/cos/video-production'

export const dynamic = 'force-dynamic'

const TABLE = 'cos_video_production_jobs'
const RENDER_BUCKET = 'video-renders'

type PostBody = VideoProductionInput & {
  queue_immediately?: boolean
  concept_approved?: boolean
}

type PatchBody = {
  id?: string
  status?: VideoProductionStatus
  output_url?: string | null
  thumbnail_url?: string | null
  error?: string | null
  approval_state?: Record<string, boolean>
}

function toDbJob(job: ReturnType<typeof buildVideoProductionJob>) {
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

async function withSignedAssets(supabase: ReturnType<typeof getAdminSupabase>, jobs: any[]) {
  const enriched = []
  for (const job of jobs) {
    let signed_output_url: string | null = null
    let signed_thumbnail_url: string | null = null

    if (job.output_url) {
      if (String(job.output_url).startsWith('http')) {
        signed_output_url = job.output_url
      } else {
        const { data } = await supabase.storage.from(RENDER_BUCKET).createSignedUrl(job.output_url, 60 * 60)
        signed_output_url = data?.signedUrl || null
      }
    }

    if (job.thumbnail_url) {
      if (String(job.thumbnail_url).startsWith('http')) {
        signed_thumbnail_url = job.thumbnail_url
      } else {
        const { data } = await supabase.storage.from(RENDER_BUCKET).createSignedUrl(job.thumbnail_url, 60 * 60)
        signed_thumbnail_url = data?.signedUrl || null
      }
    }

    enriched.push({ ...job, signed_output_url, signed_thumbnail_url })
  }
  return enriched
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  try {
    const supabase = getAdminSupabase()
    const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false }).limit(50)
    if (error) return NextResponse.json({ ok: true, jobs: [], warning: error.message })
    const jobs = await withSignedAssets(supabase, data || [])
    return NextResponse.json({ ok: true, jobs })
  } catch (error) {
    return NextResponse.json({ ok: true, jobs: [], warning: error instanceof Error ? error.message : 'Could not load jobs.' })
  }
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: PostBody
  try { body = await req.json() } catch { body = {} }

  const planned = buildVideoProductionJob(body || {})
  if (body.queue_immediately) planned.status = 'queued'
  if (body.concept_approved || body.queue_immediately) planned.approval_state.concept_approved = true

  try {
    const supabase = getAdminSupabase()
    const { data, error } = await supabase.from(TABLE).insert(toDbJob(planned)).select('*').single()
    if (error) return NextResponse.json({ ok: true, job: planned, persisted: false, warning: error.message })
    return NextResponse.json({ ok: true, job: data, persisted: true })
  } catch (error) {
    return NextResponse.json({ ok: true, job: planned, persisted: false, warning: error instanceof Error ? error.message : 'Could not persist job.' })
  }
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: PatchBody
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.id) return NextResponse.json({ ok: false, error: 'Missing job id' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (body.status) update.status = body.status
  if ('output_url' in body) update.output_url = body.output_url
  if ('thumbnail_url' in body) update.thumbnail_url = body.thumbnail_url
  if ('error' in body) update.error = body.error
  if (body.approval_state) update.approval_state = body.approval_state

  try {
    const supabase = getAdminSupabase()
    const { data, error } = await supabase.from(TABLE).update(update).eq('id', body.id).select('*').single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, job: data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Could not update job.' }, { status: 500 })
  }
}
