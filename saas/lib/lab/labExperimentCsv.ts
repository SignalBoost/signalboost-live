import type { LabRunForTracking } from './mlflowRunExport.ts'
import { buildLabExperimentComparison } from './labExperimentComparison.ts'

// Portable CSV for experiment analysis in spreadsheets or other tracking systems.
// Escape formulas too: exported provider/model metadata must never execute as spreadsheet code.
export const LAB_EXPERIMENT_CSV_COLUMNS = [
 'run_id','created_at','status','teacher_provider','teacher_model','compute_provider',
 'base_model','tuned_model_id','artifact_repo','artifact_revision','artifact_sha256','failure_code',
] as const

function csvCell(value: unknown): string {
 const raw = String(value ?? '').replace(/\u0000/g, '')
 const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? "'"+raw : raw
 return '"'+safe.replace(/"/g,'""')+'"'
}
export function buildLabExperimentCsv(runs: readonly LabRunForTracking[], filters: {provider?:string;status?:string} = {}) {
 if (!runs.length) return LAB_EXPERIMENT_CSV_COLUMNS.join(',')+'\r\n'
 const rows = buildLabExperimentComparison(runs.slice(0,100)).runs
  .filter(row=>(!filters.provider||row.computeProvider===filters.provider)&&(!filters.status||row.state===filters.status))
 const mapped = rows.map(row=>[
  row.runId,row.createdAt,row.state,row.teacherProvider,row.teacherModel,row.computeProvider,
  row.baseModel,row.tunedModelId,row.artifactRepo,row.artifactRevision,row.artifactHash,row.failureCode,
 ].map(csvCell).join(','))
 return LAB_EXPERIMENT_CSV_COLUMNS.join(',')+'\r\n'+mapped.join('\r\n')+(mapped.length?'\r\n':'')
}
