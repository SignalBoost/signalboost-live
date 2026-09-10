import { NextResponse } from 'next/server'
import { listBuilderContinuations } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function queuedOwnedSiteRepair(): Promise<{ id: string; userId: string } | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('builder_jobs').select('id,user_id')
    .eq('status', 'queued')
    .eq('job_kind', 'standard')
    .eq('owner_authorized', true)
    .contains('metadata', { selfHealingOwnedSite: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[builder_self_healing_queue_read_failed]', { message: error.message })
    return null
  }
  return data?.id && data?.user_id ? { id: String(data.id), userId: String(data.user_id) } : null
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Original authenticated jobs supply identity and objective. No request-supplied work is accepted.
  // The only queued job this recovery lane adopts is a server-created, owner-authorized repair tagged
  // by Self-Healing after its owned-site allowlist and immutable-revision checks. Ordinary Builder
  // jobs retain their existing after() execution path. Overlapping ticks are safe because claim is atomic.
  const [continuations, ownedRepair] = await Promise.all([
    listBuilderContinuations(),
    queuedOwnedSiteRepair(),
  ])
  const unique = new Map<string, { id: string; userId: string }>()
  for (const job of [...continuations, ...(ownedRepair ? [ownedRepair] : [])]) unique.set(job.id, job)
  const jobs = [...unique.values()]
  await Promise.all(jobs.map(job => runBuilderJob(job.id, job.userId)))
  return NextResponse.json({ ok: true, candidates: jobs.length, ownedSiteRepairQueued: Boolean(ownedRepair) })
}
