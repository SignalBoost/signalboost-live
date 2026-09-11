import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = fileURLToPath(new URL('../', import.meta.url))
const routePath = path.join(root, 'app/api/hub/cyber/prepare-github-pr/route.ts')
const endpoint = 'https://itmounts.com/api/hub/cyber/prepare-github-pr'
function fixture(overrides: Record<string, unknown> = {}) {
  return { id: 'request-1', user_id: 'owner-1', source_area: 'cybersecurity', source_type: 'dependency_scan',
    source_id: 'scan-1', repo: 'SignalBoost/signalboost-live', status: 'in_progress',
    human_approval_required: false, human_approved: false, fix_plan_approved: false,
    fix_plan_status: 'ready_for_preparation', implementation_status: 'awaiting_github_pr_preparation', ...overrides }
}
function approvedFixture() {
  return fixture({ status: 'approved', human_approval_required: true, human_approved: true,
    fix_plan_approved: true, fix_plan_status: 'approved_for_pr', approved_by: 'owner-1', approved_at: '2026-09-11T00:00:00Z' })
}
// Interpret the small PostgREST filter grammar used by this worker. A missing
// filter really does expose a row; fixtures never silently supply authorization.
function terms(value: string) {
  const result: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    if (value[i] === ')') depth--
    if (value[i] === ',' && depth === 0) { result.push(value.slice(start, i)); start = i + 1 }
  }
  result.push(value.slice(start))
  return result
}
function expressionMatches(row: any, expression: string): boolean {
  if (expression.startsWith('and(')) return terms(expression.slice(4, -1)).every(t => expressionMatches(row, t))
  if (expression.startsWith('or(')) return terms(expression.slice(3, -1)).some(t => expressionMatches(row, t))
  const match = /^([a-z_]+)\.eq\.(.+)$/.exec(expression)
  assert.ok(match, `Unsupported test filter: ${expression}`)
  const value = match[2] === 'true' ? true : match[2] === 'false' ? false : match[2]
  return row[match[1]] === value
}
function harness(options: { rows?: any[]; beforeClaim?: (rows: any[]) => void; staleScan?: boolean; unfilteredRead?: boolean; authorized?: boolean } = {}) {
  const rows = structuredClone(options.rows || [fixture()])
  const writes: any[] = [], attempts: any[] = [], proposals: any[] = [], branches: string[] = []
  const queries: any[] = []
  const scan = { id: 'scan-1', user_id: 'owner-1', report: { ok: true, repo: 'SignalBoost/signalboost-live', branch: 'main',
    generatedAt: options.staleScan ? '2020-01-01T00:00:00Z' : new Date().toISOString(),
    advisories: [{ id: 'GHSA-test', packageName: 'example', version: '1.2.3', sourceFile: 'saas/package.json', fixedVersions: ['1.2.4'] }] } }
  const db = { from(table: string) {
    const predicates: Array<(row: any) => boolean> = []
    const filters: any[] = []
    let update: any
    const q: any = {
      select() { return q }, order() { return q }, limit() { return q },
      eq(key: string, value: any) { filters.push(['eq', key, value]); predicates.push(row => row[key] === value); return q },
      in(key: string, values: any[]) { predicates.push(row => values.includes(row[key])); return q },
      or(value: string) { filters.push(['or', value]); predicates.push(row => terms(value).some(t => expressionMatches(row, t))); return q },
      update(value: any) { update = value; return q },
      async maybeSingle() {
        queries.push({ table, filters, update })
        if (update) {
          attempts.push(update)
          if (update.implementation_status === 'github_pr_preparing') options.beforeClaim?.(rows)
          const row = rows.find(row => predicates.every(matches => matches(row)))
          if (!row) return { data: null, error: null }
          Object.assign(row, update)
          writes.push(structuredClone(update))
          return { data: structuredClone(row), error: null }
        }
        const candidates = table === 'cyber_dependency_scans' ? [scan] : rows
        const row = candidates.find(row => (options.unfilteredRead && table === 'remediation_requests') || predicates.every(matches => matches(row)))
        return { data: row ? structuredClone(row) : null, error: null }
      },
    }
    return q
  } }
  const cache = new Map<string, any>()
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file)
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} as any }
    const imports = (specifier: string) => {
      if (specifier === 'next/server') return { NextResponse: { json: Response.json } }
      if (specifier === '@/lib/auth/access') return { requireAdmin: async () => options.authorized === false
        ? { ok: false, status: 401, error: 'Unauthorized' } : { ok: true, ctx: { userId: 'owner-1' } } }
      if (specifier === '@/utils/supabase/server') return { getAdminSupabase: () => db }
      if (specifier === '@/lib/audit/repoTarget') return { readRepoFileFrom: async () => ({ ok: true, content: '{"dependencies":{"example":"^1.2.3"}}' }) }
      if (specifier === '@/lib/ai/tools/repoWriter') return {
        ensureBranch: async (branch: string) => { branches.push(branch); return { ok: true, branch: `ai/${branch}` } },
        commitFileToBranch: async (input: any) => { proposals.push(input); return { ok: true, prUrl: 'https://github.com/SignalBoost/signalboost-live/pull/1', prNumber: 1 } },
      }
      if (specifier === '@/lib/cyber/dependencyRemediationPolicy') return load(path.join(root, 'lib/cyber/dependencyRemediationPolicy.ts'))
      throw new Error(`Unexpected import ${specifier}`)
    }
    new Function('require', 'module', 'exports', output)(imports, module, module.exports)
    cache.set(file, module.exports)
    return module.exports
  }
  return { route: load(routePath), rows, writes, attempts, proposals, branches, queries }
}
function request(id?: string) {
  return new Request(endpoint, { method: 'POST', headers: { origin: 'https://itmounts.com', 'content-type': 'application/json' }, body: JSON.stringify({ remediationId: id }) })
}

