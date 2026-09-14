import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('LOCAL_AI remains the managed fallback and RunPod embedding primary uses separate configuration', () => {
  const endpoint = source('../lib/ai/cos/embeddingEndpoint.ts')
  const wrapper = source('../lib/ai/cos/localEmbeddings.ts')

  assert.match(endpoint, /RUNPOD_PRIMARY_EMBEDDING_BASE_URL/)
  assert.match(endpoint, /RUNPOD_PRIMARY_EMBEDDING_MODEL/)
  assert.match(endpoint, /RUNPOD_PRIMARY_EMBEDDING_API_KEY/)
  assert.match(endpoint, /configuredModel !== expectedModel/)
  assert.match(wrapper, /fallbackEngine\.generateLocalEmbeddings/)
  assert.match(wrapper, /fallbackFromOwned: true/)
  assert.doesNotMatch(wrapper, /process\.env\.RUNPOD_API_KEY/)
})

test('the mature fallback engine is retained as a separate implementation, not re-created in the router', () => {
  const wrapper = source('../lib/ai/cos/localEmbeddings.ts')
  const legacy = source('../lib/ai/cos/localEmbeddingsLegacy.ts')

  assert.match(wrapper, /import \* as fallbackEngine from '\.\/localEmbeddingsLegacy\.ts'/)
  assert.match(legacy, /requestCompatibleEmbeddings/)
  assert.match(legacy, /generateLocalEmbeddings/)
  assert.match(legacy, /validateVector/)
})
