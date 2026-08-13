import { connect as tlsConnect } from 'node:tls'
import type { Observer, ProviderObservationContext } from '../lib/supervisor/execution-contracts.ts'
import { incidentSchema, type SerializableValue, type SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import type { NativeMonitoringCollector } from './native-monitoring-runtime.ts'

export type NativeProbeStatus = 'healthy'|'warning'|'critical'|'error'
export interface NativeProbeSample {
  probeId:'api'|'database'|'storage'|'certificate'; target:string; observedAt:string; status:NativeProbeStatus
  latencyMs?:number|null; errorRate?:number|null; metricValue?:number|null; metricUnit?:string|null
  details:Record<string,SerializableValue>
}
export interface NativeProbeStore {
  history(probeId:NativeProbeSample['probeId'],target:string,limit?:number):Promise<NativeProbeSample[]>
  save(sample:NativeProbeSample):Promise<void>
}
export class SupabaseNativeProbeStore implements NativeProbeStore {
  constructor(private readonly db:any){}
  async verifySchema(){ const {error}=await this.db.from('self_healing_native_probe_samples').select('id',{head:true,count:'exact'}).limit(1); if(error) throw new Error(`native_probe_store_unavailable:${String(error.message||'unknown').slice(0,160)}`) }
  async history(probeId:NativeProbeSample['probeId'],target:string,limit=24){
    const {data,error}=await this.db.from('self_healing_native_probe_samples').select('probe_id,target,observed_at,status,latency_ms,error_rate,metric_value,metric_unit,details').eq('probe_id',probeId).eq('target',target).order('observed_at',{ascending:false}).limit(Math.min(Math.max(limit,1),96))
    if(error) throw new Error(`native_probe_history_failed:${String(error.message||'unknown').slice(0,160)}`)
    return (data??[]).map((r:any)=>({probeId:r.probe_id,target:r.target,observedAt:r.observed_at,status:r.status,latencyMs:r.latency_ms==null?null:Number(r.latency_ms),errorRate:r.error_rate==null?null:Number(r.error_rate),metricValue:r.metric_value==null?null:Number(r.metric_value),metricUnit:r.metric_unit??null,details:r.details??{}}))
  }
  async save(s:NativeProbeSample){ const {error}=await this.db.from('self_healing_native_probe_samples').insert({probe_id:s.probeId,target:s.target,observed_at:s.observedAt,status:s.status,latency_ms:s.latencyMs??null,error_rate:s.errorRate??null,metric_value:s.metricValue??null,metric_unit:s.metricUnit??null,details:s.details}); if(error) throw new Error(`native_probe_sample_save_failed:${String(error.message||'unknown').slice(0,160)}`) }
}

type Thresholds={warning:number;critical:number}
export interface ApiProbeOptions { urls:readonly string[]; store:NativeProbeStore; samplesPerUrl?:number; timeoutMs?:number; latencyMs?:Thresholds; errorRate?:Thresholds; trendMultiplier?:number; fetchImpl?:typeof fetch; now?:()=>Date }
export interface DatabaseProbeOptions { db:any; store:NativeProbeStore; target?:string; latencyMs?:Thresholds; connectionPressurePct?:Thresholds; now?:()=>Date }
export interface StorageProbeOptions { db:any; store:NativeProbeStore; target?:string; quotaBytes?:number|null; latencyMs?:Thresholds; capacityPct?:Thresholds; now?:()=>Date }
export interface CertificateTarget { host:string; port?:number }
type CertInfo={validTo:string;subject?:string;issuer?:string}
export interface CertificateProbeOptions { targets:readonly CertificateTarget[]; store:NativeProbeStore; expiryDays?:Thresholds; timeoutMs?:number; now?:()=>Date; inspectCertificate?:(target:CertificateTarget,timeoutMs:number)=>Promise<CertInfo> }

const finite=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null}
const clamp=(v:number,min:number,max:number)=>Math.min(Math.max(v,min),max)
const round=(v:number,d=2)=>Number(v.toFixed(d))
export function percentile95(values:readonly number[]){const v=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);return v.length?v[Math.max(0,Math.ceil(v.length*.95)-1)]:0}
const avg=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null
const safeTarget=(v:string)=>{try{const u=new URL(v);return `${u.protocol}//${u.host}${u.pathname}`.slice(0,220)}catch{return v.slice(0,220)}}
const hash=(v:string)=>{let h=0;for(const c of v)h=((h<<5)-h+c.charCodeAt(0))|0;return Math.abs(h).toString(36)}
const id=(kind:string,target:string,at:string)=>`native-${kind}-${hash(target)}-${Math.floor(Date.parse(at)/900000)}`
const high=(v:number,t:Thresholds):'info'|'warning'|'critical'=>v>=t.critical?'critical':v>=t.warning?'warning':'info'
const low=(v:number,t:Thresholds):'info'|'warning'|'critical'=>v<=t.critical?'critical':v<=t.warning?'warning':'info'
const sampleStatus=(s:'info'|'warning'|'critical'):NativeProbeStatus=>s==='critical'?'critical':s==='warning'?'warning':'healthy'
function incident(i:{context:ProviderObservationContext;kind:string;target:string;at:string;severity:'warning'|'critical';code:string;message:string;type:string;summary:string;metadata:Record<string,SerializableValue>}):SupervisorIncident{
  const incidentId=id(i.kind,i.target,i.at)
  return incidentSchema.parse({incidentId,provider:i.context.provider||'signalboost-platform',environment:i.context.environment,severity:i.severity,detectedAt:i.at,source:'cron',errorCode:i.code,errorMessage:i.message,affectedResource:safeTarget(i.target),evidence:[{evidenceId:`${incidentId}:probe`,type:i.type,capturedAt:i.at,summary:i.summary.slice(0,1000),reference:safeTarget(i.target)}],metadata:{monitoringMode:'native',observationOnly:true,nativeProbe:i.kind,...i.metadata}})
}

