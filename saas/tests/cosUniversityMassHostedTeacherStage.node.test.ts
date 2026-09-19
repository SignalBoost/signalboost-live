import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  massHostedTeacherStageConfig,
  runMassHostedTeacherStage,
} from '../lib/ai/cos/cosUniversityMassHostedTeacherStage.ts'

function memoryDb() {
  const rows: any[] = []
  return {
    rows,
    from(table: string) {
      assert.equal(table, 'cos_university_mass_hosted_teacher_rows')
      return {
        select() {
          const filters: Record<string, unknown> = {}
          const chain: any = {
            eq(key: string, value: unknown) { filters[key] = value; return chain },
            order() {
              return Promise.resolve({
                data: rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value)),
                error: null,
              })
            },
          }
          return chain
        },
        upsert(row: any) {
          const index = rows.findIndex(item => item.run_id === row.run_id && item.prompt_id === row.prompt_id)
          if (index >= 0) rows[index] = row
          else rows.push(row)
          return {
            select() {
              return {
                single() { return Promise.resolve({ data: row, error: null }) },
              }
            },
          }
        },
      }
    },
  }
}

const env = {
  OPENAI_API_KEY: 'sk_123456789012345678901234567890',
  ANTHROPIC_API_KEY: 'sk-ant-123456789012345678901234567890',
  XAI_API_KEY: 'xai_123456789012345678901234567890',
  COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_OPENAI_MODEL: 'gpt-5.6-luna',
  COS_UNIVERSITY_TEACHER_ANTHROPIC_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_CLAUDE_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL: 'claude-sonnet-4-6',
  COS_UNIVERSITY_TEACHER_XAI_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_GROK_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_XAI_MODEL: 'grok-4.6',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED: 'true',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_CALLS: '20',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_OUTPUT_TOKENS: '384',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_PARALLELISM: '8',
}

test('mass hosted teacher stage is hard-bounded to the existing teacher ceiling envelope', () => {
  const config = massHostedTeacherStageConfig(env)
  assert.equal(config.enabled, true)
  assert.equal(config.maxCalls, 20)
  assert.equal(config.maxOutputTokens, 384)
  assert.equal(config.parallelism, 8)
  assert.equal(config.minimumRows, 20)
})

test('twenty prompts fan out across OpenAI, Claude and Grok and persist exact rows', async () => {
  const db = memoryDb()
  const prompts = Array.from({ length: 20 }, (_, index) => ({
    id: String(index + 1).padStart(64, 'a').slice(-64),
    prompt: `Teaching prompt ${index + 1}`,
  }))
  let calls = 0
  const result = await runMassHostedTeacherStage({
    db,
    run: {
      id: '11111111-1111-4111-8111-111111111111',
      candidate_id: 'mass:22222222-2222-4222-8222-222222222222:aaaaaaaaaaaaaaaa',
      batch_key: 'b'.repeat(64),
    },
    prompts,
    promptSetHash: 'c'.repeat(64),
    env,
    fetchImpl: async (input, init) => {
      calls += 1
      const url = String(input)
      const body = JSON.parse(String(init?.body || '{}'))
      const model = String(body.model)
      const text = `answer-${calls}-${model}`
      if (url.includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'request-id': `anthropic-${calls}` } })
      }
      if (url.includes('api.openai.com/v1/responses')) {
        return new Response(JSON.stringify({
          id: `resp-${calls}`,
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text }],
          }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'x-request-id': `openai-${calls}` } })
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: text } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { 'x-request-id': `compatible-${calls}` } })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.completed, true)
  assert.equal(result.rows, 20)
  assert.equal(calls, 20)
  assert.equal(db.rows.length, 20)
  assert.deepEqual(result.activeProviders, ['openai', 'claude', 'grok'])
  assert.ok((result.providerMix.openai || 0) > 0)
  assert.ok((result.providerMix.claude || 0) > 0)
  assert.ok((result.providerMix.grok || 0) > 0)
  assert.match(String(result.datasetHash), /^[a-f0-9]{64}$/)
  assert.ok(db.rows.every(row => /^[a-f0-9]{64}$/.test(row.response_hash)))
  assert.ok(db.rows.every(row => row.authority_expanded === false && row.silent_fallback_allowed === false))
})

test('consumer bypasses the single HF teacher job only after hosted teacher completion', () => {
  const consumer = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  const worker = fs.readFileSync(path.join(import.meta.dirname, '../scripts/cos-university-hf-worker-base.py'), 'utf8')
  const migration = fs.readFileSync(path.join(import.meta.dirname, '../supabase/migrations/20260919021500_cos_university_mass_hosted_teacher_rows.sql'), 'utf8')

  assert.match(consumer, /runMassHostedTeacherStage/)
  assert.match(consumer, /mass_distillation_hosted_teacher_dataset_registered/)
  assert.match(consumer, /mass_distillation_hosted_teacher_zero_row_fallback/)
  assert.match(consumer, /all_hosted_teacher_calls_failed_before_any_teacher_row/)
  assert.match(consumer, /explicitFallbackPath: 'existing_huggingface_teacher_stage'/)
  assert.match(consumer, /teacher_model_id: 'multi-provider-hosted'/)
  assert.match(consumer, /stage: 'preparation_pending'/)
  assert.match(consumer, /teacherRows: hostedRows/)
  assert.match(worker, /worker_embedded_teacher_rows_invalid/)
  assert.match(worker, /worker_embedded_teacher_row_hash_mismatch/)
  assert.match(migration, /cos_university_mass_hosted_teacher_rows/)
  assert.match(migration, /unique \(run_id, prompt_id\)/)
})

