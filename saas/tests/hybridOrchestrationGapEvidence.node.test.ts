import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Repository-evidence checks only. They are NOT commercial acceptance tests:
// each gate still requires independent staging AND production runtime receipts.
const source=(path:string)=>readFileSync(join(process.cwd(),path),'utf8')
const gap='docs/architecture/ITMOUNTS-HYBRID-ORCHESTRATION-GAP-ANALYSIS.md'
const upstream=join(process.cwd(),'../',gap)
const evidence=()=>readFileSync(existsSync(upstream)?upstream:join(process.cwd(),gap),'utf8')
const modules=[
 'lib/ai/cos/cosExecutionEnvelope.ts',
 'lib/ai/cos/agentProgressClient.ts',
 'lib/ai/cos/durableCosTurn.ts',
 'lib/agent-runtime/workflow-state.ts',
 'lib/agent-runtime/workflow-store-supabase.ts',
 'lib/agentic/dynamicWorkflowDefinition.ts',
 'lib/agentic/dynamicWorkflowRunStore.ts',
 'lib/agentic/taskLifecycle.ts',
 'lib/builder/agent-v2-job-cycle.ts',
 'lib/supervisor/orchestrator.ts',
 'platform-harness/runtime/runner.ts',
]
test('gap analysis traces real repository modules, not proposed replacement services',()=>{
 for(const file of modules) assert.ok(existsSync(join(process.cwd(),file)),file)
 assert.match(evidence(),/Reuse first/)
 assert.match(evidence(),/no third schema/i)
})
test('existing workflow store has scoped identity, idempotency, and fenced writes',()=>{
 const state=source('lib/agent-runtime/workflow-state.ts')
 const store=source('lib/agent-runtime/workflow-store-supabase.ts')
 for(const field of ['workflowId','requestId','userId','idempotencyKey','requestFingerprint','version','cancellationRequested'])
  assert.match(state,new RegExp('\\b'+field+'\\b'))
 assert.match(store,/getByIdempotencyKey/)
 assert.match(store,/compareAndSet/)
})
test('durable COS recovery must not duplicate the original action',()=>{
 const client=source('lib/ai/cos/agentProgressClient.ts')
 assert.match(client,/findDurableCosTurnReply/)
 assert.match(client,/method: 'GET'/)
 assert.match(client,/never replay/i)
})
test('Builder preserves a fenced checkpoint and Supervisor separates policy from verification',()=>{
 assert.match(source('lib/builder/agent-v2-job-cycle.ts'),/claimGeneration/)
 const supervisor=source('lib/supervisor/orchestrator.ts')
 assert.match(supervisor,/policyEngine: PolicyEngine/)
 assert.match(supervisor,/verifier: Verifier/)
})
test('platform harness includes an independent verifier interface',()=>{
 const runner=source('platform-harness/runtime/runner.ts')
 assert.match(runner,/HarnessOutcomeVerifier/)
 assert.match(runner,/verifier.verify/)
})
test('all ten commercial gates remain pending until actual runtime evidence',()=>{
 const document=evidence()
 const checklist=document.split('## Commercial readiness gate')[1]?.split('## Immediate next')[0]??''
 const pending=checklist.match(/^- \[ \] /gm)??[]
 assert.equal(pending.length,10)
 assert.equal((checklist.match(/^- \[x\] /gmi)??[]).length,0)
})
