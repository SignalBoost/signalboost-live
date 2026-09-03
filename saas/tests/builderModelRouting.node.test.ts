import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  configuredBuilderCodingModel,
  DEFAULT_BUILDER_CODING_MODEL,
} from '../lib/builder/model-routing.ts'

const saasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative: string) => readFileSync(resolve(saasRoot, relative), 'utf8')

test('Builder coding model defaults to DeepSeek V4 Flash and supports a server-owned override', () => {
  assert.equal(DEFAULT_BUILDER_CODING_MODEL, 'deepseek-ai/DeepSeek-V4-Flash-0731')
  assert.equal(configuredBuilderCodingModel(undefined), DEFAULT_BUILDER_CODING_MODEL)
  assert.equal(configuredBuilderCodingModel('   '), DEFAULT_BUILDER_CODING_MODEL)
  assert.equal(configuredBuilderCodingModel(' test/coding-candidate '), 'test/coding-candidate')
})

test('Builder port uses the existing local-inference transport with the coding model override', () => {
  const source = read('lib/cos/aiPort.ts')
  assert.match(source, /export function createBuilderAiPort\(\): CosAiPort/)
  assert.match(source, /const model = configuredBuilderCodingModel\(\)/)
  assert.match(source, /await callLocalModel\(input, \{ \.\.\.baseConfig, model \}\)/)
  assert.match(source, /localInferenceConfigFromEnv\(\)/)
  assert.doesNotMatch(source, /createBuilderAiPort[\s\S]{0,1200}callCosText\(/)
})

test('ordinary Builder jobs use the coding-specialist port rather than the general COS port', () => {
  const source = read('lib/builder/job-runner.ts')
  assert.match(source, /import \{ createBuilderAiPort \} from '\.\.\/cos\/aiPort\.ts'/)
  assert.match(source, /createGovernedBuilderAiPort\(createBuilderAiPort\(\)/)
  assert.doesNotMatch(source, /createPlatformAiPort/)
})

test('COS Platform Engineer repository repairs use the same coding-specialist port', () => {
  const source = read('lib/builder/repository-repair.ts')
  assert.match(source, /import \{ createBuilderAiPort \} from '\.\.\/cos\/aiPort\.ts'/)
  assert.match(source, /createGovernedBuilderAiPort\(createBuilderAiPort\(\)/)
  assert.doesNotMatch(source, /createPlatformAiPort/)
})

test('deployment example keeps general COS and Builder model selectors separate', () => {
  const env = read('.env.example')
  assert.match(env, /(?:^|\n)LOCAL_AI_MODEL=/)
  assert.match(env, /(?:^|\n)BUILDER_AI_MODEL=deepseek-ai\/DeepSeek-V4-Flash-0731(?:\n|$)/)
  assert.doesNotMatch(env, /BUILDER_AI_(?:API_KEY|BASE_URL)=/)
})
