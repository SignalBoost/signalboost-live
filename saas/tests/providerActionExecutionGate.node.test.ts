import assert from 'node:assert/strict'
import test from 'node:test'

import { readFile } from 'node:fs/promises'

const gatePath = new URL('../components/hub/ProviderActionExecutionGate.tsx', import.meta.url)
const modalPath = new URL('../components/hub/ProviderActionModal.tsx', import.meta.url)

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8')
}

test('execution gate uses the fail-closed reviewed capability discovery client', async () => {
  const gate = await source(gatePath)

  assert.match(gate, /import \{ discoverReviewedProviderCapabilities \}/)
  assert.match(gate, /discoverReviewedProviderCapabilities\(templateId, fetch, controller\.signal\)/)
  assert.doesNotMatch(gate, /fetch\('\/api\/hub\/action\/capabilities'/)
  assert.match(gate, /reviewedCapabilities/)
})

test('execution gate fails closed when capabilities are unavailable or empty', async () => {
  const gate = await source(gatePath)

  assert.match(gate, /provider_capabilities_unavailable/)
  assert.match(gate, /No reviewed execution path is available/)
  assert.match(gate, /This action is blocked by default/)
})

test('provider action modal wraps the legacy form in the reviewed execution gate', async () => {
  const modal = await source(modalPath)

  assert.match(modal, /import ProviderActionExecutionGate/)
  assert.match(modal, /<ProviderActionExecutionGate templateId=\{selectedTemplateId\}>/)
  assert.match(modal, /<ProviderActionForm/)
  assert.match(modal, /<\/ProviderActionExecutionGate>/)
})

test('non-direct reviewed paths remain informational and do not launch execution', async () => {
  const gate = await source(gatePath)

  assert.doesNotMatch(gate, /browser-agent\/execute/)
  assert.doesNotMatch(gate, /submitProviderActionClientPlan/)
  assert.match(gate, /This screen will not launch a browser/)
  assert.match(gate, /This screen will not submit a provider mutation/)
})
