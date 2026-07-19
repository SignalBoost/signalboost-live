// One-click audit remediation coordinator.  This endpoint is deliberately the
// durable approval boundary: a run can enter the applying state only once.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'

type Event = { file: string; line?: number | null; action: string; timestamp: string }

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (!ctx.isOwner || !ctx.userId) return NextResponse.json({ ok: false, error: 'Owner access required.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { runId?: string; action?: string; events?: Event[] }
  const runId = String(body.runId || '').trim()
  if (!runId) return NextResponse.json({ ok: false, error: 'An audit run is required.' }, { status: 400 })
  const admin = getAdminSupabase()

  if (body.action === 'complete') {
    const events = Array.isArray(body.events) ? body.events.slice(0, 500) : []
    const batch = await admin.from('audit_run_fix_batches').select('id,status').eq('run_id', runId).maybeSingle()
    if (batch.error || !batch.data || batch.data.status !== 'applying') return NextResponse.json({ ok: false, error: 'No active fix batch exists for this run.' }, { status: 409 })
    if (events.length) await admin.from('audit_run_fix_events').insert(events.map(event => ({ batch_id: batch.data.id, file: event.file, line: event.line ?? null, action: event.action, timestamp: event.timestamp })))
    const filesFixed = new Set(events.filter(event => event.action === 'fix_applied').map(event => event.file)).size
    const findingsFixed = events.filter(event => event.action === 'fix_applied').length
    const timestamp = new Date().toISOString()
    const summary = { runId, filesFixed, findingsFixed, status: 'completed', timestamp: timestamp.replace('T', ' ').slice(0, 19) }
    const update = await admin.from('audit_run_fix_batches').update({ status: 'completed', files_fixed: filesFixed, findings_fixed: findingsFixed, completed_at: timestamp, updated_at: timestamp, summary }).eq('id', batch.data.id).eq('status', 'applying').select('summary').maybeSingle()
    if (update.error || !update.data) return NextResponse.json({ ok: false, error: update.error?.message || 'Fix batch was already finalized.' }, { status: 409 })
    return NextResponse.json({ ok: true, summary: update.data.summary })
  }

  const existing = await admin.from('audit_run_fix_batches').select('id,status,summary').eq('run_id', runId).maybeSingle()
  if (existing.data) return NextResponse.json({ ok: false, code: 'fix_batch_already_approved', error: 'Fixes have already been approved for this audit run.', batch: existing.data }, { status: 409 })
  const inserted = await admin.from('audit_run_fix_batches').insert({ run_id: runId, approved_by: ctx.userId }).select('id').maybeSingle()
  if (inserted.error || !inserted.data) return NextResponse.json({ ok: false, error: inserted.error?.message || 'Could not approve this fix batch.' }, { status: 409 })
  return NextResponse.json({ ok: true, batchId: inserted.data.id })
}
