import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routePath = new URL('../app/api/internal/supervisor/protocol-capabilities/route.ts', import.meta.url)

async function routeSource(): Promise<string> {
  return readFile(routePath, 'utf8')
}

test('protocol capability diagnostics route requires admin access', async () => {
  const source = await routeSource()
  assert.match(source, /requireAdmin/)
  assert.match(source, /auth instanceof NextResponse/)
})

test('route registers every shipped protocol and returns the read-only snapshot', async () => {
  const source = await routeSource()
  for (const factory of [
    'createMcpAdapter',
    'createA2aAdapter',
    'createMavlinkAdapter',
    'createRos2Adapter',
    'createOpcUaAdapter',
    'createMqttAdapter',
  ]) {
    assert.match(source, new RegExp(factory))
  }
  assert.match(source, /capabilityCatalog\(\)/)
  assert.match(source, /createProtocolCapabilityDiagnostics/)
  assert.match(source, /Cache-Control': 'no-store'/)
})

test('route contains no protocol execution or mutation controls', async () => {
  const source = await routeSource()
  assert.doesNotMatch(source, /\.normalize\(/)
  assert.doesNotMatch(source, /\.denormalize\(/)
  assert.doesNotMatch(source, /execution\.perform/)
  assert.doesNotMatch(source, /requestApproval/)
})
