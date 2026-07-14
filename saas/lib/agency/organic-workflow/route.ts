// saas/app/api/agency/organic-workflow/route.ts
// BYOK organic campaign generator — the user supplies their own AI provider
// key and pays the provider directly. No platform key is ever used here.
// Keys live only in memory for the duration of the request. Never logged, never stored.

import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getTextAdapter, getUserProvider } from '@/lib/agency/userProviders'
import { resolveUserProviderKey } from '@/lib/agency/userProviderKeys'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 12
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
  error_code?: 'missing_key' | 'invalid_key' | 'provider_error' | 'invalid_output' | 'rate_limited' | 'bad_request'
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
    const result: OrganicResult = { ok: false, error: 'origin not allowed', error_code: 'bad_request' }
    return NextResponse.json(result, { status: 403 })
  }

  const ipKey = clientIpKey(request)
  if (rateLimited(`agency-organic-workflow:${ipKey}`)) {
    const result: OrganicResult = { ok: false, error: 'Too many generations from this network. Please try again later.', error_code: 'rate_limited' }
    return NextResponse.json(result, { status: 429 })
  }

  const body = await request.json().catch(() => null)

  const company = clean(body?.company, 120)
  const announcement = clean(body?.announcement, 1200)
  const audience = clean(body?.audience, 300)
  const website = clean(body?.website, 200)
  const lang = clean(body?.lang, 5).toLowerCase()
  const langName = LANG_NAMES[lang] || 'English'

  const requestedProvider = clean(body?.apiProvider, 60).toLowerCase()
  const template = getUserProvider(requestedProvider)
  const apiProvider = template && template.status === 'live' && template.capability === 'text' ? template.id : 'anthropic'

  let apiKey = clean(body?.apiKey, 400)

  if (!apiKey) {
    // Plug-and-play: logged-in users can use a key they connected once.
    const access = await getAccess().catch(() => null)
    if (access?.userId) {
      apiKey = (await resolveUserProviderKey(access.userId, apiProvider)) || ''
    }
  }

  if (!apiKey || apiKey.length < 20) {
    const result: OrganicResult = { ok: false, error: 'An AI provider API key is required. You pay your provider directly per generation.', error_code: 'missing_key' }
    return NextResponse.json(result, { status: 402 })
  }

  if (!company || !announcement) {
    const result: OrganicResult = { ok: false, error: 'company and announcement are required', error_code: 'bad_request' }
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

  const systemPrompt = 'You are a marketing copy engine. Always return only valid JSON. No markdown fences, no commentary.'

  const adapter = getTextAdapter(apiProvider)
  if (!adapter) {
    const result: OrganicResult = { ok: false, error: 'Provider not supported yet.', error_code: 'bad_request' }
    return NextResponse.json(result, { status: 400 })
  }

  const call = await adapter.generate(apiKey, systemPrompt, prompt, 3000)

  if (!call.ok) {
    const status = call.code === 'invalid_key' ? 401 : 502
    const message = call.code === 'invalid_key'
      ? 'Your API key was rejected by the provider. Check the key and try again.'
      : 'The AI provider request failed. Please try again in a moment.'
    const result: OrganicResult = { ok: false, error: message, error_code: call.code }
    return NextResponse.json(result, { status })
  }

  const assets = extractJson(call.text || '')
  if (!assets) {
    const result: OrganicResult = { ok: false, error: 'generation returned invalid output', error_code: 'invalid_output' }
    return NextResponse.json(result, { status: 502 })
  }

  const result: OrganicResult = { ok: true, assets, channelMode: 'FREE_ORGANIC_MODE' }
  return NextResponse.json(result)
}
