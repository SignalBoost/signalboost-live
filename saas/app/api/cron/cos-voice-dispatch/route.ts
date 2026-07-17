import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LIMIT = Number(process.env.COS_VOICE_CRON_LIMIT || 10)
const MAX_ATTEMPTS = Number(process.env.COS_VOICE_CRON_MAX_ATTEMPTS || 3)

function languageFor(campaign: any) {
  const langs = Array.isArray(campaign.languages) ? campaign.languages.filter(Boolean).map(String) : []
  return langs[0] || 'en'
}

async function dispatchVoice(req: NextRequest, id: string, language: string) {
  const url = new URL('/api/cos/campaign-queue/voice-video', req.url)
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cos-cron-secret': process.env.CRON_SECRET || '' },
    body: JSON.stringify({ id, language }),
    cache: 'no-store',
  })
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized_cron' }, { status: 401 })
  }

  const db = getAdminSupabase()
  const { data, error } = await db.from('cos_campaign_queue').select('*').eq('status', 'waiting_for_voice').order('created_at', { ascending: true }).limit(LIMIT)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results = []
  for (const campaign of data || []) {
    const attempts = Number(campaign.metadata?.voiceDispatch?.attempts || 0)
    if (attempts >= MAX_ATTEMPTS) {
      results.push({ id: campaign.id, ok: false, skipped: true, reason: 'max_attempts_exhausted' })
      continue
    }
    const language = languageFor(campaign)
    const nextMetadata = { ...(campaign.metadata || {}), voiceDispatch: { attempts: attempts + 1, lastAttemptAt: new Date().toISOString(), language } }
    await db.from('cos_campaign_queue').update({ status: 'voice_in_progress', metadata: nextMetadata }).eq('id', campaign.id).eq('status', 'waiting_for_voice')
    try {
      const response = await dispatchVoice(req, campaign.id, language)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `voice-video route returned ${response.status}`)
      await db.from('cos_campaign_queue').update({ status: 'voice_done', metadata: { ...nextMetadata, voiceDispatch: { ...nextMetadata.voiceDispatch, completedAt: new Date().toISOString(), response: { branded: payload.branded ?? null, url: payload.url || null } } } }).eq('id', campaign.id)
      results.push({ id: campaign.id, ok: true, language, status: 'voice_done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.from('cos_campaign_queue').update({ status: 'waiting_for_voice', metadata: { ...nextMetadata, voiceDispatch: { ...nextMetadata.voiceDispatch, lastError: message } } }).eq('id', campaign.id)
      console.error('COSA voice cron dispatch failed', { id: campaign.id, language, attempts: attempts + 1, error: message })
      results.push({ id: campaign.id, ok: false, language, error: message })
    }
  }

  return NextResponse.json({ ok: true, scanned: data?.length || 0, results })
}

export async function POST(req: NextRequest) { return GET(req) }
