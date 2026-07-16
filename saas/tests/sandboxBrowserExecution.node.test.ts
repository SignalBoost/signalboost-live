import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BrowserExecutor } from '../lib/supervisor/executors/browser-executor.ts'
import {
  BrowserRuntimeDryRunAdapter,
  InMemorySandboxApprovalReplayGuard,
  promoteSandboxPackage,
  sandboxBrowserExecutionSchemaVersion,
} from '../lib/supervisor/executors/browser/index.ts'
import {
  digestBrowserApprovalToken,
  issueBrowserApprovalToken,
  type BrowserApprovalClaims,
} from '../lib/browser-runtime/approval.ts'
import {
  createBrowserExecutionId,
  InMemoryBrowserExecutionStore,
  InMemoryBrowserSessionRegistry,
} from '../lib/browser-runtime/execution-state.ts'
import type { BrowserTask } from '../lib/browser-runtime/contracts.ts'

const origin = 'http://localhost:4173'
const secret = 'sandbox-execution-test-secret'
const now = new Date('2026-07-16T12:00:00.000Z')
const clock = () => now
const policy = { allowedOrigins: [origin] }
const incident = { incidentId: 'INC-SBX-001', provider: 'sandbox', environment: 'sandbox', severity: 'warning', detectedAt: '2026-07-16T11:00:00.000Z', source: 'api', errorMessage: 'Sandbox repair exercise.', evidence: [{ evidenceId: 'EV-SBX-1', type: 'log', capturedAt: '2026-07-16T11:00:00.000Z', summary: 'local sandbox only' }], metadata: {} }
const steps = [
  { stepId: 'open-login', action: 'navigate', description: 'Open sandbox login.', protectedAction: false, parameters: { url: `${origin}/browser-sandbox/login` }, expectedResult: 'Login opens.' },
  { stepId: 'wait-login', action: 'read', description: 'Wait for login.', protectedAction: false, parameters: { target: { css: '[data-browser-sandbox="login"]' } }, expectedResult: 'Login visible.' },
  { stepId: 'fill-email', action: 'fill', description: 'Fill sandbox email.', protectedAction: false, parameters: { target: { css: '[name="email"]' }, valueRef: 'sandbox://credentials/email' }, expectedResult: 'Email filled.' },
  { stepId: 'fill-password', action: 'fill', description: 'Fill sandbox password.', protectedAction: false, parameters: { target: { css: '[name="password"]' }, valueRef: 'sandbox://credentials/password' }, expectedResult: 'Password filled.' },
  { stepId: 'submit-login', action: 'click', description: 'Submit local login.', protectedAction: false, parameters: { target: { css: '[data-action="login"]' } }, expectedResult: 'Dashboard opens.' },
  { stepId: 'wait-dashboard', action: 'read', description: 'Wait dashboard.', protectedAction: false, parameters: { target: { css: '[data-browser-sandbox="dashboard"]' } }, expectedResult: 'Dashboard visible.' },
  { stepId: 'open-settings', action: 'click', description: 'Open settings.', protectedAction: false, parameters: { target: { css: '[data-action="open-settings"]' } }, expectedResult: 'Settings opens.' },
  { stepId: 'wait-settings', action: 'read', description: 'Wait settings.', protectedAction: false, parameters: { target: { css: '[data-browser-sandbox="settings"]' } }, expectedResult: 'Settings visible.' },
  { stepId: 'fill-sandbox-value', action: 'fill', description: 'Fill harmless value.', protectedAction: false, parameters: { target: { css: '[name="sandboxValue"]' }, valueRef: 'sandbox://settings/value' }, expectedResult: 'Value prepared.' },
  { stepId: 'capture-ready', action: 'screenshot', description: 'Capture pre approval evidence.', protectedAction: false, parameters: { label: 'sandbox-settings-ready' }, expectedResult: 'Evidence captured.' },
  { stepId: 'approval-checkpoint', action: 'request_approval', description: 'Pause before protected save.', protectedAction: false, parameters: {}, expectedResult: 'Paused.' },
  { stepId: 'protected-save', action: 'click', description: 'Click protected save.', protectedAction: true, parameters: { target: { css: '[data-action="protected-save"]' } }, expectedResult: 'Save clicked.' },
  { stepId: 'wait-save-success', action: 'read', description: 'Wait success marker.', protectedAction: false, parameters: { target: { css: '[data-browser-sandbox="save-success"]' } }, expectedResult: 'Success marker appears.' },
  { stepId: 'capture-after-save', action: 'screenshot', description: 'Capture post save evidence.', protectedAction: false, parameters: { label: 'sandbox-after-protected-save' }, expectedResult: 'Post evidence captured.' },
] as any[]
const plan = { planId: 'PLAN-SBX-001', incidentId: incident.incidentId, diagnosis: 'Local sandbox browser execution.', confidenceScore: 85, requiresBrowser: true, riskLevel: 'medium', targetProvider: 'sandbox', targetEnvironment: 'sandbox', targetOrigin: origin, steps, verificationSteps: [{ stepId: 'verify-success', action: 'verify', description: 'Verify success marker.', protectedAction: false, parameters: { target: { css: '[data-browser-sandbox="save-success"]' } }, expectedResult: 'Success marker is verified.' }], generatedAt: '2026-07-16T11:01:00.000Z', schemaVersion: 'supervisor-plan-v1' } as any
const dispatch = { dispatchId: 'DISP-SBX-001', requestedExecutorKind: 'browser', requestedAt: '2026-07-16T11:02:00.000Z' } as any
const ids = steps.map(s => s.stepId)
function dry() { return new BrowserRuntimeDryRunAdapter().createPackage({ incident: incident as any, repairPlan: plan, approvedStepIds: ids, dispatch, requestedExecutorKind: 'browser', clock }) }
function sign(task: BrowserTask, allowedStepIds: string[], phase: 1|2, nonce: string, extra: Partial<BrowserApprovalClaims> = {}) { return issueBrowserApprovalToken({ version: 1, taskId: task.taskId, incidentId: task.incidentId, provider: task.provider, adapterId: task.adapterId, mode: task.mode, allowedStepIds, allowedOrigins: task.allowedOrigins, issuedAt: task.issuedAt, expiresAt: task.expiresAt, nonce, phase, checkpointStepId: 'approval-checkpoint', ...extra }, secret) }
function request(token = 'malformed', pkg = dry(), continuationApprovalToken?: string) { return { dryRunPackage: pkg, packageFingerprint: pkg.packageFingerprint, dispatchId: pkg.dispatchId, incidentId: pkg.incidentId, planId: pkg.planId, sandboxOrigin: origin, browserTaskApprovalToken: token, continuationApprovalToken, executionMode: 'sandbox_execute', requestedAt: now.toISOString(), schemaVersion: sandboxBrowserExecutionSchemaVersion } }
function ports(calls: string[] = []) { let currentUrl = 'about:blank'; let closed = false; return { calls, wasClosed: () => closed, sessions: { async open() { calls.push('open'); return { page: { url: () => currentUrl, goto: async (url: string) => { currentUrl = url; calls.push(`goto:${url}`) }, click: async (selector: string) => { calls.push(`click:${selector}`) }, fill: async (selector: string, value: string) => { calls.push(`fill:${selector}:${value}`) }, waitForSelector: async (selector: string) => { calls.push(`wait:${selector}`) } }, close: async () => { closed = true; calls.push('close') } } } }, context: { resolveSecretRef: async (ref: string) => { calls.push(`secret:${ref}`); return ref.endsWith('/password') ? 'test-password' : ref.endsWith('/email') ? 'sandbox@example.test' : 'approved-sandbox-value' }, captureScreenshot: async (label: string) => { calls.push(`screenshot:${label}`); return `artifact://sandbox/${label}` } } } }

