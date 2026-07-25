import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const boundaryPath = new URL('../components/hub/GovernedProviderActionFetchBoundary.tsx', import.meta.url)
const gatePath = new URL('../components/hub/ProviderActionExecutionGate.tsx', import.meta.url)

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8')
}

test('legacy provider action requests are rebuilt through the governed client planner', async () => {
  const text = await source(boundaryPath)
  assert.match(text, /buildProviderActionClientPlan/)
  assert.match(text, /mode: handoff\.selectedMode/)
  assert.match(text, /capabilities,/)
  assert.match(text, /body: JSON\.stringify\(plan\.body\)/)
})

test('governed boundary fails closed for request, template, payload, and endpoint drift', async () => {
  const text = await source(boundaryPath)
  assert.match(text, /provider_action_request_invalid/)
  assert.match(text, /provider_action_template_mismatch/)
  assert.match(text, /provider_payload_required/)
  assert.match(text, /provider_action_endpoint_mismatch/)
})

test('reviewed capability snapshot is reconstructed immutably from the gate handoff', async () => {
  const text = await source(boundaryPath)
  assert.match(text, /Object\.freeze\(handoff\.availableCapabilities\.map/)
  assert.match(text, /reviewedCapabilities: handoff\.availableCapabilities/)
  assert.match(text, /review: handoff\.review \|\| null/)
})

test('execution gate wraps only reviewed Direct API legacy content in the governed boundary', async () => {
  const text = await source(gatePath)
  assert.match(text, /import GovernedProviderActionFetchBoundary/)
  assert.match(text, /selected\.mode === 'direct'/)
  assert.match(text, /<GovernedProviderActionFetchBoundary handoff=\{handoff\}>/)
  assert.match(text, /This screen will not launch a browser/)
  assert.match(text, /This screen will not submit a provider mutation/)
})

test('fetch interception is scoped and restored when the form unmounts', async () => {
  const text = await source(boundaryPath)
  assert.match(text, /if \(method !== 'POST' \|\| !LEGACY_ACTION_ENDPOINTS\.has\(path\)\)/)
  assert.match(text, /return originalFetch\(input, init\)/)
  assert.match(text, /window\.fetch = originalFetch/)
})
