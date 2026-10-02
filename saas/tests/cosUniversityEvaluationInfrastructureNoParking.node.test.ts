// saas/tests/cosUniversityEvaluationInfrastructureNoParking.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { MASS_EVALUATION_MAX_INFRASTRUCTURE_FAILURES_PER_GENERATION, MASS_EVALUATION_ROLLING_AUTHORIZATION_REF, decideInfrastructureStalledMassEvaluationArtifacts } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

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
 const events=Array.from({length:MASS_EVALUATION_MAX_INFRASTRUCTURE_FAILURES_PER_GENERATION-1},(_,i)=>event(i))
 assert.equal(decideInfrastructureStalledMassEvaluationArtifacts({artifacts:[artifact],events,now:new Date('2026-10-02T00:00:00Z')}).length,0)
})
