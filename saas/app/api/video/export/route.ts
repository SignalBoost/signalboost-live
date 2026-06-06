import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import {
  createBillingOverageIntent,
  createSupabaseAdmin,
  getVideoEntitlement,
  jsonSafe,
  normalizeCaptionStyle,
  RENDER_BUCKET,
  VIDEO_BUCKET,
} from '@/lib/video/pipeline'

function authClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: saasSupabaseCookieOptions,
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseUser = authClient(cookieStore)
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const sourceJobId = String(body?.sourceJobId || '').trim()
  const sourcePath = String(body?.sourcePath || '').trim()
  const captionUrl = String(body?.captionUrl || '').trim()
  const captionLang = String(body?.captionLang || 'en').slice(0, 8)
  const durationSec = Math.max(0, Number(body?.durationSec || 0))
  const sourceSizeMb = Math.max(0, Number(body?.sourceSizeMb || 0))
  const style = normalizeCaptionStyle(body?.style)
  const overlays = Array.isArray(body?.overlays) ? body.overlays.slice(0, 500) : []

  if (!sourceJobId || !sourcePath || !captionUrl) {
    return NextResponse.json({ error: 'sourceJobId, sourcePath, and captionUrl are required' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()
  const { data: sourceJob, error: sourceJobError } = await supabase
    .from('video_jobs')
    .select('*')
    .eq('id', sourceJobId)
    .or(`user_id.eq.${user.id},account_id.eq.${user.id}`)
    .maybeSingle()
  if (sourceJobError) return NextResponse.json({ error: sourceJobError.message }, { status: 500 })
  if (!sourceJob) return NextResponse.json({ error: 'Source video job not found' }, { status: 404 })

  const entitlement = await getVideoEntitlement(supabase, user.id, durationSec, sourceSizeMb)
  if (!entitlement.canExport) {
    return NextResponse.json({ error: entitlement.message, entitlement: jsonSafe(entitlement) }, { status: 402 })
  }

  const exportJobId = crypto.randomUUID()
  const resultPath = `${user.id}/${exportJobId}/final.mp4`
  const accountId = sourceJob.account_id || null

  const { error: insertError } = await supabase.from('video_jobs').insert({
    id: exportJobId,
    user_id: user.id,
    account_id: accountId,
    source_video: sourcePath,
    status: 'queued',
    job_type: 'caption_burn',
    result_url: null,
    queue_payload: jsonSafe({
      sourceJobId,
      sourceBucket: VIDEO_BUCKET,
      sourcePath,
      renderBucket: RENDER_BUCKET,
      resultPath,
      captionUrl,
      captionLang,
      style,
      overlays,
      durationSec,
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (insertError) return NextResponse.json({ error: `Could not enqueue export: ${insertError.message}` }, { status: 500 })

  try {
    await createBillingOverageIntent(supabase, { userId: user.id, accountId, jobId: exportJobId, entitlement })
  } catch (error) {
    await supabase.from('video_jobs').update({ status: 'failed', error: error instanceof Error ? error.message : 'Billing overage error' }).eq('id', exportJobId)
    return NextResponse.json({ error: 'Could not create metered billing event for overage export.' }, { status: 402 })
  }

  return NextResponse.json({
    jobId: exportJobId,
    status: 'queued',
    resultPath,
    entitlement: jsonSafe(entitlement),
    message: entitlement.billingAction === 'charge_overage'
      ? 'Export queued with metered overage billing.'
      : 'Export queued. A dedicated video worker will burn captions into the MP4.',
  })
}