export class ApiHealthObserver implements Observer {
  private readonly f:typeof fetch; private readonly now:()=>Date
  constructor(private readonly o:ApiProbeOptions){this.f=o.fetchImpl??fetch;this.now=o.now??(()=>new Date())}
  async observe(context:ProviderObservationContext){
    const out:SupervisorIncident[]=[]; const count=clamp(Math.round(this.o.samplesPerUrl??5),1,10); const timeout=clamp(Math.round(this.o.timeoutMs??8000),1000,30000)
    const lt=this.o.latencyMs??{warning:1500,critical:3000}; const et=this.o.errorRate??{warning:.05,critical:.2}; const tm=Math.max(1.1,this.o.trendMultiplier??1.75)
    for(const raw of this.o.urls){
      const target=safeTarget(raw),at=this.now().toISOString(),dur:number[]=[],codes:number[]=[];let failures=0
      for(let n=0;n<count;n++){const start=performance.now();try{const r=await this.f(raw,{method:'GET',cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(timeout),headers:{'user-agent':'SignalBoost-Self-Healing-Native-Probe/1.0'}});dur.push(performance.now()-start);codes.push(r.status);if(r.status>=500)failures++;try{await r.body?.cancel()}catch{}}catch{dur.push(performance.now()-start);codes.push(0);failures++}}
      const p95=Math.round(percentile95(dur)),er=failures/count,history=await this.o.store.history('api',target,24),prior=history.map(x=>finite(x.latencyMs)).filter((x):x is number=>x!=null&&x>0),base=prior.length>=3?avg(prior.slice(0,12)):null
      const ls=high(p95,lt),es=high(er,et),reg=base!=null&&p95>=base*tm,severity=es==='critical'||ls==='critical'?'critical':es==='warning'||ls==='warning'||reg?'warning':'info'
      await this.o.store.save({probeId:'api',target,observedAt:at,status:sampleStatus(severity),latencyMs:p95,errorRate:round(er,4),metricValue:failures,metricUnit:'failed_requests',details:{sampleCount:count,statusCodes:codes,baselineP95Ms:base==null?null:Math.round(base),trendMultiplier:round(tm)}})
      if(es!=='info')out.push(incident({context,kind:'api-errors',target,at,severity:es,code:'native_api_error_rate',message:`API 5xx/network error rate is ${round(er*100,1)}% across ${count} live request(s).`,type:'native_api_probe',summary:`Statuses ${codes.join(', ')}; p95 ${p95} ms; ${failures}/${count} request(s) failed or returned 5xx.`,metadata:{p95Ms:p95,errorRate:round(er,4),sampleCount:count,statusCodes:codes}}))
      if(ls!=='info'||reg){const s:'warning'|'critical'=ls==='critical'?'critical':'warning';out.push(incident({context,kind:'api-latency',target,at,severity:s,code:reg?'native_api_latency_regression':'native_api_latency',message:reg&&base!=null?`API p95 latency is ${p95} ms, ${round(p95/base,2)}x the recent native baseline.`:`API p95 latency is ${p95} ms.`,type:'native_api_latency_probe',summary:`Measured ${count} live request(s); recent baseline ${base==null?'not yet established':`${Math.round(base)} ms`}.`,metadata:{p95Ms:p95,baselineP95Ms:base==null?null:Math.round(base),sampleCount:count}}))}
    }return out
  }
}

