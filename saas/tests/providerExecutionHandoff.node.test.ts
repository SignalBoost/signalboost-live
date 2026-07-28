import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const gatePath = new URL('../components/hub/ProviderActionExecutionGate.tsx', import.meta.url)

async function source(): Promise<string> {
  return readFile(gatePath, 'utf8').then(hydrateLocalizedSource)
}

test('execution gate exports a bounded reviewed handoff contract', async () => {
  const text = await source()
  assert.match(text, /export type ProviderExecutionHandoff/)
  assert.match(text, /selectedMode: ProviderExecutionMode/)
  assert.match(text, /selectedCapability: ReviewedProviderCapability/)
  assert.match(text, /availableCapabilities: readonly ReviewedProviderCapability\[\]/)
  assert.match(text, /review: ProviderCapabilityResponse\['review'\]/)
})

test('handoff is created only from normalized reviewed capabilities', async () => {
  const text = await source()
  assert.match(text, /response\?\.reviewedCapabilities/)
  assert.match(text, /const selected = available\.find/)
  assert.match(text, /Object\.freeze\(\{[\s\S]*selectedCapability: selected/)
  assert.match(text, /availableCapabilities: Object\.freeze\(\[\.\.\.available\]\)/)
  assert.match(text, /templateId: String\(templateId \|\| ''\)\.trim\(\)/)
})

test('legacy behavior remains fail closed when no reviewed renderer is supplied', async () => {
  const text = await source()
  assert.match(text, /renderReviewedMode\?:/)
  assert.match(text, /reviewedContent !== undefined/)
  assert.match(text, /selected\.mode === 'direct'/)
  assert.match(text, /is reviewed but not enabled in this legacy form/)
  assert.match(text, /This screen will not launch a browser/)
})
