// saas/lib/audit/snapshotCache.ts
// Central provider-snapshot cache for the Audit suite.
//
// One 'Run Audit' collects fresh provider facts (GitHub/Vercel/Supabase/Stripe/
// identities/secrets) ONCE and writes the structured payload here. Every report
// card route then reads the latest cached snapshot instead of re-collecting live
// on each click — faster, cheaper, and a single source of truth shared with the
// Hub-driven operator run.
//
// The fallback collector uses the existing Console Hub provider-template tunnel,
// so Audit evidence stays aligned with Console Hub, COS, Cybersecurity, and
// Infrastructure PRs.
//
// Helpers never throw: report routes fall back to a one-off live collection when
// the cache is empty. `admin` is the service-role Supabase client (typed `any`,
// repo convention — strict:false).

import { collectProviderTemplateSnapshot } from '@/lib/audit/providerTemplateSnapshot'
import type { AuditSnapshot } from '@/lib/audit/findingsEngine'

const TABLE = 'audit_snapshots'

export async function writeSnapshot(
  admin: any,
  opts: { runId?: string | null; userId?: string | null; snapshot: AuditSnapshot },
): Promise<void> {
  try {
    await admin.from(TABLE).insert({
      run_id:      opts.runId ?? null,
      user_id:     opts.userId ?? null,
      snapshot:    opts.snapshot,
      captured_at: opts.snapshot?.capturedAt ?? new Date().toISOString(),
    })
  } catch {
    /* cache write is best-effort — never break the run on a write failure */
  }
}

export async function readLatestSnapshot(
  admin: any,
): Promise<{ snapshot: AuditSnapshot; capturedAt: string } | null> {
  try {
    const { data } = await admin
      .from(TABLE)
      .select('snapshot, captured_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data || !data.snapshot) return null
    return { snapshot: data.snapshot as AuditSnapshot, capturedAt: String(data.captured_at || '') }
  } catch {
    return null
  }
}

// What every report route calls. Returns the latest cached snapshot; if the cache
// is empty (no run yet) it falls back to a live collection so reports still render
// before the first audit has ever been run.
export async function getReportSnapshot(admin: any): Promise<AuditSnapshot> {
  const cached = await readLatestSnapshot(admin)
  if (cached) return cached.snapshot
  return collectProviderTemplateSnapshot()
}
