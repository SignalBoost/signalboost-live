import { buildLabMlflowRunSnapshot, type LabRunForTracking } from './mlflowRunExport.ts'

/** Provider-neutral, read-only experiment table inspired by MLflow/W&B run comparisons.
 * Run metadata is already tenant-scoped by the LAB API; never mix organizations here.
 * No evaluation scores, provider expenses or training claims are fabricated.
 */
export function buildLabExperimentComparison(runs: readonly LabRunForTracking[]) {
  if (!Array.isArray(runs) || runs.length < 1 || runs.length > 100) throw new Error('lab_experiment_count_invalid')
  const ids = new Set<string>()
  const snapshots = runs.map(run => {
    if (ids.has(run.runId)) throw new Error('lab_experiment_duplicate_run')
    ids.add(run.runId)
    return buildLabMlflowRunSnapshot(run)
  })
  const records = snapshots.map(snapshot => ({
    runId: snapshot.info.run_id,
    createdAt: new Date(snapshot.info.start_time).toISOString(),
    state: snapshot.info.status,
    teacherModel: snapshotsValue(snapshot.data.params, 'teacher_model'),
    baseModel: snapshotsValue(snapshot.data.params, 'base_model'),
    teacherProvider: snapshotsValue(snapshot.data.tags, 'lab.teacher_provider'),
    computeProvider: snapshotsValue(snapshot.data.tags, 'lab.compute_provider'),
    artifactRepo: snapshotsValue(snapshot.data.tags, 'lab.artifact_repo'),
    artifactRevision: snapshotsValue(snapshot.data.tags, 'lab.artifact_revision'),
    artifactHash: snapshotsValue(snapshot.data.tags, 'lab.artifact_hash'),
    tunedModelId: snapshotsValue(snapshot.data.tags, 'lab.tuned_model_id'),
    failureCode: snapshotsValue(snapshot.data.tags, 'lab.failure_code'),
  }))
  return Object.freeze({
    schema: 'itmounts.lab.experiment-comparison.v1',
    provenance: 'tenant_scoped_lab_run_metadata_not_provider_verified',
    verification: 'no_quality_claim_no_external_provider_calls',
    count: records.length,
    runs: records.sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.runId.localeCompare(b.runId)),
  })
}
function snapshotsValue(items: readonly {key:string;value:string}[], key: string) {
  return items.find(item => item.key === key)?.value ?? ''
}
