import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUILDER_RESIDENCY_CASES,
  assessBuilderResidencyCaseCoverage,
  runBuilderResidencyOrchestrator,
  selectNextBuilderResidencyCase,
  type BuilderResidencyOrchestratorStore,
  type BuilderResidencyExactArtifactExecutor,
  type HarnessAuthorityEnvelope,
  type HarnessEvidenceSink,
  type HarnessRunResult,
} from '../platform-harness/index.ts'
import type { ResidencyEvidenceForAssessment, ResidencyStanding } from '../lib/ai/cos/cosUniversityResidency.ts'
import { selectBuilderResidencyEnrollmentForTick } from '../platform-harness/residency/orchestrator-store.ts'

const h=(char:string)=>char.repeat(64)

function evidence(input:Partial<ResidencyEvidenceForAssessment>&Pick<ResidencyEvidenceForAssessment,'competencyId'|'variantHash'>):ResidencyEvidenceForAssessment{
  return {
    competencyId:input.competencyId,
    variantHash:input.variantHash,
    outcome:input.outcome??'pass',
    observedAt:input.observedAt??'2026-09-22T12:00:00Z',
    accepted:input.accepted??true,
  }
}

function memoryStore(initial:readonly ResidencyEvidenceForAssessment[]=[]){
  const rows=[...initial]
  const refreshed:any[]=[]
  const started:any[]=[]
  const finished:any[]=[]
  const competency:any[]=[]
  const store:BuilderResidencyOrchestratorStore={
    async nextEnrollment(){
      return {
        residencyId:'residency-1',
        candidateId:'mass:test:0123456789abcdef',
        subjectId:'computer_science_coding',
        tenantId:'tenant-1',
        portableId:'builder',
        agentId:'builder-resident-1',
        artifactId:'artifact-1',
        artifactHash:h('a'),
        artifactRevision:h('b'),
        sandboxEnvironmentId:'sandbox-1',
        standing:'resident' as ResidencyStanding,
      }
    },
    async readEvidence(){return Object.freeze([...rows])},
    async refreshAssessment(residencyId){
      refreshed.push(residencyId)
      const assessment=(await import('../lib/ai/cos/cosUniversityResidency.ts')).assessBuilderResidency(rows)
      return {
        standing:assessment.standing,
        residencyComplete:assessment.residencyComplete,
        demonstratedCompetencies:assessment.demonstratedCompetencies,
        retainedCompetencies:assessment.retainedCompetencies,
        remediationCompetencies:assessment.remediationCompetencies,
      }
    },
    async startCase(input){started.push(input);return{caseRunId:`case-${started.length}`}},
    async finishCase(input){finished.push(input)},
    async recordCompetency(input){
      competency.push(input)
      rows.push(evidence({
        competencyId:input.competencyId,
        variantHash:input.variantHash,
        outcome:input.outcome,
        observedAt:input.observedAt,
      }))
    },
  }
  return {store,rows,refreshed,started,finished,competency}
}

