import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const SAFE_VIDEO_JOB_FIELDS = 'id,status,result_url'
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!JOB_ID_PATTERN.test(id)) {
    return NextResponse.json(
      { ok: false, data: null, error: 'Invalid job id', meta: { locale: 'en', generatedAt: new Date().toISOString() } },
      { status: 400 },
    )
  }

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select(SAFE_VIDEO_JOB_FIELDS).eq('id', id).maybeSingle()

    if (response.error) {
      console.error('Failed to load video job', response.error)
      return NextResponse.json(
        { ok: false, data: null, error: 'Failed to load video job', meta: { locale: 'en', generatedAt: new Date().toISOString() } },
        { status: 500 },
      )
    }

    data = response.data
  } else {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const resultPath = resolve(queueDir, `${id}.result.json`)
    const queueDirPrefix = queueDir.endsWith(sep) ? queueDir : `${queueDir}${sep}`

    if (!resultPath.startsWith(queueDirPrefix)) {
      return NextResponse.json(
        { ok: false, data: null, error: 'Invalid job id', meta: { locale: 'en', generatedAt: new Date().toISOString() } },
        { status: 400 },
      )
    }

    if (existsSync(resultPath)) {
      try {
        data = JSON.parse(readFileSync(resultPath, 'utf8'))
      } catch (error) {
        console.error('Failed to read video job result', error)
        return NextResponse.json(
          { ok: false, data: null, error: 'Failed to load video job', meta: { locale: 'en', generatedAt: new Date().toISOString() } },
          { status: 500 },
        )
      }
    }
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, data: null, error: 'Video job not found', meta: { locale: 'en', generatedAt: new Date().toISOString() } },
      { status: 404 },
    )
  }

  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: { locale: 'en', generatedAt: new Date().toISOString() } }
  return NextResponse.json(body)
}
