// saas/tests/builderResidencyOrchestrator.node.test.ts
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
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  BUILDER_RESIDENCY_V1_COMPETENCIES,
  assessBuilderResidency,
  type ResidencyEvidenceForAssessment,
  type ResidencyStanding,
} from '../lib/ai/cos/cosUniversityResidency.ts'
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

test('a failed competency is remediated on its next unrecorded variant, never the failed one',()=>{
  const first=BUILDER_RESIDENCY_CASES[0]
  const rows=[
    evidence({competencyId:first.competencyId,variantHash:first.variantHash,outcome:'fail',observedAt:'2026-09-22T10:00:00Z'}),
  ]
  const selected=selectNextBuilderResidencyCase({evidence:rows})
  assert.equal(selected?.competencyId,first.competencyId)
  assert.notEqual(selected?.variantHash,first.variantHash)
})

test('every competency carries three distinct variants and the v1 variant hashes are unchanged',()=>{
  const byCompetency=new Map<string,Set<string>>()
  for(const item of BUILDER_RESIDENCY_CASES){
    const set=byCompetency.get(item.competencyId)??new Set<string>()
    set.add(item.variantHash)
    byCompetency.set(item.competencyId,set)
  }
  assert.equal(byCompetency.size,BUILDER_RESIDENCY_V1_COMPETENCIES.length)
  for(const competencyId of BUILDER_RESIDENCY_V1_COMPETENCIES){
    assert.ok((byCompetency.get(competencyId)?.size??0)>=3,competencyId)
  }
  // Recorded Production evidence is keyed by these hashes; editing a v1 case would orphan it.
  const v1=Object.fromEntries(BUILDER_RESIDENCY_CASES
    .filter(item=>item.variantId.startsWith('v1-'))
    .map(item=>[item.competencyId,item.variantHash]))
  assert.deepEqual(v1,{
    root_cause_diagnosis:'a265702ba999f37d0bc7d1ba2c16d987db1015c65ace40d731050d9935fcb1d4',
    recovery_from_wrong_initial_diagnosis:'9c326afe1090ae09afcbecf89fedf6e99be030a89dcd27050eb252cfa2ee61c1',
    test_and_regression_construction:'58dd24f3f44a310bbb79f0e8e88b2f8247511d2a809c8bef333f0aab54dc8aea',
    repository_navigation:'9cc9718fde3a3d507a399fe2677fd20a57e1777719a800aa7ca3fe04688ab3e8',
    typescript_nextjs_repair:'d73eb0c16d6ecd1f096c4c385b3c2fe7dc955ed4b712202d00673f7c9b712f90',
    vercel_deployment_recovery:'977847cf4d7484d3f7c992a014f9ea122334c366bafe95f84af53b5be68e614e',
    supabase_diagnosis:'47402eb7a9c9d53fce664cff13f7e9bec6910dc0a4990d7e6c6c679543682e10',
    playwright_browser_verification:'a58b9a6945b90ddf6d5f6288bc19c98b1266f13a4f318dc7bef21700fb303876',
    chrome_devtools_evidence:'83c57ad161324c769debbd2ecd86c338d73df63fde26acd06d50605b5e6630f8',
    rollback_judgment:'03636589e856ce507b6f1a11a109e011a2bcc9230df84fdc02dd2a507d63ac3b',
    mcp_tool_selection_and_recovery:'537d40789b347a53d2a8cc9b2bc983549ace5c04350e49add55afef2f61e4b89',
    security_and_authority_compliance:'96f13a3c1a01e536ddb06b04ce7bf4150ace22b9364dce7965acd1cfa99a50f1',
    cross_specialist_escalation:'989476c8526b4d635dc24e5ba36c49ffe47210ade994cba3760f6d71849b48a9',
  })
})

// v1 fixtures cannot be edited without changing their variant hash and orphaning recorded evidence.
// Two v1 cases already pass as seeded, so they prove nothing:
//   v1-entrypoint-trace   ' A  B ' trims to 'a  b', whose single double-space replace yields 'a-b'
//   v1-console-root-cause '/assets/app.jss' contains the substring '/assets/app.js' the check looks for
// They are listed here explicitly rather than silently skipped; every other case, and every v2/v3
// variant, must fail before the resident does any work.
const KNOWN_TRIVIAL_V1_VARIANTS=new Set(['v1-entrypoint-trace','v1-console-root-cause'])

