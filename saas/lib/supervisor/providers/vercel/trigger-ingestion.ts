import crypto from 'crypto'
import { type VercelHealthClient, SupabaseVercelHealthStore, VercelDeploymentHealthIntelligence } from './health-intelligence.ts'
import { FetchVercelReadOnlyClient } from './vercel-client.ts'
import { sanitizeString } from './incident-mapper.ts'
import { createSupervisorCoordinationStore, ownershipIdentity, type CoordinationStore, type WorkItem } from '../../coordination/index.ts'

export type VercelTriggerSource = 'scheduled_observation'|'vercel_webhook'|'operator_requested'|'reconciliation'
export type VercelTriggerOutcome = 'created'|'reused'|'rejected'|'deferred'
export type VercelTriggerStatus = 'active'|'terminal'
export interface VercelProviderConnection { tenantId:string; providerConnectionId:string; projectId:string; teamId?:string; environment:'sandbox'|'preview'|'production'; active:boolean }
export interface VercelTriggerRecord { triggerId:string; deduplicationKey:string; tenantId:string; provider:'vercel'; providerConnectionId:string; projectId:string; deploymentId?:string; environment:'sandbox'|'preview'|'production'; triggerSource:VercelTriggerSource; eventType?:string; incidentType?:string; fingerprint:string; eventTime?:string; receivedTime:string; deduplicationStatus:VercelTriggerOutcome; workItemId?:string; terminalStatus?:string; reasonCode?:string; safeMetadata:Record<string, unknown>; createdAt:string; updatedAt:string }
export interface VercelTriggerStore { upsertTrigger(record: VercelTriggerRecord): Promise<{ record: VercelTriggerRecord; outcome:'created'|'reused' }>; updateTrigger(id:string, patch:Partial<VercelTriggerRecord>):Promise<void>; listTriggers(input?:{limit?:number}):Promise<VercelTriggerRecord[]> }
const safe = (v:unknown,n=160)=>sanitizeString(String(v??''),n).replace(/token|secret|authorization|signature|cookie|password/gi,'[redacted]')
export const sha256 = (v:string)=>crypto.createHash('sha256').update(v).digest('hex')
export const deterministicFingerprint = (parts:Record<string, unknown>) => sha256(JSON.stringify(Object.keys(parts).sort().reduce((a,k)=>({...a,[k]:parts[k]}),{})))
export class InMemoryVercelTriggerStore implements VercelTriggerStore { private rows = new Map<string,VercelTriggerRecord>(); async upsertTrigger(r:VercelTriggerRecord){ const existing=this.rows.get(r.deduplicationKey); if(existing && existing.terminalStatus !== 'terminal_changed') return {record:{...existing}, outcome:'reused' as const}; this.rows.set(r.deduplicationKey,{...r}); return {record:{...r}, outcome:'created' as const} } async updateTrigger(id:string, patch:Partial<VercelTriggerRecord>){ for(const [k,r] of this.rows) if(r.triggerId===id) this.rows.set(k,{...r,...patch,updatedAt:patch.updatedAt??r.updatedAt}) } async listTriggers(input:{limit?:number}={}){ return [...this.rows.values()].slice(0, input.limit??50).map(r=>({...r})) } }
export class SupabaseVercelTriggerStore implements VercelTriggerStore { private db:any; constructor(db:any){ this.db=db } async upsertTrigger(r:VercelTriggerRecord){ const row=toRow(r); const {data,error}=await this.db.from('vercel_observation_triggers').upsert(row,{onConflict:'deduplication_key',ignoreDuplicates:true}).select('*').maybeSingle(); if(error) throw new Error(`trigger_upsert_failed:${safe(error.message)}`); if(data) return {record:fromRow(data),outcome:'created' as const}; const got=await this.db.from('vercel_observation_triggers').select('*').eq('deduplication_key',r.deduplicationKey).single(); if(got.error) throw new Error('trigger_lookup_failed'); return {record:fromRow(got.data),outcome:'reused' as const} } async updateTrigger(id:string, patch:Partial<VercelTriggerRecord>){ const {error}=await this.db.from('vercel_observation_triggers').update(toRowPatch(patch)).eq('trigger_id',id); if(error) throw new Error(`trigger_update_failed:${safe(error.message)}`) } async listTriggers(input:{limit?:number}={}){ const {data,error}=await this.db.from('vercel_observation_triggers').select('*').order('received_time',{ascending:false}).limit(Math.min(Math.max(input.limit??50,1),100)); if(error) throw new Error('trigger_list_failed'); return (data??[]).map(fromRow) } }
function toRow(r:VercelTriggerRecord){return {trigger_id:r.triggerId,deduplication_key:r.deduplicationKey,tenant_id:r.tenantId,provider:r.provider,provider_connection_id:r.providerConnectionId,project_id:r.projectId,deployment_id:r.deploymentId??null,environment:r.environment,trigger_source:r.triggerSource,event_type:r.eventType??null,incident_type:r.incidentType??null,fingerprint:r.fingerprint,event_time:r.eventTime??null,received_time:r.receivedTime,deduplication_status:r.deduplicationStatus,work_item_id:r.workItemId??null,terminal_status:r.terminalStatus??null,reason_code:r.reasonCode??null,safe_metadata:r.safeMetadata,created_at:r.createdAt,updated_at:r.updatedAt}}
function toRowPatch(p:Partial<VercelTriggerRecord>){ const r:any={}; for(const [k,v] of Object.entries(toRow({...({} as VercelTriggerRecord),...p} as VercelTriggerRecord))) if(v!==undefined) r[k]=v; return r }
function fromRow(r:any):VercelTriggerRecord{return {triggerId:r.trigger_id,deduplicationKey:r.deduplication_key,tenantId:r.tenant_id,provider:'vercel',providerConnectionId:r.provider_connection_id,projectId:r.project_id,deploymentId:r.deployment_id??undefined,environment:r.environment,triggerSource:r.trigger_source,eventType:r.event_type??undefined,incidentType:r.incident_type??undefined,fingerprint:r.fingerprint,eventTime:r.event_time??undefined,receivedTime:r.received_time,deduplicationStatus:r.deduplication_status,workItemId:r.work_item_id??undefined,terminalStatus:r.terminal_status??undefined,reasonCode:r.reason_code??undefined,safeMetadata:r.safe_metadata??{},createdAt:r.created_at,updatedAt:r.updated_at}}
export function verifyVercelWebhookSignature(raw:string, headers:Headers, secret:string, now=Date.now(), toleranceMs=300000){ const sig=headers.get('x-vercel-signature')||headers.get('vercel-signature')||''; const ts=headers.get('x-vercel-timestamp')||headers.get('vercel-timestamp')||''; if(!sig) return {ok:false,code:'missing_signature'}; if(ts && Math.abs(now-Number(ts))>toleranceMs) return {ok:false,code:'replay_rejected'}; const bases=ts?[`${ts}.${raw}`,raw]:[raw]; for(const base of bases){ const expected=crypto.createHmac('sha256',secret).update(base).digest('hex'); const a=Buffer.from(expected,'hex'); const b=Buffer.from(sig.replace(/^sha256=/,''),'hex'); if(a.length&&a.length===b.length&&crypto.timingSafeEqual(a,b)) return {ok:true as const} } return {ok:false,code:'invalid_signature'} }
export function normalizeVercelWebhook(body:any, connections:VercelProviderConnection[]){ const type=safe(body?.type||body?.event||body?.name,80); const supported=new Set(['deployment.created','deployment.ready','deployment.error','deployment.canceled','deployment.cancelled','deployment.failed']) ; if(!supported.has(type)) return {ok:false as const,code:'unsupported_event_type'}; const data=body?.payload??body?.data??body; const projectId=safe(data?.projectId||data?.project?.id||body?.projectId,120); const deploymentId=safe(data?.deploymentId||data?.deployment?.id||data?.deployment?.uid||body?.deploymentId,120); const environment=(data?.target==='production'||data?.environment==='production')?'production':(data?.target==='preview'||data?.environment==='preview')?'preview':'preview'; const conn=connections.find(c=>c.active&&c.projectId===projectId&&c.environment===environment); if(!conn) return {ok:false as const,code:'provider_identity_not_authorized'}; const eventTime=safe(body?.createdAt||data?.createdAt||new Date().toISOString(),80); const message=safe(data?.message||data?.error?.message||type,240).replace(/<[^>]*>/g,''); return {ok:true as const, connection:conn, event:{type,projectId,deploymentId,environment,eventTime,message,incidentType:type.includes('error')||type.includes('failed')?'deployment_failed':type.includes('cancel')?'deployment_canceled':'deployment_observed'}} }
export async function acceptVercelTrigger(input:{store:VercelTriggerStore; coordinationStore:CoordinationStore; connection:VercelProviderConnection; triggerSource:VercelTriggerSource; eventType?:string; deploymentId?:string; incidentType?:string; eventTime?:string; observationWindow?:string; safeMetadata?:Record<string,unknown>; now?:Date; maxAttempts?:number}){ const now=input.now??new Date(); const fp=deterministicFingerprint({tenantId:input.connection.tenantId,providerConnectionId:input.connection.providerConnectionId,projectId:input.connection.projectId,deploymentId:input.deploymentId??'',environment:input.connection.environment,eventType:input.eventType??'',incidentType:input.incidentType??'deployment_health_observation',window:input.observationWindow??''}); const key=`vercel:${fp}`; const workItemId=`vercel-health:${fp.slice(0,32)}`; const base:VercelTriggerRecord={triggerId:`trg-${fp.slice(0,32)}`,deduplicationKey:key,tenantId:input.connection.tenantId,provider:'vercel',providerConnectionId:input.connection.providerConnectionId,projectId:input.connection.projectId,deploymentId:input.deploymentId,environment:input.connection.environment,triggerSource:input.triggerSource,eventType:input.eventType,incidentType:input.incidentType??'deployment_health_observation',fingerprint:fp,eventTime:input.eventTime,receivedTime:now.toISOString(),deduplicationStatus:'created',workItemId,reasonCode:'accepted',safeMetadata:JSON.parse(JSON.stringify(input.safeMetadata??{},(_k,v)=>typeof v==='string'?safe(v,240):v)),createdAt:now.toISOString(),updatedAt:now.toISOString()}; const up=await input.store.upsertTrigger(base); if(up.outcome==='reused' && up.record.workItemId) return {outcome:'reused' as const, record:up.record, workItemId:up.record.workItemId}; const work:WorkItem={workItemId,workItemType:'vercel_deployment_health',incidentId:`vercel-trigger:${fp.slice(0,32)}`,provider:'vercel',tenantId:input.connection.tenantId,projectId:input.connection.projectId,environment:input.connection.environment,state:'queued',priority:60,createdAt:now.toISOString(),availableAt:now.toISOString(),attempt:0,maxAttempts:input.maxAttempts??1,policyVersion:'ha-policy-v1',capabilityVersion:'vercel-browser-capabilities-v1',adapterVersion:'vercel-browser-adapter-v1',schemaVersion:'supervisor-work-item-v1'}; try{ await input.coordinationStore.enqueueWorkItem(work) }catch(e:any){ if(!String(e?.code||e?.message).includes('conflict')) { await input.store.updateTrigger(up.record.triggerId,{deduplicationStatus:'deferred',reasonCode:'coordination_unavailable',updatedAt:now.toISOString()}); return {outcome:'deferred' as const, record:{...up.record,deduplicationStatus:'deferred',reasonCode:'coordination_unavailable'}, workItemId:undefined} } } await input.store.updateTrigger(up.record.triggerId,{workItemId,deduplicationStatus:'created',updatedAt:now.toISOString()}); return {outcome:'created' as const, record:{...up.record,workItemId,deduplicationStatus:'created'}, workItemId} }
export async function runAcceptedVercelWork(input:{coordinationStore:CoordinationStore; db:any; connection:VercelProviderConnection; workItemId:string; ownerInstanceId:string; ownerRuntimeId:string; leaseMs:number; client?:VercelHealthClient; now?:Date}){ const now=input.now??new Date(); await input.coordinationStore.registerInstance({instanceId:input.ownerInstanceId,runtimeId:input.ownerRuntimeId,startedAt:now.toISOString(),heartbeatAt:now.toISOString(),softwareVersion:process.env.VERCEL_GIT_COMMIT_SHA||'local',schemaVersion:'supervisor-instance-v1',supportedProviderKinds:['vercel'],status:'healthy'}); const lease=await input.coordinationStore.acquireLease({workItemId:input.workItemId,ownerInstanceId:input.ownerInstanceId,ownerRuntimeId:input.ownerRuntimeId,leaseDurationMs:input.leaseMs,now}); const workflow=new VercelDeploymentHealthIntelligence({config:{providerConnectionId:input.connection.providerConnectionId,projectId:input.connection.projectId,teamId:input.connection.teamId,environment:input.connection.environment,lookbackWindowMs:Number(process.env.VERCEL_OBSERVATION_LOOKBACK_MS||3600000),maxDeployments:Number(process.env.VERCEL_OBSERVATION_MAX_PROJECTS||5),repeatedFailureThreshold:2,stuckDeploymentThresholdMs:3600000,maxAttempts:Number(process.env.VERCEL_OBSERVATION_RETRY_ATTEMPTS||1),clock:{now:()=>new Date()},sleeper:{sleep:async()=>{}}},secretResolver:async id=>id===process.env.VERCEL_PROVIDER_CONNECTION_ID?(process.env.VERCEL_API_TOKEN||''):'',client:input.client??new FetchVercelReadOnlyClient(),store:new SupabaseVercelHealthStore(input.db)}); return workflow.run({coordinationStore:input.coordinationStore,workItemId:input.workItemId,ownerInstanceId:input.ownerInstanceId,ownerRuntimeId:input.ownerRuntimeId,leaseId:lease.leaseId,fencingToken:lease.fencingToken,executionMode:'api_only'}) }
export async function loadActiveVercelConnections(db:any, limit:number):Promise<VercelProviderConnection[]>{ if(process.env.VERCEL_PROJECT_ID&&process.env.VERCEL_PROVIDER_CONNECTION_ID) return [{tenantId:process.env.VERCEL_TENANT_ID||'platform',providerConnectionId:process.env.VERCEL_PROVIDER_CONNECTION_ID,projectId:process.env.VERCEL_PROJECT_ID,teamId:process.env.VERCEL_TEAM_ID,environment:(process.env.VERCEL_OBSERVATION_ENVIRONMENT as any)||'production',active:true}].slice(0,limit); const {data,error}=await db.from('provider_connections').select('tenant_id,id,project_id,team_id,environment,is_active').eq('provider','vercel').eq('is_active',true).limit(limit); if(error) throw new Error('connection_lookup_failed'); return (data??[]).map((r:any)=>({tenantId:r.tenant_id,providerConnectionId:r.id,projectId:r.project_id,teamId:r.team_id,environment:['sandbox','preview','production'].includes(r.environment)?r.environment:'production',active:!!r.is_active})) }

