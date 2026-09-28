//
// Production 2026-09-28: 26 of 37 active Builder residents could never finish. Each competency has three
// active variants, each attempted once, and after a failure a competency needs two distinct later passes,
// so fail -> pass -> fail (or pass -> fail) on one competency can never be cleared. Those residents stayed
// `remediation_required` (PENDING) forever and kept taking case turns. They now get a terminal FAIL with
// the evidence of which competency and which variants failed. The standard itself is unchanged.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  ACTIVE_BUILDER_RESIDENCY_CASES,
  runBuilderResidencyOrchestrator,
  unrecoverableBuilderResidencyCompetencies,
  type BuilderResidencyExactArtifactExecutor,
  type BuilderResidencyOrchestratorStore,
} from '../platform-harness/index.ts'
import {
  BUILDER_RESIDENCY_FAILED_CLAIM,
  BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE,
  createSupabaseBuilderResidencyOrchestratorStore,
} from '../platform-harness/residency/orchestrator-store.ts'
import {
  assessBuilderResidency,
  type ResidencyEvidenceForAssessment,
  type ResidencyStanding,
} from '../lib/ai/cos/cosUniversityResidency.ts'

const h=(char:string)=>char.repeat(64)
const variants=(competencyId:string)=>ACTIVE_BUILDER_RESIDENCY_CASES.filter(item=>item.competencyId===competencyId)
const [rc1,rc2,rc3]=variants('root_cause_diagnosis')

function row(variant:{competencyId:string;variantHash:string},outcome:'pass'|'fail',hour:number):ResidencyEvidenceForAssessment{
  return {
    competencyId:variant.competencyId,
    variantHash:variant.variantHash,
    outcome,
    observedAt:`2026-09-28T${String(hour).padStart(2,'0')}:00:00Z`,
    accepted:true,
  }
}

test('every competency still has exactly three active variants (the arithmetic this rule relies on)',()=>{
  const counts=new Map<string,number>()
  for(const item of ACTIVE_BUILDER_RESIDENCY_CASES) counts.set(item.competencyId,(counts.get(item.competencyId)??0)+1)
  assert.equal(counts.size,13)
  assert.ok([...counts.values()].every(count=>count===3))
})

test('fail -> pass -> fail on all three variants can never be cleared',()=>{
  const evidence=[row(rc1,'fail',1),row(rc2,'pass',4),row(rc3,'fail',8)]
  const out=unrecoverableBuilderResidencyCompetencies({evidence})
  assert.equal(out.length,1)
  assert.equal(out[0].competencyId,'root_cause_diagnosis')
  assert.equal(out[0].passesAfterLastFailure,0)
  assert.equal(out[0].untriedVariants,0)
  assert.deepEqual(out[0].attempts.map(item=>`${item.variantId}:${item.outcome}`),[
    `${rc1.variantId}:fail`,`${rc2.variantId}:pass`,`${rc3.variantId}:fail`,
  ])
})

test('pass -> fail leaves one untried variant, which can never give two later passes',()=>{
  const out=unrecoverableBuilderResidencyCompetencies({evidence:[row(rc1,'pass',1),row(rc2,'fail',2)]})
  assert.deepEqual(out.map(item=>item.competencyId),['root_cause_diagnosis'])
  assert.equal(out[0].untriedVariants,1)
})

test('residents that can still clear remediation are never failed',()=>{
  // One failure, two untried variants left.
  assert.equal(unrecoverableBuilderResidencyCompetencies({evidence:[row(rc1,'fail',1)]}).length,0)
  // One failure, one later pass, one untried variant left.
  assert.equal(unrecoverableBuilderResidencyCompetencies({evidence:[row(rc1,'fail',1),row(rc2,'pass',2)]}).length,0)
  // Cleared: two distinct passes after the failure.
  const cleared=[row(rc1,'fail',1),row(rc2,'pass',2),row(rc3,'pass',3)]
  assert.equal(unrecoverableBuilderResidencyCompetencies({evidence:cleared}).length,0)
  const state=assessBuilderResidency(cleared).competencies.find(item=>item.competencyId==='root_cause_diagnosis')?.state
  assert.equal(state,'demonstrated')
  // No evidence at all.
  assert.equal(unrecoverableBuilderResidencyCompetencies({evidence:[]}).length,0)
})

test('assessment alone never fails a resident; only the certain-result check does',()=>{
  const standing=assessBuilderResidency([row(rc1,'fail',1),row(rc2,'pass',4),row(rc3,'fail',8)]).standing
  assert.equal(standing,'remediation_required')
})

