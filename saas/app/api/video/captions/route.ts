import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type CaptionCue = {
  id: string
  start: number
  end: number
  text: string
}

type JsonSafeVideoResponse<T> = {
  ok: boolean
  data: T | null
  error: string | null
  meta: {
    locale: SupportedVideoLocale
    generatedAt: string
  }
}

const supportedLocales: SupportedVideoLocale[] = ['en', 'es', 'pt', 'pl', 'ru']

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) {
  return NextResponse.json(body, { status })
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return supportedLocales.includes(requested as SupportedVideoLocale)
    ? requested as SupportedVideoLocale
    : 'en'
}

function parseTimestamp(value: string) {
  const normalized = value.trim().replace(',', '.')
  const parts = normalized.split(':')

  if (parts.length !== 3) return 0

  const [hours, minutes, seconds] = parts

  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

function normalizeText(lines: string[]) {
  return lines
    .join(' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCaptionText(input: string): CaptionCue[] {
  const blocks = input
    .replace(/^WEBVTT[^\n]*(?:\r?\n(?:NOTE[^\n]*\r?\n)?)?(?:\r?\n)/, '')
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0)

  const cues: CaptionCue[] = []

  for (const block of blocks) {
    const timingIndex = block.findIndex((line) => line.includes('-->'))

    if (timingIndex === -1) continue

    const [startRaw, endRaw] = block[timingIndex]
      .split('-->')
      .map((part) => part.trim().split(/\s+/)[0])

    const text = normalizeText(block.slice(timingIndex + 1))

    if (!text) continue

    cues.push({
      id: `cue-${cues.length + 1}`,
      start: parseTimestamp(startRaw),
      end: parseTimestamp(endRaw),
      text,
    })
  }

  return cues
}

export async function POST(request: Request) {
  const lang = localeFromRequest(request)
  const formData = await request.formData()
  const file = formData.get('captions')

  const raw =
    typeof file === 'string'
      ? file
      : file instanceof File
        ? await file.text()
        : String(formData.get('text') || '')

  const cues = parseCaptionText(raw)

  return json({
    ok: true,
    data: {
      cues,
      cueCount: cues.length,
    },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  })
}
