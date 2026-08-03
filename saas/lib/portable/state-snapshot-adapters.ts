// saas/lib/portable/state-snapshot-adapters.ts
//
// PRE-STAGED CHECKPOINT MECHANISMS.
//
// state-snapshot-port.ts defines what a checkpoint IS. This file supplies working
// implementations for the mechanisms large companies already run, so a buyer does not
// have to write one before the platform can protect a repair.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY EVERY ADAPTER TAKES INJECTED FUNCTIONS INSTEAD OF AN SDK
//
// Not one of these imports a vendor library. Each takes a small set of calls the buyer
// already has wired — their own client, their own credentials, their own network path,
// their own retry policy. That is what keeps the portable portable: a buyer drops it into
// their stack without inheriting our dependency tree, our SDK versions or our auth model,
// and the adapter contributes the one thing they cannot get from a README — the SEMANTICS
// of that mechanism, including whether its restore is genuinely atomic.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE atomicRestore FLAG IS THE WHOLE POINT, AND IT IS SET HONESTLY BELOW
//
// planTransactionBoundary only classifies a plan BOUNDED when every scope it touches has
// an ATOMIC restore. So this flag decides whether a repair runs unattended. Two of the
// adapters here declare false, and they are the interesting ones:
//
//   RDS point-in-time recovery restores into a NEW instance and needs a cutover. It is a
//   superb recovery mechanism and a poor transaction — minutes, not seconds, and a
//   connection-string change in the middle. Marked non-atomic, so a database repair on
//   PITR alone will not run unattended. That is the correct answer, not a limitation to
//   work around.
//
//   Object-store versioning restores per key. A repair touching many keys can leave some
//   restored and some not, which is exactly the partial-replay fragility snapshots exist
//   to remove.
//
// Setting either of these to true would make more plans BOUNDED and more repairs run
// unattended. That is precisely why they are false.

import type {
  SnapshotCapability,
  SnapshotCaptureResult,
  SnapshotRestoreResult,
  SnapshotScope,
  StateSnapshotPort,
  StateSnapshotRef,
} from './state-snapshot-port.ts'

const nowIso = () => new Date().toISOString()

function ref(
  scope: SnapshotScope,
  provider: string,
  snapshotId: string,
  metadata: Record<string, string | number | boolean> = {},
  expiresAt?: string,
): StateSnapshotRef {
  return Object.freeze({ snapshotId, scope, provider, capturedAt: nowIso(), restorable: true, ...(expiresAt ? { expiresAt } : {}), metadata })
}

