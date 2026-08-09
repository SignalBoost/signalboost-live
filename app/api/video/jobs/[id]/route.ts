import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import type { JsonSafeVideoResponse } from '@/lib/video/types'

const SAFE_JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const MAX_RESULT_FILE_BYTES = 1024 * 1024

function responseMeta() {
  return { locale: 'en', generatedAt: new Date().toISOString() }
}

function errorResponse(error: string, status: number) {
  const body: JsonSafeVideoResponse<null> = { ok: false, data: null, error, meta: responseMeta() }
  return NextResponse.json(body, { status })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!SAFE_JOB_ID_PATTERN.test(id)) {
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

    if (!resultPath.startsWith(`${queueDir}${sep}`)) {
      return errorResponse('Invalid video job id', 400)
    }

    if (existsSync(resultPath)) {
      try {
        const stats = statSync(resultPath)
        if (!stats.isFile() || stats.size > MAX_RESULT_FILE_BYTES) {
          return errorResponse('Invalid video result', 500)
        }

        const parsed = JSON.parse(readFileSync(resultPath, 'utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return errorResponse('Invalid video result', 500)
        }

        data = parsed
      } catch {
        return errorResponse('Invalid video result', 500)
      }
    } else {
      data = { id, status: 'queued', result_url: null }
    }
  }
  const body: JsonSafeVideoResponse<typeof data> = { ok: true, data, error: null, meta: responseMeta() }
  return NextResponse.json(body)
}
