import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_SANDBOX_RUNTIME_POLICY, assertSafeSandboxRuntimePolicy, validateSandboxRuntimePolicy } from '../lib/agent-runtime/policy.ts'
import { DisabledCodeSandboxProvider } from '../lib/agent-runtime/providers/disabled-provider.ts'

test('agent runtime defaults are conservative and immutable', () => {
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.maximumCorrectionAttempts, 3)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.outboundNetwork, false)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.inheritEnvironment, false)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.hostFilesystemAccess, false)
  assert.equal(DEFAULT_SANDBOX_RUNTIME_POLICY.repositoryWrites, false)
  assert.equal(Object.isFrozen(DEFAULT_SANDBOX_RUNTIME_POLICY), true)
  assert.deepEqual(validateSandboxRuntimePolicy(DEFAULT_SANDBOX_RUNTIME_POLICY), [])
})

test('unsafe policy values are rejected without weakening permissions', () => {
  const invalid = { ...DEFAULT_SANDBOX_RUNTIME_POLICY, maximumCorrectionAttempts: 4, outboundNetwork: true, hostFilesystemAccess: true, privilegedExecution: true, dockerSocketAccess: true, repositoryWrites: true, automaticDeployment: true, automaticMerge: true }
  const fields = validateSandboxRuntimePolicy(invalid).map(issue => issue.field)
  assert.deepEqual(fields, ['maximumCorrectionAttempts', 'outboundNetwork', 'hostFilesystemAccess', 'privilegedExecution', 'dockerSocketAccess', 'repositoryWrites', 'automaticDeployment', 'automaticMerge'])
  assert.throws(() => assertSafeSandboxRuntimePolicy(invalid))
  assert.throws(() => assertSafeSandboxRuntimePolicy({ ...DEFAULT_SANDBOX_RUNTIME_POLICY, maximumCommandExecutionTimeMs: 0 }))
})

test('disabled provider never executes, returns structured failure, and cleanup is idempotent', async () => {
  const provider = new DisabledCodeSandboxProvider()
  const session = await provider.createSession({ workspaceId: 'work', declaredWorkspacePath: 'workspace', capabilities: [] })
  const result = await provider.execute(session, { requestId: 'request', language: 'typescript', stage: 'execution', source: 'throw new Error()', workingDirectory: '.', timeoutMs: 1 })
  assert.equal(result.exitCode, 125)
  assert.equal(result.error?.code, 'sandbox_unavailable')
  assert.equal(result.artifacts.length, 0)
  await provider.destroySession(session)
  await provider.destroySession(session)
})
