import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { createExtraRenderBilling } from '@/lib/video/billing'
import { enqueueVideoJob, listVideoJobs, type VideoJobType } from '@/lib/video/queue'
import { getSubscriptionDecision, incrementVideoExportUsage } from '@/lib/video/subscription'

export const runtime = 'nodejs'

const VIDEO_BUCKET = 'video-jobs'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

function isSupportedJobType(value: unknown): value is VideoJobType {
  return value === 'transcode' || value === 'caption_burn' || value === 'export'
}

function safeText(value: unknown): string {
  return String(value ?? '').trim()
}

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server config error: missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  const supabase = adminClient()
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 20)))
  const [jobs, subscription] = await Promise.all([
    listVideoJobs(supabase, user.id, limit),
    getSubscriptionDecision(supabase, user.id),
  ])

  return NextResponse.json({ jobs, subscription, bucket: VIDEO_BUCKET })
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server config error: missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  const sourceVideo = safeText(body?.sourceVideo || body?.source_video || body?.path)
  const captionsPath = safeText(body?.captionsPath || body?.captions_path) || null
  const jobType = isSupportedJobType(body?.jobType) ? body.jobType : 'export'
  if (!sourceVideo) return NextResponse.json({ error: 'sourceVideo is required' }, { status: 400 })

  const supabase = adminClient()
  const subscription = await getSubscriptionDecision(supabase, user.id)

  if (!subscription.allowed && subscription.reason === 'demo_only') {
    return NextResponse.json({
      status: 'demo_playback',
      message: 'Free/demo users can preview demo playback only. Upgrade for full transcoding/export.',
      subscription,
      demo: { playbackOnly: true, watermark: 'SignalBoost demo', exportEnabled: false },
    }, { status: 402 })
  }

  if (!subscription.allowed && subscription.reason === 'over_quota') {
    const billing = await createExtraRenderBilling(user.id, crypto.randomUUID())
    return NextResponse.json({ status: 'billing_required', subscription, billing }, { status: 402 })
  }

  const job = await enqueueVideoJob(supabase, {
    accountId: user.id,
    userId: user.id,
    sourceVideo,
    captionsPath,
    jobType,
    provider: 'ffmpeg',
    metadata: {
      requestedBy: user.email ?? user.id,
      output: 'mp4',
      captionBurn: Boolean(captionsPath),
    },
  })
  await incrementVideoExportUsage(supabase, user.id)

  return NextResponse.json({ status: 'queued', job, subscription }, { status: 202 })
}
