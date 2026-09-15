import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VIDEO_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

function createMeta() {
  return { locale: 'en', generatedAt: new Date().toISOString() }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!VIDEO_JOB_ID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, data: null, error: 'Invalid video job id', meta: createMeta() }, { status: 400 })
  }

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select('id,status,result_url').eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const queueDirWithSeparator = queueDir.endsWith(sep) ? queueDir : `${queueDir}${sep}`
    const resultPath = resolve(queueDir, `${id}.result.json`)

    if (!resultPath.startsWith(queueDirWithSeparator)) {
      return NextResponse.json({ ok: false, data: null, error: 'Invalid video job id', meta: createMeta() }, { status: 400 })
    }

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (stats.size > MAX_RESULT_FILE_BYTES) {
          return NextResponse.json({ ok: false, data: null, error: 'Video job result is too large', meta: createMeta() }, { status: 413 })
        }

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return NextResponse.json({ ok: false, data: null, error: 'Invalid video job result', meta: createMeta() }, { status: 500 })
        }
        data = parsed
      } catch {
        return NextResponse.json({ ok: false, data: null, error: 'Invalid video job result', meta: createMeta() }, { status: 500 })
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: createMeta() }
  return NextResponse.json(body)
}