export class DatabaseHealthObserver implements Observer {
  private readonly now:()=>Date
  constructor(private readonly o:DatabaseProbeOptions){this.now=o.now??(()=>new Date())}
  async observe(context:ProviderObservationContext){
    const at=this.now().toISOString(),target=this.o.target??'supabase-postgres',start=performance.now(),r=await this.o.db.rpc('self_healing_database_probe'),latency=Math.round(performance.now()-start)
    if(r.error){await this.o.store.save({probeId:'database',target,observedAt:at,status:'error',latencyMs:latency,errorRate:1,metricValue:null,metricUnit:'connection_pressure_pct',details:{rpcOk:false,failure:String(r.error.message||'database probe failed').slice(0,220)}});return[incident({context,kind:'database',target,at,severity:'critical',code:'native_database_probe_failed',message:'Native database health probe failed.',type:'native_database_probe',summary:`Read-only database health RPC failed after ${latency} ms.`,metadata:{latencyMs:latency,rpcOk:false}})]}
    const row=Array.isArray(r.data)?r.data[0]:r.data,active=finite(row?.active_connections)??0,max=Math.max(1,finite(row?.max_connections)??1),pressure=finite(row?.connection_pressure_pct)??round(active/max*100,2),queries=finite(row?.active_queries)??0,longest=finite(row?.longest_query_seconds)??0
    const ls=high(latency,this.o.latencyMs??{warning:750,critical:2000}),ps=high(pressure,this.o.connectionPressurePct??{warning:70,critical:90}),severity=ls==='critical'||ps==='critical'?'critical':ls==='warning'||ps==='warning'?'warning':'info'
    await this.o.store.save({probeId:'database',target,observedAt:at,status:sampleStatus(severity),latencyMs:latency,errorRate:0,metricValue:round(pressure,2),metricUnit:'connection_pressure_pct',details:{activeConnections:active,maxConnections:max,activeQueries:queries,longestQuerySeconds:round(longest,2)}})
    const out:SupervisorIncident[]=[]
    if(ps!=='info')out.push(incident({context,kind:'database-pressure',target,at,severity:ps,code:'native_database_connection_pressure',message:`Database connection pressure is ${round(pressure,1)}% (${active}/${max}).`,type:'native_database_probe',summary:`${queries} active query(s); longest active query ${round(longest,1)} seconds.`,metadata:{connectionPressurePct:round(pressure,2),activeConnections:active,maxConnections:max,activeQueries:queries,longestQuerySeconds:round(longest,2)}}))
    if(ls!=='info')out.push(incident({context,kind:'database-latency',target,at,severity:ls,code:'native_database_latency',message:`Database health RPC latency is ${latency} ms.`,type:'native_database_latency_probe',summary:`Live read-only RPC completed in ${latency} ms.`,metadata:{latencyMs:latency,connectionPressurePct:round(pressure,2)}}))
    return out
  }
}

