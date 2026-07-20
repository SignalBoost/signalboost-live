import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const url = (path: string) => new URL(path, import.meta.url)
const read = (path: string) => readFileSync(url(path), 'utf8')

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

test('duplicate consent and manual patch surfaces are permanently removed', () => {
  const executive = read('../components/audit/ExecutiveSummary.tsx')
  const stripe = read('../components/audit/StripeReport.tsx')

  assert.doesNotMatch(executive, /AuditFixConsent|acceptHref|actionableFindings/)
  assert.doesNotMatch(stripe, /PatchPreview|Generate fix|Confirm & Push Pull Request/)

  assert.equal(existsSync(url('../components/audit/RemediationBanner.tsx')), false)
  assert.equal(existsSync(url('../components/audit/AuditFixConsent.tsx')), false)
  assert.equal(existsSync(url('../components/audit/PatchPreview.tsx')), false)
  assert.equal(existsSync(url('../app/api/hub/operator/audit/patch/route.ts')), false)
})

test('remediation lifecycle is status-only and exposes no GitHub action', () => {
  const lifecycle = read('../components/audit/RemediationLifecyclePanel.tsx')

  assert.match(lifecycle, /No further action is required/)
  assert.match(lifecycle, /AI will merge automatically/)
  assert.doesNotMatch(lifecycle, /prUrl|prNumber|openPr|Open remediation PR|target="_blank"|href=/)
})

test('remediation roadmap is read-only and cannot assign manual work', () => {
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

test('ONBOARD defines approval-only autonomous remediation and forbids human PR UI', () => {
  const onboard = read('../../ONBOARD.md')

  assert.match(onboard, /one run-scoped owner approval/i)
  assert.match(onboard, /AI creates the protected branch and internal pull request/i)
  assert.match(onboard, /waits for required checks, merges automatically, verifies the result/i)
  assert.match(onboard, /must not expose a human GitHub PR review button/i)
  assert.match(onboard, /per-finding patch preview/i)
  assert.match(onboard, /assignment, owner, or due-date controls/i)
  assert.match(onboard, /without asking the owner to approve again/i)
})
