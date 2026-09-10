import { NextResponse } from 'next/server'
import { listBuilderContinuations } from '@/lib/builder/job-store'
import { runBuilderJob } from '@/lib/builder/job-runner'
import { getAdminSupabase } from '@/utils/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type OwnedRepairKind = 'site' | 'audit'
type QueuedOwnedRepair = { id: string; userId: string; kind: OwnedRepairKind; createdAt: string }

async function queuedOwnedRepair(
  metadataKey: 'selfHealingOwnedSite' | 'selfHealingOwnedAudit',
  kind: OwnedRepairKind,
): Promise<QueuedOwnedRepair | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('builder_jobs').select('id,user_id,created_at')
    .eq('status', 'queued')
    .eq('job_kind', 'standard')
    .eq('owner_authorized', true)
    .contains('metadata', { [metadataKey]: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[builder_self_healing_queue_read_failed]', { kind, message: error.message })
    return null
  }
  return data?.id && data?.user_id
    ? { id: String(data.id), userId: String(data.user_id), kind, createdAt: String(data.created_at || '') }
    : null
}

async function queuedOwnedSelfHealingRepairs(): Promise<QueuedOwnedRepair[]> {
  const [site, audit] = await Promise.all([
    queuedOwnedRepair('selfHealingOwnedSite', 'site'),
    queuedOwnedRepair('selfHealingOwnedAudit', 'audit'),
  ])
  return [site, audit].filter((job): job is QueuedOwnedRepair => Boolean(job))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Original authenticated jobs supply identity and objective. No request-supplied work is accepted.
  // Preserve the established Builder continuation contract first; the production gate verifies that
  // authentication completes before this explicit continuation read. Owned Self-Healing recovery lanes
  // are then evaluated separately so they cannot weaken or obscure the normal continuation path.
  const continuations = await listBuilderContinuations()
  const ownedRepairs = await queuedOwnedSelfHealingRepairs()
  const unique = new Map<string, { id: string; userId: string }>()
  for (const job of [...continuations, ...ownedRepairs]) unique.set(job.id, { id: job.id, userId: job.userId })
  const jobs = [...unique.values()]
  await Promise.all(jobs.map(job => runBuilderJob(job.id, job.userId)))
  return NextResponse.json({
    ok: true,
    candidates: jobs.length,
    ownedSiteRepairQueued: ownedRepairs.some(job => job.kind === 'site'),
    ownedAuditRepairQueued: ownedRepairs.some(job => job.kind === 'audit'),
  })
}
