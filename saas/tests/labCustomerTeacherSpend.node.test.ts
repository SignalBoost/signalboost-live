// Teacher API spend: reserved before any call, executed in the Harness, hard-stopped at the reservation, settled always.
import assert from 'node:assert/strict'
import test from 'node:test'

const gov = await import('../lib/ai/cos/labCustomerGovernedTeacher.ts')
const card = { id: 'rc-1', inputUsdPerMTok: 1, outputUsdPerMTok: 4, requestOverheadTokens: 64, safetyMargin: 1.1 }
const prompts = Array.from({ length: 30 }, (_, i) => `Explain topic number ${i} in two sentences.`)
const teacher = { providerKind: 'openai', model: 'gpt-x', endpoint: null, apiKey: 'sk-' + 'k'.repeat(40) }
const priced = (i: number, o: number) => (i * card.inputUsdPerMTok + o * card.outputUsdPerMTok) / 1e6
function harnessSpy(log: string[]) {
  return (async (h: any) => { log.push(`harness:${h.reservedUsd}:${h.maxCalls}`); return h.operation({}, new AbortController().signal) }) as any
}
// Mirrors the database: reserve prices token bounds x margin; settle prices ACTUAL tokens, never clamps, blocks on overrun.
function dbSpy(log: string[], opts: { reserveFails?: boolean; noCard?: boolean; approved?: number } = {}) {
  const st = { reserved: 0, charged: null as number | null, overrun: 0, blocked: false, committed: 0, approved: opts.approved ?? 100, detail: null as any, bounds: null as any }
  return { st, port: {
    rateCard: async () => { log.push('card'); if (opts.noCard) throw new Error('lab_teacher_rate_unverified'); return card },
    reserve: async (b: any) => {
      log.push('reserve'); if (opts.reserveFails) throw new Error('lab_customer_teacher_budget_exceeded')
      if (st.blocked) throw new Error('lab_customer_spend_blocked')
      st.bounds = b; st.reserved = Math.ceil(priced(b.inputTokenBound, b.outputTokenBound) * card.safetyMargin * 1e6) / 1e6
      if (st.reserved > b.capUsd) throw new Error('lab_customer_teacher_budget_exceeded')
      st.committed += st.reserved; return { reservedUsd: st.reserved }
    },
    settle: async (t: any) => {
      log.push('settle'); st.detail = t
      const charged = Math.ceil(priced(t.inputTokens, t.outputTokens) * 1e6) / 1e6
      st.charged = charged; st.overrun = Math.max(0, charged - st.reserved)
      st.committed = st.committed - st.reserved + charged
      if (st.overrun > 0) st.blocked = true
      return { chargedUsd: charged, overrunUsd: st.overrun, blocked: st.blocked, remainingUsd: Math.max(0, st.approved - st.committed) }
    },
  } }
}
const ok = (i: number | null, o: number | null) => (async (x: any) => ({ provider: 'openai', model: 'gpt-x', text: `ok ${x.request.prompt}`, inputTokens: i, outputTokens: o, requestId: null })) as any

test('verified pricing: rate card -> reserve -> Harness -> calls -> settle; customer prices are not an input', async () => {
  const log: string[] = []; const d = dbSpy(log)
  const out = await gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d.port,
    harness: harnessSpy(log), generate: (async (x: any) => { log.push('call'); assert.equal(x.env.LAB_CUSTOMER_TEACHER_CREDENTIAL, teacher.apiKey); return ok(100, 200)(x) }) as any } as any)
  assert.deepEqual(log.slice(0, 2), ['card', 'reserve']); assert.match(log[2], /^harness:/); assert.equal(log.at(-1), 'settle')
  assert.equal(d.st.bounds.rateCardId, 'rc-1')
  assert.equal(d.st.detail.inputTokens, 3000); assert.equal(d.st.detail.outputTokens, 6000)
  assert.equal(out.spentUsd, Math.ceil(priced(3000, 6000) * 1e6) / 1e6)
  assert.equal(out.settlement.remainingUsd, 100 - out.spentUsd)
  assert.equal(process.env.LAB_CUSTOMER_TEACHER_CREDENTIAL, undefined)
  const src = (await import('node:fs')).readFileSync(new URL('../app/api/lab/training/route.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /teacherInputUsdPerMTok|teacherOutputUsdPerMTok|PerMTok\)/, 'route must not read customer prices')
})

