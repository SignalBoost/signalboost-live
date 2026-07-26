// saas/tests/portableBrowserRemoteAdapters.node.test.ts
//
// Five adapters that were four-line stubs — create() returned `never` — now validate a
// buyer's configuration and delegate the vendor call to a transport the buyer implements.
// These tests hold the rules that make that safe, and they run against every rebuilt adapter
// so a sixth cannot be added with a weaker posture.

import test from 'node:test'
import assert from 'node:assert/strict'

import { createBrowserstackSessionFactory, BROWSERSTACK_ADAPTER_DEFINITION, browserstackAdapterStatus } from '../lib/portable-browser/adapters/browserstack-adapter.ts'
import { createSauceLabsSessionFactory, SAUCE_LABS_ADAPTER_DEFINITION } from '../lib/portable-browser/adapters/sauce-labs-adapter.ts'
import { createLambdatestSessionFactory, LAMBDATEST_ADAPTER_DEFINITION } from '../lib/portable-browser/adapters/lambdatest-adapter.ts'
import { createUipathSessionFactory, UIPATH_ADAPTER_DEFINITION } from '../lib/portable-browser/adapters/uipath-adapter.ts'
import { createAutomationAnywhereSessionFactory, AUTOMATION_ANYWHERE_ADAPTER_DEFINITION } from '../lib/portable-browser/adapters/automation-anywhere-adapter.ts'
import { describeRemoteAdapter } from '../lib/portable-browser/adapters/remote-adapter-kit.ts'

const ORIGIN = 'http://localhost:3000'

const session = () => ({ page: {} as any, async close() {} })
const transport = (calls: any[] = []) => ({
  async openSession(input: any) { calls.push(input); return session() },
})
const broker = (value = 'vault-resolved-secret') => ({ async resolveCredential() { return value } })

const CONFIGS: Record<string, Record<string, string>> = {
  browserstack: { hubEndpoint: 'https://hub.example.com' },
  'sauce-labs': { hubEndpoint: 'https://ondemand.example.com', dataCentre: 'us-west' },
  lambdatest: { hubEndpoint: 'https://hub.example.com' },
  uipath: { orchestratorUrl: 'https://orch.example.com', tenantName: 'acme', folderPath: '/Approved' },
  'automation-anywhere': { controlRoomUrl: 'https://cr.example.com', botId: 'bot-42' },
}

const FACTORIES: Record<string, (c: any) => any> = {
  browserstack: createBrowserstackSessionFactory,
  'sauce-labs': createSauceLabsSessionFactory,
  lambdatest: createLambdatestSessionFactory,
  uipath: createUipathSessionFactory,
  'automation-anywhere': createAutomationAnywhereSessionFactory,
}

const DEFINITIONS = [
  BROWSERSTACK_ADAPTER_DEFINITION,
  SAUCE_LABS_ADAPTER_DEFINITION,
  LAMBDATEST_ADAPTER_DEFINITION,
  UIPATH_ADAPTER_DEFINITION,
  AUTOMATION_ANYWHERE_ADAPTER_DEFINITION,
]

const build = (id: string, over: any = {}) =>
  FACTORIES[id]({
    configuration: CONFIGS[id],
    approvedOrigins: [ORIGIN],
    credentialBroker: broker(),
    transport: transport(),
    ...over,
  })

const launch = (id: string, over: any = {}) => ({
  provider: id, adapterId: id, mode: 'read_only', allowedOrigins: [ORIGIN], ...over,
})

test('every rebuilt adapter opens a session and hands the transport the resolved credential', async () => {
  for (const id of Object.keys(FACTORIES)) {
    const calls: any[] = []
    const factory = build(id, { transport: transport(calls) })
    const opened = await factory.open(launch(id))
    assert.ok(opened, `${id} returned no session`)
    assert.equal(calls.length, 1, `${id} did not call the transport`)
    assert.equal(calls[0].credential, 'vault-resolved-secret', `${id} did not resolve the credential`)
  }
})

test('a launch request for a DIFFERENT vendor is refused, never quietly serviced', async () => {
  for (const id of Object.keys(FACTORIES)) {
    await assert.rejects(() => build(id).open(launch(id, { adapterId: 'someone-else' })), new RegExp(`${id}_launch_scope_rejected`))
  }
})

test('execute_change is refused by every adapter — these are read-only', async () => {
  for (const id of Object.keys(FACTORIES)) {
    await assert.rejects(() => build(id).open(launch(id, { mode: 'execute_change' })), new RegExp(`${id}_execute_change_rejected`))
  }
})

