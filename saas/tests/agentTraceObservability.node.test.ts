import test from 'node:test'
import assert from 'node:assert/strict'
import { agentTraceEvent, AGENT_TRACE_SCHEMA } from '../lib/observability/agentTrace.ts'

test('agent trace is metadata-only and preserves correlation identity', () => {
  const event=agentTraceEvent({traceId:'harness:run-123',spanId:'span-1',parentSpanId:'root',kind:'tool',name:'mcp.github.read',status:'succeeded',actor:'builder',provider:'github',capability:'repository.read',authorityRef:'approval-1',durationMs:42,costUsd:0,attributes:{attempt:1,redacted:true}})
  assert.equal(event.schemaVersion,AGENT_TRACE_SCHEMA)
  assert.equal(event.traceId,'harness:run-123')
  assert.equal(event.parentSpanId,'root')
  assert.equal(event.kind,'tool')
  assert.equal(event.durationMs,42)
  assert.equal('prompt' in event,false)
  assert.equal('response' in event,false)
  assert.equal('args' in event,false)
})

test('agent trace rejects missing correlation identity', () => {
  assert.throws(()=>agentTraceEvent({traceId:'',kind:'agent',name:'cos',status:'started'}),/agent_trace_id_required/)
})
