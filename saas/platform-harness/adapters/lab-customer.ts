// Customer Lab Harness ingress.
// Auth + explicit Lab membership are verified before this helper is called. The host then issues
// one narrow, non-expanding Production authority envelope for the Lab binding operation.
import { randomUUID } from 'node:crypto'
import { createProductionHarnessRequest } from './production.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import { withHarnessExecutionContext } from '../runtime/execution-context.ts'
import type { HarnessManifest } from '../core/types.ts'

export const LAB_UNIVERSITY_BIND_CAPABILITY='university.distillation.execute' as const

export async function withCustomerLabUniversityBindingHarness<T>(input:{
  organizationId:string
  operation:(manifest:HarnessManifest)=>Promise<T>
}):Promise<T>{
  const runId=`lab-customer-${randomUUID()}`
  const request=createProductionHarnessRequest({
    runId,
    objective:'Bind an authenticated customer Lab Experiment to an existing governed University run.',
    tenantId:input.organizationId,
    portableId:'itmounts-lab',
    agentId:'itmounts-lab-customer-ingress',
    role:'lab_customer',
    environmentId:'itmounts-production',
    requestedCapabilities:[LAB_UNIVERSITY_BIND_CAPABILITY],
    limits:{deadlineMs:30_000,maxToolCalls:1,maxConcurrency:1,maxCostUsd:0},
  })
  const decision=resolveHarnessManifest(request,{
    manifestRef:`host://lab-customer-membership/${input.organizationId}/${runId}`,
    verified:true,
    verifiedBy:'host',
    environments:['production'],
    capabilities:[{
      id:LAB_UNIVERSITY_BIND_CAPABILITY,
      environments:['production'],
      mutating:true,
      risk:'write',
      scopes:[`organization:${input.organizationId}`],
    }],
    limits:{deadlineMs:30_000,maxToolCalls:1,maxConcurrency:1,maxCostUsd:0},
  })
  if(decision.allowed===false) throw new Error(`lab_customer_harness_denied:${decision.reasons.join(',')}`)
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort('harness_deadline_exceeded'),30_000)
  try{
    return await withHarnessExecutionContext(decision.manifest,controller.signal,()=>input.operation(decision.manifest),{enforceProviderCostBudget:true})
  }finally{clearTimeout(timer)}
}
