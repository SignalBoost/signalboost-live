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
  const assets: any[] = []
  const assetSets: any[] = []
  return {
    rows,
    assets,
    assetSets,
    from(table: string) {
      if (table === 'cos_university_distillation_assets') {
        return {
          async upsert(batch: any[]) {
            for (const row of batch) {
              if (!assets.some(item => item.asset_key === row.asset_key)) assets.push(row)
            }
            return { error: null }
          },
        }
      }
      if (table === 'cos_university_distillation_asset_sets') {
        return {
          async upsert(row: any) {
            if (!assetSets.some(item => item.asset_set_key === row.asset_set_key)) assetSets.push(row)
            return { error: null }
          },
        }
      }
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
  DEEPSEEK_API_KEY: 'dsk_123456789012345678901234567890',
  GEMINI_API_KEY: 'gai_123456789012345678901234567890',
  COS_UNIVERSITY_TEACHER_OPENAI_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_OPENAI_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_OPENAI_MODEL: 'gpt-5.6-luna',
  COS_UNIVERSITY_TEACHER_ANTHROPIC_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_CLAUDE_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL: 'claude-sonnet-4-6',
  COS_UNIVERSITY_TEACHER_XAI_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_GROK_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_XAI_MODEL: 'grok-4.6',
  COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_DEEPSEEK_API_MODEL: 'deepseek-flash',
  COS_UNIVERSITY_TEACHER_GEMINI_ENABLED: 'true',
  COS_UNIVERSITY_TEACHER_GEMINI_ADAPTER_READY: 'true',
  COS_UNIVERSITY_TEACHER_GEMINI_MODEL: 'gemini-3.8-flash',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED: 'true',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_CALLS: '20',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_OUTPUT_TOKENS: '384',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_PARALLELISM: '8',
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_PROVIDER_COST_USD_JSON: JSON.stringify({
    openai: 0.002,
    claude: 0.008,
    grok: 0.004,
    'deepseek-api': 0.001,
    gemini: 0.0017,
  }),
  COS_UNIVERSITY_MASS_HOSTED_TEACHER_PROVIDER_MAX_OUTPUT_TOKENS_JSON: JSON.stringify({ claude: 512 }),
}

test('mass hosted teacher stage is hard-bounded to the existing teacher ceiling envelope', () => {
  const config = massHostedTeacherStageConfig(env)
  assert.equal(config.enabled, true)
  assert.equal(config.maxCalls, 20)
  assert.equal(config.maxOutputTokens, 384)
  assert.equal(config.parallelism, 8)
  assert.equal(config.minimumRows, 20)
  assert.equal(config.providerEstimatedUnitCostUsd.claude, 0.008)
  assert.equal(config.providerEstimatedUnitCostUsd['deepseek-api'], 0.001)
  assert.equal(config.providerMaxOutputTokens.claude, 512)
})

test('twenty prompts fan out across all active hosted teachers and persist exact rows', async () => {
  const db = memoryDb()
  const prompts = Array.from({ length: 20 }, (_, index) => ({
    id: String(index + 1).padStart(64, 'a').slice(-64),
    prompt: `Teaching prompt ${index + 1}`,
  }))
  let calls = 0
  let anthropicMaxTokens: number | null = null
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
        anthropicMaxTokens = Number(body.max_tokens)
        return new Response(JSON.stringify({
          content: [{ type: 'text', text }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'request-id': `anthropic-${calls}` } })
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }), { status: 200, headers: { 'x-goog-request-id': `gemini-${calls}` } })
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
  assert.equal(db.assets.length, 20)
  assert.equal(db.assetSets.length, 1)
  assert.match(String(result.assetSetKey), /^[a-f0-9]{64}$/)
  assert.match(String(result.portableManifestHash), /^[a-f0-9]{64}$/)
  assert.deepEqual(result.activeProviders, ['openai', 'claude', 'grok', 'deepseek-api', 'gemini'])
  assert.deepEqual(result.plannedProviderMix, {
    openai: 4,
    claude: 1,
    grok: 2,
    'deepseek-api': 8,
    gemini: 5,
  })
  assert.deepEqual(result.providerMix, result.plannedProviderMix)
  assert.equal(result.plannedEstimatedCostUsd, 0.0405)
  assert.equal(anthropicMaxTokens, 512)
  assert.equal(result.routingMode, 'dynamic-pipeline-router-v1-cost-balanced')
  assert.equal(Object.values(result.providerMix).reduce((sum, value) => sum + value, 0), 20)
  assert.ok(Object.keys(result.providerMix).every(id => result.activeProviders.includes(id)))
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

test('hosted teacher preparation restores prompt-response structure without changing governed hashes', () => {
  const consumer = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  const base = fs.readFileSync(path.join(import.meta.dirname, '../scripts/cos-university-hf-worker-base.py'), 'utf8')
  const worker = fs.readFileSync(path.join(import.meta.dirname, '../scripts/cos-university-hf-worker.py'), 'utf8')

  assert.match(consumer, /const promptSet = await buildTeacherPrompts\(run\.subject_id, sourceHashes\)/)
  assert.match(consumer, /mass_distillation_hosted_prompt_set_mismatch/)
  assert.match(consumer, /promptById/)
  assert.match(consumer, /text: response/)
  assert.match(consumer, /role: 'user'/)
  assert.match(consumer, /role: 'assistant'/)

  assert.match(base, /"text": text/)
  assert.match(base, /"item_hash": digest/)
  assert.match(base, /"prompt": prompt/)
  assert.match(base, /"response": response/)
  assert.match(base, /ordered = sorted\(by_hash\.items\(\), key=lambda item: item\[0\]\)/)

  assert.match(worker, /TRAINING_INPUT_PROFILE = "student_chat_template_v1"/)
  assert.match(worker, /tokenizer\.apply_chat_template/)
  assert.match(worker, /add_generation_prompt=False/)
  assert.match(worker, /enable_thinking=False/)
  assert.match(worker, /dataset_text_field="training_text"/)
  assert.match(worker, /train_dataset=training_for_trainer/)
  assert.match(worker, /"structuredItems"/)
  assert.match(worker, /"fallbackItems"/)
  assert.doesNotMatch(worker, /safety-attribution-discriminating|safety-spend-deadline|transfer-simpson/)
})
test('production config activates the bounded parallel teacher stage without embedding credentials', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../vercel.json'), 'utf8'))
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_ENABLED, 'true')
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_CALLS, '20')
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_MAX_OUTPUT_TOKENS, '384')
  assert.equal(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PARALLELISM, '8')
  assert.deepEqual(JSON.parse(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PROVIDER_COST_USD_JSON), {
    openai: 0.002,
    claude: 0.008,
    grok: 0.004,
    'deepseek-api': 0.001,
    gemini: 0.0017,
  })
  assert.deepEqual(JSON.parse(vercel.env.COS_UNIVERSITY_MASS_HOSTED_TEACHER_PROVIDER_MAX_OUTPUT_TOKENS_JSON), { claude: 512 })
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_OPENAI_MODEL, 'gpt-5.6-luna')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_ANTHROPIC_MODEL, 'claude-sonnet-4-6')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_XAI_MODEL, 'grok-4.6')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_DEEPSEEK_API_MODEL, 'deepseek-flash')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_GEMINI_MODEL, 'gemini-3.8-flash')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENABLED, 'true')
  assert.equal(vercel.env.COS_UNIVERSITY_TEACHER_GEMINI_ENABLED, 'true')
  const serialized = JSON.stringify(vercel)
  assert.doesNotMatch(serialized, /OPENAI_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY|DEEPSEEK_API_KEY|GEMINI_API_KEY/)
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
  assert.match(source, /'gemini_generate_content'/)
})