test('valid sandbox package promotes deterministically and rejects tampering, wrong envs, and origins', () => {
  const pkg = dry(); const promoted = promoteSandboxPackage(request('placeholder', pkg), policy); const promoted2 = promoteSandboxPackage(request('placeholder', pkg), policy)
  assert.deepEqual(promoted.task.steps.map(s => s.id), ids); assert.deepEqual(promoted, promoted2)
  assert.throws(() => promoteSandboxPackage(request('placeholder', { ...pkg, targetEnvironment: 'production' } as any), policy), /fingerprint|sandbox/i)
  const preview = dry(); preview.targetEnvironment = 'preview'; assert.throws(() => promoteSandboxPackage(request('placeholder', preview), policy), /fingerprint|sandbox/i)
  assert.throws(() => promoteSandboxPackage({ ...request('placeholder', pkg), packageFingerprint: 'wrong' }, policy), /fingerprint/)
  assert.throws(() => promoteSandboxPackage({ ...request('placeholder', pkg), sandboxOrigin: 'https://example.com' }, policy), /loopback|origin/)
  assert.throws(() => promoteSandboxPackage({ ...request('placeholder', pkg), sandboxOrigin: 'http://localhost:9999' }, policy), /exact configured/)
})

test('sandbox execution requires Browser Runtime approval and pauses before protected save', async () => {
  const calls: string[] = []; const p = ports(calls); const store = new InMemoryBrowserExecutionStore(); const registry = new InMemoryBrowserSessionRegistry(); const executor = new BrowserExecutor({ sandbox: { policy, signingSecret: secret, sessions: p.sessions, context: p.context, executionStore: store, sessionRegistry: registry, now: clock }, clock })
  const pkg = dry(); const promoted = promoteSandboxPackage(request('placeholder', pkg), policy); const phaseOne = sign(promoted.task, ids.slice(0, ids.indexOf('approval-checkpoint') + 1), 1, 'phase-one')
  let result = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-1', metadata: { browserExecutionMode: 'sandbox_execute', sandboxExecutionRequest: request(undefined as any, pkg) } }, dispatch })
  assert.equal(result.status, 'failed'); assert.equal(calls.length, 0)
  result = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-2', metadata: { browserExecutionMode: 'sandbox_execute', sandboxExecutionRequest: request(phaseOne, pkg) } }, dispatch })
  assert.equal(result.status, 'paused_for_approval')
  assert.equal(calls.some(c => c.includes('protected-save')), false)
  assert.ok(calls.includes('screenshot:sandbox-settings-ready'))
  assert.equal(p.wasClosed(), false)
  assert.ok((result.evidence[0].data as any).runtimeResult.executionId)
})

