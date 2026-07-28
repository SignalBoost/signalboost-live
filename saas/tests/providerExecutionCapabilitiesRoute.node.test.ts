import assert from 'node:assert/strict'
import test from 'node:test'

import { readFile } from 'node:fs/promises'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const routePath = new URL('../app/api/hub/action/capabilities/route.ts', import.meta.url)

async function routeSource(): Promise<string> {
  return readFile(routePath, 'utf8').then(hydrateLocalizedSource)
}

test('provider capability route is authenticated and validates the template', async () => {
  const source = await routeSource()

  assert.match(source, /getCurrentUser/)
  assert.match(source, /Unauthorized/)
  assert.match(source, /template_id_required/)
  assert.match(source, /provider_template_not_found/)
})

test('provider capability route exposes reviewed modes without executing them', async () => {
  const source = await routeSource()

  assert.match(source, /getProviderExecutionPolicy/)
  assert.match(source, /getReviewedProviderExecutionCapability/)
  assert.match(source, /preferredMode/)
  assert.match(source, /capabilities/)
  assert.match(source, /cosaPrStagesProposalOnly: true/)
  assert.match(source, /browserAgentCreatesDryRunOnly: true/)
  assert.match(source, /directConfigurationHasNoProviderEndpoint: true/)
})

test('provider capability route returns review provenance when registered', async () => {
  const source = await routeSource()

  assert.match(source, /reviewer: reviewed\.reviewer/)
  assert.match(source, /reviewedAt: reviewed\.reviewedAt/)
})