test('zero hosted rows are an explicit governed HF fallback, while partial hosted success still fails closed', () => {
  const consumer = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  assert.match(consumer, /hosted\.rows === 0 && !hosted\.completed/)
  assert.match(consumer, /successfulHostedRows: 0/)
  assert.match(consumer, /silentFallbackAllowed: false/)
  assert.match(consumer, /else if \(!hosted\.completed \|\| !hosted\.datasetHash \|\| hosted\.outputHashes\.length < hosted\.minimumRows\)/)
  assert.match(consumer, /mass_distillation_hosted_teacher_incomplete/)
})


test('missing teacher work reroutes to another available provider instead of waiting for the original provider', async () => {
  const db = memoryDb()
  const prompts = Array.from({ length: 20 }, (_, index) => ({
    id: (index + 1).toString(16).padStart(64, '0'),
    prompt: `Dynamic prompt ${index + 1}`,
  }))
  const retryEnv = {
    ...env,
    XAI_API_KEY: undefined,
    DEEPSEEK_API_KEY: undefined,
    GEMINI_API_KEY: undefined,
    COS_UNIVERSITY_TEACHER_XAI_ENABLED: 'false',
    COS_UNIVERSITY_TEACHER_DEEPSEEK_API_ENABLED: 'false',
    COS_UNIVERSITY_TEACHER_GEMINI_ENABLED: 'false',
  }

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = JSON.parse(String(init?.body || '{}'))
    const model = String(body.model)
    if (url.includes('anthropic.com')) {
      return new Response(JSON.stringify({
        type: 'error',
        error: { type: 'credit_error', message: 'temporarily unavailable' },
      }), { status: 400 })
    }
    return new Response(JSON.stringify({
      id: 'resp-openai',
      output: [{
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: `openai-${model}` }],
      }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200, headers: { 'x-request-id': 'openai-reroute' } })
  }

  const run = {
    id: '55555555-5555-4555-8555-555555555555',
    candidate_id: 'mass:66666666-6666-4666-8666-666666666666:cccccccccccccccc',
    batch_key: 'f'.repeat(64),
  }

  const first = await runMassHostedTeacherStage({
    db, run, prompts, promptSetHash: '1'.repeat(64), env: retryEnv, fetchImpl,
  })
  assert.equal(first.rows, 16)
  assert.equal(first.completed, false)
  assert.deepEqual(first.activeProviders, ['openai', 'claude'])
  assert.equal(first.providerMix.openai, 16)
  assert.equal(first.providerMix.claude, undefined)
  assert.equal(first.failures.length, 4)
  assert.ok(first.failures.every(item => item.teacherId === 'claude'))

  // The next tick knows this is a partial retry. It excludes each missing prompt's original primary
  // provider when another approved route exists, so a paid Claude failure is not purchased again
  // before the prompt spills to the cheaper healthy provider.
  const second = await runMassHostedTeacherStage({
    db, run, prompts, promptSetHash: '1'.repeat(64), env: retryEnv, fetchImpl,
  })
  assert.equal(second.rows, 20)
  assert.equal(second.completed, true)
  assert.equal(second.providerMix.openai, 20)
  assert.equal(second.providerMix.claude, undefined)
  assert.equal(second.reroutedPrompts, 0)
  assert.equal(second.attemptedCalls, 4)
  assert.equal(second.failures.length, 0)
})