test('valid continuation executes only remaining steps and cross execution replay is rejected', async () => {
  const calls: string[] = []; const p = ports(calls); const store = new InMemoryBrowserExecutionStore(); const registry = new InMemoryBrowserSessionRegistry(); const executor = new BrowserExecutor({ sandbox: { policy, signingSecret: secret, sessions: p.sessions, context: p.context, executionStore: store, sessionRegistry: registry, now: clock }, clock })
  const pkg = dry(); const promoted = promoteSandboxPackage(request('placeholder', pkg), policy); const preIds = ids.slice(0, ids.indexOf('approval-checkpoint') + 1); const postIds = ids.slice(ids.indexOf('approval-checkpoint') + 1); const phaseOne = sign(promoted.task, preIds, 1, 'phase-one-cont')
  const paused = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-3', metadata: { browserExecutionMode: 'sandbox_execute', sandboxExecutionRequest: request(phaseOne, pkg) } }, dispatch })
  const executionId = (paused.evidence[0].data as any).runtimeResult.executionId as string
  const wrong = sign(promoted.task, postIds, 2, 'wrong-exec', { executionId: 'different', preApprovalTokenDigest: digestBrowserApprovalToken(phaseOne) })
  const rejected = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-4', metadata: { browserExecutionMode: 'sandbox_execute', browserExecutionId: executionId, sandboxExecutionRequest: request(phaseOne, pkg, wrong) } }, dispatch })
  assert.equal(rejected.status, 'failed'); assert.equal(calls.some(c => c === 'click:[data-action="protected-save"]'), false)
  const phaseTwo = sign(promoted.task, postIds, 2, 'phase-two', { executionId, preApprovalTokenDigest: digestBrowserApprovalToken(phaseOne) })
  const completed = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-5', metadata: { browserExecutionMode: 'sandbox_execute', browserExecutionId: executionId, sandboxExecutionRequest: request(phaseOne, pkg, phaseTwo) } }, dispatch })
  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.executedStepIds, ids.filter(id => id !== 'approval-checkpoint'))
  assert.equal(calls.filter(c => c.startsWith('goto:')).length, 1)
  assert.ok(calls.includes('screenshot:sandbox-after-protected-save'))
  assert.equal(p.wasClosed(), true)
})

