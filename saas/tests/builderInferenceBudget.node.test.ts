import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'
import { PGlite } from '@electric-sql/pglite'
import { BuilderBudgetError, builderBudgetedModelFetch, quoteDeepInfraRequest, readBuilderRunLimits, withBuilderInferenceBudget } from '../lib/builder/inference-budget.ts'
import { createBuilderInferenceBudgetStore } from '../lib/builder/inference-budget-store.ts'

const migration = readFileSync(new URL('../supabase/migrations/20261019201138_builder_inference_run_budget.sql', import.meta.url), 'utf8')
const endpoint = 'https://api.deepinfra.com/v1/openai/chat/completions'
const body = { model: 'test/model', max_tokens: 100, messages: [{ role: 'user', content: 'repair this code' }] }
// Explicit fake tariff and fake HTTP responses; no live model, model key, or paid provider.
const catalog = [{ model_name: body.model, type: 'text-generation', max_tokens: 1000,
  pricing: { type: 'tokens', cents_per_input_token: 0.001, cents_per_output_token: 0.002 } }]
const quote = quoteDeepInfraRequest(endpoint, body, catalog)
const uid = '11111111-1111-4111-8111-111111111111'

test('the production enqueue boundary persists server-parsed limits and refuses unguarded engines', async () => {
  let sent: any = null
  const source = stripTypeScriptTypes(readFileSync(new URL('../lib/builder/job-store.ts', import.meta.url), 'utf8'))
    .replace(/^import[^\n]*\n/gm, '').replace(/^export\s+/gm, '')
  const enqueue = new Function('createClient', 'readBuilderRunLimits', 'MAX_WORK_SLICES',
    `${source}\nreturn enqueueBuilderJob`)(() => ({ rpc: async (_: string, args: any) => {
      sent = args; return { data: { job_id: uid, history_message_id: uid }, error: null }
    } }), readBuilderRunLimits, 24)
  const beforeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const beforeKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-placeholder'
  try {
    const input = { jobId: uid, workspaceId: uid, userId: uid, conversationId: uid, jobKind: 'standard',
      objective: 'Limits: maximum 10 minutes and $0.50 in inference spending.', runningReply: 'queued',
      metadata: { builderEngine: 'v2', builderRunLimits: { maxCostNanodollars: 9999999999 } } }
    await enqueue(input)
    assert.deepEqual(sent.p_metadata.builderRunLimits, { maxCostNanodollars: 500000000, maxElapsedMs: 600000 })
    sent = null
    await assert.rejects(enqueue({ ...input, metadata: { builderEngine: 'v1' } }), /builder_budget_v2_required/)
    assert.equal(sent, null)
  } finally {
    if (beforeUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = beforeUrl
    if (beforeKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = beforeKey
  }
})

async function database(cap = 500_000_000, elapsedMs = 600_000) {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.builder_jobs(id uuid primary key,user_id uuid,status text,claim_generation integer,job_kind text,metadata jsonb,created_at timestamptz);
    grant select,update on public.builder_jobs to service_role;`)
  await db.exec(migration)
  const job = { id: randomUUID(), userId: uid, claimGeneration: 1 }
  await db.query('insert into builder_jobs values($1,$2,$3,1,$4,$5,now())', [job.id, uid, 'running', 'standard',
    JSON.stringify({ builderEngine: 'v2', builderRunLimits: { maxCostNanodollars: cap, maxElapsedMs: elapsedMs } })])
  const rpc = async (name: string, args: Record<string, unknown>) => {
    try {
      const parameters = name === 'reserve_builder_inference'
        ? ['p_job_id','p_user_id','p_generation','p_call_id','p_upper_nanos','p_quote']
        : ['p_job_id','p_user_id','p_call_id','p_accounted_nanos','p_reported_nanos']
      const values = parameters.map(key => key === 'p_quote' ? JSON.stringify(args[key]) : args[key])
      const { rows } = await db.query<any>(`select public.${name}(${parameters.map((_, i) => '$' + (i + 1)).join(',')}) as result`, values)
      return { data: rows[0].result, error: null }
    } catch (error) { return { data: null, error: { message: (error as Error).message } } }
  }
  const store = createBuilderInferenceBudgetStore({ rpc }, job)
  const ledger = async () => (await db.query<any>('select * from builder_inference_budgets where job_id=$1', [job.id])).rows[0]
  return { db, job, store, rpc, ledger }
}

test('parses the actual requested dollar ceiling and one absolute ten-minute deadline', () => {
  const original = readFileSync(new URL('./fixtures/builder-isolated-acceptance.txt', import.meta.url), 'utf8')
  assert.deepEqual(readBuilderRunLimits(original), { maxCostNanodollars: 500_000_000, maxElapsedMs: 600_000 })
  assert.deepEqual(readBuilderRunLimits('Budget: at most $0.000000001. Maximum 1 second.'), { maxCostNanodollars: 1, maxElapsedMs: 1000 })
  assert.throws(() => readBuilderRunLimits('Limits: maximum $0.0000000001'), /amount_invalid/)
  assert.equal(readBuilderRunLimits('Build a tracker displaying a $50 budget.'), null)
})

test('quote reserves full context, full output, and ignores cached-token savings', () => {
  assert.equal(quote.upperNanodollars, 12_000_000)
  assert.equal(quote.contextTokens, 1000)
  for (const changed of [{ ...body, n: 2 }, { ...body, stream: true }, { ...body, service_tier: 'priority' },
    { ...body, max_tokens: undefined }, { ...body, messages: [{ content: [{ type: 'image_url', image_url: 'x' }] }] }]) {
    assert.throws(() => quoteDeepInfraRequest(endpoint, changed, catalog), BuilderBudgetError)
  }
  assert.throws(() => quoteDeepInfraRequest('https://api.deepinfra.com.evil.test/v1/openai/chat/completions', body, catalog), /provider_not_priced/)
  assert.throws(() => quoteDeepInfraRequest(endpoint, body, []), /price_unavailable/)
})

test('tiny cap blocks BEFORE the first model HTTP request and persists the empty ledger', async () => {
  const { db, store, ledger } = await database(1)
  let modelCalls = 0
  const transport = builderBudgetedModelFetch((async url => {
    if (String(url).endsWith('/models/list')) return Response.json(catalog)
    modelCalls++; throw new Error('paid request must not run')
  }) as typeof fetch)
  try {
    await assert.rejects(withBuilderInferenceBudget(store, Date.now() + 10_000, () => transport(endpoint, { body: JSON.stringify(body) })), /builder_budget_exhausted/)
    assert.equal(modelCalls, 0)
    assert.equal(Number((await ledger()).reserved_nanos), 0)
    assert.equal((await ledger()).call_count, 0)
  } finally { await db.close() }
})

test('concurrent reservations cannot oversubscribe the same job', async () => {
  const { db, store, ledger } = await database(quote.upperNanodollars)
  try {
    const results = await Promise.allSettled([store.reserve(randomUUID(), quote), store.reserve(randomUUID(), quote)])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(Number((await ledger()).reserved_nanos), quote.upperNanodollars)
    assert.equal((await ledger()).call_count, 1)
  } finally { await db.close() }
})

test('usage settles once; a fresh resumed worker inherits the spent and pending amounts', async () => {
  const { db, job, store, rpc, ledger } = await database(quote.upperNanodollars)
  try {
    const callId = randomUUID()
    await store.reserve(callId, quote)
    await store.settle(callId, 2_000_000, 1_000_000)
    await store.settle(callId, 0, 0)
    assert.equal(Number((await ledger()).accounted_nanos), 2_000_000)
    await db.query('update builder_jobs set claim_generation=2 where id=$1', [job.id])
    const resumed = createBuilderInferenceBudgetStore({ rpc }, { ...job, claimGeneration: 2 })
    await assert.rejects(resumed.reserve(randomUUID(), quote), /builder_budget_exhausted/)
    await assert.rejects(store.reserve(randomUUID(), quote), /builder_budget_lease_lost/)
  } finally { await db.close() }
})

test('lost responses retain the entire reservation; retries cannot reset or reuse it', async () => {
  const { db, store, ledger } = await database(quote.upperNanodollars)
  let calls = 0
  const transport = builderBudgetedModelFetch((async url => {
    if (String(url).endsWith('/models/list')) return Response.json(catalog)
    calls++; throw new Error('connection lost after provider accepted request')
  }) as typeof fetch)
  try {
    for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(withBuilderInferenceBudget(store, Date.now() + 10_000,
      () => transport(endpoint, { body: JSON.stringify(body) })))
    assert.equal(calls, 1)
    assert.equal(Number((await ledger()).reserved_nanos), quote.upperNanodollars)
  } finally { await db.close() }
})

test('physical call metering records conservative token cost and the provider estimate separately', async () => {
  const { db, store, ledger } = await database()
  const transport = builderBudgetedModelFetch((async url => String(url).endsWith('/models/list') ? Response.json(catalog)
    : Response.json({ choices: [{ message: { content: 'repair' } }], usage: { prompt_tokens: 10, completion_tokens: 2, estimated_cost: 0.00005 } })) as typeof fetch)
  try {
    await withBuilderInferenceBudget(store, Date.now() + 10_000, () => transport(endpoint, { body: JSON.stringify(body) }))
    assert.equal(Number((await ledger()).accounted_nanos), 140_000)
    assert.equal(Number((await ledger()).reserved_nanos), 0)
    const rows = await db.query<any>('select reported_nanos from builder_inference_reservations')
    assert.equal(Number(rows.rows[0].reported_nanos), 50_000)
  } finally { await db.close() }
})

test('missing usage holds the full upper bound; unknown prices never dispatch', async () => {
  const { db, store, ledger } = await database()
  let calls = 0
  const transport = builderBudgetedModelFetch((async url => {
    if (String(url).endsWith('/models/list')) return Response.json(catalog)
    calls++; return Response.json({ choices: [] })
  }) as typeof fetch)
  try {
    await withBuilderInferenceBudget(store, Date.now() + 10_000, () => transport(endpoint, { body: JSON.stringify(body) }))
    assert.equal(Number((await ledger()).reserved_nanos), quote.upperNanodollars)
    await assert.rejects(withBuilderInferenceBudget(store, Date.now() + 10_000,
      () => transport('https://unpriced.example/chat/completions', { body: JSON.stringify(body) })), /provider_not_priced/)
    assert.equal(calls, 1)
  } finally { await db.close() }
})

test('expired absolute deadline blocks before pricing, storage, or model work', async () => {
  let work = 0
  const store = { reserve: async () => { work++ }, settle: async () => { work++ } }
  const transport = builderBudgetedModelFetch((async () => { work++; return Response.json({}) }) as typeof fetch)
  await assert.rejects(withBuilderInferenceBudget(store, Date.now() - 1,
    () => transport(endpoint, { body: JSON.stringify(body) })), /time_exhausted/)
  assert.equal(work, 0)
})

test('the wall-clock deadline aborts an in-flight model request and keeps its reservation', async () => {
  const { db, store, ledger } = await database()
  let calls = 0
  const transport = builderBudgetedModelFetch((async (url, init) => {
    if (String(url).endsWith('/models/list')) return Response.json(catalog)
    calls++
    return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))
  }) as typeof fetch)
  try {
    // Keep the test process alive while AbortSignal.timeout's unref'ed timer runs.
    const keepAlive = setTimeout(() => {}, 1000)
    try { await assert.rejects(withBuilderInferenceBudget(store, Date.now() + 100,
      () => transport(endpoint, { body: JSON.stringify(body) })), /builder_budget_time_exhausted/) }
    finally { clearTimeout(keepAlive) }
    assert.equal(calls, 1)
    assert.equal(Number((await ledger()).reserved_nanos), quote.upperNanodollars)
  } finally { await db.close() }
})

test('database expiry and another tenant are denied even if the worker clock is wrong', async () => {
  const { db, store, job, rpc } = await database()
  try {
    await db.query("update builder_jobs set created_at=now()-interval '11 minutes' where id=$1", [job.id])
    await assert.rejects(store.reserve(randomUUID(), quote), /builder_budget_time_exhausted/)
    const other = createBuilderInferenceBudgetStore({ rpc }, { ...job, userId: randomUUID() })
    await assert.rejects(other.reserve(randomUUID(), quote), /builder_budget_lease_lost/)
  } finally { await db.close() }
})

test('a provider cost above its quoted bound is recorded and disables subsequent calls', async () => {
  const { db, store, ledger } = await database()
  try {
    const id = randomUUID()
    await store.reserve(id, quote)
    await assert.rejects(store.settle(id, quote.upperNanodollars + 1, quote.upperNanodollars + 1), /ceiling_breached/)
    assert.equal((await ledger()).blocked, true)
    await assert.rejects(store.reserve(randomUUID(), quote), /builder_budget_exhausted/)
  } finally { await db.close() }
})

test('database enforces original deadline and refuses cap reset, duplicate call, other tenant, and terminal job', async () => {
  const { db, store, job, ledger } = await database()
  try {
    const id = randomUUID()
    await store.reserve(id, quote)
    await assert.rejects(store.reserve(id, quote), /builder_budget_storage_unavailable/)
    await db.query(`update builder_jobs set metadata=jsonb_set(metadata,'{builderRunLimits,maxCostNanodollars}','600000000') where id=$1`, [job.id])
    await assert.rejects(store.reserve(randomUUID(), quote), /limits_changed/)
    await db.query(`update builder_jobs set metadata=jsonb_set(metadata,'{builderRunLimits,maxCostNanodollars}','500000000'),status='failed' where id=$1`, [job.id])
    await assert.rejects(store.reserve(randomUUID(), quote), /lease_lost/)
    assert.equal((await ledger()).call_count, 1)
    const denied = createBuilderInferenceBudgetStore({ rpc: async (name, args) => {
      try { await db.exec('set role authenticated'); await db.query(`select public.reserve_builder_inference($1,$2,1,$3,1,$4)`, [job.id,uid,randomUUID(),'{}'])
        return { data: null, error: null }
      } catch (e) { assert.match((e as Error).message, /permission denied/); return { data: null, error: { message: 'denied' } } }
      finally { await db.exec('reset role') }
    } }, job)
    await assert.rejects(denied.reserve(randomUUID(), quote))
  } finally { await db.close() }
})