test('dataset preparation excludes rows without a supervised prompt-response pair', () => {
  const worker = fs.readFileSync(path.join(import.meta.dirname, '../scripts/cos-university-hf-worker-base.py'), 'utf8')
  assert.match(worker, /def supervised_pair\(row: dict\[str, Any\], text: str\)/)
  assert.match(worker, /prompt, response = supervised_pair\(raw_row, text\)/)
  assert.match(worker, /if not prompt or not response:\n\s+continue/)
  assert.match(worker, /user_marker = "<user>\\n"/)
  assert.match(worker, /assistant_marker = "\\n\\n<assistant>\\n"/)
})


test('hosted teacher routing balances dollars and gives expensive teachers completion headroom without raising the hard ceiling', () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassHostedTeacherStage.ts'), 'utf8')
  assert.match(source, /use at most 180 words/)
  assert.match(source, /costBalancedPrimaryPlan/)
  assert.match(source, /estimatedUnitCostUsd: teacherEstimatedCostUsd/)
  assert.match(source, /excludedProviderIds: excludePreviousPrimary/)
  assert.doesNotMatch(source, /teacher\.id === ['"]claude['"]/)
  assert.match(source, /DEFAULT_MAX_OUTPUT_TOKENS = 384/)
  assert.match(source, /HARD_MAX_OUTPUT_TOKENS = 512/)
})


test('remediation teacher override can produce twenty-five rows without widening the ordinary default', async () => {
  const db = memoryDb()
  const prompts = Array.from({ length: 25 }, (_, index) => ({
    id: (index + 100).toString(16).padStart(64, '0'),
    prompt: `Remediation prompt ${index + 1}`,
  }))
  let calls = 0
  const result = await runMassHostedTeacherStage({
    db,
    run: {
      id: '77777777-7777-4777-8777-777777777777',
      candidate_id: 'mass:88888888-8888-4888-8888-888888888888:dddddddddddddddd',
      batch_key: 'a'.repeat(64),
    },
    prompts,
    promptSetHash: '9'.repeat(64),
    minimumRows: 25,
    maxCalls: 32,
    env,
    fetchImpl: async (input, init) => {
      calls += 1
      const url = String(input)
      const body = JSON.parse(String(init?.body || '{}'))
      const model = String(body.model)
      const answer = `remediation-answer-${calls}-${model}`
      if (url.includes('anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{ type: 'text', text: answer }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'request-id': `anthropic-remediation-${calls}` } })
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: answer }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }), { status: 200, headers: { 'x-goog-request-id': `gemini-remediation-${calls}` } })
      }
      if (url.includes('api.openai.com/v1/responses')) {
        return new Response(JSON.stringify({
          id: `resp-remediation-${calls}`,
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer }] }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }), { status: 200, headers: { 'x-request-id': `openai-remediation-${calls}` } })
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: answer } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }), { status: 200, headers: { 'x-request-id': `compatible-remediation-${calls}` } })
    },
  })

  assert.equal(massHostedTeacherStageConfig(env).maxCalls, 20)
  assert.equal(result.minimumRows, 25)
  assert.equal(result.effectiveMaxCalls, 32)
  assert.equal(result.rows, 25)
  assert.equal(result.completed, true)
  assert.equal(calls, 25)
  assert.equal(db.rows.length, 25)
})


