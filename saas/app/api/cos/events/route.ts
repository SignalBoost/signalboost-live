// saas/app/api/cos/events/route.ts
// Ingestion seam for the COS mining layer. Authenticated users append behavioral /
// transactional events to the raw lake. The session identity stamps user_id — the
// client cannot spoof whose events these are.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { getMiningStore } from '@/lib/cos/mining/storage'
import { RawEvent, EventType, DeviceType } from '@/lib/cos/mining/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EVENT_TYPES = new Set<EventType>(['click', 'deposit', 'transfer', 'transaction', 'campaign', 'provider_api'])
const DEVICES = new Set<DeviceType>(['mobile', 'desktop', 'tablet', 'unknown'])

function sanitize(raw: any, userId: string): RawEvent | null {
  if (!raw || !EVENT_TYPES.has(raw.event_type)) return null
  const occurred = typeof raw.occurred_at === 'string' && !isNaN(Date.parse(raw.occurred_at))
    ? raw.occurred_at
    : new Date().toISOString()
  const device = DEVICES.has(raw.device_type) ? raw.device_type : 'unknown'
  const amount = Number.isFinite(raw.amount_cents) ? Math.trunc(raw.amount_cents) : null
  return {
    user_id: userId, // server-stamped, not trusted from client
    event_type: raw.event_type,
    provider: typeof raw.provider === 'string' ? raw.provider.slice(0, 120) : null,
    amount_cents: amount,
    device_type: device,
    occurred_at: occurred,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const incoming = Array.isArray(body?.events) ? body.events : [body]
  const clean = incoming.map((e: any) => sanitize(e, user.id)).filter(Boolean) as RawEvent[]
  if (clean.length === 0) return NextResponse.json({ ok: false, error: 'No valid events' }, { status: 400 })
  if (clean.length > 500) return NextResponse.json({ ok: false, error: 'Batch too large (max 500)' }, { status: 400 })

  const result = await getMiningStore().appendEvents(clean)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: result.inserted })
}
