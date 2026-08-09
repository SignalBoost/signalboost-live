import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VIDEO_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const RESULT_FILE_MAX_BYTES = 1024 * 1024
const VIDEO_JOB_COLUMNS = 'id,status,result_url'

function responseMeta() {
  return { locale: 'en', generatedAt: new Date().toISOString() }
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error, meta: responseMeta() }, { status })
}

function isPathInside(parent: string, child: string) {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`
  return child.startsWith(normalizedParent)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!VIDEO_JOB_ID_PATTERN.test(id)) {
    return errorResponse('Invalid job id', 400)
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
    if (!isPathInside(queueDir, resultPath)) {
      return errorResponse('Invalid job id', 400)
    }

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (!stats.isFile()) {
          return errorResponse('Invalid job result', 500)
        }
        if (stats.size > RESULT_FILE_MAX_BYTES) {
          return errorResponse('Job result is too large', 413)
        }

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!isRecord(parsed)) {
          return errorResponse('Invalid job result', 500)
        }
        data = parsed
      } catch {
        return errorResponse('Invalid job result', 500)
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: responseMeta() }
  return NextResponse.json(body)
}
