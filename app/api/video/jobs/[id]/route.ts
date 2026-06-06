import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select('*').eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const resultPath = join(process.cwd(), '.video-queue', `${id}.result.json`)
    data = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) : { id, status: 'queued', result_url: null }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: { locale: 'en', generatedAt: new Date().toISOString() } }
  return NextResponse.json(body)
}
