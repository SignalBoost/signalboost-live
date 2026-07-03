// saas/app/api/cos/publish-status/route.ts
// Owner-only publishing status check for recent COSA campaigns.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

const VIDEO_CHANNELS = ['youtube', 'short_video']

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function summarizePublished(published: any) {
  if (!published || typeof published !== 'object') return []
  return Object.entries(published).map(([key, value]: [string, any]) => ({
    key,
    publishedAt: value?.publishedAt || null,
    language: value?.language || null,
    liveUrl: value?.result?.liveUrl || value?.result?.url || null,
    notified: Boolean(value?.notified),
    error: value?.notifyError || null,
  }))
}

export async function GET() {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const sb = admin()
  const { data, error } = await sb
    .from('cos_campaign_queue')
    .select('id,title,channel,status,created_at,approved_at,approved_by,metadata')
    .in('channel', VIDEO_CHANNELS)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const campaigns = (data || []).map((c: any) => {
    const meta = c.metadata || {}
    const video = meta.video || {}
    const publishedEntries = summarizePublished(meta.published)
    const published = publishedEntries.length > 0
    const blockedReason = published ? null : (meta.auto_publish_note || video.autoPublishNote || null)
    const finalReady = video.status === 'ready' && video.branded === true && Boolean(video.voicedUrl)
    return {
      id: c.id,
      title: c.title,
      channel: c.channel,
      status: c.status,
      createdAt: c.created_at,
      approvedAt: c.approved_at || null,
      finalVideoReady: finalReady,
      published,
      publishedEntries,
      liveUrls: publishedEntries.map((p: any) => p.liveUrl).filter(Boolean),
      blockedReason,
      autoPublish: meta.autoPublish || null,
      autoPublishReady: meta.autoPublishReady || null,
      videoStage: video.status || null,
      branded: video.branded === true,
    }
  })

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), campaigns })
}