function failed(error: unknown, what: string): SnapshotCaptureResult & SnapshotRestoreResult {
  return { ok: false, error: `${what}: ${error instanceof Error ? error.message : String(error)}` }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. VERCEL — DEPLOYMENT ALIASING.  ATOMIC.
//
// The cleanest checkpoint in common use. Builds are immutable and a production alias is a
// pointer, so capturing means writing down which deployment the alias currently targets
// and restoring means pointing it back. Nothing is rebuilt, nothing is replayed, and the
// switch is a single API call — a genuine transaction boundary.

export interface VercelDeploymentSnapshotDeps {
  /** The deployment id the production alias currently resolves to. */
  currentDeploymentId(): Promise<string> | string
  /** Repoint the alias at a previous deployment id. */
  assignAlias(deploymentId: string): Promise<void> | void
  projectId?: string
}

export function createVercelDeploymentSnapshotAdapter(deps: VercelDeploymentSnapshotDeps): StateSnapshotPort {
  return {
    capabilities: () => [Object.freeze({ scope: 'deployment' as const, provider: 'vercel', atomicRestore: true, estimatedRestoreSeconds: 10 })],
    async capture() {
      try {
        const deploymentId = await deps.currentDeploymentId()
        if (!deploymentId) return { ok: false, error: 'No current production deployment id was returned.' }
        return { ok: true, snapshot: ref('deployment', 'vercel', deploymentId, { projectId: deps.projectId ?? '' }) }
      } catch (error) { return failed(error, 'Vercel deployment capture failed') }
    },
    async restore(snapshot) {
      try {
        await deps.assignAlias(snapshot.snapshotId)
        return { ok: true, restoredAt: nowIso() }
      } catch (error) { return failed(error, 'Vercel alias restore failed') }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KUBERNETES — ROLLOUT REVISION.  ATOMIC.
//
// A Deployment keeps its revision history, so the checkpoint is the current revision
// number and the restore is `rollout undo --to-revision`. The rollout itself is gradual,
// but it is one declarative operation with a single outcome, which is what atomic means
// here: no per-step reasoning, no partially applied state to reconcile by hand.

export interface KubernetesRolloutSnapshotDeps {
  currentRevision(): Promise<string | number> | string | number
  undoToRevision(revision: string): Promise<void> | void
  /** Optional: block until the rollout settles, so a restore reports success only when it is true. */
  waitForRollout?(): Promise<{ ready: boolean; detail?: string }> | { ready: boolean; detail?: string }
  namespace?: string
  workload?: string
}

export function createKubernetesRolloutSnapshotAdapter(deps: KubernetesRolloutSnapshotDeps): StateSnapshotPort {
  return {
    capabilities: () => [
      Object.freeze({ scope: 'container' as const, provider: 'kubernetes', atomicRestore: true, estimatedRestoreSeconds: 60 }),
      Object.freeze({ scope: 'deployment' as const, provider: 'kubernetes', atomicRestore: true, estimatedRestoreSeconds: 60 }),
    ],
    async capture() {
      try {
        const revision = String(await deps.currentRevision())
        if (!revision) return { ok: false, error: 'No current rollout revision was returned.' }
        return { ok: true, snapshot: ref('container', 'kubernetes', revision, { namespace: deps.namespace ?? '', workload: deps.workload ?? '' }) }
      } catch (error) { return failed(error, 'Kubernetes revision capture failed') }
    },
    async restore(snapshot) {
      try {
        await deps.undoToRevision(snapshot.snapshotId)
        if (deps.waitForRollout) {
          const settled = await deps.waitForRollout()
          // A rollout that was accepted but has not converged is not a completed restore.
          // Reporting success here would let the verifier check a system still in motion.
          if (!settled.ready) return { ok: false, error: `Rollout to revision ${snapshot.snapshotId} did not become ready: ${settled.detail ?? 'not ready'}` }
        }
        return { ok: true, restoredAt: nowIso() }
      } catch (error) { return failed(error, 'Kubernetes rollout undo failed') }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SQL SAVEPOINT — DATABASE.  ATOMIC, WITH ONE REAL CONDITION.
//
// The strictest boundary available: the repair runs inside a transaction and a failure
// rolls back to a savepoint. Postgres, MySQL and SQL Server all support this.
//
// THE CONDITION, AND IT IS NOT NEGOTIABLE: a savepoint only exists inside the connection
// and transaction that created it. If the repair's writes go through a different
// connection — a pool handing out a second session, a job queue, an external service —
// the savepoint protects nothing while appearing to protect everything. The buyer
// supplies `sameTransaction`, and a false answer at restore time is reported as a failed
// restore rather than a successful one. A checkpoint you cannot prove you are inside is
// not a checkpoint.

export interface SqlSavepointSnapshotDeps {
  createSavepoint(name: string): Promise<void> | void
  rollbackToSavepoint(name: string): Promise<void> | void
  releaseSavepoint?(name: string): Promise<void> | void
  /** Must report whether the ORIGINAL transaction is still open on the SAME connection. */
  sameTransaction(): Promise<boolean> | boolean
  engine?: string
}

export function createSqlSavepointSnapshotAdapter(deps: SqlSavepointSnapshotDeps): StateSnapshotPort {
  return {
    capabilities: () => [Object.freeze({ scope: 'database' as const, provider: deps.engine ?? 'sql', atomicRestore: true, estimatedRestoreSeconds: 1 })],
    async capture() {
      try {
        const name = `sb_repair_${Date.now().toString(36)}`
        await deps.createSavepoint(name)
        return { ok: true, snapshot: ref('database', deps.engine ?? 'sql', name, { engine: deps.engine ?? 'sql' }) }
      } catch (error) { return failed(error, 'Savepoint creation failed') }
    },
    async restore(snapshot) {
      try {
        if (!(await deps.sameTransaction())) {
          return { ok: false, error: `Savepoint ${snapshot.snapshotId} is no longer reachable: the original transaction and connection are gone, so rolling back to it would silently do nothing.` }
        }
        await deps.rollbackToSavepoint(snapshot.snapshotId)
        return { ok: true, restoredAt: nowIso() }
      } catch (error) { return failed(error, 'Savepoint rollback failed') }
    },
    async release(snapshot) {
      try { if (deps.releaseSavepoint && await deps.sameTransaction()) await deps.releaseSavepoint(snapshot.snapshotId) } catch { /* releasing is housekeeping; never fail an incident over it */ }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AWS RDS — POINT-IN-TIME RECOVERY.  DELIBERATELY NON-ATOMIC.
//
// Excellent recovery, poor transaction. PITR restores into a NEW instance and someone has
// to cut connections over to it — minutes of work with a config change in the middle.
// Declared non-atomic so a database repair resting on PITR alone is classified UNBOUNDED
// and will not run unattended. Pair it with the savepoint adapter for the transactional
// path and keep PITR as the deeper safety net beneath it.

export interface RdsPointInTimeSnapshotDeps {
  latestRestorableTime(): Promise<string> | string
  restoreToPointInTime(input: { restoreTime: string; sourceInstanceId: string }): Promise<{ newInstanceId: string }> | { newInstanceId: string }
  sourceInstanceId: string
}

export function createRdsPointInTimeSnapshotAdapter(deps: RdsPointInTimeSnapshotDeps): StateSnapshotPort {
  return {
    capabilities: () => [Object.freeze({ scope: 'database' as const, provider: 'aws-rds', atomicRestore: false, estimatedRestoreSeconds: 900 })],
    async capture() {
      try {
        const restoreTime = String(await deps.latestRestorableTime())
        if (!restoreTime) return { ok: false, error: 'RDS reported no restorable time.' }
        return { ok: true, snapshot: ref('database', 'aws-rds', restoreTime, { sourceInstanceId: deps.sourceInstanceId }) }
      } catch (error) { return failed(error, 'RDS restorable-time capture failed') }
    },
    async restore(snapshot) {
      try {
        const result = await deps.restoreToPointInTime({ restoreTime: snapshot.snapshotId, sourceInstanceId: deps.sourceInstanceId })
        // The restore is only half of it. The new instance exists; traffic still points at
        // the old one. Reported as a failure ON PURPOSE so nobody downstream reads
        // "restored" and believes the incident is over.
        return { ok: false, error: `A restored instance was created (${result.newInstanceId}), but traffic still points at ${deps.sourceInstanceId}. Cutover is a human decision.` }
      } catch (error) { return failed(error, 'RDS point-in-time restore failed') }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. OBJECT STORE VERSIONING — FILESYSTEM.  NON-ATOMIC.
//
// S3, GCS and Azure Blob all keep prior versions, and restoring one key is reliable.
// Restoring twenty is twenty operations that can partly fail, which is the fragility
// snapshots exist to remove, so this is declared non-atomic.

export interface ObjectStoreVersionSnapshotDeps {
  listCurrentVersions(): Promise<Array<{ key: string; versionId: string }>> | Array<{ key: string; versionId: string }>
  restoreVersion(input: { key: string; versionId: string }): Promise<void> | void
  bucket: string
  provider?: string
}

export function createObjectStoreVersionSnapshotAdapter(deps: ObjectStoreVersionSnapshotDeps): StateSnapshotPort {
  const provider = deps.provider ?? 'object-store'
  const held = new Map<string, Array<{ key: string; versionId: string }>>()
  return {
    capabilities: () => [Object.freeze({ scope: 'filesystem' as const, provider, atomicRestore: false, estimatedRestoreSeconds: 120 })],
    async capture() {
      try {
        const versions = await deps.listCurrentVersions()
        if (!versions.length) return { ok: false, error: `No versioned objects found in ${deps.bucket}. Versioning may be disabled, in which case there is nothing to restore to.` }
        const id = `${deps.bucket}:${Date.now().toString(36)}`
        held.set(id, versions)
        return { ok: true, snapshot: ref('filesystem', provider, id, { bucket: deps.bucket, objectCount: versions.length }) }
      } catch (error) { return failed(error, 'Object version capture failed') }
    },
    async restore(snapshot) {
      const versions = held.get(snapshot.snapshotId)
      if (!versions) return { ok: false, error: `Version manifest ${snapshot.snapshotId} is no longer held in memory, so the prior versions cannot be identified.` }
      const failures: string[] = []
      for (const entry of versions) {
        try { await deps.restoreVersion(entry) } catch (error) { failures.push(`${entry.key}: ${error instanceof Error ? error.message : 'failed'}`) }
      }
      if (failures.length) return { ok: false, error: `${failures.length} of ${versions.length} objects did not restore: ${failures.slice(0, 3).join('; ')}` }
      return { ok: true, restoredAt: nowIso() }
    },
    release(snapshot) { held.delete(snapshot.snapshotId) },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. EXTERNAL SAAS RECORDS — CRM, AD PLATFORMS, ANYTHING WITH AN API AND NO UNDO.
//    NON-ATOMIC, AND THE REASON WHY IS THE MOST IMPORTANT NOTE IN THIS FILE.
//
// This is the adapter Marketing and Sales needs: bulk-updating five thousand lead statuses,
// raising a daily ad budget, rewriting an outreach sequence. HubSpot, Salesforce, Google Ads
// and Meta have no "undo the last hour" button, so the checkpoint is built rather than
// requested — read the current field values, keep them somewhere the buyer controls, and
// write them back if the job fails.
//
// THAT WRITE-BACK IS A COMPENSATING ACTION, NOT A RESTORE, AND THE DIFFERENCE IS REAL:
//
//   · It is not atomic. Five thousand records is five thousand writes, and the four
//     hundredth can fail on a rate limit while the first three hundred and ninety-nine
//     already landed.
//   · It is not a time machine. Anything that happened between capture and write-back —
//     a salesperson editing a lead, a webhook firing, a workflow triggering — is
//     overwritten by a value that was true earlier. Restoring stale state over newer state
//     is its own incident.
//   · It cannot reach what already left. A budget can be set back; the impressions bought
//     at the higher budget were bought. The emails a sequence already sent were sent.
//
// So atomicRestore is FALSE. A Marketing and Sales plan resting on this alone classifies
// UNBOUNDED and will not run unattended in production. That is the correct answer for bulk
// mutation of a customer's CRM, and the way to earn BOUNDED is to narrow the plan — fewer
// records, an isolated environment, or a database-backed staging table with a real savepoint
// behind it — not to relabel this adapter.

export interface RecordFieldState { recordId: string; fields: Record<string, string | number | boolean | null> }

export interface CompensatingRecordSnapshotDeps {
  /** Read the current values of the fields this job will change, before it changes them. */
  readCurrentState(): Promise<RecordFieldState[]> | RecordFieldState[]
  /** Write a captured value back. Called once per record, and may partially fail. */
  writeState(record: RecordFieldState): Promise<void> | void
  /**
   * Where the captured state is KEPT — the buyer's database, object store or vault. Supplied
   * rather than assumed because this is their customer data: it must never rest anywhere they
   * have not chosen, and an in-process map would lose it the moment the worker restarts.
   */
  checkpointStore: {
    put(key: string, value: RecordFieldState[]): Promise<void> | void
    get(key: string): Promise<RecordFieldState[] | undefined> | RecordFieldState[] | undefined
    delete?(key: string): Promise<void> | void
  }
  /** 'hubspot', 'salesforce', 'google-ads', 'meta-ads', or a buyer's internal CRM. */
  provider: string
  scope?: SnapshotScope
}

export function createCompensatingRecordSnapshotAdapter(deps: CompensatingRecordSnapshotDeps): StateSnapshotPort {
  const scope = deps.scope ?? 'database'
  return {
    capabilities: () => [Object.freeze({ scope, provider: deps.provider, atomicRestore: false, estimatedRestoreSeconds: 300 })],
    async capture(input) {
      try {
        const state = await deps.readCurrentState()
        if (!state.length) return { ok: false, error: `No current state was read from ${deps.provider}, so there is nothing to restore to. Refusing to proceed as if a checkpoint existed.` }
        const key = `${deps.provider}:${Date.now().toString(36)}`
        await deps.checkpointStore.put(key, state)
        return { ok: true, snapshot: ref(scope, deps.provider, key, { recordCount: state.length, reason: input.reason }) }
      } catch (error) { return failed(error, `${deps.provider} state capture failed`) }
    },
    async restore(snapshot) {
      let state: RecordFieldState[] | undefined
      try { state = await deps.checkpointStore.get(snapshot.snapshotId) } catch (error) { return failed(error, 'Checkpoint read failed') }
      if (!state?.length) return { ok: false, error: `Checkpoint ${snapshot.snapshotId} could not be read back, so the previous values are unknown.` }

      const failures: string[] = []
      let restored = 0
      for (const record of state) {
        try { await deps.writeState(record); restored += 1 }
        catch (error) { failures.push(`${record.recordId}: ${error instanceof Error ? error.message : 'failed'}`) }
      }
      if (failures.length) {
        // Named precisely, because "rollback failed" would send someone looking for a
        // system-wide problem when what they have is a list of records to reconcile.
        return { ok: false, error: `Compensating write-back is incomplete: ${restored} of ${state.length} records restored, ${failures.length} failed (${failures.slice(0, 3).join('; ')}). The remaining records still hold values written by the failed job.` }
      }
      return { ok: true, restoredAt: nowIso() }
    },
    async release(snapshot) { try { await deps.checkpointStore.delete?.(snapshot.snapshotId) } catch { /* housekeeping */ } },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. THE PLUG-AND-PLAY SEAM
//
// A buyer whose mechanism is not above writes one object and passes it to the composite
// alongside the pre-staged ones. defineSnapshotAdapter exists to validate that object at
// construction: a malformed adapter should fail when the platform starts, not during the
// first incident it was supposed to protect.

export interface CustomSnapshotAdapterSpec {
  scope: SnapshotScope
  provider: string
  atomicRestore: boolean
  estimatedRestoreSeconds?: number
  capture(input: { scope: SnapshotScope; provider: string; environment: string; reason: string }): Promise<SnapshotCaptureResult> | SnapshotCaptureResult
  restore(snapshot: StateSnapshotRef): Promise<SnapshotRestoreResult> | SnapshotRestoreResult
  release?(snapshot: StateSnapshotRef): Promise<void> | void
}

export function defineSnapshotAdapter(spec: CustomSnapshotAdapterSpec): StateSnapshotPort {
  if (!spec || typeof spec !== 'object') throw new Error('A snapshot adapter spec is required.')
  if (!spec.provider?.trim()) throw new Error('A snapshot adapter must name its provider.')
  if (typeof spec.capture !== 'function' || typeof spec.restore !== 'function') throw new Error(`Snapshot adapter ${spec.provider} must implement both capture and restore.`)
  if (typeof spec.atomicRestore !== 'boolean') throw new Error(`Snapshot adapter ${spec.provider} must state atomicRestore explicitly — it decides whether repairs run unattended, so it is never inferred.`)
  return {
    capabilities: () => [Object.freeze({ scope: spec.scope, provider: spec.provider, atomicRestore: spec.atomicRestore, ...(spec.estimatedRestoreSeconds !== undefined ? { estimatedRestoreSeconds: spec.estimatedRestoreSeconds } : {}) })],
    capture: spec.capture,
    restore: spec.restore,
    ...(spec.release ? { release: spec.release } : {}),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. THE COMPOSITE
//
// Real infrastructure is plural: Vercel for deployment, RDS or a savepoint for the
// database, Kubernetes for containers, something bespoke for the rest. This merges them
// into the single port the orchestrator consumes, routing by scope on capture and by the
// snapshot's own scope and provider on restore.

export function createCompositeSnapshotPort(adapters: readonly StateSnapshotPort[]): StateSnapshotPort {
  if (!adapters?.length) throw new Error('At least one snapshot adapter is required.')

  const routeFor = async (scope: SnapshotScope, provider?: string) => {
    const scored: Array<{ adapter: StateSnapshotPort; capability: SnapshotCapability }> = []
    for (const adapter of adapters) {
      for (const capability of await adapter.capabilities()) {
        if (capability.scope === scope) scored.push({ adapter, capability })
      }
    }
    if (!scored.length) return undefined
    // An exact provider match wins; otherwise prefer an ATOMIC mechanism, because when a
    // buyer registers both a savepoint and PITR for the same database, the transactional
    // one is the one that should carry the repair.
    const exact = provider ? scored.find(entry => entry.capability.provider === provider) : undefined
    return exact ?? scored.find(entry => entry.capability.atomicRestore) ?? scored[0]
  }

  return {
    async capabilities() {
      const all: SnapshotCapability[] = []
      for (const adapter of adapters) all.push(...(await adapter.capabilities()))
      return all
    },
    async capture(input) {
      const route = await routeFor(input.scope, input.provider)
      if (!route) return { ok: false, error: `No snapshot adapter is registered for ${input.scope}.` }
      return await route.adapter.capture(input)
    },
    async restore(snapshot) {
      const route = await routeFor(snapshot.scope, snapshot.provider)
      if (!route) return { ok: false, error: `No snapshot adapter is registered for ${snapshot.scope}, so ${snapshot.snapshotId} cannot be restored.` }
      return await route.adapter.restore(snapshot)
    },
    async release(snapshot) {
      const route = await routeFor(snapshot.scope, snapshot.provider)
      if (route?.adapter.release) await route.adapter.release(snapshot)
    },
  }
}
