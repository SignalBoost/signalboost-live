import assert from 'node:assert/strict'
import test from 'node:test'
import type { HostContext } from '../lib/supervisor/portable/host-context.ts'
import { PERFORMANCE_INCIDENT_RECIPE } from '../lib/ai/cos/incidentRecipeRouter.ts'

test('host recipe memory persists recipes through async buyer-owned port', async () => {
  const stored = new Map<string, any>()
  const host: HostContext = {
    secrets: { async getSecret() { return undefined } },
    notifications: { notify() {} },
    approvers: { approversFor() { return [] } },
    branding: { productName: 'Buyer Supervisor' },
    recipeMemory: {
      async get(key) { return stored.get(key) },
      async set(key, recipe) { stored.set(key, recipe) },
    },
  }

  await host.recipeMemory?.set('tenant:prod:vercel:performance', PERFORMANCE_INCIDENT_RECIPE)
  const recipe = await host.recipeMemory?.get('tenant:prod:vercel:performance')
  assert.equal(recipe?.id, 'self-healing.performance.v1')
})
