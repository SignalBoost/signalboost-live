import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { partitionRemediationRequests, needsHumanApproval, routineDependencyState, trustedDependencyChanges, updateVerifiedPackageJson } from '../lib/cyber/dependencyRemediationPolicy.ts'
import { remediationAutonomyCopy } from '../lib/cyber/remediationAutonomyCopy.ts'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const root = fileURLToPath(new URL('../', import.meta.url))
const routePath = path.join(root, 'app/api/hub/cyber/dependencies/route.ts')
const user = 'owner-1'
function fixture() {
  const report = { ok: true, repo: 'SignalBoost/signalboost-live', target: 'https://github.com/SignalBoost/signalboost-live', branch: 'main', generatedAt: new Date().toISOString(), advisories: [{ id: 'GHSA-example', packageName: 'example', version: '1.2.3', sourceFile: 'saas/package.json', severity: 'high', summary: 'Example', fixedVersions: ['1.2.4'] }], summary: { advisories: 1 } }
  return { report, scan: { id: 'scan-1', user_id: user, report }, row: { id: 'request-1', user_id: user, source_area: 'cybersecurity', source_type: 'dependency_scan', source_id: 'scan-1', repo: report.repo, status: 'in_progress' } }
}
function harness(options: { authorized?: boolean; scan?: any; row?: any; insertError?: boolean; claimLost?: boolean; writerFails?: boolean; manifest?: string; route?: string } = {}) {
  const writes: Array<{ table: string; value: any }> = []
  const proposals: any[] = []
  const pdfDocs: any[] = []
  const queries: Array<{ table: string; filters: Record<string, unknown> }> = []
  const db = { from(table: string) {
    const filters: Record<string, unknown> = {}
    let insertion: any
    const q: any = {
      select() { return q }, eq(k: string, v: unknown) { filters[k] = v; return q }, in() { return q },
      order() { return q }, limit() { return q },
      insert(value: any) { insertion = value; writes.push({ table, value }); return q },
      update(value: any) { insertion = value; writes.push({ table, value }); return q },
      single: async () => result(), maybeSingle: async () => result(),
    }
    const result = () => {
      queries.push({ table, filters })
      if (insertion?.implementation_status === 'github_pr_preparing' && options.claimLost) return { data: null, error: null }
      if (insertion) return options.insertError ? { data: null, error: { message: 'persistence failed' } } : { data: { id: 'request-1', ...insertion }, error: null }
      if (table === 'cyber_dependency_scans') {
        const scan = options.scan === undefined ? fixture().scan : options.scan
        return { data: scan && filters.id === scan.id && filters.user_id === scan.user_id ? scan : null, error: null }
      }
      if (table === 'remediation_requests') {
        const row = options.row || null
        const visible = row && (!filters.user_id || row.user_id === filters.user_id) && (!filters.id || row.id === filters.id)
        return { data: visible ? row : null, error: null }
      }
      throw new Error(`Unexpected table ${table}`)
    }
    return q
  } }
  const cache = new Map<string, any>()
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file)
    const source = readFileSync(file, 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const module = { exports: {} as any }
    cache.set(file, module.exports)
    const imports = (spec: string) => {
      if (spec === 'next/server') return { NextResponse: { json: Response.json } }
      if (spec === '@/lib/auth/access') return { requireAdmin: async () => options.authorized === false ? { ok: false, error: 'Unauthorized', status: 401 } : { ok: true, ctx: { userId: user } } }
      if (spec === '@/utils/supabase/server') return { getAdminSupabase: () => db }
      if (spec === '@/lib/cyber/dependencyScanner') return { scanDependencyAdvisories: async () => { throw new Error('Unexpected live scan') } }
      if (spec === '@/lib/i18n/reportLanguage') return { normalizeReportLang: () => 'en', reportLangFromCookie: () => 'en' }
      if (spec === '@/lib/audit/simplePdf') return { createSimplePdf: (doc: any) => { pdfDocs.push(doc); return new Uint8Array([37, 80, 68, 70]) } }
      if (spec === '@/lib/audit/repoTarget') return { readRepoFileFrom: async () => ({ ok: true, content: options.manifest ?? JSON.stringify({ dependencies: { example: '^1.2.3' } }) }) }
      if (spec === '@/lib/ai/tools/repoWriter') return { ensureBranch: async (branch: string) => ({ ok: true, branch: `ai/${branch}`, created: true }), commitFileToBranch: async (input: any) => { proposals.push(input); return options.writerFails ? { ok: false, error: 'write failed' } : { ok: true, prUrl: 'https://github.com/SignalBoost/signalboost-live/pull/1', prNumber: 1 } } }
      if (spec.startsWith('@/lib/cyber/')) return load(path.join(root, spec.slice(2) + (spec.endsWith('.ts') ? '' : '.ts')))
      throw new Error(`Unexpected import ${spec}`)
    }
    new Function('require', 'module', 'exports', output)(imports, module, module.exports)
    cache.set(file, module.exports)
    return module.exports
  }
  return { route: load(options.route ? path.join(root, options.route) : routePath), writes, queries, proposals, pdfDocs }
}
const request = (body: unknown, origin = 'https://itmounts.com') => new Request('https://itmounts.com/api/hub/cyber/dependencies', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('owned dependency plan proceeds without inventing a human approval', async () => {
  const h = harness()
  const response = await h.route.POST(request({ action: 'request_remediation', scanId: 'scan-1', report: fixture().report }))
  assert.equal(response.status, 200)
  const row = h.writes.find(w => w.table === 'remediation_requests')?.value
  assert.ok(row)
  assert.equal(row.human_approval_required, false)
  assert.equal(row.human_approved, false)
  assert.equal(row.status, 'in_progress')
  assert.equal(row.implementation_status, 'awaiting_github_pr_preparation')
  assert.equal(row.fix_plan_approved, false)
})

test('a browser-supplied report cannot authorize dependency preparation', async () => {
  const h = harness({ scan: null })
  const response = await h.route.POST(request({ action: 'request_remediation', report: fixture().report }))
  assert.notEqual(response.status, 200)
  assert.equal(h.writes.length, 0)
})

test('another users stored scan cannot become preparation authority', async () => {
  const h = harness({ scan: { ...fixture().scan, user_id: 'other-user' } })
  const response = await h.route.POST(request({ action: 'request_remediation', scanId: 'scan-1', report: fixture().report }))
  assert.notEqual(response.status, 200)
  assert.equal(h.writes.length, 0)
})

test('unauthenticated and cross-origin requests never write a plan', async () => {
  for (const [authorized, origin] of [[false, 'https://itmounts.com'], [true, 'https://untrusted.example']] as const) {
    const h = harness({ authorized })
    const response = await h.route.POST(request({ action: 'request_remediation', scanId: 'scan-1', report: fixture().report }, origin))
    assert.notEqual(response.status, 200)
    assert.equal(h.writes.length, 0)
  }
})

test('persisting a plan unsuccessfully cannot be reported as success', async () => {
  const h = harness({ insertError: true })
  const response = await h.route.POST(request({ action: 'request_remediation', scanId: 'scan-1', report: fixture().report }))
  assert.equal(response.status, 500)
})

test('completed Guardian reviews are history, not pending approvals', () => {
  const rows = [
    { id: 'done', status: 'completed', human_approval_required: true, human_approved: false },
    { id: 'pending', status: 'awaiting_human_review', human_approval_required: true, human_approved: false },
    { id: 'routine', status: 'in_progress', human_approval_required: false },
    { id: 'legacy-routine', status: 'awaiting_human_review', human_approval_required: false },
    { id: 'cancelled', status: 'cancelled' },
  ]
  const result = partitionRemediationRequests(rows)
  assert.deepEqual(result.pending.map(r => r.id), ['pending'])
  assert.deepEqual(result.active.map(r => r.id), ['routine', 'legacy-routine'])
  assert.deepEqual(result.history.map(r => r.id), ['done', 'cancelled'])
  assert.equal(needsHumanApproval({ status: 'awaiting_human_review' }), true)
})

test('dashboard uses the same partition for its count and visible queue', () => {
  const page = readFileSync(path.join(root, 'app/dashboard/cybersecurity/page.tsx'), 'utf8')
  assert.match(page, /partitionRemediationRequests\(remediationRequests\)/)
  assert.match(page, /pendingRemediation\.slice\(0, 20\)\.map/)
  assert.match(page, /remediationHistory\.slice\(0, 20\)\.map/)
  assert.match(page, /needsHumanApproval\(r\)/)
})

test('routine policy records no human or fix-plan approval', () => {
  assert.equal(routineDependencyState().human_approved, false)
  assert.equal(routineDependencyState().approved_by, null)
  assert.equal(routineDependencyState().fix_plan_approved, false)
})

test('only owned, fresh, in-scope canonical scan evidence permits a proposal', () => {
  const f = fixture()
  const verdict = trustedDependencyChanges(f.row, f.scan)
  assert.equal(verdict.ok, true)
  for (const [row, scan] of [
    [{ ...f.row, source_type: 'guardian_repository_change' }, f.scan],
    [{ ...f.row, user_id: 'other' }, f.scan],
    [{ ...f.row, status: 'cancelled' }, f.scan],
    [f.row, { ...f.scan, report: { ...f.report, repo: 'other/repo' } }],
    [f.row, { ...f.scan, report: { ...f.report, generatedAt: '2020-01-01T00:00:00Z' } }],
  ]) assert.equal(trustedDependencyChanges(row, scan).ok, false)
})

test('unknown, unsupported and conflicting version evidence blocks rather than asks for approval', () => {
  const f = fixture()
  for (const fixedVersions of [[], ['2.0.0'], ['1.2.2'], ['1.2.4-beta'], ['file:../malicious']]) {
    const scan = { ...f.scan, report: { ...f.report, advisories: [{ ...f.report.advisories[0], fixedVersions }] } }
    assert.equal(trustedDependencyChanges(f.row, scan).ok, false)
  }
  const scan = { ...f.scan, report: { ...f.report, advisories: [...f.report.advisories, { ...f.report.advisories[0], id: 'another', fixedVersions: ['1.2.5'] }] } }
  assert.equal(trustedDependencyChanges(f.row, scan).ok, false)
})

test('repository drift, transitive-only entries and unsafe paths cannot be silently changed', () => {
  const f = fixture()
  const verdict = trustedDependencyChanges(f.row, f.scan)
  assert.equal(verdict.ok, true)
  if (!verdict.ok) return
  const content = JSON.stringify({ scripts: { build: 'unchanged' }, dependencies: { example: '^1.2.3' } })
  const updated = JSON.parse(updateVerifiedPackageJson(content, verdict.changes))
  assert.equal(updated.dependencies.example, '^1.2.4')
  assert.deepEqual(updated.scripts, { build: 'unchanged' })
  assert.throws(() => updateVerifiedPackageJson(JSON.stringify({ dependencies: { example: '^1.2.5' } }), verdict.changes), /rescan/)
  assert.throws(() => updateVerifiedPackageJson('{}', verdict.changes), /not_found/)
  const scan = { ...f.scan, report: { ...f.report, advisories: [{ ...f.report.advisories[0], sourceFile: '../package.json' }] } }
  assert.equal(trustedDependencyChanges(f.row, scan).ok, false)
})

test('autonomy and separate-history copy exists in all supported languages', () => {
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    const copy = remediationAutonomyCopy(lang)
    assert.ok(copy.humanEmpty)
    assert.ok(copy.activeWork)
    assert.ok(copy.reviewHistory)
    assert.ok(copy.approvalNotRequired)
    assert.equal(copy.safety.length, 3)
  }
})

