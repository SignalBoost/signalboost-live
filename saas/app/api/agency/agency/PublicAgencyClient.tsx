import { NextResponse } from 'next/server'
import { callModel } from '@/lib/ai/modelRouter'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 6
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type OrganicAssets = {
  youtubeTitle: string
  youtubeDescription: string
  youtubeCommunityPost: string
  linkedinCompanyPost: string
  linkedinFounderPost: string
  pressReleaseSubject: string
  pressReleaseBody: string
}

type OrganicResult = {
  ok: boolean
  error?: string
  assets?: OrganicAssets
  channelMode?: string
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
}

function sameOriginOk(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) return true
  const host = req.headers.get('host')
  if (!host) return false
  try { return new URL(origin).host === host } catch { return false }
}

function clientIpKey(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const first = forwarded.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function rateLimited(key: string) {
  const now = Date.now()
  const existing = rateBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  existing.count += 1
  if (existing.count % 50 === 0 || rateBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(bucketKey)
  }
  return existing.count > RATE_MAX
}

function clean(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function extractJson(raw: string): OrganicAssets | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    const fields = [
      'youtubeTitle',
      'youtubeDescription',
      'youtubeCommunityPost',
      'linkedinCompanyPost',
      'linkedinFounderPost',
      'pressReleaseSubject',
      'pressReleaseBody',
    ]
    const out: Record<string, string> = {}
    for (const field of fields) {
      const value = parsed?.[field]
      if (typeof value !== 'string' || !value.trim()) return null
      out[field] = value.trim()
    }
    return out as OrganicAssets
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  if (!sameOriginOk(request)) {
    const result: OrganicResult = { ok: false, error: 'origin not allowed' }
    return NextResponse.json(result, { status: 403 })
  }

  const ipKey = clientIpKey(request)
  if (rateLimited(`agency-organic-workflow:${ipKey}`)) {
    const result: OrganicResult = { ok: false, error: 'Too many generations from this network. Please try again later.' }
    return NextResponse.json(result, { status: 429 })
  }

  const body = await request.json().catch(() => null)

  const company = clean(body?.company, 120)
  const announcement = clean(body?.announcement, 1200)
  const audience = clean(body?.audience, 300)
  const website = clean(body?.website, 200)
  const lang = clean(body?.lang, 5).toLowerCase()
  const langName = LANG_NAMES[lang] || 'English'

  if (!company || !announcement) {
    const result: OrganicResult = { ok: false, error: 'company and announcement are required' }
    return NextResponse.json(result, { status: 400 })
  }

  const prompt = [
    'You are the SignalBoost Free Organic Mode campaign engine. Generate zero-cost organic campaign assets.',
    'Business context:',
    '- Company / brand: ' + company,
    '- Announcement / campaign goal: ' + announcement,
    audience ? '- Target audience: ' + audience : '',
    website ? '- Website / CTA link: ' + website : '',
    '',
    'Write every asset in ' + langName + '.',
    'Rules: no paid-media language, no ad-spend references, no hashtag spam (max 3 hashtags per post), professional but energetic tone, concrete and specific to the context above.',
    '',
    'Return ONLY a valid JSON object with exactly these string fields and nothing else:',
    '{',
    '  "youtubeTitle": "video title, max 90 chars",',
    '  "youtubeDescription": "video description with CTA, 400-700 chars",',
    '  "youtubeCommunityPost": "YouTube community post, 200-400 chars",',
    '  "linkedinCompanyPost": "LinkedIn company-page post, 500-900 chars",',
    '  "linkedinFounderPost": "personal founder-voice LinkedIn post, 500-900 chars",',
    '  "pressReleaseSubject": "press release email subject, max 90 chars",',
    '  "pressReleaseBody": "press release email body for newspaper/magazine journalists, 800-1400 chars, plain text paragraphs"',
    '}',
  ].filter(Boolean).join('\n')

  const raw = await callModel({
    prompt,
    maxTokens: 3000,
    systemPrompt: 'You are a marketing copy engine. Always return only valid JSON. No markdown fences, no commentary.',
  })

  if (!raw) {
    const result: OrganicResult = { ok: false, error: 'generation unavailable' }
    return NextResponse.json(result, { status: 502 })
  }

  const assets = extractJson(raw)
  if (!assets) {
    const result: OrganicResult = { ok: false, error: 'generation returned invalid output' }
    return NextResponse.json(result, { status: 502 })
  }

  const result: OrganicResult = { ok: true, assets, channelMode: 'FREE_ORGANIC_MODE' }
  return NextResponse.json(result)
}
