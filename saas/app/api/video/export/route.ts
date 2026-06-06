import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { refundVideoCredit, spendVideoCredit } from '@/lib/credits'

export const runtime = 'nodejs'
export const maxDuration = 60

type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type CaptionCue = {
  id: string
  start: number
  end: number
  text: string
}

type CaptionStyle = {
  fontFamily: string
  color: string
  backgroundColor: string
  fontSize: number
  animation: 'none' | 'fade' | 'slide' | 'pop'
  x: number
  y: number
}

type VideoExportPayload = {
  sourceUrl: string
  filename: string
  durationSec: number
  captions: CaptionCue[]
  style: CaptionStyle
  aspectRatio?: '9:16' | '1:1' | '16:9'
  locale: SupportedVideoLocale
  tier?: string
  usedMinutes?: number
}

type JsonSafeVideoResponse<T> = {
  ok: boolean
  data: T | null
  error: string | null
  meta: {
    locale: SupportedVideoLocale
    generatedAt: string
  }
}

const supportedLocales: SupportedVideoLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) {
  return NextResponse.json(body, { status })
}

function locale(value: unknown): SupportedVideoLocale {
  const requested = String(value || 'en')

  return supportedLocales.includes(requested as SupportedVideoLocale)
    ? requested as SupportedVideoLocale
    : 'en'
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

async function getUser() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Safe to ignore in server contexts where cookies cannot be set.
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

async function resolveAccountId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('accounts')
    .select('id')
    .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

export async function POST(request: Request) {
  let payload: VideoExportPayload

  try {
    payload = await request.json()
  } catch {
    return json(
      {
        ok: false,
        data: null,
        error: 'Invalid export payload.',
        meta: { locale: 'en', generatedAt: new Date().toISOString() },
      },
      400,
    )
  }

  const lang = locale(payload.locale)

  if (!payload.sourceUrl) {
    return json(
      {
        ok: false,
        data: null,
        error: 'A source video URL is required.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      400,
    )
  }

  const user = await getUser()

  if (!user?.id) {
    return json(
      {
        ok: false,
        data: null,
        error: 'You must be signed in to export videos.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      401,
    )
  }

  const credit = await spendVideoCredit(user.id)

  if (!credit.ok) {
    return json(
      {
        ok: false,
        data: null,
        error: 'You do not have enough video credits to export. Upgrade or wait for your monthly reset.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      402,
    )
  }

  const supabase = adminClient()

  if (!supabase) {
    await refundVideoCredit(user.id)

    return json(
      {
        ok: false,
        data: null,
        error: 'Video export storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }

  const jobId = randomUUID()

  try {
    const accountId = await resolveAccountId(supabase, user.id)

    const queuePayload = {
      ...payload,
      userId: user.id,
      accountId,
      locale: lang,
      creditSpent: true,
      creditsRemaining: credit.remaining,
      plan: credit.plan,
    }

    const { error } = await supabase.from('video_jobs').insert({
      id: jobId,
      user_id: user.id,
      account_id: accountId,
      source_video: payload.sourceUrl,
      status: 'queued',
      job_type: 'export',
      queue_payload: queuePayload,
      file_name: payload.filename || 'video.mp4',
      duration_seconds: Math.round(Number(payload.durationSec) || 0),
      captions: Array.isArray(payload.captions) ? payload.captions : [],
      plan: credit.plan,
    })

    if (error) throw new Error(error.message)

    return json({
      ok: true,
      data: {
        jobId,
        status: 'queued' as const,
        creditsRemaining: credit.remaining,
        plan: credit.plan,
      },
      error: null,
      meta: { locale: lang, generatedAt: new Date().toISOString() },
    }, 202)
  } catch (error) {
    await refundVideoCredit(user.id)

    return json(
      {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : 'Export queue failed.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }
}
