import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('seller-managed COS defaults generic model routing to local compute', () => {
  const router = source('../lib/ai/providerRouter.ts')

  assert.match(router, /export function resolveProviderPreference\(/)
  assert.match(router, /if \(explicitPreference\) return explicitPreference/)
  assert.match(router, /return 'local'/)
  assert.match(router, /const preference = resolveProviderPreference\(args\.modelPreference\)/)

  assert.doesNotMatch(router, /args\.modelPreference\s*\?\?[^\n]*'claude'/)
  assert.doesNotMatch(router, /args\.modelPreference\s*\?\?[^\n]*'openai'/)
  assert.doesNotMatch(router, /args\.modelPreference\s*\?\?[^\n]*'gemini'/)
})

test('seller-managed environment preference cannot make a generic COS call hosted-model dependent', () => {
  const router = source('../lib/ai/providerRouter.ts')

  assert.match(router, /AI_MODEL_PROVIDER=\$\{value\} cannot control seller-managed COS; defaulting to local/)
  assert.doesNotMatch(router, /function providerFromEnvironment\(\)[\s\S]*?return value === 'local' \|\| value === 'claude' \|\| value === 'gemini'/)
  assert.doesNotMatch(router, /LOCAL_AI_CLOUD_FALLBACK_PROVIDER[\s\S]*?return callExternalChain/)
})

test('Backup COS continuity defaults to local/private compute, never OpenAI', () => {
  const backup = source('../lib/cos-backup/runtime.ts')
  const localPreferences = backup.match(/modelPreference:\s*'local'/g) || []

  assert.equal(localPreferences.length, 2)
  assert.doesNotMatch(backup, /modelPreference:\s*'openai'/)
  assert.doesNotMatch(backup, /modelPreference:\s*'claude'/)
  assert.doesNotMatch(backup, /modelPreference:\s*'gemini'/)
})