test('an origin outside the allowlist is refused — a session cannot roam', async () => {
  for (const id of Object.keys(FACTORIES)) {
    await assert.rejects(
      () => build(id).open(launch(id, { allowedOrigins: ['http://localhost:9999'] })),
      new RegExp(`${id}_origin_rejected`),
    )
  }
})

test('a buyer PRODUCTION origin is accepted — these adapters drive real applications', async () => {
  for (const id of Object.keys(FACTORIES)) {
    const production = 'https://app.acme.com'
    const factory = build(id, { approvedOrigins: [production] })
    const opened = await factory.open(launch(id, { allowedOrigins: [production] }))
    assert.ok(opened, `${id} refused a legitimate buyer origin`)
  }
})

test('the allowlist is the cage: an origin the buyer never declared is refused', async () => {
  for (const id of Object.keys(FACTORIES)) {
    const factory = build(id, { approvedOrigins: ['https://app.acme.com'] })
    await assert.rejects(
      () => factory.open(launch(id, { allowedOrigins: ['https://evil.example.com'] })),
      new RegExp(`${id}_origin_rejected`),
    )
  }
})

test('plaintext http is refused outside loopback, so a production origin cannot be downgraded', () => {
  for (const id of Object.keys(FACTORIES)) {
    assert.throws(() => build(id, { approvedOrigins: ['http://app.acme.com'] }), new RegExp(`${id}_insecure_origin_rejected`))
  }
})

test('a wildcard, a path, or embedded credentials are refused as origins', () => {
  for (const id of Object.keys(FACTORIES)) {
    for (const bad of ['https://acme.com/*', 'https://acme.com/app', 'https://user:pw@acme.com']) {
      assert.throws(() => build(id, { approvedOrigins: [bad] }), new RegExp(`${id}_invalid_origin`), `${id} accepted ${bad}`)
    }
  }
})

test('missing configuration names the exact key, per vendor', () => {
  assert.throws(() => build('uipath', { configuration: { orchestratorUrl: 'https://orch.example.com', tenantName: 'acme' } }), /uipath_folderPath_required/)
  assert.throws(() => build('sauce-labs', { configuration: { hubEndpoint: 'https://ondemand.example.com' } }), /sauce-labs_dataCentre_required/)
  assert.throws(() => build('automation-anywhere', { configuration: { controlRoomUrl: 'https://cr.example.com' } }), /automation-anywhere_botId_required/)
})

test('a missing broker or transport is refused at construction, not at launch', () => {
  assert.throws(() => build('lambdatest', { credentialBroker: undefined }), /lambdatest_credential_broker_required/)
  assert.throws(() => build('lambdatest', { transport: undefined }), /lambdatest_transport_required/)
  assert.throws(() => build('lambdatest', { approvedOrigins: [] }), /lambdatest_origin_required/)
})

test('a credential the vault cannot resolve stops the launch', async () => {
  const factory = build('browserstack', { credentialBroker: { async resolveCredential() { return '' } } })
  await assert.rejects(() => factory.open(launch('browserstack')), /browserstack_credential_unavailable/)
})

test('THE SECRET NEVER ESCAPES: a transport that throws it back is sanitized', async () => {
  const secret = 'super-secret-vault-value'
  const factory = build('browserstack', {
    credentialBroker: broker(secret),
    transport: { async openSession() { throw new Error(`upstream refused key ${secret}`) } },
  })
  await assert.rejects(
    () => factory.open(launch('browserstack')),
    (error: Error) => {
      assert.ok(!error.message.includes(secret), 'the resolved credential leaked into the error')
      return true
    },
  )
})

test('a transport returning a malformed session is refused rather than passed upward', async () => {
  const factory = build('lambdatest', { transport: { async openSession() { return { page: null } as any } } })
  await assert.rejects(() => factory.open(launch('lambdatest')), /lambdatest_session_invalid/)
})

test('every definition declares its required ports — no more requiredPorts: []', () => {
  for (const definition of DEFINITIONS) {
    const status = describeRemoteAdapter(definition)
    assert.equal(status.status, 'buyer_configuration_required')
    assert.ok(status.requiredConfigurationKeys.length > 0, `${definition.adapterId} declares no configuration keys`)
    assert.deepEqual(status.requiredPorts, ['credentialBroker', 'transport'])
    assert.equal(status.credentialRequired, true)
  }
  assert.equal(browserstackAdapterStatus.adapterId, 'browserstack')
})

test('each adapter declaration matches its catalog id exactly', () => {
  assert.deepEqual(DEFINITIONS.map((d) => d.adapterId).sort(), [
    'automation-anywhere', 'browserstack', 'lambdatest', 'sauce-labs', 'uipath',
  ])
})