test('no verified rate card: nothing is reserved and no provider call is made', async () => {
  const log: string[] = []; const d = dbSpy(log, { noCard: true })
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d.port,
    harness: harnessSpy(log), generate: (async () => { throw new Error('must not call') }) as any } as any), /rate_unverified/)
  assert.deepEqual(log, ['card'])
})

test('conservative token bound: input bound >= UTF-8 bytes (so >= any byte-level tokenizer count), incl. non-Latin text', () => {
  for (const p of ['hello world', 'Привет, как дела?', '日本語のテキストです', 'مرحبا بالعالم', '🙂🙂🙂']) {
    const bytes = new TextEncoder().encode(p).length
    const bound = gov.inputTokenBound(p, card)
    assert.ok(bound >= bytes + card.requestOverheadTokens, p)
    assert.ok(bound > Math.ceil(p.length / 3), 'strictly more conservative than the old chars/3 estimate: ' + p)
  }
  assert.equal(gov.outputTokenBound(), gov.LAB_TEACHER_MAX_OUTPUT_TOKENS)
  assert.ok(gov.worstCaseCallUsd('x', card) >= priced(gov.inputTokenBound('x', card), gov.LAB_TEACHER_MAX_OUTPUT_TOKENS) * 1.1 - 1e-12)
})

test('no provider call when the database refuses the reservation', async () => {
  const log: string[] = []; const d = dbSpy(log, { reserveFails: true })
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d.port,
    harness: harnessSpy(log), generate: (async () => { throw new Error('must not call') }) as any } as any), /budget_exceeded/)
  assert.deepEqual(log, ['card', 'reserve'])
})

test('overrun preserved: usage above the bound is settled at its FULL actual cost, not clamped to the reservation', async () => {
  const log: string[] = []; const d = dbSpy(log)
  let calls = 0
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d.port, concurrency: 1,
    harness: harnessSpy(log), generate: (async (x: any) => { calls++; return ok(200_000, 50_000)(x) }) as any } as any), /lab_teacher_budget_overrun/)
  assert.equal(calls, 1, 'no further call is admitted after the first over-bound result')
  assert.equal(d.st.detail.inputTokens, 200_000); assert.equal(d.st.detail.boundExceeded, 1)
  assert.equal(d.st.charged, Math.ceil(priced(200_000, 50_000) * 1e6) / 1e6)
  assert.ok(d.st.overrun > 0 && d.st.charged! > d.st.reserved, 'charged above reservation, overrun kept')
  assert.equal(d.st.blocked, true)
})

test('overrun beyond the whole reservation: recorded in full, run blocked, no training budget left from the teacher share', async () => {
  const log: string[] = []; const d = dbSpy(log, { approved: 6 })
  const p1 = prompts.slice(0, 20)
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts: p1, teacherBudgetUsd: 1, budget: d.port, concurrency: 1,
    harness: harnessSpy(log), generate: ok(5_000_000, 100) } as any), /lab_teacher_budget_overrun/)
  assert.ok(d.st.charged! > d.st.reserved, 'actual cost exceeds the reservation')
  assert.ok(Math.abs(d.st.overrun - (d.st.charged! - d.st.reserved)) < 1e-9)
  assert.equal(d.st.committed, d.st.charged, 'committed cost carries the true amount')
  assert.equal(d.st.blocked, true)
  await assert.rejects(d.port.reserve({ rateCardId: 'rc-1', inputTokenBound: 1, outputTokenBound: 1, capUsd: 1 }), /spend_blocked/)
})

test('unmetered and failed calls are charged at their full bound', async () => {
  const log: string[] = []; const d = dbSpy(log)
  const out = await gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d.port, concurrency: 1,
    harness: harnessSpy(log), generate: ok(null, null) } as any)
  const inB = prompts.reduce((s, p) => s + gov.inputTokenBound(p, card), 0)
  assert.equal(d.st.detail.unmetered, 30); assert.equal(d.st.detail.inputTokens, inB); assert.equal(d.st.detail.outputTokens, 30 * 1024)
  assert.equal(out.settlement.overrunUsd, 0, 'bounds priced plainly never exceed the margin-inflated reservation')
  const log2: string[] = []; const d2 = dbSpy(log2)
  await gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d2.port, concurrency: 1,
    harness: harnessSpy(log2), generate: (async () => { throw new Error('500') }) as any } as any)
  assert.equal(d2.st.detail.inputTokens, inB)
})