export class StorageHealthObserver implements Observer {
  private readonly now:()=>Date
  constructor(private readonly o:StorageProbeOptions){this.now=o.now??(()=>new Date())}
  async observe(context:ProviderObservationContext){
    const at=this.now().toISOString(),target=this.o.target??'supabase-storage',start=performance.now(),[b,u]=await Promise.all([this.o.db.storage.listBuckets(),this.o.db.rpc('self_healing_storage_probe',{quota_bytes:this.o.quotaBytes??null})]),latency=Math.round(performance.now()-start),failure=b?.error||u?.error
    if(failure){await this.o.store.save({probeId:'storage',target,observedAt:at,status:'error',latencyMs:latency,errorRate:1,metricValue:null,metricUnit:'capacity_pct',details:{apiOk:!b?.error,rpcOk:!u?.error,failure:String(failure.message||'storage probe failed').slice(0,220)}});return[incident({context,kind:'storage',target,at,severity:'critical',code:'native_storage_probe_failed',message:'Native storage health probe failed.',type:'native_storage_probe',summary:`Storage API/usage checks failed after ${latency} ms.`,metadata:{latencyMs:latency,storageApiOk:!b?.error,usageRpcOk:!u?.error}})]}
    const row=Array.isArray(u?.data)?u.data[0]:u?.data,bytes=finite(row?.bytes_used)??0,objects=finite(row?.object_count)??0,buckets=finite(row?.bucket_count)??(Array.isArray(b?.data)?b.data.length:0),capacity=finite(row?.capacity_pct),ls=high(latency,this.o.latencyMs??{warning:1000,critical:3000}),cs=capacity==null?'info':high(capacity,this.o.capacityPct??{warning:80,critical:95}),severity=ls==='critical'||cs==='critical'?'critical':ls==='warning'||cs==='warning'?'warning':'info'
    await this.o.store.save({probeId:'storage',target,observedAt:at,status:sampleStatus(severity),latencyMs:latency,errorRate:0,metricValue:capacity??bytes,metricUnit:capacity==null?'bytes_used':'capacity_pct',details:{bytesUsed:bytes,objectCount:objects,bucketCount:buckets,capacityPct:capacity==null?null:round(capacity,2),quotaConfigured:capacity!=null}})
    const out:SupervisorIncident[]=[]
    if(cs!=='info'&&capacity!=null)out.push(incident({context,kind:'storage-capacity',target,at,severity:cs,code:'native_storage_capacity_pressure',message:`Storage capacity is ${round(capacity,1)}% used.`,type:'native_storage_capacity_probe',summary:`${bytes} byte(s) across ${objects} object(s) in ${buckets} bucket(s).`,metadata:{capacityPct:round(capacity,2),bytesUsed:bytes,objectCount:objects,bucketCount:buckets}}))
    if(ls!=='info')out.push(incident({context,kind:'storage-latency',target,at,severity:ls,code:'native_storage_latency',message:`Storage health probe latency is ${latency} ms.`,type:'native_storage_latency_probe',summary:`Live bucket listing and storage usage RPC completed in ${latency} ms.`,metadata:{latencyMs:latency,bytesUsed:bytes,objectCount:objects,bucketCount:buckets}}))
    return out
  }
}

