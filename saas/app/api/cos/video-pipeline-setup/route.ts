import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'
import { COS_VIDEO_QUEUE_SQL } from '@/lib/operator/videoQueueSchema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function client() {
  const url = process.env[['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')]!
  const key = process.env[['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')]!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const access = await getAccess()
  if (!access.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const sb = client()
  const res = await sb.rpc('hub_exec_sql', { query: COS_VIDEO_QUEUE_SQL })
  if (res.error) {
    return NextResponse.json({ ok: false, error: res.error.message }, { status: 500 })
  }

  const check = await sb.from('cos_video_production_jobs').select('id').limit(1)
  if (check.error) {
    return NextResponse.json({ ok: false, error: check.error.message, setupResult: res.data }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'COS video queue schema is ready.', setupResult: res.data })
}
