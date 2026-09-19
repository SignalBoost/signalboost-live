import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claimAvailableDynamicPipeline,
  createDynamicPipelineCandidate,
  dynamicPipelineCandidatesFromProviderHub,
  rerouteDynamicPipeline,
  routeDynamicPipeline,
} from '../lib/dynamic-pipeline-router/index.ts'
import { createPortableCapabilityDescriptor } from '../provider-hub-core/capability-runtime.ts'

const candidate=(overrides: Partial<Parameters<typeof createDynamicPipelineCandidate>[0]>={})=>createDynamicPipelineCandidate({
  pipelineId:'p1', providerId:'provider-a', capabilityIds:Object.freeze(['teacher.generate']),
  availability:'available', maxConcurrency:4, activeLeases:0, queueDepth:0, recentFailureRate:0,
  estimatedUnitCostUsd:0.01, estimatedLatencyMs:100, environments:Object.freeze(['production']), ...overrides,
})

test('routes to compatible available capacity and skips unavailable/full pipelines',()=>{
  const decision=routeDynamicPipeline({workloadId:'w1',capabilityId:'teacher.generate',environment:'production'},[
    candidate({pipelineId:'down',availability:'unavailable'}),
    candidate({pipelineId:'full',activeLeases:4,maxConcurrency:4}),
    candidate({pipelineId:'ready',providerId:'provider-b'}),
  ])
  assert.equal(decision.selected?.pipelineId,'ready')
  assert.equal(decision.authorityExpanded,false)
})

test('buyer provider preference is honored among healthy compatible pipelines',()=>{
  const decision=routeDynamicPipeline({
    workloadId:'w2',capabilityId:'teacher.generate',preferredProviderIds:['provider-b'],
  },[
    candidate({pipelineId:'a',providerId:'provider-a'}),
    candidate({pipelineId:'b',providerId:'provider-b'}),
  ])
  assert.equal(decision.selected?.providerId,'provider-b')
})

test('failed pipeline can be excluded and work reroutes to another compatible pipeline',()=>{
  const all=[
    candidate({pipelineId:'a',providerId:'provider-a'}),
    candidate({pipelineId:'b',providerId:'provider-b'}),
  ]
  const first=routeDynamicPipeline({workloadId:'w3',capabilityId:'teacher.generate'},all)
  assert.ok(first.selected)
  const second=rerouteDynamicPipeline({workloadId:'w3',capabilityId:'teacher.generate'},all,[first.selected!.pipelineId])
  assert.ok(second.selected)
  assert.notEqual(second.selected?.pipelineId,first.selected?.pipelineId)
})

test('lease contention falls through to the next ranked pipeline without executing work',async()=>{
  const attempts:string[]=[]
  const result=await claimAvailableDynamicPipeline({
    workload:{workloadId:'w4',capabilityId:'teacher.generate',preferredProviderIds:['provider-a']},
    candidates:[
      candidate({pipelineId:'a',providerId:'provider-a'}),
      candidate({pipelineId:'b',providerId:'provider-b'}),
    ],
    leasePort:{
      async tryAcquire(input){
        attempts.push(input.pipelineId)
        return input.pipelineId==='a'?null:{leaseId:'lease-b',workloadId:input.workloadId,pipelineId:input.pipelineId}
      },
    },
  })
  assert.equal(result.claimed,true)
  assert.equal(result.candidate?.pipelineId,'b')
  assert.deepEqual(attempts,['a','b'])
})

test('Provider Hub capability metadata adapts into router candidates without becoming another provider registry',()=>{
  const descriptor=createPortableCapabilityDescriptor({
    capabilityId:'teacher.generate',providerId:'buyer-cloud',connectionId:'conn-1',tenantId:'tenant-1',
    environmentId:'production',risk:'write',availability:'available',requiresApproval:false,scopes:Object.freeze(['generate']),
    metadata:Object.freeze({maxConcurrency:8,activeLeases:2,queueDepth:3,recentFailureRate:0.05}),
  })
  const [mapped]=dynamicPipelineCandidatesFromProviderHub([descriptor])
  assert.equal(mapped.providerId,'buyer-cloud')
  assert.equal(mapped.maxConcurrency,8)
  assert.equal(mapped.activeLeases,2)
  assert.deepEqual(mapped.capabilityIds,['teacher.generate'])
})

test('secret-like router metadata is rejected',()=>{
  assert.throws(()=>candidate({metadata:Object.freeze({apiKey:'do-not-store'})}),/secret_metadata_rejected/)
})


test('University distillation consumes the shared router instead of a private vendor modulo',()=>{
  const source=readFileSync(new URL('../lib/ai/cos/cosUniversityMassHostedTeacherStage.ts',import.meta.url),'utf8')
  assert.match(source,/rankDynamicPipelineCandidates/)
  assert.match(source,/capabilityId: 'ai\.teacher\.generate'/)
  assert.match(source,/routingMode: 'dynamic-pipeline-router-v1'/)
  assert.doesNotMatch(source,/teachers\[\(\(index as number\) \+ wave\) % teachers\.length\]/)
})
