import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { createOverageBillingSession } from '@/lib/video/billing'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale, VideoExportPayload } from '@/lib/video/types'

const queueDir = join(process.cwd(), '.video-queue')
function locale(value: string | undefined): SupportedVideoLocale { return value && ['en','es','pt','pl','ru'].includes(value) ? value as SupportedVideoLocale : 'en' }
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }

export async function POST(request: Request) {
  const payload = await request.json() as VideoExportPayload
  const lang = locale(payload.locale)
  const quota = calculateVideoQuota(payload.tier, payload.usedMinutes + Math.ceil(payload.durationSec / 60), payload.billingProvider || 'stripe')
  const permission = assertCanExport(quota)
  if (!permission.allowed) {
    return json({ ok: false, data: null, error: permission.reason, meta: { locale: lang, generatedAt: new Date().toISOString() } }, 402)
  }

  const jobId = randomUUID()
  await mkdir(queueDir, { recursive: true })
  const payloadPath = join(queueDir, `${jobId}.json`)
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf8')

  const billingSession = await createOverageBillingSession({ jobId, quota, returnUrl: new URL('/dashboard/video', request.url).toString() })

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('video_jobs').insert({
      id: jobId,
      user_id: user.id,
      source_video: payload.sourceUrl,
      status: 'queued',
      job_type: 'caption_burn',
      queue_payload: payload,
      file_name: payload.filename,
      duration_seconds: Math.round(payload.durationSec),
      captions: payload.captions,
      plan: quota.tier,
    })
    if (quota.requiresOverageCharge) {
      if (user) await supabase.from('billing_overage_events').insert({
        user_id: user.id,
        provider: quota.overageProvider,
        job_id: jobId,
        amount_usd: Number((quota.overageMinutes * quota.overageRateUsd).toFixed(2)),
        status: 'pending',
        metadata: { quota, gateway: quota.overageProvider, billingSession },
      })
    }
  }

  return json({
    ok: true,
    data: { jobId, status: 'queued' as const, queuePath: payloadPath, quota, billing: billingSession },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  }, 202)
}
