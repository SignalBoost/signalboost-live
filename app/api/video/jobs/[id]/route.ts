import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VIDEO_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const meta = { locale: 'en', generatedAt: new Date().toISOString() }

  if (!VIDEO_JOB_ID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, data: null, error: 'Invalid job id', meta }, { status: 400 })
  }

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select('*').eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const resultPath = resolve(queueDir, `${id}.result.json`)
    const queuePrefix = queueDir.endsWith(sep) ? queueDir : `${queueDir}${sep}`

    if (!resultPath.startsWith(queuePrefix)) {
      return NextResponse.json({ ok: false, data: null, error: 'Invalid job id', meta }, { status: 400 })
    }

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (stats.size > MAX_RESULT_FILE_BYTES) {
          return NextResponse.json({ ok: false, data: null, error: 'Result file is too large', meta }, { status: 413 })
        }

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return NextResponse.json({ ok: false, data: null, error: 'Invalid result file', meta }, { status: 500 })
        }
        data = parsed
      } catch {
        return NextResponse.json({ ok: false, data: null, error: 'Invalid result file', meta }, { status: 500 })
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta }
  return NextResponse.json(body)
}
