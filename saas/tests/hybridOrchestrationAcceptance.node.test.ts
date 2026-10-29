// saas/tests/hybridOrchestrationAcceptance.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateTaskOutcome } from '../lib/ai/cos/answerTaskContract.ts'

const source = (path:string) => readFileSync(join(process.cwd(),path),'utf8')

test('gate 1 diagnostic: current workflow state has identity but lacks canonical immutable objective contract',()=>{
 const existing=source('lib/agent-runtime/workflow-state.ts')
 assert.match(existing,/readonly workflowId: string; readonly requestId: string; readonly userId: string; readonly idempotencyKey: string/)
 assert.doesNotMatch(existing,/immutable_objective|completed_actions_ledger|final_verification_result/)
})
test('gate 6 partial: executable proof does not turn missing execution evidence into success',()=>{
 const verdict=evaluateTaskOutcome({originalRequest:'Deploy feature and verify production',answer:'Tests passed; deployment READY',requiresExecutionEvidence:true,receipts:[{kind:'test',reference:'ci:123',verified:true}]})
 assert.notEqual(verdict.status,'verified')
 assert.ok(verdict.blockers.includes('verified_execution_receipt_missing'))
})

test('gate 1 foundation: admission and terminal History use the canonical builder_jobs identity', () => {
 const admission=source('supabase/migrations/20261029161500_cos_canonical_task_admission.sql')
 const finish=source('supabase/migrations/20261029230000_cos_customer_task_atomic_finish.sql')
 const durable=source('lib/ai/cos/durableCosTurn.ts')
 assert.match(admission,/INSERT INTO public\.builder_jobs\(id,workspace_id,user_id,conversation_id,objective,job_kind/)
 assert.match(admission,/VALUES \(p_task_id,p_task_id,p_user_id,p_conversation_id/)
 assert.match(admission,/v_existing\.objective <> btrim\(p_objective\)/)
 assert.match(admission,/v_existing\.user_id <> p_user_id/)
 assert.match(finish,/select id into v_task_id from public\.builder_jobs[\s\S]*for update;/)
 assert.match(finish,/update public\.assistant_messages[\s\S]*update public\.builder_jobs/)
 assert.match(durable,/db\.rpc\('admit_cos_customer_task'/)
 assert.match(durable,/db\.rpc\('finish_cos_customer_task'/)
})

test('gate 1 foundation: database rejects objective changes and COS jobs cannot be claimed as Builder slices', () => {
 const schema=source('supabase/migrations/20261029153500_customer_task_record_foundation.sql')
 assert.match(schema,/NEW\.objective IS DISTINCT FROM OLD\.objective/)
 assert.match(schema,/CREATE TRIGGER protect_builder_task_objective BEFORE UPDATE ON public\.builder_jobs/)
 assert.match(schema,/CREATE TRIGGER prevent_cos_task_builder_claim BEFORE UPDATE ON public\.builder_jobs/)
 assert.match(schema,/job_kind IN \('standard', 'debug_file', 'cos_turn'\)/)
})


test('gate 1 regression: durable COS delegation carries the admitted identity into Builder', () => {
 const proxy=source('app/api/cos-provenance-browser/route.ts')
 const specialist=source('lib/ai/cos/softwareSpecialist.ts')
 const store=source('lib/builder/job-store.ts')
 assert.match(proxy,/canonicalCustomerTaskId: turnId, conversationId/)
 assert.match(specialist,/customerTaskId: String\(input\.body\.context\.canonicalCustomerTaskId\)/)
 assert.match(specialist,/await enqueueBuilderJob\(\{[\s\S]*?metadata: \{[\s\S]*?customerTaskId:/)
 assert.match(store,/db\.rpc\('enqueue_builder_job'/)
})

test('gate 1 regression: PostgreSQL enforces same user, conversation and COS parent kind', () => {
 const migration=source('supabase/migrations/20261029235900_builder_customer_task_parent_link.sql')
 assert.match(migration,/v_parent\.job_kind <> 'cos_turn'/)
 assert.match(migration,/v_parent\.user_id <> NEW\.user_id/)
 assert.match(migration,/v_parent\.conversation_id <> NEW\.conversation_id/)
 assert.match(migration,/BEFORE INSERT OR UPDATE OF metadata,user_id,conversation_id,job_kind/)
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.enforce_builder_customer_task_parent\(\) FROM PUBLIC, anon, authenticated/)
})

test.todo('gate 1 E2E: COS, Builder and History share one persisted immutable customer task and execution identity')
test.todo('gate 2 CI caller inventory: all module authorities classified and no parallel customer task record')
test.todo('gate 3 E2E: consequential tools denied by host-side policy despite agent replanning')
test.todo('gate 4 staging: provider accepted effect then worker crash; reconcile by action id without duplicate effect')
test.todo('gate 5 staging: failed plan replans preserving immutable objective, receipts, budget and grants')
test.todo('gate 6 staging: passing Builder tests with broken deployed feature remains incomplete')
test.todo('gate 7 staging: browser disconnect and worker restart recover the same task without re-POST')
test.todo('gate 8 Playwright: customer History Stop Resume Results control authoritative job and show evidence')
test.todo('gate 9 staging: real DB, provider and worker failure-injection receipts retained')
test.todo('gate 10 production: low-risk canary rollout and verified automatic rollback')
