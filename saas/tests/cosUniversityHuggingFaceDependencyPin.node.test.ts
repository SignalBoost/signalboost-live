import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, '../lib/ai/cos/cosUniversityHuggingFaceJobs.ts'), 'utf8')

test('Hugging Face Jobs use one exact known-good hub client across all paid stages', () => {
  assert.match(source, /HUGGING_FACE_HUB_KNOWN_GOOD = 'huggingface_hub==1\.31\.0'/)
  assert.equal((source.match(/HUGGING_FACE_HUB_KNOWN_GOOD/g) || []).length, 4)
  assert.doesNotMatch(source, /huggingface_hub>=/)
})