const authority:HarnessAuthorityEnvelope={
  manifestRef:'referee://residency/orchestrator-test',
  verified:true,
  verifiedBy:'referee',
  environments:['sandbox'],
  capabilities:[
    {id:'mcp.github-mcp.contents.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.code.search',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.commits.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.commit.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.branches.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.pull_request.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.github-mcp.branch.create',environments:['sandbox'],mutating:true,risk:'write'},
    {id:'mcp.github-mcp.contents.write',environments:['sandbox'],mutating:true,risk:'write'},
    {id:'mcp.github-mcp.pull_request.create',environments:['sandbox'],mutating:true,risk:'write'},
    {id:'mcp.vercel-mcp.project.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.deployments.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.deployment.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.deployment_build_logs.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.vercel-mcp.runtime_logs.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.supabase-mcp.tables.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.supabase-mcp.logs.query',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'mcp.supabase-mcp.advisors.read',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.snapshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.screenshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.console',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.playwright-mcp.network.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.snapshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.screenshot',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.console.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.network.list',environments:['sandbox'],mutating:false,risk:'read'},
    {id:'browser.chrome-devtools-mcp.lighthouse',environments:['sandbox'],mutating:false,risk:'read'},
  ],
  limits:{maxToolCalls:120,deadlineMs:20*60_000,maxConcurrency:1},
}

function successfulResult(runId:string):HarnessRunResult{
  return {
    runId,
    profile:'residency',
    trajectory:[{
      runId,
      sequence:1,
      at:'2026-09-22T12:00:00Z',
      kind:'verification',
      summary:'case verified',
      evidenceRefs:['evidence://practice'],
    }],
    outcome:{status:'success',verifierRef:'verifier://practice',evidenceHash:h('e')},
    authorityExpanded:false,
    productionMutationObserved:false,
  }
}

const sink:HarnessEvidenceSink={async append(){}}


test('Residency scheduling retries one recent infrastructure failure then rotates for fairness',()=>{
  const enrollments=[
    {id:'resident-a'},
    {id:'resident-b'},
    {id:'resident-c'},
  ]
  const oneFailure=selectBuilderResidencyEnrollmentForTick({
    enrollments,
    recentCases:[
      {residency_id:'resident-b',harness_outcome:'infrastructure_failure',completed_at:'2026-09-23T15:08:00Z'},
    ],
  })
  assert.equal(oneFailure?.id,'resident-b')

  const secondFailure=selectBuilderResidencyEnrollmentForTick({
    enrollments,
    recentCases:[
      {residency_id:'resident-b',harness_outcome:'infrastructure_failure',completed_at:'2026-09-23T15:18:00Z'},
      {residency_id:'resident-b',harness_outcome:'infrastructure_failure',completed_at:'2026-09-23T15:08:00Z'},
    ],
  })
  assert.equal(secondFailure?.id,'resident-a')

  const competencyResult=selectBuilderResidencyEnrollmentForTick({
    enrollments,
    recentCases:[
      {residency_id:'resident-b',harness_outcome:'success',completed_at:'2026-09-23T15:18:00Z'},
    ],
  })
  assert.equal(competencyResult?.id,'resident-a')
})

test('coverage reports the complete Builder Residency v1 practical catalog',()=>{
  const coverage=assessBuilderResidencyCaseCoverage()
  assert.equal(coverage.totalCompetencies,13)
  assert.equal(coverage.coveredCompetencies,13)
  assert.deepEqual(coverage.missingCompetencies,[])
})

test('case selection prioritizes remediation before untouched competency',()=>{
  const first=BUILDER_RESIDENCY_CASES[0]
  const second=BUILDER_RESIDENCY_CASES[1]
  const rows=[
    evidence({competencyId:first.competencyId,variantHash:first.variantHash,outcome:'fail',observedAt:'2026-09-22T10:00:00Z'}),
  ]
  const selected=selectNextBuilderResidencyCase({evidence:rows})
  assert.equal(selected?.competencyId,first.competencyId)
  assert.notEqual(selected?.variantHash,second.variantHash)
})

test('scheduler runs one bounded case and recomputes standing',async()=>{
  const mem=memoryStore()
  let calls=0
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){
      calls+=1
      return successfulResult(input.request.runId)
    },
  }
  const out=await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor,
    harnessEvidenceSink:sink,
    authorityFor:async()=>authority,
    now:()=>new Date('2026-09-22T12:00:00Z'),
  })
  assert.equal(out.state,'case_completed')
  assert.equal(calls,1)
  assert.equal(mem.started.length,1)
  assert.equal(mem.competency.length,1)
  assert.equal(mem.refreshed.length,1)
  assert.equal(out.automaticFinalGateEnable,false)
  assert.equal(out.promotionAuthorized,false)
  assert.equal(out.productionTrafficAuthorized,false)
})

