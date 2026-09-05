// saas/lib/builder/repository-repair-snapshot-host.ts
//
// The checkpoint auto-merge is admitted against. Host adapter, not portable code: it names
// Vercel and reads this deployment's environment. A buyer replaces this file.
//
// WHY THIS IS NOT vercelSnapshotAdapterFromEnv().
//
// The Supervisor's env factory only ever reports restorable: true when rollback is aimed at
// SUPERVISOR_SNAPSHOT_PROJECT_ID — a DIFFERENT project from the live one, deliberately, so
// rollback could be proven somewhere harmless. That is right for the Supervisor and wrong
// here. A bad merge breaks the live SaaS project, so the only checkpoint that means anything
// is the live project's current production deployment. Restoring a dedicated practice project
// would satisfy the check and undo nothing.
//
// So this factory reads VERCEL_PROJECT_ID on purpose, and takes its restore permission from
// its own flag rather than borrowing the Supervisor's.
//
// TWO FLAGS, BOTH DELIBERATE. BUILDER_AUTO_MERGE_ENABLED lets the lane attempt a merge;
// BUILDER_AUTO_MERGE_ROLLBACK_ENABLED decides whether the captured deployment is declared
// restorable. Without the second, capture still succeeds and reports the exact build that
// would have been the rollback target — and attemptSignalBoostRepositoryAutoMerge refuses on
// snapshot_not_restorable, leaving the PR open. That refusal is the correct default: no
// checkpoint you can actually use, no unattended merge.
//
// Note the cost Vercel attaches to the restore this enables: after a rollback, auto-assignment
// of production domains is turned off, so later pushes stop going live until someone promotes
// a build. See vercelRollbackAftermath() — that warning belongs in whatever watches the merge.

import { createVercelSnapshotAdapter } from '@/lib/supervisor/adapters/vercel-snapshot-host'
import type { StateSnapshotPort } from '@/lib/portable/state-snapshot-port'

export function builderAutoMergeRollbackEnabled(): boolean {
  return String(process.env.BUILDER_AUTO_MERGE_ROLLBACK_ENABLED || '').trim().toLowerCase() === 'true'
}

/**
 * Null rather than a half-configured adapter: a missing snapshot port reads as "no checkpoint
 * available" and refuses the merge, which is the safe reading. An adapter that existed but
 * could not authenticate would look like protection and provide none.
 */
export function builderAutoMergeSnapshotPort(): StateSnapshotPort | null {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  if (!token || !projectId) return null

  return createVercelSnapshotAdapter({
    token,
    projectId,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    allowProductionRestore: builderAutoMergeRollbackEnabled(),
  })
}

/** Why auto-merge will or will not find a usable checkpoint, in a sentence. */
export function builderAutoMergeSnapshotStatus(): string {
  const token = process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || ''
  const projectId = process.env.VERCEL_PROJECT_ID || ''
  if (!token || !projectId) return 'No Vercel credentials are configured, so no checkpoint can be captured and auto-merge stays PR-only.'
  if (!builderAutoMergeRollbackEnabled()) return `Checkpoints are captured against project ${projectId} but are not marked restorable, so auto-merge refuses and the pull request stays open. Set BUILDER_AUTO_MERGE_ROLLBACK_ENABLED to change that.`
  return `Checkpoints are captured against project ${projectId} and are restorable, so auto-merge may complete when the flag is on and the diff carries no danger category.`
}
