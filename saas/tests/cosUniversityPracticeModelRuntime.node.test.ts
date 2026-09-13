// saas/tests/cosUniversityPracticeModelRuntime.node.test.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY,
  UNIVERSITY_PRACTICE_MODEL_INVALID,
  resolveUniversityPracticeModel,
} from '../lib/ai/cos/cosUniversityPracticeModelRuntime.ts'
import { UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED } from '../lib/ai/cos/cosUniversityAgentModelPolicy.ts'

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

async function withPracticeEnv(fn: () => Promise<void>) {
  const beforeBase = process.env.LOCAL_AI_BASE_URL
  const beforeProvider = process.env.LOCAL_AI_MANAGED_PROVIDER
  const beforePractice = process.env.UNIVERSITY_PRACTICE_MODEL
  try {
    await fn()
  } finally {
    restore('LOCAL_AI_BASE_URL', beforeBase)
    restore('LOCAL_AI_MANAGED_PROVIDER', beforeProvider)
    restore('UNIVERSITY_PRACTICE_MODEL', beforePractice)
  }
}

test('explicit environment practice model remains authoritative', async () => withPracticeEnv(async () => {
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  process.env.UNIVERSITY_PRACTICE_MODEL = 'operator/explicit-model'
  let reads = 0
  const model = await resolveUniversityPracticeModel({ readSetting: async () => { reads += 1; return 'db/model' } })
  assert.equal(model, 'operator/explicit-model')
  assert.equal(reads, 0)
}))

test('DeepInfra may use the service-only buyer-controlled runtime setting when env is absent', async () => withPracticeEnv(async () => {
  process.env.LOCAL_AI_BASE_URL = 'https://api.deepinfra.com/v1/openai'
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  const model = await resolveUniversityPracticeModel({ readSetting: async () => 'deepseek-ai/DeepSeek-V4-Flash-0731' })
  assert.equal(model, 'deepseek-ai/DeepSeek-V4-Flash-0731')
}))

test('DeepInfra still fails closed when neither explicit configuration source has a model', async () => withPracticeEnv(async () => {
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  await assert.rejects(
    resolveUniversityPracticeModel({ readSetting: async () => null }),
    new RegExp(UNIVERSITY_PRACTICE_MODEL_NOT_CONFIGURED),
  )
}))

test('malformed buyer-controlled model identifiers fail closed', async () => withPracticeEnv(async () => {
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'deepinfra'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  await assert.rejects(
    resolveUniversityPracticeModel({ readSetting: async () => 'bad model with spaces' }),
    new RegExp(UNIVERSITY_PRACTICE_MODEL_INVALID),
  )
}))

test('self-hosted runtime without an explicit practice override keeps existing primary routing', async () => withPracticeEnv(async () => {
  process.env.LOCAL_AI_BASE_URL = 'http://127.0.0.1:11434/v1'
  process.env.LOCAL_AI_MANAGED_PROVIDER = 'local'
  delete process.env.UNIVERSITY_PRACTICE_MODEL
  let reads = 0
  const model = await resolveUniversityPracticeModel({ readSetting: async () => { reads += 1; return 'should-not-be-read' } })
  assert.equal(model, null)
  assert.equal(reads, 0)
}))

test('both COS and specialist practice execution are wired to the shared resolver', () => {
  const root = path.resolve(import.meta.dirname, '..')
  const cosExecution = fs.readFileSync(path.join(root, 'lib/ai/cos/cosUniversityPracticeExecution.ts'), 'utf8')
  const agentRuntime = fs.readFileSync(path.join(root, 'lib/ai/cos/cosUniversityAgentExamRuntime.ts'), 'utf8')
  assert.match(cosExecution, /await resolveUniversityPracticeModel\(\)/)
  assert.match(agentRuntime, /request\.purpose === 'practice' \? await resolveUniversityPracticeModel\(\) : null/)
  assert.equal(COS_UNIVERSITY_PRACTICE_MODEL_SETTING_KEY, 'cos_university_practice_model')
})
