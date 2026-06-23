// app/api/video/jobs/[id]/route.ts
// Fetch one video job. SECURITY: now requires an authenticated user AND verifies
// the job belongs to them (was an unauthenticated IDOR — any job by id).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const meta = { locale: 'en', generatedAt: new Date().toISOString() }

  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, data: null, error: 'Unauthorized', meta }, { status: 401 })
  }

  // DB row, scoped to the caller — never returns another user's job.
  const response = await supabase.from('video_jobs').select('*').eq('id', id).single()
  let data: any = response.data

  if (data && data.user_id && data.user_id !== user.id) {
    return NextResponse.json({ ok: false, data: null, error: 'Forbidden', meta }, { status: 403 })
  }

  // Local-queue fallback (auth-gated). Only the in-process result file for this id.
  if (!data) {
    const resultPath = join(process.cwd(), '.video-queue', `${id}.result.json`)
    data = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : { id, status: 'queued', result_url: null }
    if (data && data.user_id && data.user_id !== user.id) {
      return NextResponse.json({ ok: false, data: null, error: 'Forbidden', meta }, { status: 403 })
    }
  }

  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta }
  return NextResponse.json(body)
}
