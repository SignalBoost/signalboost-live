import type { LabRunForTracking } from './mlflowRunExport.ts'
import { buildLabExperimentComparison } from './labExperimentComparison.ts'

/** Observed outcome counts from tenant-scoped run metadata, never model quality or provider reliability scores. */
export function summarizeLabProviderOutcomes(runs: readonly LabRunForTracking[]) {
 if (!runs.length) return Object.freeze([])
 const rows = buildLabExperimentComparison(runs.slice(0,100)).runs
 const byProvider = new Map<string,{ provider:string; total:number; finished:number; failed:number; cancelled:number; running:number; artifacts:number }>()
 for (const row of rows) {
  const key = row.computeProvider || 'unknown'
  const entry = byProvider.get(key) ?? { provider:key,total:0,finished:0,failed:0,cancelled:0,running:0,artifacts:0 }
  entry.total++
  if (row.state === 'FINISHED') entry.finished++
  else if (row.state === 'FAILED') entry.failed++
  else if (row.state === 'KILLED') entry.cancelled++
  else entry.running++
  if (row.artifactHash && row.artifactRevision) entry.artifacts++
  byProvider.set(key,entry)
 }
 return Object.freeze([...byProvider.values()].sort((a,b)=>a.provider.localeCompare(b.provider)))
}
