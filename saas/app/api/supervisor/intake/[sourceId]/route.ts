// saas/app/api/supervisor/intake/[sourceId]/route.ts
//
// THE URL A MONITORING TOOL POSTS TO.

import { NextRequest, NextResponse } from 'next/server'
import { getIncidentIntake } from '@/self-healing-host/incident-intake'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUTH_REASONS = new Set([
  'missing_signature', 'bad_signature', 'missing_shared_secret', 'bad_shared_secret',
  'missing_timestamp', 'invalid_timestamp', 'timestamp_outside_replay_window',
  'timestamp_in_future', 'authentication_error', 'authentication_failed', 'source_disabled',
])

const statusForRejection = (reason: string): number => (AUTH_REASONS.has(reason) ? 401 : 400)

export async function POST(req: NextRequest, ctx: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await ctx.params
  const { runtime: intake } = getIncidentIntake()
  let rawBody: string
  try { rawBody = await req.text() } catch { return NextResponse.json({ ok: false, error: 'unreadable_body' }, { status: 400 }) }
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => { headers[key] = value })
  const result = await intake.deliver(sourceId, { headers, rawBody, receivedAt: new Date().toISOString() })

  if (result.status === 'rejected') return NextResponse.json({ ok: false, status: 'rejected', reason: result.reason }, { status: statusForRejection(result.reason) })
  if (result.status === 'ignored') return NextResponse.json({ ok: true, status: 'ignored', reason: result.reason }, { status: 200 })
  if (result.status === 'duplicate') return NextResponse.json({ ok: true, status: 'duplicate', incidentId: result.duplicateOf }, { status: 200 })
  if (result.status === 'batch') {
    const results = result.results.map(item => {
      if (item.status === 'handled') return { status: 'accepted', incidentId: item.record.incidentId, outcome: item.record.status, replayed: item.replayed }
      if (item.status === 'duplicate') return { status: 'duplicate', incidentId: item.duplicateOf }
      return { status: item.status, reason: item.reason }
    })
    return NextResponse.json({ ok: true, status: 'batch', accepted: results.filter(r => r.status === 'accepted').length, results }, { status: 207 })
  }
  return NextResponse.json({ ok: true, status: 'accepted', incidentId: result.record.incidentId, outcome: result.record.status, reason: result.record.reason, replayed: result.replayed }, { status: 202 })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await ctx.params
  return NextResponse.json({ ok: true, schemaVersion: 'supervisor-incident-intake-v1', sourceId, method: 'POST', note: 'Send incidents with POST. See the incident intake guide for the payload and signing scheme.' }, { status: 200 })
}