test('sandbox execution rejects a reused phase-one approval before opening another session', async () => {
  const calls: string[] = []
  const p = ports(calls)
  const executor = new BrowserExecutor({
    sandbox: {
      policy,
      signingSecret: secret,
      sessions: p.sessions,
      context: p.context,
      executionStore: new InMemoryBrowserExecutionStore(),
      sessionRegistry: new InMemoryBrowserSessionRegistry(),
      approvalReplayGuard: new InMemorySandboxApprovalReplayGuard(),
      now: clock,
    },
    clock,
  })
  const pkg = dry()
  const promoted = promoteSandboxPackage(request('placeholder', pkg), policy)
  const phaseOne = sign(
    promoted.task,
    ids.slice(0, ids.indexOf('approval-checkpoint') + 1),
    1,
    'phase-one-single-use',
  )
  const first = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-REPLAY-1', metadata: { browserExecutionMode: 'sandbox_execute', sandboxExecutionRequest: request(phaseOne, pkg) } }, dispatch })
  assert.equal(first.status, 'paused_for_approval')
  const callsAfterFirst = calls.length

  const replayed = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-REPLAY-2', metadata: { browserExecutionMode: 'sandbox_execute', sandboxExecutionRequest: request(phaseOne, pkg) } }, dispatch })
  assert.equal(replayed.status, 'failed')
  assert.equal(calls.length, callsAfterFirst)
  assert.equal(calls.filter(call => call === 'open').length, 1)
  assert.match(JSON.stringify(replayed.evidence), /already been used/)
})

test('sandbox continuation rejects a reused nonce before the protected action', async () => {
  const calls: string[] = []
  const p = ports(calls)
  const executor = new BrowserExecutor({
    sandbox: {
      policy,
      signingSecret: secret,
      sessions: p.sessions,
      context: p.context,
      executionStore: new InMemoryBrowserExecutionStore(),
      sessionRegistry: new InMemoryBrowserSessionRegistry(),
      approvalReplayGuard: new InMemorySandboxApprovalReplayGuard(),
      now: clock,
    },
    clock,
  })
  const pkg = dry()
  const promoted = promoteSandboxPackage(request('placeholder', pkg), policy)
  const preIds = ids.slice(0, ids.indexOf('approval-checkpoint') + 1)
  const postIds = ids.slice(ids.indexOf('approval-checkpoint') + 1)
  const reusedNonce = 'must-be-unique-across-approvals'
  const phaseOne = sign(promoted.task, preIds, 1, reusedNonce)
  const paused = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-NONCE-1', metadata: { browserExecutionMode: 'sandbox_execute', sandboxExecutionRequest: request(phaseOne, pkg) } }, dispatch })
  const executionId = (paused.evidence[0].data as any).runtimeResult.executionId as string
  const phaseTwo = sign(promoted.task, postIds, 2, reusedNonce, {
    executionId,
    preApprovalTokenDigest: digestBrowserApprovalToken(phaseOne),
  })

  const rejected = await executor.execute({ incident: incident as any, plan, approvedStepIds: ids, executionContext: { executionId: 'EXEC-SBX-NONCE-2', metadata: { browserExecutionMode: 'sandbox_execute', browserExecutionId: executionId, sandboxExecutionRequest: request(phaseOne, pkg, phaseTwo) } }, dispatch })
  assert.equal(rejected.status, 'failed')
  assert.equal(calls.some(call => call === 'click:[data-action="protected-save"]'), false)
  assert.match(JSON.stringify(rejected.evidence), /already been used/)
})

test('sandbox adapter layer has no production browser/provider SDK imports and audit payloads are serializable without secrets', () => {
  for (const file of ['approval-replay-guard.ts','sandbox-execution-adapter.ts','sandbox-package-promoter.ts','sandbox-origin-policy.ts','sandbox-execution-schema.ts']) {
    const src = readFileSync(new URL(`../lib/supervisor/executors/browser/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /playwright|chromium|browser-use|stagehand|@vercel|stripe|supabase.*from|createClient/i)
  }
  assert.doesNotThrow(() => JSON.stringify(request('not-a-secret-token-name')))
  assert.doesNotMatch(JSON.stringify(request('not-a-secret-token-name')), /test-password|sandbox@example.test/)
})