test('remediation consumer keeps ordinary subject examples in training after independent holdout', () => {
  const consumer = fs.readFileSync(path.join(import.meta.dirname, '../lib/ai/cos/cosUniversityMassDistillationConsumer.ts'), 'utf8')
  const worker = fs.readFileSync(path.join(import.meta.dirname, '../scripts/cos-university-hf-worker-base.py'), 'utf8')

  assert.match(consumer, /MASS_REMEDIATION_REPLAY_MIN_TRAINING_ROWS = 20/)
  assert.match(consumer, /MASS_REMEDIATION_HOLDOUT_TARGET = 5/)
  assert.match(consumer, /MASS_REMEDIATION_ORDINARY_TRAINING_MIN = 2/)
  assert.match(consumer, /MASS_REMEDIATION_ORDINARY_PROMPT_MIN = MASS_REMEDIATION_HOLDOUT_TARGET \+ MASS_REMEDIATION_ORDINARY_TRAINING_MIN/)
  assert.match(consumer, /MASS_REMEDIATION_TEACHER_MIN_ROWS = 27/)
  assert.match(consumer, /ordinary\.length < MASS_REMEDIATION_ORDINARY_PROMPT_MIN/)
  assert.match(consumer, /failureDerivedTarget = MASS_REMEDIATION_REPLAY_MIN_TRAINING_ROWS/)
  assert.match(consumer, /MASS_REMEDIATION_TEACHER_MAX_CALLS - failureDerivedTarget/)
  assert.match(consumer, /minimumRows: remediationTeacherRequired \? remediationTeacherPrompts\.length : undefined/)

  // Mass preparation still withholds holdout exclusively from ordinary rows, so >=7 ordinary teacher
  // rows means the five-row holdout cannot consume every ordinary subject example.
  assert.match(worker, /non_failure_pairs = \[item for item in ordered if item\[1\]\.get\("failure_derived"\) is not True\]/)
  assert.match(worker, /holdout_pairs = non_failure_pairs\[:holdout_count\]/)
  assert.match(worker, /training_pairs = \[item for item in ordered if item\[0\] not in holdout_hashes\]/)
})


test('dataset preparation emits assessment-ready Holdout rows without changing training pairs', () => {
  const worker = fs.readFileSync(path.join(import.meta.dirname, '../scripts/cos-university-hf-worker-base.py'), 'utf8')
  assert.match(worker, /def holdout_assessment_pair\(row: dict\[str, Any\]\)/)
  assert.match(worker, /training = Dataset\.from_list\(\[/)
  assert.match(worker, /\{\*\*row, "holdout_format": "training_pair_v1"\} for _, row in training_pairs/)
  assert.match(worker, /"holdout_format": "assessment_ready_v1"/)
  assert.match(worker, /Do not invent a different example/)
})
