import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const { data, error } = await admin()
    .from('cos_campaign_queue')
    .select('id, metadata')
    .not('metadata->>video_archived_at', 'is', null)
    .limit(500)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const archived = (data || []).map((row: any) => ({
    id: String(row.id),
    archived_at: row?.metadata?.video_archived_at || null,
  }))

  return NextResponse.json({ ok: true, archived })
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const id = String(body?.id || '').trim()
  const action = body?.action === 'restore' ? 'restore' : 'archive'
  if (!id) return NextResponse.json({ ok: false, error: 'Campaign id is required.' }, { status: 400 })

  const sb = admin()
  const { data: campaign, error: readError } = await sb
    .from('cos_campaign_queue')
    .select('id, metadata')
    .eq('id', id)
    .single()

  if (readError || !campaign) return NextResponse.json({ ok: false, error: readError?.message || 'Campaign not found.' }, { status: 404 })

  const metadata = { ...(campaign.metadata || {}) } as Record<string, any>
  if (action === 'archive') metadata.video_archived_at = new Date().toISOString()
  else delete metadata.video_archived_at

  const { error } = await sb.from('cos_campaign_queue').update({ metadata }).eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id, action, archived_at: metadata.video_archived_at || null })
}
