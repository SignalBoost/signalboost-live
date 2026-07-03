// saas/app/api/cos/video-approval-notify/route.ts
// Owner-only helper: notify the owner only when the FINAL COSA video is ready
// for approval. Raw/base renders are not campaign-ready and must not trigger
// approval requests.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VIDEO_CHANNELS = ['youtube', 'short_video']
const LIMIT = 10

function admin() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']!
  const key = process.env['SUPABASE_' + 'SERVICE_ROLE_KEY']!
  return createClient(url, key, { auth: { persistSession: false } })
}

function finalVideoUrl(video: any): string | null {
  if (!video) return null
  if (video.status !== 'ready') return null
  if (video.branded !== true) return null
  if (!video.voicedUrl) return null
  return String(video.voicedUrl)
}

function approvalUrl(req: NextRequest) {
  const origin = new URL(req.url).origin
  return `${origin}/dashboard/cosa/video-pipeline`
}

export async function GET(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })
  if (!ctx.email) return NextResponse.json({ ok: false, error: 'Owner email missing.' }, { status: 400 })

  const sb = admin()
  const { data: campaigns, error } = await sb
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', VIDEO_CHANNELS)
    .in('status', ['waiting_approval', 'draft'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const toNotify = (campaigns || [])
    .filter((c: any) => {
      const video = c?.metadata?.video
      if (!finalVideoUrl(video)) return false
      if (video?.approvalRequestedAt) return false
      return true
    })
    .slice(0, LIMIT)

  const link = approvalUrl(req)
  const results: any[] = []

  for (const campaign of toNotify) {
    const video = campaign.metadata.video
    const title = String(campaign.title || 'COSA video campaign')
    const sent = await sendEmail({
      from: 'saasMarketing',
      to: ctx.email,
      subject: `Final video ready for approval: ${title.slice(0, 90)}`,
      html: `
        <p>COSA has prepared the final branded video for your review.</p>
        <p><strong>${title}</strong></p>
        <p>This final version should include voice/captions plus the SignalBoostAi and www.saas.signalboostapp.com branding.</p>
        <p><a href="${link}">Open the final video approval page</a></p>
        <p>Approve once. After approval, COSA will continue automatically with publishing and tracking.</p>
      `.trim(),
    })

    const patchVideo = {
      ...video,
      approvalRequestedAt: new Date().toISOString(),
      approvalNotification: {
        ok: Boolean(sent?.ok),
        email: ctx.email,
        finalOnly: true,
        error: sent?.ok ? null : sent?.error || 'send failed',
      },
    }

    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: patchVideo },
    }).eq('id', campaign.id)

    results.push({ campaign: campaign.id, title, notified: Boolean(sent?.ok), finalVideo: true, error: sent?.ok ? null : sent?.error || 'send failed' })
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, notified: results.length, results, approvalPage: link, rule: 'final branded videos only' })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
