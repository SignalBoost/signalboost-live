import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const VALID_JOB_ID = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, { status })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidVideoResult(value: unknown, id: string) {
  if (!isRecord(value)) return false
  if ('id' in value && value.id !== id) return false
  if ('status' in value && typeof value.status !== 'string') return false
  if ('result_url' in value && value.result_url !== null && typeof value.result_url !== 'string') return false
  return true
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!VALID_JOB_ID.test(id)) return errorResponse('Invalid video job id', 400)

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select('id,status,result_url').eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const resultPath = resolve(queueDir, `${id}.result.json`)
    const resultRelativePath = relative(queueDir, resultPath)
    if (resultRelativePath.startsWith('..') || isAbsolute(resultRelativePath)) return errorResponse('Invalid video job id', 400)

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (!stats.isFile()) return errorResponse('Video result is unavailable', 404)
        if (stats.size > MAX_RESULT_FILE_BYTES) return errorResponse('Video result file is too large', 413)

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!isValidVideoResult(parsed, id)) return errorResponse('Video result file is invalid', 500)
        data = parsed
      } catch {
        return errorResponse('Video result file is invalid', 500)
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: { locale: 'en', generatedAt: new Date().toISOString() } }
  return NextResponse.json(body)
}