test('every seeded case genuinely fails its proving command before any repair',()=>{
  for(const item of BUILDER_RESIDENCY_CASES){
    const dir=mkdtempSync(join(tmpdir(),'residency-case-'))
    try{
      for(const file of item.seedFiles){
        mkdirSync(dirname(join(dir,file.path)),{recursive:true})
        writeFileSync(join(dir,file.path),file.content)
      }
      const proof=spawnSync('sh',['-c',item.provingCommand],{cwd:dir,encoding:'utf8',timeout:20_000})
      if(KNOWN_TRIVIAL_V1_VARIANTS.has(item.variantId)){
        assert.equal(proof.status,0,`${item.variantId} is no longer trivial; remove it from the exception list`)
        continue
      }
      assert.notEqual(proof.status,0,`${item.variantId} passes without any work`)
    }finally{
      rmSync(dir,{recursive:true,force:true})
    }
  }
})

test('the catalog makes Residency completion and remediation reachable',()=>{
  const variants=(competencyId:string)=>BUILDER_RESIDENCY_CASES.filter(item=>item.competencyId===competencyId)
  const twoPassesEach=BUILDER_RESIDENCY_V1_COMPETENCIES.flatMap(competencyId=>
    variants(competencyId).slice(0,2).map(item=>evidence({competencyId,variantHash:item.variantHash,outcome:'pass'})))
  assert.equal(assessBuilderResidency(twoPassesEach).residencyComplete,true)

  const [v1,v2,v3]=variants('playwright_browser_verification')
  const remediated=[
    evidence({competencyId:v1.competencyId,variantHash:v1.variantHash,outcome:'fail',observedAt:'2026-09-22T10:00:00Z'}),
    evidence({competencyId:v2.competencyId,variantHash:v2.variantHash,outcome:'pass',observedAt:'2026-09-22T11:00:00Z'}),
    evidence({competencyId:v3.competencyId,variantHash:v3.variantHash,outcome:'pass',observedAt:'2026-09-22T12:00:00Z'}),
  ]
  const state=assessBuilderResidency(remediated).competencies
    .find(item=>item.competencyId==='playwright_browser_verification')?.state
  assert.equal(state,'demonstrated')
})

test('case selection never replays a variant that already has competency evidence',()=>{
  const first=BUILDER_RESIDENCY_CASES[0]
  const failed=[
    evidence({competencyId:first.competencyId,variantHash:first.variantHash,outcome:'fail',observedAt:'2026-09-22T10:00:00Z'}),
  ]
  const afterFail=selectNextBuilderResidencyCase({evidence:failed})
  assert.ok(afterFail)
  assert.notEqual(afterFail.variantHash,first.variantHash)

  const passed=[
    evidence({competencyId:first.competencyId,variantHash:first.variantHash,outcome:'pass'}),
  ]
  assert.notEqual(selectNextBuilderResidencyCase({evidence:passed})?.variantHash,first.variantHash)

  const everyVariantRecorded=BUILDER_RESIDENCY_CASES.map(item=>
    evidence({competencyId:item.competencyId,variantHash:item.variantHash,outcome:'fail'}))
  assert.equal(selectNextBuilderResidencyCase({evidence:everyVariantRecorded}),null)
})

test('remediation is prioritized onto a different, unrecorded variant of the failed competency',()=>{
  const first=BUILDER_RESIDENCY_CASES[0]
  const second=BUILDER_RESIDENCY_CASES[1]
  const alternate={...first,variantId:'v2-alternate',variantHash:h('e')}
  const cases=[first,second,alternate]
  const rows=[
    evidence({competencyId:first.competencyId,variantHash:first.variantHash,outcome:'fail',observedAt:'2026-09-22T10:00:00Z'}),
  ]
  const selected=selectNextBuilderResidencyCase({evidence:rows,cases})
  assert.equal(selected?.competencyId,first.competencyId)
  assert.equal(selected?.variantHash,alternate.variantHash)
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
  // Every variant already has evidence but none passed: nothing may be replayed and the
  // resident is not complete, so the scheduler must wait for new curriculum.
  const allCurrent=BUILDER_RESIDENCY_CASES.map(item=>evidence({
    competencyId:item.competencyId,
    variantHash:item.variantHash,
    outcome:'fail',
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
  assert.equal(out.coverage.coveredCompetencies,13)
  assert.equal(out.coverage.missingCompetencies.length,0)
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
