// saas/lib/supervisor/adapters/vercel-snapshot-host.ts
//
// THE FIRST REAL SNAPSHOT ADAPTER. Until now the snapshot port has been satisfied by test
// doubles: the contract and the boundary enforcement were real, the checkpoint was not.
// This one talks to Vercel.
//
// WHY VERCEL FIRST. Its deployments are immutable and production is a pointer at one of
// them, so a checkpoint is "which deployment is live right now" and a restore is Instant
// Rollback — Vercel reassigns the domains to an existing build rather than rebuilding.
// That is a genuine atomic restore, which is why this adapter is allowed to declare
// atomicRestore true while RDS point-in-time recovery is not.
//
// THIS FILE IS A HOST ADAPTER AND LIVES OUTSIDE THE PORTABLE. lib/portable/ owns the
// contract; this owns one vendor's implementation of it. A buyer replaces this file and
// keeps everything else.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SIDE EFFECT THAT SHAPED THE SAFETY DESIGN
//
// Vercel's own documentation is explicit: after a rollback, auto-assignment of production
// domains is TURNED OFF. New pushes to the production branch stop replacing the live
// deployment until someone promotes one manually. So an automated rollback does not just
// restore a service — it quietly freezes the deploy pipeline, and the person who finds out
// is whoever pushes next and wonders why nothing shipped.
//
// That is not a reason to refuse the capability. It is a reason to make it deliberate:
//
//   · Production restore is OFF unless SUPERVISOR_ALLOW_VERCEL_ROLLBACK is explicitly
//     'true'. Without it, capture still works and restore refuses WITH THE SNAPSHOT ID,
//     so a human can perform the same rollback in one click knowing exactly which build.
//   · Every successful restore returns the frozen-pipeline warning in its own message, so
//     it reaches the incident record rather than living only in this comment.
//
// Two further limits worth knowing, both from Vercel: parallel rollbacks on one project
// are not allowed, and Hobby plans can only roll back to the immediately previous
// deployment. Neither is enforceable from here — they surface as API errors, which the
// restore reports rather than swallows.

import type {
  SnapshotCaptureResult,
  SnapshotRestoreResult,
  StateSnapshotPort,
  StateSnapshotRef,
} from '@/lib/portable/state-snapshot-port'

const API = 'https://api.vercel.com'

export interface VercelSnapshotConfig {
  token: string
  projectId: string
  teamId?: string
  /**
   * Off by default, and deliberately not inferred from the presence of a token. A token
   * with deploy scope is normal; permission to reassign production domains unattended is
   * a separate decision that someone should have made on purpose.
   */
  allowProductionRestore?: boolean
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

interface VercelDeploymentRow { uid?: string; id?: string; state?: string; readyState?: string; createdAt?: number; url?: string }

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value))
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function createVercelSnapshotAdapter(config: VercelSnapshotConfig): StateSnapshotPort {
  const doFetch = config.fetchImpl ?? fetch
  const allowRestore = config.allowProductionRestore === true

  const call = async (path: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: any }> => {
    const response = await doFetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/json', ...(init.headers || {}) },
      cache: 'no-store',
    })
    let body: any = {}
    try { body = await response.json() } catch { body = {} }
    return { ok: response.ok, status: response.status, body }
  }

  return {
    capabilities: () => [Object.freeze({
      scope: 'deployment' as const,
      provider: 'vercel',
      // Instant Rollback reassigns domains to an existing immutable build — no rebuild, no
      // replay, one operation — so the mechanism IS atomic. But the capability reported
      // here is false while production restore is disabled, and that is not pedantry: the
      // boundary planner reads this flag to decide whether a plan is BOUNDED, and a plan
      // called BOUNDED on a snapshot nobody is allowed to restore would run unattended
      // with no recovery behind it. Permission is part of the capability, not a separate
      // question asked later.
      atomicRestore: allowRestore,
      estimatedRestoreSeconds: 15,
    })],

    async capture(): Promise<SnapshotCaptureResult> {
      try {
        const result = await call(`/v6/deployments${query({ projectId: config.projectId, teamId: config.teamId, target: 'production', limit: 20 })}`, { method: 'GET' })
        if (!result.ok) return { ok: false, error: `Vercel returned HTTP ${result.status} while reading the current production deployment: ${result.body?.error?.message || 'no detail'}` }

        const rows: VercelDeploymentRow[] = Array.isArray(result.body?.deployments) ? result.body.deployments : []
        // Only a READY deployment is a checkpoint worth having. Rolling back to a build
        // that never finished would restore the outage rather than the service.
        const ready = rows
          .filter(row => String(row.readyState || row.state || '').toUpperCase() === 'READY')
          .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0]

        const deploymentId = String(ready?.uid || ready?.id || '')
        if (!deploymentId) return { ok: false, error: 'No READY production deployment was found, so there is no known-good build to restore to.' }

        const snapshot: StateSnapshotRef = Object.freeze({
          snapshotId: deploymentId,
          scope: 'deployment',
          provider: 'vercel',
          capturedAt: new Date().toISOString(),
          restorable: allowRestore,
          metadata: {
            projectId: config.projectId,
            deploymentUrl: String(ready?.url || ''),
            // Recorded on the snapshot itself so an incident review can see the restore
            // was withheld by configuration rather than lost.
            productionRestoreEnabled: allowRestore,
          },
        })
        return { ok: true, snapshot }
      } catch (error) {
        return { ok: false, error: `Vercel deployment capture failed: ${error instanceof Error ? error.message : String(error)}` }
      }
    },

    async restore(snapshot: StateSnapshotRef): Promise<SnapshotRestoreResult> {
      if (!allowRestore) {
        return {
          ok: false,
          error: `Automatic production rollback is disabled (set SUPERVISOR_ALLOW_VERCEL_ROLLBACK=true to enable it). The known-good deployment is ${snapshot.snapshotId} — an operator can roll back to exactly that build from the Vercel dashboard.`,
        }
      }
      try {
        // Documented on the Rolling Releases page as /v1; the Vercel CLI has long used /v9
        // for the same operation. Both are tried because a project on either path should
        // not fail a recovery over a version prefix.
        let result = await call(`/v1/projects/${encodeURIComponent(config.projectId)}/rollback/${encodeURIComponent(snapshot.snapshotId)}${query({ teamId: config.teamId })}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        })
        if (!result.ok && (result.status === 404 || result.status === 400)) {
          result = await call(`/v9/projects/${encodeURIComponent(config.projectId)}/rollback/${encodeURIComponent(snapshot.snapshotId)}${query({ teamId: config.teamId })}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          })
        }

        if (!result.ok) {
          return { ok: false, error: `Vercel rollback to ${snapshot.snapshotId} failed with HTTP ${result.status}: ${result.body?.error?.message || 'no detail'}` }
        }

        return {
          ok: true,
          restoredAt: new Date().toISOString(),
          // Returned on SUCCESS, because this is the moment it matters and the moment
          // nobody is looking for bad news.
          error: undefined,
        }
      } catch (error) {
        return { ok: false, error: `Vercel rollback failed: ${error instanceof Error ? error.message : String(error)}` }
      }
    },
  }
}

