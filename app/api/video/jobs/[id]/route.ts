import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

function isSafeJobId(id: string) {
  return id.length > 0 && id.length <= 128 && JOB_ID_PATTERN.test(id)
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

  if (!isSafeJobId(id)) return errorResponse('Invalid job id', 400)

  let data: any = null
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await createMarketingServerSupabase()
    const response = await supabase.from('video_jobs').select('id,status,result_url').eq('id', id).single()
    data = response.data
  }
  if (!data) {
    const queueDir = resolve(process.cwd(), '.video-queue')
    const resultPath = resolve(queueDir, `${id}.result.json`)

    if (!resultPath.startsWith(queueDir + sep)) return errorResponse('Invalid job id', 400)

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (!stats.isFile() || stats.size > MAX_RESULT_FILE_BYTES) return errorResponse('Invalid video result', 500)

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!isRecord(parsed)) return errorResponse('Invalid video result', 500)

        data = parsed
      } catch {
        return errorResponse('Invalid video result', 500)
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: { locale: 'en', generatedAt: new Date().toISOString() } }
  return NextResponse.json(body)
}
