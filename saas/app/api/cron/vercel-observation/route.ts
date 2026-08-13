import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSupervisorCoordinationStore } from '@/lib/supervisor/coordination'
import { SupabaseVercelTriggerStore, acceptVercelTrigger, loadActiveVercelConnections, runAcceptedVercelWork } from '@/lib/supervisor/providers/vercel/trigger-ingestion'
import { remediateNativeIncidents } from '@/self-healing-host/native-autonomous-loop'

export const runtime='nodejs'; export const dynamic='force-dynamic'; export const maxDuration=60
const n=(k:string,d:number,max:number)=>Math.min(Math.max(Number(process.env[k]||d),1),max)

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`) return NextResponse.json({ok:false,error:{code:'unauthorized_cron'}},{status:401})
  const started=Date.now()
  const maxConnections=n('VERCEL_OBSERVATION_MAX_CONNECTIONS',3,25)
  const maxDurationMs=n('VERCEL_OBSERVATION_MAX_DURATION_MS',45000,55000)
  const db=getAdminSupabase()
  let coordinationStore
  try{ coordinationStore=createSupervisorCoordinationStore({supabase:db,runtime:process.env.NODE_ENV as any}) }
  catch{ return NextResponse.json({ok:false,outcome:'deferred',error:{code:'coordination_unavailable'}},{status:503}) }

  const triggerStore=new SupabaseVercelTriggerStore(db)
  const summary:any[]=[]
  try{ await coordinationStore.reconcileExpiredLeases(new Date()) }
  catch{ summary.push({phase:'reconciliation',outcome:'deferred',reason:'coordination_unavailable'}) }

  const connections=await loadActiveVercelConnections(db,maxConnections)
  for(const connection of connections){
    if(Date.now()-started>maxDurationMs){ summary.push({connection:'bounded',outcome:'deferred',reason:'max_duration'}); break }
    try{
      const accepted=await acceptVercelTrigger({
        store:triggerStore,
        coordinationStore,
        connection,
        triggerSource:'scheduled_observation',
        observationWindow:String(Math.floor(Date.now()/n('VERCEL_OBSERVATION_LOOKBACK_MS',3600000,86400000))),
        safeMetadata:{source:'cron',readOnly:true,providerMutations:false,browserExecution:false},
        maxAttempts:n('VERCEL_OBSERVATION_RETRY_ATTEMPTS',1,3),
      })

      let healthRun:any=null
      let remediation:any[]=[]
      if(accepted.workItemId&&accepted.outcome==='created'){
        healthRun=await runAcceptedVercelWork({
          coordinationStore,
          db,
          connection,
          workItemId:accepted.workItemId,
          ownerInstanceId:process.env.SUPERVISOR_INSTANCE_ID||'vercel-observation-cron',
          ownerRuntimeId:process.env.SUPERVISOR_RUNTIME_ID||`runtime-${process.pid}`,
          leaseMs:n('SUPERVISOR_LEASE_MS',60000,300000),
        })
        if(healthRun?.incident){
          remediation=await remediateNativeIncidents([healthRun.incident],{maxIncidents:1})
        }
      }

      summary.push({
        project:connection.projectId,
        environment:connection.environment,
        outcome:accepted.outcome,
        workItemId:accepted.workItemId,
        fingerprint:accepted.record.fingerprint.slice(0,16),
        healthStatus:healthRun?.status??null,
        incidentId:healthRun?.incident?.incidentId??null,
        remediation,
      })
    }catch(e:any){
      summary.push({project:connection.projectId,environment:connection.environment,outcome:'rejected',reason:String(e?.message||'failed').split(':')[0]})
    }
  }

  return NextResponse.json({
    ok:true,
    schemaVersion:'vercel-observation-cron-v2',
    readOnlyObservation:true,
    providerMutations:false,
    productionBrowserExecution:false,
    autonomousRemediation:true,
    limits:{maxConnections,maxDurationMs},
    summary,
  })
}
