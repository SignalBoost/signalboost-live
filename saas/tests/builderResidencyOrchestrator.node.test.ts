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

test('coverage reports the real practical curriculum gap',()=>{
  const coverage=assessBuilderResidencyCaseCoverage()
  assert.equal(coverage.totalCompetencies,13)
  assert.equal(coverage.coveredCompetencies,3)
  assert.equal(coverage.missingCompetencies.length,10)
  assert.ok(coverage.missingCompetencies.includes('vercel_deployment_recovery'))
  assert.ok(coverage.missingCompetencies.includes('chrome_devtools_evidence'))
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