function enrollmentStore(evidence:readonly ResidencyEvidenceForAssessment[],withClose:boolean){
  const closed:any[]=[]
  const started:any[]=[]
  const store:BuilderResidencyOrchestratorStore={
    async nextEnrollment(){
      return {
        residencyId:'residency-dead',
        candidateId:'mass:test:dead',
        subjectId:'Computer Science & Coding',
        tenantId:'t',portableId:'p',agentId:'a',
        artifactId:'artifact-dead',
        artifactHash:h('a'),
        artifactRevision:h('b'),
        sandboxEnvironmentId:'s',
        standing:'remediation_required' as ResidencyStanding,
      }
    },
    async readEvidence(){return Object.freeze([...evidence])},
    async refreshAssessment(){throw new Error('must_not_refresh_a_closed_residency')},
    async startCase(input){started.push(input);return{caseRunId:'case-1'}},
    async finishCase(){},
    async recordCompetency(){},
    ...(withClose?{async closeFailedResidency(input:any){closed.push(input);return{closed:true,artifactQuarantined:true}}}:{}),
  }
  return {store,closed,started}
}

test('the orchestrator records the final FAIL instead of running a case that cannot change it',async()=>{
  const mem=enrollmentStore([row(rc1,'fail',1),row(rc2,'pass',4),row(rc3,'fail',8)],true)
  const executor:BuilderResidencyExactArtifactExecutor={async run(){throw new Error('must_not_run')}}
  const out:any=await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor,
    harnessEvidenceSink:{async record(){}} as any,
    authorityFor:async()=>{throw new Error('must_not_request_authority')},
  })
  assert.equal(out.state,'residency_failed')
  assert.equal(out.ok,true)
  assert.equal(out.artifactQuarantined,true)
  assert.equal(mem.started.length,0)
  assert.equal(mem.closed.length,1)
  assert.deepEqual(mem.closed[0].competencies.map((item:any)=>item.competencyId),['root_cause_diagnosis'])
  assert.equal(out.promotionAuthorized,false)
  assert.equal(out.productionTrafficAuthorized,false)
  assert.equal(out.automaticFinalGateEnable,false)
})

test('a failed closure is reported and still runs no case',async()=>{
  const mem=enrollmentStore([row(rc1,'fail',1),row(rc2,'pass',4),row(rc3,'fail',8)],false)
  ;(mem.store as any).closeFailedResidency=async()=>{throw new Error('check constraint violation')}
  const executor:BuilderResidencyExactArtifactExecutor={async run(){throw new Error('must_not_run')}}
  const out:any=await runBuilderResidencyOrchestrator({
    store:mem.store,
    executor,
    harnessEvidenceSink:{async record(){}} as any,
    authorityFor:async()=>{throw new Error('must_not_request_authority')},
  })
  assert.equal(out.state,'residency_failure_not_recorded')
  assert.equal(out.ok,false)
  assert.match(out.error,/check constraint/)
  assert.equal(mem.started.length,0)
})

type Call=Readonly<{table:string;op:string;value?:any;filters:readonly (readonly [string,string,unknown])[];options?:any}>

function fakeDb(input:{enrollments:any[];evidence:Record<string,any[]>}){
  const calls:Call[]=[]
  const db:any={
    from(table:string){
      let op='select'
      let value:any
      let options:any
      const filters:(readonly [string,string,unknown])[]=[]
      const result=()=>{
        calls.push(Object.freeze({table,op,value,filters:Object.freeze([...filters]),options}))
        if(table==='cos_university_residency_enrollments'&&op==='select') return {data:input.enrollments,error:null}
        if(table==='cos_university_residency_competency_evidence'){
          const id=String(filters.find(item=>item[0]==='eq'&&item[1]==='residency_id')?.[2]??'')
          return {data:input.evidence[id]??[],error:null}
        }
        if(op==='update') return {data:[{id:'row'}],error:null}
        return {data:null,error:null}
      }
      const chain:any={
        select(){return chain},
        update(next:any){op='update';value=next;return chain},
        upsert(next:any,opts:any){op='upsert';value=next;options=opts;return chain},
        eq(column:string,v:unknown){filters.push(['eq',column,v]);return chain},
        in(column:string,v:unknown){filters.push(['in',column,v]);return chain},
        order(){return chain},
        limit(){return chain},
        then(resolve:(value:any)=>unknown,reject?:(error:unknown)=>unknown){
          return Promise.resolve(result()).then(resolve,reject)
        },
      }
      return chain
    },
  }
  return {db,calls}
}

const enrollmentRow=(id:string,standing='remediation_required')=>({
  id,candidate_id:`mass:${id}`,subject_id:'Computer Science & Coding',trained_artifact_id:`artifact-${id}`,
  trained_artifact_hash:h('c'),revision_key:h('d'),standing,updated_at:'2026-09-28T10:00:00Z',
})
const evidenceRow=(variant:{competencyId:string;variantHash:string},outcome:'pass'|'fail',hour:number)=>({
  competency_id:variant.competencyId,variant_hash:variant.variantHash,outcome,observed_at:`2026-09-28T${String(hour).padStart(2,'0')}:00:00Z`,
})

