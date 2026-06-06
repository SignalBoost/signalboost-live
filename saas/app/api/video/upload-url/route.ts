// saas/app/api/video/upload-url/route.ts
// Step 1 of the upload flow: validate auth/plan/size, create the job row,
// and return a one-time signed upload URL so the browser can upload the video
// DIRECTLY to Supabase Storage (bypassing Vercel's ~4.5MB request body limit).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

const VIDEO_BUCKET = 'video-jobs'

const PLAN_VIDEO_LIMITS: Record<string, number> = {
  trial: 5,
  starter: 30,
  pro: 120,
  business: 999,
}

const SUPPORTED_LANGS = ['en', 'pt', 'es', 'pl', 'ru']

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  try { return String(err) } catch { return 'unknown error' }
}

function extFromName(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'mp4'
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
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

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fail fast on missing config — before the user uploads anything.
  const missingEnv: string[] = []
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missingEnv.length) {
    return NextResponse.json(
      { error: `Server config error: missing env var(s): ${missingEnv.join(', ')}` },
      { status: 500 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch (err) {
    return NextResponse.json({ error: `Invalid request body: ${errMsg(err)}` }, { status: 400 })
  }

  const fileName = String(body?.fileName ?? '').trim()
  const fileSize = Number(body?.fileSize ?? 0)
  const langsIn: unknown = body?.langs
  const formatsIn: unknown = body?.formats
  const sourceOnly = body?.sourceOnly === true

  if (!fileName || !fileSize) {
    return NextResponse.json({ error: 'fileName and fileSize are required' }, { status: 400 })
  }

  const ext = extFromName(fileName)
  if (!/^(mp4|mov|avi|mkv|webm|mp3|wav|m4a)$/.test(ext)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  const langs = (Array.isArray(langsIn) ? langsIn : [])
    .map((l) => String(l).trim())
    .filter((l) => SUPPORTED_LANGS.includes(l))
  if (!langs.length) langs.push('en')

  const formats = (Array.isArray(formatsIn) ? formatsIn : [])
    .map((f) => String(f).trim())
    .filter((f) => ['srt', 'vtt', 'ass'].includes(f))
  if (!formats.length) formats.push('srt')

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // ── Plan / size check (done here, before upload) ───────────────────────────
  const plan = await getUserPlan(supabaseAdmin, user.id)
  const maxMinutes = PLAN_VIDEO_LIMITS[plan] ?? 5
  const fileSizeMB = fileSize / (1024 * 1024)
  if (fileSizeMB > maxMinutes * 100) {
    return NextResponse.json(
      { error: `File too large for your ${plan} plan. Max ~${maxMinutes} minutes.` },
      { status: 413 },
    )
  }

  // ── Create job + signed upload URL ─────────────────────────────────────────
  const jobId = crypto.randomUUID()
  const path = `${user.id}/${jobId}/source.${ext}`

  const { error: insertError } = sourceOnly
    ? { error: null }
    : await supabaseAdmin.from('video_jobs').insert({
    id: jobId,
    user_id: user.id,
    file_name: fileName,
    file_size: fileSize,
    langs,
    formats,
    status: 'queued',
    job_type: 'caption_burn',
    account_id: user.id,
    source_video: path,
    plan,
  })
  if (insertError) {
    return NextResponse.json(
      { error: `Database error creating job (video_jobs): ${insertError.message}` },
      { status: 500 },
    )
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(VIDEO_BUCKET)
    .createSignedUploadUrl(path)

  if (signError || !signed) {
    return NextResponse.json(
      {
        error: `Could not create upload URL (check the '${VIDEO_BUCKET}' bucket exists): ${
          signError?.message ?? 'unknown'
        }`,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    jobId: sourceOnly ? null : jobId,
    path: signed.path,
    token: signed.token,
    bucket: VIDEO_BUCKET,
    langs,
    formats,
  })
}

async function getUserPlan(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!data?.plan) return 'free'
  const plan = String(data.plan).toLowerCase()
  return ['free', 'trial', 'starter', 'pro', 'business'].includes(plan) ? plan : 'free'
}
