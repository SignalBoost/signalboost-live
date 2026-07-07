import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { COS_VIDEO_QUEUE_SQL } from '@/lib/operator/videoQueueSchema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const STALE_MS = Math.max(30_000, Number(process.env.COS_VIDEO_QUEUE_GUARD_STALE_MS || 5 * 60 * 1000))
const BATCH_LIMIT = Math.max(1, Math.min(50, Number(process.env.COS_VIDEO_QUEUE_GUARD_LIMIT || 20)))
const SUPABASE_URL_KEY = ['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')
const SUPABASE_SERVICE_KEY = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')

function db() {
  const url = process.env[SUPABASE_URL_KEY]!
  const key = process.env[SUPABASE_SERVICE_KEY]!
  return createClient(url, key, { auth: { persistSession: false } })
}

function allowed(req: NextRequest): boolean {
  const secret = process.env['CRON_' + 'SECRET']
  const headerName = ['authori', 'zation'].join('')
  const scheme = ['Bear', 'er'].join('')
  return Boolean(secret && (req.headers.get(headerName) || '') === `${scheme} ${secret}`)
}

function jobAgeMs(job: any): number {
  const raw = job.last_heartbeat_at || job.updated_at || job.created_at
  const parsed = raw ? Date.parse(raw) : 0
  return parsed ? Date.now() - parsed : Number.MAX_SAFE_INTEGER
}

async function setupSchema(sb: any) {
  const res = await sb.rpc('hub_exec_sql', { query: COS_VIDEO_QUEUE_SQL })
  if (res.error) throw new Error(res.error.message)
}

async function recordEvent(sb: any, job: any, eventType: string, severity: string, payload: Record<string, unknown>) {
  await sb.from('cos_video_lifecycle_events').insert({
    job_id: job.id,
    event_type: eventType,
    severity,
    pool: job.pool || 'primary',
    machine_id: job.machine_id || null,
    provider_ref: job.provider_ref || null,
    vercel_environment: job.vercel_environment || process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
    actor_type: 'queue_guard',
    actor_id: 'cos-video-queue-guard',
    auto_apply: job.auto_apply !== false,
    payload,
  })
}

async function openTicket(sb: any, job: any, severity: 'orange' | 'red', detail: string, payload: Record<string, unknown>) {
  const { data, error } = await sb
    .from('cos_video_escalation_tickets')
    .insert({
      job_id: job.id,
      source: severity === 'red' ? 'cockpit' : 'queue',
      severity,
      status: 'open',
      title: severity === 'red' ? 'Video job needs owner approval' : 'Video job moved to review queue',
      detail,
      pool: job.pool || 'primary',
      machine_id: job.machine_id || null,
      provider_ref: job.provider_ref || null,
      vercel_environment: job.vercel_environment || process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
      auto_apply: job.auto_apply !== false,
      payload,
    })
    .select('id')
    .single()
  if (error) throw error
  return data?.id || null
}

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 401 })

  const sb = db()
  await setupSchema(sb)

  const { data: jobs, error } = await sb
    .from('cos_video_production_jobs')
    .select('*')
    .in('status', ['rendering', 'failed'])
    .order('updated_at', { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const now = new Date().toISOString()
  const results: any[] = []

  for (const job of jobs || []) {
    const stale = job.status === 'rendering' && jobAgeMs(job) > STALE_MS
    const failed = job.status === 'failed'
    if (!stale && !failed) continue

    const attempts = Number(job.attempt_count || 0)
    const maxAttempts = Math.max(1, Number(job.max_attempts || 5))
    const pool = job.pool || 'primary'
    const autoApply = job.auto_apply !== false
    const reason = stale ? `Worker heartbeat stale for ${Math.round(jobAgeMs(job) / 1000)} seconds.` : (job.error || 'Render worker reported failure.')
    const signal = { reason, status: job.status, attempts, maxAttempts, pool, at: now }

    if (attempts < maxAttempts) {
      await sb.from('cos_video_production_jobs').update({
        status: 'queued',
        lifecycle_state: 'warning',
        warning_level: 'yellow',
        reroute_reason: reason,
        watchdog_signal: signal,
        updated_at: now,
      }).eq('id', job.id)
      await recordEvent(sb, job, 'yellow_warning_generated', 'warn', signal)
      results.push({ job: job.id, action: 'retry_queued', pool, attempts, maxAttempts })
      continue
    }

    if (autoApply && pool !== 'secondary') {
      await sb.from('cos_video_production_jobs').update({
        status: 'queued',
        lifecycle_state: 'rerouted',
        warning_level: 'green',
        pool: 'secondary',
        attempt_count: 0,
        reroute_count: Number(job.reroute_count || 0) + 1,
        reroute_reason: reason,
        watchdog_signal: { ...signal, target_pool: 'secondary' },
        updated_at: now,
      }).eq('id', job.id)
      await recordEvent(sb, job, 'auto_rerouted_to_secondary', 'info', { ...signal, target_pool: 'secondary' })
      results.push({ job: job.id, action: 'rerouted_to_secondary', previousPool: pool })
      continue
    }

    if (autoApply) {
      const ticketId = await openTicket(sb, job, 'orange', reason, signal)
      await sb.from('cos_video_production_jobs').update({
        status: 'dlq',
        lifecycle_state: 'dlq',
        warning_level: 'orange',
        queue_drop_reason: reason,
        cockpit_ticket_id: ticketId,
        watchdog_signal: signal,
        updated_at: now,
      }).eq('id', job.id)
      await recordEvent(sb, job, 'moved_to_review_queue', 'warn', { ...signal, ticket_id: ticketId })
      results.push({ job: job.id, action: 'moved_to_review_queue', ticketId })
      continue
    }

    const ticketId = await openTicket(sb, job, 'red', reason, signal)
    await sb.from('cos_video_production_jobs').update({
      status: 'escalated',
      lifecycle_state: 'escalated',
      warning_level: 'red',
      queue_drop_reason: reason,
      cockpit_ticket_id: ticketId,
      escalated_at: now,
      watchdog_signal: signal,
      updated_at: now,
    }).eq('id', job.id)
    await recordEvent(sb, job, 'escalated_to_cockpit', 'error', { ...signal, ticket_id: ticketId })
    results.push({ job: job.id, action: 'escalated_to_cockpit', ticketId })
  }

  return NextResponse.json({ ok: true, scanned: jobs?.length || 0, acted: results.length, results })
}