// ============================================================================
// PORTABLE ENTRY POINTS — a buyer calls these instead of runAcceptedVercelWork /
// loadActiveVercelConnections. Same behavior, but every dependency (secrets, run-history
// store, connection list) is injected instead of read from process.env or assumed
// Supabase. The originals above are untouched and still power the platform's own
// webhook/vercel and cron/vercel-observation routes.
// ============================================================================
import type { VercelObservationRuntimeConfig, VercelConnectionSource } from './portable/vercel-runtime-config.ts'

export async function runAcceptedVercelWorkWithConfig(input: {
  coordinationStore: CoordinationStore
  connection: VercelProviderConnection
  workItemId: string
  ownerInstanceId: string
  ownerRuntimeId: string
  leaseMs: number
  config: VercelObservationRuntimeConfig
  now?: Date
}) {
  const now = input.now ?? new Date()
  await input.coordinationStore.registerInstance({
    instanceId: input.ownerInstanceId, runtimeId: input.ownerRuntimeId,
    startedAt: now.toISOString(), heartbeatAt: now.toISOString(),
    softwareVersion: input.config.softwareVersion || 'local', schemaVersion: 'supervisor-instance-v1',
    supportedProviderKinds: ['vercel'], status: 'healthy',
  })
  const lease = await input.coordinationStore.acquireLease({
    workItemId: input.workItemId, ownerInstanceId: input.ownerInstanceId,
    ownerRuntimeId: input.ownerRuntimeId, leaseDurationMs: input.leaseMs, now,
  })
  const workflow = new VercelDeploymentHealthIntelligence({
    config: {
      providerConnectionId: input.connection.providerConnectionId,
      projectId: input.connection.projectId,
      teamId: input.connection.teamId,
      environment: input.connection.environment,
      lookbackWindowMs: input.config.lookbackWindowMs ?? 3600000,
      maxDeployments: input.config.maxDeployments ?? 5,
      repeatedFailureThreshold: 2,
      stuckDeploymentThresholdMs: 3600000,
      maxAttempts: input.config.maxAttempts ?? 1,
      clock: { now: () => new Date() },
      sleeper: { sleep: async () => {} },
    },
    secretResolver: async (id) => input.config.secretResolver(id),
    client: input.config.client ?? new FetchVercelReadOnlyClient(),
    store: input.config.healthStore,
  })
  return workflow.run({
    coordinationStore: input.coordinationStore, workItemId: input.workItemId,
    ownerInstanceId: input.ownerInstanceId, ownerRuntimeId: input.ownerRuntimeId,
    leaseId: lease.leaseId, fencingToken: lease.fencingToken, executionMode: 'api_only',
  })
}

export async function loadActiveVercelConnectionsFromSource(
  source: VercelConnectionSource,
  limit: number,
): Promise<VercelProviderConnection[]> {
  return source.list(limit)
}