test('production config activates the bounded parallel teacher stage without embedding credentials', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../vercel.json'), 'utf8'))
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED, 'true')
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_CALLS, '20')
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_OUTPUT_TOKENS, '384')
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PARALLELISM, '8')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_OPENAI_MODEL, 'gpt-5.6-luna')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL, 'claude-sonnet-4-6')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_XAI_MODEL, 'grok-4.6')
  const serialized = JSON.stringify(vercel)
  assert.doesNotMatch(serialized, /OPENAI_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY/)
})


test('no hosted credentials produces an explicit skip so the existing HF teacher lane may continue', async () => {
  const db = memoryDb()
  const result = await runMassHostedTeacherStage({
    db,
    run: {
      id: '33333333-3333-4333-8333-333333333333',
      candidate_id: 'mass:44444444-4444-4444-8444-444444444444:bbbbbbbbbbbbbbbb',
      batch_key: 'd'.repeat(64),
    },
    prompts: Array.from({ length: 20 }, (_, index) => ({
      id: (index.toString(16).padStart(64, '0')).slice(-64),
      prompt: `Prompt ${index}`,
    })),
    promptSetHash: 'e'.repeat(64),
    env: {
      COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED: 'true',
      COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
      COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY: 'true',
      COS_UNIVERSITY_TEACHER_OPENAI_MODEL: 'gpt-5.6-luna',
    },
  })
  assert.equal(result.skipped, true)
  assert.equal(result.reason, 'no_active_hosted_teacher_provider')
  assert.equal(result.completed, false)
  assert.equal(result.rows, 0)
})

test('mass teacher lane uses provider-declared eligibility rather than a hard-coded vendor ID list', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassHostedTeacherStage.ts'), 'utf8')
  assert.doesNotMatch(source, /MASS_HOSTED_TEACHER_IDS/)
  assert.match(source, /item\.massDistillationEligible === true/)
  assert.match(source, /'openai_responses'/)
  assert.match(source, /'openai_compatible'/)
  assert.match(source, /'anthropic_messages'/)
})


test('zero hosted rows are an explicit governed HF fallback, while partial hosted success still fails closed', () => {
  const consumer = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  assert.match(consumer, /hosted\.rows === 0 && !hosted\.completed/)
  assert.match(consumer, /successfulHostedRows: 0/)
  assert.match(consumer, /silentFallbackAllowed: false/)
  assert.match(consumer, /else if \(!hosted\.completed \|\| !hosted\.datasetHash \|\| hosted\.outputHashes\.length < 20\)/)
  assert.match(consumer, /mass_distillation_hosted_teacher_incomplete/)
})


test('provider assignment remains stable across partial retries and failure telemetry names the attempted teacher', async () => {
  const db = memoryDb()
  const prompts = Array.from({ length: 20 }, (_, index) => ({
    id: (index + 1).toString(16).padStart(64, '0'),
    prompt: `Stable prompt ${index + 1}`,
  }))
  const retryEnv = {
    ...env,
    XAI_API_KEY: undefined,
    COS_UNIVERSITY_TEACHER_XAI_ENABLED: 'false',
  }
  let claudeAvailable = false

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || '{}'))
    const model = String(body.model)
    if (url.includes('anthropic.com')) {
      if (!claudeAvailable) {
        return new Response(JSON.stringify({
          type: 'error',
          error: { type: 'credit_error', message: 'temporarily unavailable' },
        }), { status: 400 })
      }
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: `claude-${model}` }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }), { status: 200, headers: { 'request-id': 'anthropic-retry' } })
    }
    return new Response(JSON.stringify({
      id: 'resp-openai',
      output: [{
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: `openai-${model}` }],
      }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200, headers: { 'x-request-id': 'openai-retry' } })
  }

  const run = {
    id: '55555555-5555-4555-8555-555555555555',
    candidate_id: 'mass:66666666-6666-4666-8666-666666666666:cccccccccccccccc',
    batch_key: 'f'.repeat(64),
  }

  const first = await runMassHostedTeacherStage({
    db, run, prompts, promptSetHash: '1'.repeat(64), env: retryEnv, fetchImpl,
  })
  assert.equal(first.rows, 10)
  assert.equal(first.completed, false)
  assert.deepEqual(first.activeProviders, ['openai', 'claude'])
  assert.equal(first.providerMix.openai, 10)
  assert.equal(first.providerMix.claude, undefined)
  assert.ok(first.failures.every(item => item.teacherId === 'claude'))

  claudeAvailable = true
  const second = await runMassHostedTeacherStage({
    db, run, prompts, promptSetHash: '1'.repeat(64), env: retryEnv, fetchImpl,
  })
  assert.equal(second.rows, 20)
  assert.equal(second.completed, true)
  assert.equal(second.providerMix.openai, 10)
  assert.equal(second.providerMix.claude, 10)
  assert.equal(second.failures.length, 0)

  for (let index = 0; index < prompts.length; index += 1) {
    const stored = db.rows.find(row => row.prompt_id === prompts[index].id)
    assert.equal(stored.teacher_id, index % 2 === 0 ? 'openai' : 'claude')
  }
})
