import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

function isInsideDirectory(baseDir: string, targetPath: string) {
  const relativePath = relative(baseDir, targetPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { ok: false, data: null, error, meta: { locale: 'en', generatedAt: new Date().toISOString() } },
    { status },
  )
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!JOB_ID_PATTERN.test(id)) {
    return errorResponse('Invalid video job id', 400)
  }

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select('id,status,result_url').eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const resultPath = resolve(join(queueDir, `${id}.result.json`))

    if (!isInsideDirectory(queueDir, resultPath)) {
      return errorResponse('Invalid video job id', 400)
    }

    if (existsSync(resultPath)) {
      try {
        const realQueueDir = realpathSync(queueDir)
        const realResultPath = realpathSync(resultPath)

        if (!isInsideDirectory(realQueueDir, realResultPath)) {
          return errorResponse('Invalid video job result', 500)
        }

        const stats = statSync(realResultPath)
        if (!stats.isFile() || stats.size > MAX_RESULT_FILE_BYTES) {
          return errorResponse('Invalid video job result', 500)
        }

        const parsed = JSON.parse(readFileSync(realResultPath, 'utf8'))
        if (!isRecord(parsed)) {
          return errorResponse('Invalid video job result', 500)
        }
        data = parsed
      } catch {
        return errorResponse('Invalid video job result', 500)
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: { locale: 'en', generatedAt: new Date().toISOString() } }
  return NextResponse.json(body)
}
