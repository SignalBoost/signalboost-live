// saas/tests/cosUniversityEvaluationInfrastructureNoParking.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP, MASS_EVALUATION_MAX_INFRASTRUCTURE_FAILURES_PER_GENERATION, MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, decideInfrastructureStalledMassEvaluationArtifacts } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const candidateId='mass:11111111-1111-4111-8111-111111111111:abcdef0123456789'
const artifactHash='a'.repeat(64)
const artifact={candidateId,subjectId:'Economics & Finance',artifactHash,createdAt:'2026-09-29T00:00:00Z'}
const event=(i:number,error='mass_distilled_evaluation_answer_missing:x:finish=stop:think=0:open=0:close=0:other=0:cap=1024')=>({candidateId,observedAt:new Date(Date.parse('2026-10-01T00:00:00Z')+i*60000).toISOString(),expiresAt:null,verifier:'host_controller',evidence:{claim:'mass_distilled_independent_evaluation_failed',artifactHash,error,authorizationRef:MASS_EVALUATION_ROLLING_AUTHORIZATION_REF}})

test('persistent evaluator infrastructure cannot park a student forever',()=>{
 const events=Array.from({length:MASS_EVALUATION_MAX_INFRASTRUCTURE_FAILURES_PER_GENERATION},(_,i)=>event(i))
 const result=decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events,now:new Date('2026-10-02T00:00:00Z')})
 assert.equal(result.length,1)
 assert.equal(result[0].candidateId,candidateId)
})

test('bounded infrastructure retries remain allowed below the lifecycle ceiling',()=>{
 // Different failures (a transient run of mixed causes) retry up to the 12-failure ceiling.
 const events=Array.from({length:MASS_EVALUATION_MAX_INFRASTRUCTURE_FAILURES_PER_GENERATION-1},(_,i)=>event(i,`mass_distilled_evaluation_runtime_not_ready:mass_distilled_gateway_ping_timeout:case${i}`))
 assert.equal(decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events,now:new Date('2026-10-02T00:00:00Z')}).length,0)
})

// Owner decision 2026-10-07: every exam ends with a verdict or an explained failure. The same infrastructure error
// repeating is a defect a retry cannot fix (temperature 0), so it stops the generation well before the 12-failure
// ceiling instead of waiting out a cooldown ladder for days.
test('the same infrastructure error repeating stops the generation before the 12-failure ceiling',()=>{
 const events=Array.from({length:MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP},(_,i)=>event(i))
 const result=decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events,now:new Date('2026-10-02T00:00:00Z')})
 assert.equal(result.length,1)
 assert.ok(MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP<MASS_EVALUATION_MAX_INFRASTRUCTURE_FAILURES_PER_GENERATION)
})

test('one identical failure short of the stop, or a broken run, keeps retrying',()=>{
 const short=Array.from({length:MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP-1},(_,i)=>event(i))
 assert.equal(decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events:short,now:new Date('2026-10-02T00:00:00Z')}).length,0)
 // A different error in between breaks the run: only the newest consecutive identical errors count.
 const broken=[...Array.from({length:MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP-1},(_,i)=>event(i)),event(MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP,'mass_distilled_evaluation_judge_case_invalid')]
 assert.equal(decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events:broken,now:new Date('2026-10-02T00:00:00Z')}).length,0)
})

test('a repeated merit failure never counts toward the infrastructure stop',()=>{
 const merit=Array.from({length:MASS_EVALUATION_IDENTICAL_INFRASTRUCTURE_STOP},(_,i)=>event(i,'mass_distilled_evaluation_candidate_answer_missing:x:finish=stop:think=0:open=0:close=0:other=0:cap=1024'))
 assert.equal(decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events:merit,now:new Date('2026-10-02T00:00:00Z')}).length,0)
})