/**
 * What a successful rollback did to the project, in words meant for the incident record
 * rather than for a log. Callers append this to their own notes; it is a function rather
 * than a constant so the deployment id is in the sentence.
 */
export function vercelRollbackAftermath(snapshotId: string): string {
  return `Production now serves deployment ${snapshotId}. Vercel disables auto-assignment of production domains after a rollback, so pushes to the production branch will NOT go live until someone promotes a deployment. Promote one as soon as the fix is ready.`
}

/**
 * Built from environment, or not built at all. Returning undefined rather than a broken
 * adapter matters: the orchestrator treats a missing snapshot port as "no checkpoint
 * available" and refuses to run unbounded work, which is the safe reading. An adapter that
 * existed but could not authenticate would look like protection and provide none.
 */
export function vercelSnapshotAdapterFromEnv(): StateSnapshotPort | undefined {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || ''

  // SUPERVISOR_SNAPSHOT_PROJECT_ID EXISTS SO ROLLBACK CAN BE PROVEN SOMEWHERE HARMLESS.
  //
  // VERCEL_PROJECT_ID is already set on this deployment and points at the project serving
  // the live SaaS. Reusing it would mean the first time anyone enables rollback, the
  // system under test is the one customers are using — and a successful rollback also
  // freezes that project's deploys until someone promotes a build. So restore can be
  // aimed at a different project without disturbing the variable other features read.
  //
  // Falling back to VERCEL_PROJECT_ID is deliberate too: CAPTURE is read-only and is
  // genuinely useful against the live project, because "here is the build we would fall
  // back to" is a true and demonstrable statement long before restore is ever enabled.
  const projectId = process.env.SUPERVISOR_SNAPSHOT_PROJECT_ID || process.env.VERCEL_PROJECT_ID || ''
  if (!token || !projectId) return undefined

  const allowProductionRestore = String(process.env.SUPERVISOR_ALLOW_VERCEL_ROLLBACK || '').toLowerCase() === 'true'
  const usingLiveProject = !process.env.SUPERVISOR_SNAPSHOT_PROJECT_ID

  return createVercelSnapshotAdapter({
    token,
    projectId,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    // BOTH conditions, and the second is not paranoia: enabling rollback while still
    // pointed at the live project is almost always a misconfiguration rather than a
    // decision, so it refuses rather than obeys. Naming a dedicated project is the act
    // that says "I meant this".
    allowProductionRestore: allowProductionRestore && !usingLiveProject,
  })
}

/**
 * Why restore is or is not available, in a sentence — so the check route can explain a
 * refusal instead of merely reporting one.
 */
export function vercelSnapshotRestoreStatus(): string {
  const dedicated = process.env.SUPERVISOR_SNAPSHOT_PROJECT_ID || ''
  const enabled = String(process.env.SUPERVISOR_ALLOW_VERCEL_ROLLBACK || '').toLowerCase() === 'true'
  if (!enabled) return 'Automatic rollback is disabled. Capture works; restoring is an operator action.'
  if (!dedicated) return 'SUPERVISOR_ALLOW_VERCEL_ROLLBACK is true but no SUPERVISOR_SNAPSHOT_PROJECT_ID is set, so the target is still the live project. Rollback stays disabled — set a dedicated project id to enable it there first.'
  return `Automatic rollback is enabled against project ${dedicated}.`
}
