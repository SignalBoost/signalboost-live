import {getAdminSupabase} from '@/utils/supabase/server'

/** Trusted host-only tenant resolution. Never accepts a caller-supplied tenant. */
export async function resolveLabMonitoringTenant(db:ReturnType<typeof getAdminSupabase>):Promise<string|null>{
 const configured=process.env.ITMOUNTS_LAB_OBSERVABILITY_TENANT_ID?.trim()
 if(configured){
  if(!/^[a-f0-9-]{36}$/i.test(configured))return null
  const {data,error}=await db.rpc('itmounts_lab_observability_scope_valid',{p_tenant_id:configured})
  if(error)throw Error('lab_tenant_resolution_unavailable')
  return data===true?configured:null
 }
 const {data,error}=await db.rpc('itmounts_lab_observability_unique_tenant')
 if(error)throw Error('lab_tenant_resolution_unavailable')
 return typeof data==='string'&&/^[a-f0-9-]{36}$/i.test(data)?data:null
}
