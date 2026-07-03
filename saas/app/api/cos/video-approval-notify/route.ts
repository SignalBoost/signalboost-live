// saas/app/api/cos/video-approval-notify/route.ts
// Owner-only helper: notify the owner when previewable COSA videos are ready
// for approval. This fills the missing handoff between COSA preparing the video
// and the owner reviewing/approving it.

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

function previewUrl(video: any): string | null {
  if (!video) return null
  if (video.branded === true && video.voicedUrl) return String(video.voicedUrl)
  if (video.voicedUrl) return String(video.voicedUrl)
  if (video.url) return String(video.url)
  return null
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
      if (!previewUrl(video)) return false
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
      subject: `Video ready for approval: ${title.slice(0, 90)}`,
      html: `
        <p>COSA has prepared a video preview for your review.</p>
        <p><strong>${title}</strong></p>
        <p><a href="${link}">Open the video approval page</a></p>
        <p>Review the playable preview, then approve or reject the campaign from the page.</p>
      `.trim(),
    })

    const patchVideo = {
      ...video,
      approvalRequestedAt: new Date().toISOString(),
      approvalNotification: {
        ok: Boolean(sent?.ok),
        email: ctx.email,
        error: sent?.ok ? null : sent?.error || 'send failed',
      },
    }

    await sb.from('cos_campaign_queue').update({
      metadata: { ...(campaign.metadata || {}), video: patchVideo },
    }).eq('id', campaign.id)

    results.push({ campaign: campaign.id, title, notified: Boolean(sent?.ok), error: sent?.ok ? null : sent?.error || 'send failed' })
  }

  return NextResponse.json({ ok: true, scanned: campaigns?.length || 0, notified: results.length, results, approvalPage: link })
}

export async function POST(req: NextRequest) {
  return GET(req)
}
