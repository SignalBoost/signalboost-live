import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'

// Audit completion must report active risk, not replay fixed scan findings.
const url = (path: string) => new URL(path, import.meta.url)
const read = (path: string) => readUiSource(url(path))

test('Audit Console exposes one run-scoped approval and the AI performs the rest', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')
  const approval = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')

  assert.match(dashboard, /approveAllFixes/)
  assert.match(dashboard, /\/api\/hub\/operator\/audit\/approve-all/)
  assert.match(dashboard, /Approve all fixes/)
  assert.match(dashboard, /This is the only approval/)
  assert.doesNotMatch(dashboard, /RemediationBanner|Confirm & Push Pull Request|Open remediation PR|<PatchPreview/)

  assert.match(approval, /approve_audit_run_remediation_v2/)
  assert.match(approval, /runApprovedAuditRemediationWithRetry/)
  assert.match(system, /ensurePullRequest/)
  assert.match(system, /queueAutoMerge/)
  assert.match(system, /mergeCleanPullRequest/)
  assert.match(system, /finalize_audit_run_remediation_v2/)
})

test('the default AI path has no required duplicate consent or patch UI', () => {
  const executive = read('../components/audit/ExecutiveSummary.tsx')
  const stripe = read('../components/audit/StripeReport.tsx')

  assert.doesNotMatch(executive, /AuditFixConsent|acceptHref|actionableFindings/)
  assert.doesNotMatch(stripe, /PatchPreview|Generate fix|Confirm & Push Pull Request/)

  assert.equal(existsSync(url('../components/audit/RemediationBanner.tsx')), false)
  assert.equal(existsSync(url('../components/audit/AuditFixConsent.tsx')), false)
  assert.equal(existsSync(url('../components/audit/PatchPreview.tsx')), false)
  assert.equal(existsSync(url('../app/api/hub/operator/audit/patch/route.ts')), false)
})

test('remediation lifecycle does not present GitHub as a required next step', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')

  assert.match(lifecycle, /AI will merge automatically/)
  assert.doesNotMatch(lifecycle, /prUrl|prNumber|openPr|Open remediation PR|target="_blank"|href=/)
})

test('remediation lifecycle shows truthful dynamic progress and a real worker heartbeat', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')
  const approval = read('../app/api/hub/operator/audit/approve-all/route.ts')
  const heartbeat = read('../lib/audit/remediationHeartbeat.ts')
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')

  assert.match(lifecycle, /activityCheckedAt\?: string/)
  assert.match(lifecycle, /lifecycleUpdatedAt\?: string/)
  assert.match(lifecycle, /role="progressbar"/)
  assert.match(lifecycle, /aria-valuenow=\{progress\}/)
  assert.match(lifecycle, /window\.setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/)
  assert.match(lifecycle, /heartbeatAge > 45/)
  assert.match(lifecycle, /No recent system heartbeat/)
  assert.match(lifecycle, /sb-audit-progress-flow/)
  assert.match(lifecycle, /activity\.live &&/)
  assert.match(lifecycle, /prefers-reduced-motion/)

  assert.match(heartbeat, /HEARTBEAT_INTERVAL_MS = 20_000/)
  assert.match(heartbeat, /audit_remediation_heartbeat/)
  assert.match(heartbeat, /approved_remediation_worker/)
  assert.match(heartbeat, /\.eq\('payload->>kind', HEARTBEAT_KIND\)/)
  assert.match(retry, /recordApprovedRemediationHeartbeat/)
  assert.match(retry, /withWorkerHeartbeat/)

  assert.match(runs, /activityHeartbeatAt \|\| persistedHeartbeatAt/)
  assert.match(runs, /\.eq\('payload->>kind', HEARTBEAT_KIND\)/)
  assert.match(runs, /lifecycleUpdatedAt:/)
  assert.doesNotMatch(runs, /const checkedAt = new Date\(\)\.toISOString\(\)/)

  // Approval happens before the asynchronous worker can emit a real heartbeat.
  // It may truthfully report when activity was checked, but it must not fabricate a heartbeat.
  assert.match(approval, /activityCheckedAt: new Date\(\)\.toISOString\(\)/)
  assert.doesNotMatch(approval, /activityHeartbeatAt/)
  assert.doesNotMatch(approval, /const checkedAt = new Date\(\)\.toISOString\(\)/)
})

