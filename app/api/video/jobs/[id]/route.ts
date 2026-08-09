import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VIDEO_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024
const VIDEO_QUEUE_DIR = resolve(process.cwd(), '.video-queue')
const VIDEO_JOB_SELECT_FIELDS = 'id,status,result_url'

function responseBody<T>(ok: boolean, data: T, error: string | null): JsonSafeVideoResponse<T> {
  return { ok, data, error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!VIDEO_JOB_ID_PATTERN.test(id)) {
    return NextResponse.json(responseBody(false, null, 'Invalid video job id'), { status: 400 })
  }

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select(VIDEO_JOB_SELECT_FIELDS).eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const resultPath = resolve(VIDEO_QUEUE_DIR, `${id}.result.json`)
    if (!resultPath.startsWith(`${VIDEO_QUEUE_DIR}${sep}`)) {
      return NextResponse.json(responseBody(false, null, 'Invalid video job id'), { status: 400 })
    }

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (!stats.isFile() || stats.size > MAX_RESULT_FILE_BYTES) {
          return NextResponse.json(responseBody(false, null, 'Invalid video job result'), { status: 500 })
        }

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return NextResponse.json(responseBody(false, null, 'Invalid video job result'), { status: 500 })
        }
        data = parsed
      } catch {
        return NextResponse.json(responseBody(false, null, 'Invalid video job result'), { status: 500 })
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = responseBody(true, data, null)
  return NextResponse.json(body)
}
