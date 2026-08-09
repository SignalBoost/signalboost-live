import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VIDEO_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

function meta() {
  return { locale: 'en', generatedAt: new Date().toISOString() }
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error, meta: meta() }, { status })
}

function isSafeResultPath(queueDir: string, resultPath: string) {
  return resultPath.startsWith(`${queueDir}${sep}`)
}

function isResultObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readQueuedResult(resultPath: string) {
  if (!existsSync(resultPath)) return { found: false as const }

  try {
    const resultStats = statSync(resultPath)
    if (!resultStats.isFile() || resultStats.size > MAX_RESULT_FILE_BYTES) {
      return { found: true as const, error: 'Invalid video job result' }
    }

    const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
    if (!isResultObject(parsed)) {
      return { found: true as const, error: 'Invalid video job result' }
    }

    return { found: true as const, data: parsed }
  } catch {
    return { found: true as const, error: 'Invalid video job result' }
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!VIDEO_JOB_ID_PATTERN.test(id)) {
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
    const resultPath = resolve(queueDir, `${id}.result.json`)

    if (!isSafeResultPath(queueDir, resultPath)) {
      return errorResponse('Invalid video job id', 400)
    }

    const queuedResult = readQueuedResult(resultPath)
    if (queuedResult.found) {
      if (queuedResult.error) return errorResponse(queuedResult.error, 500)
      data = queuedResult.data
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: meta() }
  return NextResponse.json(body)
}
