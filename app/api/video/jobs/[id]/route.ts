import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VIDEO_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024
const VIDEO_JOB_COLUMNS = 'id,status,result_url'

function meta() {
  return { locale: 'en', generatedAt: new Date().toISOString() }
}

function isPathInsideDirectory(directory: string, filePath: string) {
  const relativePath = relative(directory, filePath)
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!VIDEO_JOB_ID_PATTERN.test(id)) {
    const body: JsonSafeVideoResponse<null> = { ok: false, data: null, error: 'Invalid video job id', meta: meta() }
    return NextResponse.json(body, { status: 400 })
  }

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select(VIDEO_JOB_COLUMNS).eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const resultPath = resolve(queueDir, `${id}.result.json`)

    if (!isPathInsideDirectory(queueDir, resultPath)) {
      const body: JsonSafeVideoResponse<null> = { ok: false, data: null, error: 'Invalid video job id', meta: meta() }
      return NextResponse.json(body, { status: 400 })
    }

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (!stats.isFile() || stats.size > MAX_RESULT_FILE_BYTES) {
          throw new Error('Invalid video result file')
        }

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Invalid video result data')
        }
        data = parsed
      } catch {
        const body: JsonSafeVideoResponse<null> = { ok: false, data: null, error: 'Invalid video result', meta: meta() }
        return NextResponse.json(body, { status: 500 })
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: meta() }
  return NextResponse.json(body)
}