test('unapproved legacy requests remain untouched for admin and cron callers', async () => {
  for (const cron of [false, true]) {
    const row = fixture({ status: 'awaiting_human_review', human_approval_required: true })
    const h = harness({ rows: [row] })
    const previous = process.env.CRON_SECRET
    try {
      process.env.CRON_SECRET = 'test-only-cron'
      const response = cron ? await h.route.GET(new Request(endpoint, { headers: { authorization: 'Bearer test-only-cron' } }))
        : await h.route.POST(request(row.id))
      assert.equal(response.status, 409)
      assert.deepEqual(h.rows, [row])
      assert.equal(h.attempts.length, 0)
      assert.equal(h.branches.length, 0)
      assert.equal(h.proposals.length, 0)
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = previous
    }
  }
})

test('missing, null and incomplete approval metadata never authorizes preparation', async () => {
  for (const overrides of [
    { human_approval_required: undefined }, { human_approval_required: null },
    { status: 'approved', human_approval_required: true },
    { status: 'approved', human_approval_required: true, human_approved: true },
    { status: 'approved', human_approval_required: true, human_approved: true, fix_plan_approved: true, fix_plan_status: 'ready_for_review' },
  ]) {
    const row = fixture(overrides)
    const h = harness({ rows: [row] })
    assert.equal((await h.route.POST(request(row.id))).status, 409)
    assert.deepEqual(h.rows, [row])
    assert.equal(h.attempts.length, 0)
  }
})

test('a stale or unfiltered returned row is rejected before any claim', async () => {
  const row = fixture({ status: 'awaiting_human_review', human_approval_required: true })
  const h = harness({ rows: [row], unfilteredRead: true })
  const response = await h.route.POST(request(row.id))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).approvalRequired, true)
  assert.equal(h.attempts.length, 0)
  assert.deepEqual(h.rows, [row])
})

test('an older gated request cannot starve approval-free preparation', async () => {
  const gated = fixture({ id: 'gated', status: 'awaiting_human_review', human_approval_required: true })
  const h = harness({ rows: [gated, fixture()] })
  const response = await h.route.POST(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).remediationId, 'request-1')
  assert.deepEqual(h.rows[0], gated)
  assert.equal(h.proposals.length, 1)
})

test('routine preparation preserves approval-free state without writing approval fields', async () => {
  const h = harness()
  assert.equal((await h.route.POST(request('request-1'))).status, 200)
  assert.equal(h.rows[0].human_approval_required, false)
  assert.equal(h.rows[0].human_approved, false)
  assert.equal(h.rows[0].fix_plan_approved, false)
  assert.equal(h.proposals.length, 1)
  for (const write of h.writes) {
    assert.equal('human_approval_required' in write, false)
    assert.equal('human_approved' in write, false)
    assert.equal('fix_plan_approved' in write, false)
  }
})

test('explicit approval is honored and its audit fields survive success and verification failure', async () => {
  for (const staleScan of [false, true]) {
    const row = approvedFixture()
    const h = harness({ rows: [row], staleScan })
    assert.equal((await h.route.POST(request(row.id))).status, staleScan ? 409 : 200)
    for (const key of ['human_approval_required', 'human_approved', 'fix_plan_approved', 'fix_plan_status', 'approved_by', 'approved_at']) {
      assert.equal(h.rows[0][key], (row as any)[key])
      assert.equal(h.writes.some(write => key in write), false)
    }
    assert.equal(h.proposals.length, staleScan ? 0 : 1)
    assert.equal(h.rows[0].implementation_status, staleScan ? 'verification_blocked' : 'github_pr_prepared')
  }
})

test('a newly required approval between selection and claim prevents all repository work', async () => {
  const h = harness({ beforeClaim: rows => { rows[0].human_approval_required = true } })
  assert.equal((await h.route.POST(request('request-1'))).status, 409)
  assert.equal(h.writes.length, 0)
  assert.equal(h.rows[0].implementation_status, 'awaiting_github_pr_preparation')
  assert.equal(h.rows[0].human_approval_required, true)
  assert.equal(h.branches.length, 0)
  assert.equal(h.proposals.length, 0)
})

test('revoked human or fix-plan approval cannot survive the compare-and-set claim', async () => {
  for (const key of ['human_approved', 'fix_plan_approved']) {
    const h = harness({ rows: [approvedFixture()], beforeClaim: rows => { rows[0][key] = false } })
    assert.equal((await h.route.POST(request('request-1'))).status, 409)
    assert.equal(h.writes.length, 0)
    assert.equal(h.branches.length, 0)
    assert.equal(h.rows[0].status, 'approved')
    assert.equal(h.rows[0][key], false)
  }
})
