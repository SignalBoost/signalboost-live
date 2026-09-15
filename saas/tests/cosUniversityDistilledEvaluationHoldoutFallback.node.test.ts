import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')

test('distilled evaluation falls back only from Hugging Face rows provider 5xx to first-rows', () => {
  assert.match(route, /HF_ROWS_ORIGIN = 'https:\/\/datasets-server\.huggingface\.co'/)
  assert.match(route, /response\.ok \|\| response\.status < 500/)
  assert.match(route, /rowsUrl\.pathname !== '\/rows'/)
  assert.match(route, /new URL\('\/first-rows', HF_ROWS_ORIGIN\)/)
  assert.match(route, /\['dataset', 'config', 'split'\]/)
})

test('fetch fallback is invocation-scoped and restored even when evaluation throws', () => {
  assert.match(route, /const originalFetch = globalThis\.fetch/)
  assert.match(route, /globalThis\.fetch = patchedFetch/)
  assert.match(route, /finally \{\s*globalThis\.fetch = originalFetch\s*\}/)
  assert.match(route, /runWithHfRowsFallback\(\s*\(\) => runUniversityDistilledArtifactEvaluation\(new Date\(\)\)/)
})

test('transport fallback does not weaken pinned holdout integrity gates', () => {
  assert.match(evaluator, /distilled_evaluation_holdout_revision_moved/)
  assert.match(evaluator, /payload\.rows\.length !== input\.expectedHashes\.length/)
  assert.match(evaluator, /sha256Raw\(text\) !== itemHash/)
  assert.match(evaluator, /distilled_evaluation_holdout_identity_mismatch/)
  assert.match(evaluator, /manifestHash\(observed\) !== input\.expectedManifestHash/)
})