test('progress is stage-based and never pretends to know exact provider completion', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')

  assert.match(lifecycle, /function stageProgress/)
  assert.match(lifecycle, /status === 'checks_pending'\) return 55/)
  assert.match(lifecycle, /status === 'auto_merge_queued'\) return 75/)
  assert.match(lifecycle, /Stage changed/)
  assert.doesNotMatch(lifecycle, /Math\.random|setProgress\(|fakeProgress|simulatedProgress/)
})

test('remediation roadmap remains read-only in the default AI path', () => {
  const page = read('../app/hub/audit/remediation/page.tsx')
  const roadmap = read('../components/audit/RemediationRoadmap.tsx')

  assert.match(page, /Read-only remediation roadmap/)
  assert.doesNotMatch(page, /method:\s*'POST'|onChange=|finding-state[\s\S]*POST/)
  assert.match(roadmap, /Read-only remediation roadmap/)
  assert.doesNotMatch(roadmap, /FINDING_STATUSES|<select|<input|onChange\?|setOwnerDraft|useState/)
})

test('approval is durable and recovery does not ask the owner again', () => {
  const retry = read('../lib/audit/approvedRunRemediationRetry.ts')
  const cron = read('../app/api/cron/audit-approved-remediation/route.ts')
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')

  assert.match(retry, /runApprovedAuditRemediationSystem/)
  assert.doesNotMatch(retry, /approve_audit_run_remediation/)
  assert.match(cron, /runApprovedAuditRemediationWithRetry/)
  assert.match(runs, /recoverApprovedRun/)
  assert.doesNotMatch(runs, /approve_audit_run_remediation_v2/)
})

test('ONBOARD preserves governed AI execution and truthful status doctrine', () => {
  const onboard = read('../../ONBOARD.md')

  assert.match(onboard, /Never weaken evidence gates, private holdouts, authorization, tenant isolation or lifecycle rules merely to make a dashboard green/i)
  assert.match(onboard, /A branch is not Production\. A green build is not capability acceptance/i)
  assert.match(onboard, /Verify implementation and runtime behavior from code plus live evidence before diagnosing or reporting status/i)
})

test('failed GitHub checks and stalled stages never look actively pending', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')
  const system = read('../lib/audit/approvedRunRemediationSystem.ts')

  assert.match(system, /getCheckSummary/)
  assert.match(system, /checks\.state === 'failed'/)
  assert.match(system, /lifecycleStatus: 'checks_failed'/)
  assert.match(system, /updatePullRequestBranch/)
  assert.match(system, /lifecycleStatus: 'repairing'/)
  assert.match(system, /\.eq\('payload->>kind', 'audit_batch_remediation'\)/)
  assert.match(lifecycle, /status === 'checks_failed'/)
  assert.match(lifecycle, /changedAge > 900/)
  assert.match(lifecycle, /No forward progress — recovery required/)
  assert.match(lifecycle, /GitHub checks failed — AI repair required/)
})

test('completed remediation presents zero active findings while retaining audit evidence', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')

  assert.match(dashboard, /fixed\?: boolean/)
  assert.match(dashboard, /const findings = \(data\.findings as Finding\[\]\) \|\| \(log\?\.findings as Finding\[\]\) \|\| \[\]/)
  assert.match(dashboard, /filter\(finding => !finding\.fixed\)/)
  assert.match(dashboard, /value=\{String\(findings\.length\)\}/)
  assert.match(dashboard, /view\.status === 'remediated' \? copy\.remediatedClean : copy\.clean/)
  assert.match(dashboard, /\{findings\.length\} \{copy\.findings\}/)
  assert.match(dashboard, /status: 'remediated'/)
})
