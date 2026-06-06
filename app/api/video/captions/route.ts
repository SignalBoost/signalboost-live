import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)
  const formData = await request.formData()
  const file = formData.get('captions')
  const raw = typeof file === 'string' ? file : file instanceof File ? await file.text() : String(formData.get('text') || '')
  const cues = parseCaptionText(raw)
  const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
    ok: true,
    data: { cues, cueCount: cues.length },
    error: null,
    meta: { locale, generatedAt: new Date().toISOString() },
  }
  return NextResponse.json(body)
}
