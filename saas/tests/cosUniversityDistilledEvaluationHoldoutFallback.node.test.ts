import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/cos-university-distilled-evaluation/route.ts', import.meta.url), 'utf8')
const helper = readFileSync(new URL('../lib/ai/cos/hfPinnedParquetRows.ts', import.meta.url), 'utf8')
const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('distilled evaluation replaces private Dataset Viewer 5xx with exact pinned Hub parquet rows', () => {
  assert.match(route, /HF_ROWS_ORIGIN = 'https:\/\/datasets-server\.huggingface\.co'/)
  assert.match(route, /metadataRepoId/)
  assert.match(route, /metadata\?\.sha/)
  assert.match(route, /readPinnedHfParquetRows/)
  assert.match(route, /response\.ok \|\| response\.status < 500/)
  assert.doesNotMatch(route, /new URL\(['"]\/first-rows/)
})

test('direct Hub parquet reader is exact-revision, split-scoped, and resource bounded while streaming', () => {
  assert.match(helper, /resolve\/\$\{revision\}/)
  assert.match(helper, /MAX_PARQUET_FILES = 8/)
  assert.match(helper, /MAX_PARQUET_FILE_BYTES = 8 \* 1024 \* 1024/)
  assert.match(helper, /MAX_ROWS = 100/)
  assert.match(helper, /splitParquetMatcher/)
  assert.match(helper, /response\.body\.getReader\(\)/)
  assert.match(helper, /total > maxBytes/)
  assert.match(helper, /reader\.cancel\('distilled_evaluation_hf_pinned_parquet_size_ceiling'\)/)
  assert.match(helper, /parquetReadObjects\(\{ file \}\)/)
  assert.equal(pkg.dependencies.hyparquet, '1.26.0')
})

test('evaluation transport guards are invocation-scoped and restore host fetch after keepalive cleanup', () => {
  assert.match(route, /const originalFetch = globalThis\.fetch/)
  assert.match(route, /globalThis\.fetch = patchedFetch/)
  assert.match(route, /finally \{\s*for \(const timer of keepalives\.values\(\)\) clearInterval\(timer\)\s*globalThis\.fetch = originalFetch\s*\}/)
  assert.match(route, /runWithEvaluationTransportGuards\(\{\s*routeDeadlineMs,\s*runner: \(\) => runUniversityDistilledArtifactEvaluation\(new Date\(\)\),?\s*\}\)/)
})

test('transport fallback does not weaken pinned holdout integrity gates', () => {
  assert.match(evaluator, /distilled_evaluation_holdout_revision_moved/)
  assert.match(evaluator, /payload\.rows\.length !== input\.expectedHashes\.length/)
  assert.match(evaluator, /sha256Raw\(text\) !== itemHash/)
  assert.match(evaluator, /distilled_evaluation_holdout_identity_mismatch/)
  assert.match(evaluator, /manifestHash\(observed\) !== input\.expectedManifestHash/)
})
