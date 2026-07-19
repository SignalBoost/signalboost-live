import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const access = await getAccess()
  if (!access.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const { data, error } = await admin()
    .from('cos_campaign_queue')
    .select('id, metadata')
    .in('channel', ['youtube', 'short_video'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const integrity = Object.fromEntries((data || []).map((campaign: any) => {
    const video = campaign?.metadata?.video || {}
    return [String(campaign.id), {
      audioTrack: video.audioTrack === true,
      captionsBurned: video.captionsBurned === true,
      voiceFallback: video.voiceFallback === true,
      voiceLocalFallback: video.voiceLocalFallback === true,
      voiceStatus: video.voiceStatus || null,
      voiceEngine: video.voiceEngine || null,
      voiceCompletedAt: video.voiceCompletedAt || null,
    }]
  }))

  return NextResponse.json({ ok: true, integrity })
}