test('scheduler stops honestly when available case curriculum is exhausted',async()=>{
  const allCurrent=BUILDER_RESIDENCY_CASES.map(item=>evidence({
    competencyId:item.competencyId,
    variantHash:item.variantHash,
    outcome:'pass',
  }))
  const mem=memoryStore(allCurrent)
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(){throw new Error('must_not_run')},
  }
  const out=await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor,
    harnessEvidenceSink:sink,
    authorityFor:async()=>authority,
  })
  assert.equal(out.state,'waiting_for_residency_cases')
  assert.equal(out.ok,false)
  assert.equal(mem.started.length,0)
  assert.equal(out.coverage.coveredCompetencies,3)
  assert.equal(out.coverage.missingCompetencies.length,10)
  assert.equal(out.automaticFinalGateEnable,false)
})

test('idle scheduler never changes authority or final gate state',async()=>{
  const mem=memoryStore()
  mem.store.nextEnrollment=async()=>null
  const out=await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor:{async run(){throw new Error('must_not_run')}},
    harnessEvidenceSink:sink,
    authorityFor:async()=>authority,
  })
  assert.equal(out.state,'idle')
  assert.equal(out.ok,true)
  assert.equal(out.automaticFinalGateEnable,false)
  assert.equal(out.promotionAuthorized,false)
  assert.equal(out.productionTrafficAuthorized,false)
})


test('Builder Residency practical catalog covers every v1 competency without claiming final evaluation',()=>{
  const coverage=assessBuilderResidencyCaseCoverage()
  assert.equal(coverage.totalCompetencies,13)
  assert.equal(coverage.coveredCompetencies,13)
  assert.deepEqual(coverage.missingCompetencies,[])
  assert.equal(new Set(BUILDER_RESIDENCY_CASES.map(item=>item.competencyId)).size,13)
  assert.equal(new Set(BUILDER_RESIDENCY_CASES.map(item=>item.variantHash)).size,BUILDER_RESIDENCY_CASES.length)
})


test('scheduler hands infrastructure failure to Self-Healing without creating competency evidence',async()=>{
  const mem=memoryStore()
  const repairs:any[]=[]
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){
      return {
        runId:input.request.runId,
        profile:'residency',
        trajectory:[],
        outcome:{
          status:'infrastructure_failure',
          verifierRef:'host://builder-residency-independent-proof-v1',
          failureCode:'residency_exact_artifact_runtime_not_ready:network',
        },
        authorityExpanded:false,
        productionMutationObserved:false,
      }
    },
  }
  const out=await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor,
    harnessEvidenceSink:sink,
    authorityFor:async()=>authority,
    repairInfrastructure:async input=>{
      repairs.push(input)
      return {
        attempted:true,
        completed:true,
        failureCode:input.failureCode,
        authorityExpanded:false,
        productionTrafficAuthorized:false,
      }
    },
    now:()=>new Date('2026-09-23T12:30:00Z'),
  })

  assert.equal(out.ok,false)
  assert.equal(out.state,'case_not_completed')
  assert.equal(repairs.length,1)
  assert.equal(repairs[0].failureCode,'residency_exact_artifact_runtime_not_ready:network')
  assert.equal(mem.competency.length,0)
  assert.equal((out as any).selfHealing.completed,true)
})

test('scheduler does not invoke infrastructure repair for competency failure',async()=>{
  const mem=memoryStore()
  let repairs=0
  const executor:BuilderResidencyExactArtifactExecutor={
    async run(input){
      return {
        runId:input.request.runId,
        profile:'residency',
        trajectory:[],
        outcome:{
          status:'agent_failure',
          verifierRef:'host://builder-residency-independent-proof-v1',
          failureCode:'wrong_diagnosis',
        },
        authorityExpanded:false,
        productionMutationObserved:false,
      }
    },
  }
  await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor,
    harnessEvidenceSink:sink,
    authorityFor:async()=>authority,
    repairInfrastructure:async()=>{
      repairs+=1
      return {}
    },
  })
  assert.equal(repairs,0)
})
