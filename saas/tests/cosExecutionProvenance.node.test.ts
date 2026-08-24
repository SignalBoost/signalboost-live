// saas/tests/cosExecutionProvenance.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCosExecutionProvenance, previousCosExecution, rememberCosExecution } from '../lib/ai/cos/cosExecutionProvenance.ts'

test('provenance introspection reads the immediately prior server execution snapshot',()=>{
  rememberCosExecution({sessionId:'conversation-1',snapshot:{at:'2026-08-11T20:00:00-06:00',prompt:'diagnose SaaS latency',reply:'answer',source:'local_cos_reasoning',executionProvenance:{authority:'server_execution_telemetry',model_generated:false,semantic_cache:{used:false,evidence_count:0},enterprise_memory:{used:true,evidence_count:2},knowledge_graph:{used:true,evidence_count:2},learned_corpus:{used:false,evidence_count:0},autonomous_research:{used:false,documents_acquired:0,new_knowledge_retained:0},local_reasoning:{invoked:true,model:'independent-local:qwen2.5-coder:32b'},external_ai:{invoked:false}},liveTelemetry:null}})
  const prior=previousCosExecution({sessionId:'conversation-1'})
  assert.ok(prior)
  const text=formatCosExecutionProvenance(prior!)
  assert.match(text,/qwen2\.5-coder:32b/)
  assert.match(text,/Enterprise Memory: used; evidence contributed: 2/)
  assert.match(text,/External Fallback \/ Teacher: not used/)
  assert.doesNotMatch(text,/lead magnet/i)
})