const workerPath = 'app/api/hub/cyber/prepare-github-pr/route.ts'
test('routine worker creates only a branch proposal from canonical evidence without a human vote', async () => {
  const f = fixture()
  const h = harness({ route: workerPath, row: f.row, scan: f.scan })
  const response = await h.route.POST(request({ remediationId: f.row.id }))
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.verifiedRepair, false)
  assert.equal(result.approvalRequired, false)
  assert.equal(h.proposals.length, 1)
  assert.equal(h.proposals[0].path, 'saas/package.json')
  assert.match(h.proposals[0].branch, /^cyber-/)
  assert.equal(JSON.parse(h.proposals[0].content).dependencies.example, '^1.2.4')
  assert.equal(h.writes.some(w => w.value.human_approved === true || w.value.fix_plan_approved === true), false)
  assert.equal(h.writes.at(-1)?.value.implementation_status, 'github_pr_prepared')
})

test('missing version evidence produces a visible verification blocker, not an approval demand', async () => {
  const f = fixture()
  f.report.advisories[0].fixedVersions = []
  const h = harness({ route: workerPath, row: f.row, scan: f.scan })
  const response = await h.route.POST(request({ remediationId: f.row.id }))
  assert.equal(response.status, 409)
  assert.equal(h.proposals.length, 0)
  assert.equal(h.writes.at(-1)?.value.implementation_status, 'verification_blocked')
  assert.equal(h.writes.at(-1)?.value.human_approval_required, false)
})