test('settlement still happens when the Harness refuses; prompts that do not fit the teacher budget are never attempted', async () => {
  const log: string[] = []; const d = dbSpy(log)
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 5, budget: d.port,
    harness: (async () => { throw new Error('lab_teacher_harness_denied:x') }) as any } as any), /harness_denied/)
  assert.equal(log.at(-1), 'settle'); assert.equal(d.st.charged, 0)
  const per = gov.worstCaseCallUsd(prompts[0], card)
  const log2: string[] = []; const d2 = dbSpy(log2); let calls = 0
  const out = await gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: per * 10.5, budget: d2.port, concurrency: 1,
    harness: harnessSpy(log2), generate: (async (x: any) => { calls++; return ok(10, 10)(x) }) as any } as any)
  assert.ok(calls <= 10); assert.equal(out.rows.length, calls)
  await assert.rejects(gov.runGovernedTeacher({ organizationId: 'o', trainingRunId: 'r', teacher, prompts, teacherBudgetUsd: 0, budget: d2.port } as any), /budget_invalid/)
})

test('migration: verified rate cards, database-side pricing, no clamp, overrun blocks all further spend', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../supabase/migrations/20261012010000_lab_customer_teacher_spend.sql', import.meta.url), 'utf8')
  const base = readFileSync(new URL('../supabase/migrations/20261012000000_lab_customer_provider_credentials_and_training.sql', import.meta.url), 'utf8')
  assert.match(sql, /create table if not exists lab\.teacher_rate_cards[\s\S]*source_url text not null[\s\S]*verified_by text not null[\s\S]*verified_at timestamptz not null/)
  assert.match(sql, /revoke all on lab\.teacher_rate_cards from public, anon, authenticated, service_role/)
  assert.doesNotMatch(sql, /p_input_usd_per_mtok|p_max_usd|p_used_usd/, 'no caller-supplied prices or USD amounts')
  assert.doesNotMatch(sql, /least\(greatest\(coalesce\(p_used_usd/, 'old clamp removed')
  assert.match(sql, /overrun := greatest\(charged - r\.teacher_reserved_usd, 0\)/)
  assert.match(sql, /committed_max_cost_usd = committed_max_cost_usd - teacher_reserved_usd \+ charged/)
  assert.match(sql, /spend_blocked_at = case when overrun > 0/)
  assert.match(sql, /if r\.spend_blocked_at is not null then raise exception 'lab_customer_spend_blocked'/)
  assert.match(base, /constraint customer_training_runs_budget_ck check \(committed_max_cost_usd <= approved_budget_usd or spend_blocked_at is not null\)/)
  assert.match(base, /if r\.spend_blocked_at is not null and coalesce\(p_add_cost, 0\) > 0 then raise exception 'lab_customer_spend_blocked'/)
  assert.match(sql, /revoke all on function public\.itmounts_lab_customer_reserve_teacher\(uuid,uuid,uuid,bigint,bigint,numeric\) from public, anon, service_role/)
  assert.doesNotMatch(sql, /grant[^;]*supervisor/i)
})

test('copy: eleven languages with identical keys and every error code translated', async () => {
  const c = await import('../lib/i18n/labCustomerTrainingCopy.ts')
  const langs = Object.keys(c.LAB_CUSTOMER_TRAINING_COPY)
  assert.deepEqual(langs.sort(), ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pl', 'pt', 'ru'])
  const keys = (o: any): string[] => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? keys(v).map(x => `${k}.${x}`) : [k]).sort()
  const ref = keys(c.LAB_CUSTOMER_TRAINING_COPY.en)
  for (const l of langs) {
    assert.deepEqual(keys(c.LAB_CUSTOMER_TRAINING_COPY[l]), ref, l)
    for (const v of Object.values(c.LAB_CUSTOMER_TRAINING_COPY[l]).filter(x => typeof x === 'string')) assert.ok((v as string).length > 0)
    if (l !== 'en') assert.notEqual(c.LAB_CUSTOMER_TRAINING_COPY[l].title, c.LAB_CUSTOMER_TRAINING_COPY.en.title)
  }
  for (const code of c.LAB_CUSTOMER_TRAINING_ERROR_CODES) assert.ok(c.LAB_CUSTOMER_TRAINING_COPY.ar.errors[code])
  assert.equal(c.labCustomerTrainingCopy('pt-BR').title, c.LAB_CUSTOMER_TRAINING_COPY.pt.title)
  assert.equal(c.fmt('a {n} b', { n: 3 }), 'a 3 b')
})
