import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const TOKEN_HASH = 'a1196cf279a1786b2c180b2d6355dc6c2c2525ed1188900826d07d30a6e7b6c5'
const CANDIDATE_ID = 'study-plan:e23cb043-715e-4406-8898-421159fae2df'
const READY_BUDGET_MS = 500_000

function authorized(token: string | null): boolean {
  if (!token) return false
  const actual = createHash('sha256').update(token).digest()
  const expected = Buffer.from(TOKEN_HASH, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(req: NextRequest) {
  if (!authorized(req.nextUrl.searchParams.get('token'))) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  const key = configuredRunpodApiKey()
  const db = cosServiceDb()
  if (!key || !db) {
    return NextResponse.json({ ok: false, error: 'runtime_configuration_missing' }, { status: 500 })
  }

  const rows = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', CANDIDATE_ID)
    .eq('verifier', 'host_production_verifier')
    .order('observed_at', { ascending: false })
    .limit(100)
  if (rows.error) throw rows.error

  const canary = (rows.data || []).find((row: any) => row?.evidence?.claim === 'production_canary_healthy'
    && row?.evidence?.exactArtifact === true
    && row?.evidence?.endpointId)
  const endpointId = String((canary as any)?.evidence?.endpointId || '').trim()
  if (!/^[A-Za-z0-9_-]{3,120}$/.test(endpointId)) {
    return NextResponse.json({ ok: false, error: 'proven_endpoint_missing' }, { status: 500 })
  }

  const deadline = Date.now() + READY_BUDGET_MS
  let lastStatus: number | null = null
  while (Date.now() < deadline) {
    const remaining = Math.max(1_000, deadline - Date.now())
    try {
      const response = await fetch(`https://${endpointId}.api.runpod.ai/ready`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
        cache: 'no-store',
      })
      lastStatus = response.status
      if (response.status === 200) {
        return NextResponse.json({ ok: true, ready: true, endpointId }, {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        })
      }
      if (response.status === 503) {
        const detail = (await response.text()).slice(0, 300)
        if (detail.includes('distilled_bootstrap_failed')) {
          return NextResponse.json({ ok: false, error: 'runtime_bootstrap_failed' }, { status: 503 })
        }
      }
    } catch {
      lastStatus = null
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(2_000, Math.max(0, deadline - Date.now()))))
  }

  return NextResponse.json({ ok: false, error: `runtime_not_ready:${lastStatus ?? 'network'}` }, { status: 503 })
}
