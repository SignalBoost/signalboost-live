import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import {
  PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT,
  PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_VERSION,
  runPlatformHarnessProductionAcceptance,
} from '@/platform-harness/acceptance/production-canary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function deploymentFingerprint():string {
  const deploymentUrl=String(process.env.VERCEL_URL??'').trim()
  if(!deploymentUrl) throw new Error('platform_harness_acceptance_deployment_unavailable')
  return `sha256:${createHash('sha256').update(deploymentUrl,'utf8').digest('hex')}`
}

export async function GET(req:NextRequest) {
  const cronSecret=String(process.env.CRON_SECRET??'').trim()
  if(!cronSecret||req.headers.get('authorization')!==`Bearer ${cronSecret}`) {
    return NextResponse.json({ok:false,error:'unauthorized_cron'},{status:401})
  }
  if(process.env.VERCEL_ENV!=='production') {
    return NextResponse.json({ok:false,error:'platform_harness_acceptance_production_only'},{status:409})
  }

  const productionCommit=String(process.env.VERCEL_GIT_COMMIT_SHA??'').trim()
  if(!productionCommit) {
    return NextResponse.json({ok:false,error:'platform_harness_acceptance_commit_unavailable'},{status:503})
  }

  let productionDeploymentFingerprint:string
  try {
    productionDeploymentFingerprint=deploymentFingerprint()
  } catch(error) {
    return NextResponse.json({
      ok:false,
      error:error instanceof Error?error.message:'platform_harness_acceptance_deployment_unavailable',
    },{status:503,headers:{'cache-control':'no-store'}})
  }

  const db=getAdminSupabase()
  const existing=await db.from('supervisor_audit_events')
    .select('event_id,occurred_at,payload')
    .eq('event_type',PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT)
    .contains('payload',{productionCommit,productionDeploymentFingerprint})
    .order('occurred_at',{ascending:false})
    .limit(1)
    .maybeSingle()

  if(existing.error) {
    return NextResponse.json({ok:false,error:'platform_harness_acceptance_lookup_failed'},{status:503})
  }
  if(existing.data) {
    const payload=existing.data.payload&&typeof existing.data.payload==='object'
      ? existing.data.payload as Record<string,unknown>
      : {}
    return NextResponse.json({
      ok:true,
      alreadyAccepted:true,
      eventId:existing.data.event_id,
      acceptedAt:payload.acceptedAt??existing.data.occurred_at,
      productionCommit,
      productionDeploymentFingerprint,
      cases:payload.cases??[],
    },{headers:{'cache-control':'no-store'}})
  }

  try {
    const result=await runPlatformHarnessProductionAcceptance({
      db:db as any,
      productionCommit,
      productionDeploymentFingerprint,
    })
    const eventId=`platform-harness-production-acceptance-${result.runId}`
    const payload=Object.freeze({
      acceptedAt:result.acceptedAt,
      productionCommit:result.productionCommit,
      productionDeploymentFingerprint:result.productionDeploymentFingerprint,
      acceptanceClass:'itmounts-production-harness-full-monty',
      cases:result.cases,
      hiddenReasoningPersisted:false,
      customerDataTouched:false,
      authorityExpanded:false,
    })
    const {error}=await db.from('supervisor_audit_events').insert({
      event_id:eventId,
      execution_id:result.runId,
      incident_id:result.runId,
      event_type:PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT,
      occurred_at:result.acceptedAt,
      payload,
      schema_version:PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_VERSION,
    })
    if(error) throw new Error('platform_harness_acceptance_summary_persist_failed')

    return NextResponse.json({
      ok:true,
      alreadyAccepted:false,
      eventId,
      acceptedAt:result.acceptedAt,
      productionCommit:result.productionCommit,
      productionDeploymentFingerprint:result.productionDeploymentFingerprint,
      cases:result.cases,
    },{headers:{'cache-control':'no-store'}})
  } catch(error) {
    const reason=error instanceof Error?error.message.split(':')[0]:'platform_harness_acceptance_failed'
    return NextResponse.json({ok:false,error:reason},{status:503,headers:{'cache-control':'no-store'}})
  }
}
