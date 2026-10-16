/**
 * Read-only MLflow REST-shaped snapshot of an existing customer LAB run.
 * Export never talks to MLflow or submits a provider job. This is a portable
 * metadata record, NOT a registered MLflow run or a model-quality certificate.
 */
export type LabRunForTracking = Readonly<{
  runId: string; stage: string; createdAt: string;
  teacherProviderKind: string; teacherModel: string; baseModel: string;
  computeProviderKind?: string; tunedModelId?: string | null;
  artifactRepo?: string | null; artifactRevision?: string | null;
  artifactHash?: string | null; failureCode?: string | null;
}>
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
const mlflowStatus = (stage: string) =>
  stage === 'completed' ? 'FINISHED' :
  stage === 'failed' ? 'FAILED' :
  stage === 'cancelled' ? 'KILLED' : 'RUNNING'
const limited = (value: string | null | undefined, max = 500) =>
  typeof value === 'string' ? value.slice(0, max) : ''
const kv = (key: string, value: string | null | undefined) => ({ key, value: limited(value) })

export function buildLabMlflowRunSnapshot(run: LabRunForTracking) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(run.runId)) throw new Error('Invalid run identifier')
  const start = Date.parse(run.createdAt)
  if (!Number.isFinite(start)) throw new Error('Invalid run timestamp')
  const status = mlflowStatus(run.stage)
  const tags = [
    kv('source', 'itmounts-ai-university'),
    kv('lab.stage', run.stage),
    kv('lab.teacher_provider', run.teacherProviderKind),
    kv('lab.compute_provider', run.computeProviderKind),
    kv('lab.artifact_repo', run.artifactRepo),
    kv('lab.artifact_revision', run.artifactRevision),
    kv('lab.artifact_hash', run.artifactHash),
    kv('lab.tuned_model_id', run.tunedModelId),
    kv('lab.failure_code', run.failureCode),
  ].filter(item => item.value)
  return {
    format: 'itmounts.mlflow-run-snapshot.v1',
    interoperability: 'MLflow Run/RunInfo-shaped metadata only; not imported or registered in MLflow',
    info: {
      run_id: run.runId,
      run_name: 'iTMounts LAB ' + run.runId.slice(0, 8),
      status,
      start_time: start,
      end_time: TERMINAL.has(run.stage) ? null : null,
      artifact_uri: null,
      lifecycle_stage: 'active',
    },
    data: {
      params: [kv('teacher_model', run.teacherModel), kv('base_model', run.baseModel)],
      metrics: [],
      tags,
    },
  } as const
}