test('worker denies cross-user, Guardian, terminal, stale and changed-manifest proposal execution', async () => {
  const f = fixture()
  const cases = [
    { row: { ...f.row, user_id: 'other-user' } },
    { row: { ...f.row, source_type: 'guardian_repository_change' } },
    { row: { ...f.row, status: 'cancelled' } },
    { row: f.row, scan: { ...f.scan, report: { ...f.report, generatedAt: '2020-01-01T00:00:00Z' } } },
    { row: f.row, manifest: JSON.stringify({ dependencies: { example: '1.2.9' } }) },
  ]
  for (const entry of cases) {
    const h = harness({ route: workerPath, ...entry })
    const response = await h.route.POST(request({ remediationId: f.row.id }))
    assert.notEqual(response.status, 200)
    assert.equal(h.proposals.length, 0)
  }
})

test('lost claim and failed writes cannot be reported as prepared PRs', async () => {
  for (const option of [{ claimLost: true }, { writerFails: true }]) {
    const h = harness({ route: workerPath, row: fixture().row, ...option })
    const response = await h.route.POST(request({ remediationId: 'request-1' }))
    assert.notEqual(response.status, 200)
    assert.equal(h.writes.some(w => w.value.implementation_status === 'github_pr_prepared'), false)
    if ('claimLost' in option) assert.equal(h.proposals.length, 0)
  }
})

test('GET is reserved for authenticated cron rather than browser mutation', async () => {
  const h = harness({ route: workerPath, row: fixture().row })
  const response = await h.route.GET(new Request('https://itmounts.com/api/hub/cyber/prepare-github-pr'))
  assert.equal(response.status, 401)
  assert.equal(h.proposals.length, 0)
  assert.equal(h.writes.length, 0)
})

test('PDF export uses the same preparation policy rather than restoring blanket approval copy', async () => {
  const h = harness({ route: 'app/api/hub/cyber/report-pdf/route.ts' })
  const response = await h.route.POST(request({ report: fixture().report }))
  assert.equal(response.status, 200)
  assert.equal(h.pdfDocs[0].title, 'iTMounts Cybersecurity Issue Review')
  assert.equal(h.pdfDocs[0].subtitle, remediationAutonomyCopy('en').issueReviewSubtitle)
  assert.doesNotMatch(JSON.stringify(h.pdfDocs), /require human approval before opening|human\/admin must approve|Human Approval Control/)
})
