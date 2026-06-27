// saas/app/api/public/lead-intake/route.ts
// Shared lead intake API for public SignalBoost lead magnets.
// Converts opt-in requests from public tools into owner-review queue records.

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  buildLeadIntake,
  buildOutreachQueueRow,
  isValidLeadEmail,
  normalizeCosLocale,
  normalizeLeadSource,
  normalizePublicTarget,
  type LeadIntakePayload,
} from '@/lib/cos-marketing-sales'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY_BYTES = 16_000
const RATE_WINDOW_MS = 10 * 60_000
const RATE_MAX = 8
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

type Body = Record<string, unknown>

async function readJsonLimited(req: Request): Promise<{ ok: true; value: Body } | { ok: false; error: string; status: number }> {
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) return { ok: false, error: 'Content-Type must be application/json', status: 415 }
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'Request body is too large', status: 413 }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object') return { ok: false, error: 'Invalid JSON body', status: 400 }
    return { ok: true, value: value as Body }
  } catch {
    return { ok: false, error: 'Invalid JSON body', status: 400 }
  }
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

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function asFindings(value: unknown): LeadIntakePayload['findings'] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 12).map(item => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    return {
      code: asString(record.code) || undefined,
      category: asString(record.category) || undefined,
      severity: asString(record.severity) || undefined,
      value: typeof record.value === 'string' || typeof record.value === 'number' || typeof record.value === 'boolean' ? record.value : undefined,
    }
  })
}

function asTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => asString(item)).filter(Boolean).slice(0, 12)
}

async function persistIntake(payload: LeadIntakePayload, intake: ReturnType<typeof buildLeadIntake>) {
  const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!hasSupabaseConfig) {
    return { attempted: false, saved: false, table: 'outreach_queue', reason: 'Supabase service configuration is not available.' }
  }

  try {
    const supabase = getAdminSupabase()
    const row = buildOutreachQueueRow(intake, payload)
    const { data, error } = await supabase
      .from('outreach_queue')
      .insert(row as never)
      .select('id')
      .single()

    if (error) {
      return { attempted: true, saved: false, table: 'outreach_queue', reason: error.message }
    }

    const record = data as { id?: string } | null
    return { attempted: true, saved: true, table: 'outreach_queue', recordId: record?.id }
  } catch (error) {
    return { attempted: true, saved: false, table: 'outreach_queue', reason: error instanceof Error ? error.message : 'Unable to save intake.' }
  }
}

export async function POST(req: Request) {
  if (!sameOriginOk(req)) return NextResponse.json({ ok: false, error: 'Cross-origin request rejected' }, { status: 403 })

  const ipKey = clientIpKey(req)
  if (rateLimited(`public-lead-intake:${ipKey}`)) {
    return NextResponse.json({ ok: false, error: 'Too many requests from this network. Please try again later.' }, { status: 429 })
  }

  const parsed = await readJsonLimited(req)
  if (parsed.ok === false) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status })

  const source = normalizeLeadSource(asString(parsed.value.source))
  const email = asString(parsed.value.email).toLowerCase()
  const targetUrl = normalizePublicTarget(asString(parsed.value.targetUrl))

  if (!source) return NextResponse.json({ ok: false, error: 'Valid lead source is required.' }, { status: 400 })
  if (!isValidLeadEmail(email)) return NextResponse.json({ ok: false, error: 'A valid email is required.' }, { status: 400 })
  if (!targetUrl) return NextResponse.json({ ok: false, error: 'A valid public target URL is required.' }, { status: 400 })

  const payload: LeadIntakePayload = {
    source,
    email,
    name: asString(parsed.value.name) || undefined,
    company: asString(parsed.value.company) || undefined,
    targetUrl,
    locale: normalizeCosLocale(asString(parsed.value.locale)),
    country: asString(parsed.value.country) || undefined,
    score: asNumber(parsed.value.score),
    summary: asObject(parsed.value.summary),
    findings: asFindings(parsed.value.findings),
    tags: asTags(parsed.value.tags),
  }

  const intakeBase = buildLeadIntake(payload)
  const storage = await persistIntake(payload, intakeBase)

  return NextResponse.json({
    ok: true,
    module: 'cos_marketing_sales',
    route: 'public_lead_intake',
    mode: 'owner_review_required',
    intake: { ...intakeBase, storage },
  })
}
