import { makeLabPhaseObservation, type LabPhaseObservation } from './labAllPhasesObservability.ts'

/** DB returns untrusted data. The scope belongs to the trusted caller, not a client parameter. */
export async function readTenantLabObservations(
  db: {from(table:string):any},
  tenant: string,
  revision: string,
): Promise<readonly LabPhaseObservation[]> {
  if (!tenant || tenant.length > 128 || !/^[a-f0-9]{7,64}$/i.test(revision)) throw Error('lab_observability_scope_invalid')
  const {data,error}=await db.from('lab_phase_observations')
    .select('phase,signal,source,outcome,exact_revision,observed_at')
    .eq('tenant_id',tenant).eq('exact_revision',revision)
    .order('observed_at',{ascending:false}).limit(1000)
  if(error) throw Error('lab_observability_storage_unavailable')
  const events:LabPhaseObservation[]=[]
  for(const row of data??[]) {
    try { events.push(makeLabPhaseObservation({
      phase:row.phase,signal:row.signal,source:row.source,outcome:row.outcome,
      exactRevision:row.exact_revision,observedAt:new Date(row.observed_at).toISOString(),
    })) } catch { /* Bad rows never gain evidentiary authority. */ }
  }
  return events
}
