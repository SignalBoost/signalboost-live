import assert from 'node:assert/strict'
import test from 'node:test'
import { createReferenceCOSA2AHost, REFERENCE_DIAGNOSTIC_AGENT_ID, selectCOSA2AHostForPlan } from '../a2a-host/reference-cos-runtime-host.ts'

const scope = { tenantId: 'signalboost-owner', environmentId: 'preview', portableId: 'cos' }
const env = { SIGNALBOOST_A2A_REFERENCE_ORIGIN: 'https://reference.example' } as NodeJS.ProcessEnv

test('Phase 9 buyer-installed host always takes precedence over the SignalBoost reference host', () => {
  const installed = { orchestrator: {} } as any
  const selected = selectCOSA2AHostForPlan({
    installedHost: installed,
    scope,
    plan: { familyId: 'self-healing-diagnostic', skillId: 'self-healing.diagnose' },
    env,
  })
  assert.equal(selected.source, 'buyer-installed')
  assert.equal(selected.host, installed)
})

test('Phase 9 reference fallback is available only for canonical advisory diagnosis', () => {
  const diagnostic = selectCOSA2AHostForPlan({
    installedHost: null,
    scope,
    plan: { familyId: 'self-healing-diagnostic', skillId: 'self-healing.diagnose' },
    env,
  })
  assert.equal(diagnostic.source, 'signalboost-reference')
  assert.ok(diagnostic.host)

  const marketing = selectCOSA2AHostForPlan({
    installedHost: null,
    scope,
    plan: { familyId: 'marketing', skillId: 'marketing.research' },
    env,
  })
  assert.equal(marketing.source, 'none')
  assert.equal(marketing.host, null)
})

test('Phase 9 reference registry is exact-scope and exposes one advisory skill', async () => {
  const host = createReferenceCOSA2AHost(scope, env)
  const snapshot = await host.registry.snapshot()
  assert.equal(snapshot.agents.length, 1)
  assert.equal(snapshot.agents[0].agentId, REFERENCE_DIAGNOSTIC_AGENT_ID)
  assert.deepEqual(snapshot.assignments[0].allowedSkills, [{ skillId: 'self-healing.diagnose', risk: 'advisory' }])
  assert.equal(snapshot.assignments[0].tenantId, scope.tenantId)
  assert.equal(snapshot.assignments[0].environmentId, scope.environmentId)
  assert.equal(snapshot.assignments[0].portableId, scope.portableId)
  assert.ok(!JSON.stringify(snapshot).includes('reference.example'))
})

test('Phase 9 COS orchestration reaches the reference specialist through HTTPS JSON-RPC', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  let endpoint = ''
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    calls += 1
    endpoint = String(input)
    const rpc = JSON.parse(String(init?.body ?? '{}'))
    assert.equal(rpc.method, 'message/send')
    assert.equal(rpc.params?.message?.metadata?.signalboostSkillId, 'self-healing.diagnose')
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: rpc.id,
      result: {
        kind: 'task',
        id: 'reference-task-1',
        contextId: 'reference-context-1',
        status: { state: 'completed' },
        artifacts: [{ artifactId: 'diagnosis-1', name: 'diagnosis', parts: [{ kind: 'text', text: 'Reference diagnosis completed.' }] }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  try {
    const host = createReferenceCOSA2AHost(scope, env)
    const result = await host.orchestrator.orchestrate({
      ...scope,
      messageId: 'phase9-message-1',
      text: 'The service is returning repeated 503 errors after deployment. Diagnose the incident.',
      traceId: 'phase9-trace-1',
      plan: { familyId: 'self-healing-diagnostic', skillId: 'self-healing.diagnose' },
    })
    assert.equal(result.ok, true)
    assert.equal(result.mode, 'delegated')
    assert.equal(result.selectedAgentId, REFERENCE_DIAGNOSTIC_AGENT_ID)
    assert.equal(calls, 1)
    assert.equal(endpoint, 'https://reference.example/api/a2a/reference-diagnostic')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Phase 9 rejects wildcard reference scope before host construction', () => {
  assert.throws(() => createReferenceCOSA2AHost({ ...scope, tenantId: '*' }, env), /a2a_reference_scope_invalid:tenantId/)
})