test('the tick sweep fails only residents that can never finish, with evidence first',async()=>{
  const {db,calls}=fakeDb({
    enrollments:[enrollmentRow('dead0001'),enrollmentRow('alive001'),enrollmentRow('fresh001','resident')],
    evidence:{
      dead0001:[evidenceRow(rc1,'fail',1),evidenceRow(rc2,'pass',4),evidenceRow(rc3,'fail',8)],
      alive001:[evidenceRow(rc1,'fail',1),evidenceRow(rc2,'pass',4)],
      fresh001:[],
    },
  })
  const store=createSupabaseBuilderResidencyOrchestratorStore({db,tenantId:'t',portableId:'p',agentId:'a',sandboxEnvironmentId:'s'})
  const sweep=await store.closeUnrecoverableResidencies()
  assert.equal(sweep.checked,3)
  assert.deepEqual(sweep.closedResidencyIds,['dead0001'])
  assert.equal(sweep.quarantinedArtifacts,1)
  assert.deepEqual(sweep.errors,[])

  const writes=calls.filter(call=>call.op!=='select')
  assert.deepEqual(writes.map(call=>`${call.op}:${call.table}`),[
    'upsert:cos_university_learning_assurance_events',
    'update:cos_local_distillation_artifacts',
    'update:cos_university_residency_enrollments',
  ])
  const [event,artifact,enrollment]=writes
  assert.equal(event.value.event_type,'fine_tune')
  assert.equal(event.value.verifier,'host_controller')
  assert.equal(event.value.candidate_id,'mass:dead0001')
  assert.equal(event.value.evidence.profile,BUILDER_RESIDENCY_FINAL_DISPOSITION_PROFILE)
  assert.equal(event.value.evidence.claim,BUILDER_RESIDENCY_FAILED_CLAIM)
  assert.equal(event.value.evidence.failedCompetencies[0].competencyId,'root_cause_diagnosis')
  assert.equal(event.value.evidence.evaluationPassed,false)
  assert.equal(event.value.evidence.productionTrafficAuthorized,false)
  assert.equal(event.options.ignoreDuplicates,true)
  assert.match(event.value.event_key,/^[a-f0-9]{64}$/)
  assert.match(event.value.evidence_hash,/^[a-f0-9]{64}$/)

  assert.equal(artifact.value.status,'quarantined')
  assert.ok(artifact.filters.some(item=>item[0]==='eq'&&item[1]==='status'&&item[2]==='evaluation_pending'))
  assert.ok(artifact.filters.some(item=>item[0]==='eq'&&item[1]==='candidate_id'&&item[2]==='mass:dead0001'))

  assert.equal(enrollment.value.standing,'residency_failed')
  assert.ok(enrollment.filters.some(item=>item[0]==='eq'&&item[1]==='id'&&item[2]==='dead0001'))
  assert.ok(enrollment.filters.some(item=>item[0]==='in'&&item[1]==='standing'
    &&JSON.stringify(item[2])===JSON.stringify(['resident','senior_resident','remediation_required'])))
})

test('the Residency cron closes certain failures before admission and case turns',()=>{
  const route=readFileSync(new URL('../app/api/cron/cos-university-residency/route.ts',import.meta.url),'utf8')
  const sweep=route.indexOf('await store.closeUnrecoverableResidencies()')
  assert.ok(sweep>0)
  assert.ok(sweep<route.indexOf('await admitNextBuilderResidency('))
  assert.ok(sweep<route.indexOf('await runBuilderResidencyOrchestrator('))
  assert.match(route,/residencyFailures:\s*body\.residencyFailures/)
})

test('the database accepts the terminal residency_failed standing',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20260928234500_builder_residency_failed_standing.sql',import.meta.url),'utf8')
  assert.match(migration,/drop constraint if exists cos_university_residency_enrollments_standing_check/)
  assert.match(migration,/'resident','senior_resident','residency_complete','remediation_required','residency_failed'/)
})

test('owner telemetry shows a failed Residency as a result, not as work to continue',()=>{
  const route=readFileSync(new URL('../app/api/admin/cos-university-telemetry/route.ts',import.meta.url),'utf8')
  const failed=route.indexOf("residencyState?.standing === 'residency_failed'")
  assert.ok(failed>0)
  assert.ok(failed<route.indexOf("else if (residencyState && residencyState.standing !== 'residency_complete') { currentStage = 'Builder Residency'"))
})