const cn=(v:string|string[]|undefined)=>Array.isArray(v)?v.join(', '):v
async function inspectTls(target:CertificateTarget,timeout:number):Promise<CertInfo>{
  return new Promise((resolve,reject)=>{const socket=tlsConnect({host:target.host,port:target.port??443,servername:target.host,rejectUnauthorized:true}),timer=setTimeout(()=>{socket.destroy();reject(new Error('tls_probe_timeout'))},timeout)
    socket.once('secureConnect',()=>{clearTimeout(timer);try{const c=socket.getPeerCertificate();if(!c?.valid_to)throw new Error('tls_certificate_missing');resolve({validTo:c.valid_to,subject:cn(c.subject?.CN),issuer:cn(c.issuer?.CN)})}catch(e){reject(e)}finally{socket.end()}})
    socket.once('error',e=>{clearTimeout(timer);reject(e)})
  })
}
export class CertificateExpiryObserver implements Observer {
  private readonly now:()=>Date;private readonly inspect:NonNullable<CertificateProbeOptions['inspectCertificate']>
  constructor(private readonly o:CertificateProbeOptions){this.now=o.now??(()=>new Date());this.inspect=o.inspectCertificate??inspectTls}
  async observe(context:ProviderObservationContext){
    const out:SupervisorIncident[]=[],t=this.o.expiryDays??{warning:30,critical:7},timeout=clamp(Math.round(this.o.timeoutMs??8000),1000,30000)
    for(const x of this.o.targets){const at=this.now().toISOString(),target=`${x.host}:${x.port??443}`,start=performance.now();try{const c=await this.inspect(x,timeout),latency=Math.round(performance.now()-start),expiry=Date.parse(c.validTo);if(!Number.isFinite(expiry))throw new Error('tls_certificate_expiry_invalid');const days=(expiry-Date.parse(at))/86400000,s=low(days,t)
      await this.o.store.save({probeId:'certificate',target,observedAt:at,status:sampleStatus(s),latencyMs:latency,errorRate:0,metricValue:round(days,2),metricUnit:'days_remaining',details:{validTo:new Date(expiry).toISOString(),subject:c.subject??null,issuer:c.issuer??null}})
      if(s!=='info')out.push(incident({context,kind:'certificate-expiry',target,at,severity:s,code:'native_certificate_expiry',message:`TLS certificate for ${x.host} expires in ${round(days,1)} day(s).`,type:'native_tls_certificate_probe',summary:`Validated TLS handshake; certificate expires ${new Date(expiry).toISOString()}.`,metadata:{daysRemaining:round(days,2),validTo:new Date(expiry).toISOString(),tlsHandshakeMs:latency}}))
    }catch(e){const latency=Math.round(performance.now()-start);await this.o.store.save({probeId:'certificate',target,observedAt:at,status:'error',latencyMs:latency,errorRate:1,metricValue:null,metricUnit:'days_remaining',details:{tlsOk:false,failure:String(e instanceof Error?e.message:'TLS probe failed').slice(0,220)}});out.push(incident({context,kind:'certificate',target,at,severity:'critical',code:'native_tls_validation_failed',message:`TLS validation failed for ${x.host}.`,type:'native_tls_certificate_probe',summary:`A real TLS handshake failed after ${latency} ms.`,metadata:{tlsOk:false,tlsHandshakeMs:latency}}))}}
    return out
  }
}
export function createNativeProactiveMonitoringCollectors(i:{db:any;store:NativeProbeStore;apiUrls:readonly string[];certificateTargets:readonly CertificateTarget[];storageQuotaBytes?:number|null}):NativeMonitoringCollector[]{
  return [
    {id:'native-api-health',signals:['api-error-rate','api-latency'],observer:new ApiHealthObserver({urls:i.apiUrls,store:i.store})},
    {id:'native-database-health',signals:['database-health'],observer:new DatabaseHealthObserver({db:i.db,store:i.store})},
    {id:'native-storage-health',signals:['storage-health'],observer:new StorageHealthObserver({db:i.db,store:i.store,quotaBytes:i.storageQuotaBytes})},
    {id:'native-certificate-expiry',signals:['certificate-expiry'],observer:new CertificateExpiryObserver({targets:i.certificateTargets,store:i.store})},
  ]
}
