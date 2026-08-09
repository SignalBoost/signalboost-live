import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
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
  const generatedAt = () => new Date().toISOString()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Video uploads are temporarily unavailable.', meta: { locale: 'en', generatedAt: generatedAt() } }, 503)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return json({ ok: false, data: null, error: 'Authentication is required to upload videos.', meta: { locale: 'en', generatedAt: generatedAt() } }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'No authorized account was found for this upload.', meta: { locale: 'en', generatedAt: generatedAt() } }, 403)
  }

  const form = await request.formData()
  const lang = locale(form.get('locale'))
  const video = form.get('video')
  if (!(video instanceof File)) {
    return json({ ok: false, data: null, error: 'A video file is required.', meta: { locale: lang, generatedAt: generatedAt() } }, 400)
  }

  const durationSec = Number(form.get('durationSec') || 0)
  const priorUsedMinutes = Number(form.get('usedMinutes') || 0)
  if (!Number.isFinite(durationSec) || durationSec < 0 || durationSec > Number.MAX_SAFE_INTEGER) {
    return json({ ok: false, data: null, error: 'durationSec must be a finite non-negative number.', meta: { locale: lang, generatedAt: generatedAt() } }, 400)
  }
  if (!Number.isFinite(priorUsedMinutes) || priorUsedMinutes < 0 || priorUsedMinutes > Number.MAX_SAFE_INTEGER) {
    return json({ ok: false, data: null, error: 'usedMinutes must be a finite non-negative number.', meta: { locale: lang, generatedAt: generatedAt() } }, 400)
  }

  const usedMinutes = priorUsedMinutes + Math.ceil(durationSec / 60)
  if (!Number.isFinite(usedMinutes) || usedMinutes < 0 || usedMinutes > Number.MAX_SAFE_INTEGER) {
    return json({ ok: false, data: null, error: 'Calculated usage is invalid.', meta: { locale: lang, generatedAt: generatedAt() } }, 400)
  }

  const persisted = await persistVideoUpload(video)
  const tier = String(form.get('tier') || 'free')
  const quota = calculateVideoQuota(tier, usedMinutes, String(form.get('billingProvider') || 'stripe') === 'paypal' ? 'paypal' : 'stripe')

  const { error: insertError } = await supabase.from('video_storage').insert({
    user_id: user.id,
    account_id: accountId,
    filename: persisted.filename,
    source_path: persisted.publicUrl,
    size_mb: persisted.sizeMb,
    duration_sec: Math.round(durationSec),
    captions: [],
    transcoded: false,
  })
  if (insertError) {
    return json({ ok: false, data: null, error: 'Failed to save video metadata.', meta: { locale: lang, generatedAt: generatedAt() } }, 500)
  }

  return json({
    ok: true,
    data: { ...persisted, quota },
    error: null,
    meta: { locale: lang, generatedAt: generatedAt() },
  })
}
