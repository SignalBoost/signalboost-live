import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('audit reports explicitly ask whether the user wants AI-prepared fixes', () => {
  const consent = read('../components/audit/AuditFixConsent.tsx')

  for (const prompt of [
    'Would you like SignalBoost AI to prepare fixes for these issues?',
    '¿Quieres que SignalBoost AI prepare correcciones para estos problemas?',
    'Você quer que a SignalBoost AI prepare correções para estes problemas?',
    'Czy chcesz, aby SignalBoost AI przygotowała poprawki do tych problemów?',
    'Хотите, чтобы SignalBoost AI подготовил исправления для этих проблем?',
  ]) assert.ok(consent.includes(prompt), `missing localized consent prompt: ${prompt}`)

  for (const answer of [
    'Yes — prepare fixes', 'Not now',
    'Sí — preparar correcciones', 'Ahora no',
    'Sim — preparar correções',
    'Tak — przygotuj poprawki', 'Nie teraz',
    'Да — подготовить исправления', 'Не сейчас',
  ]) assert.ok(consent.includes(answer), `missing localized consent answer: ${answer}`)
})

test('the repository audit offers one final approval instead of per-finding approvals', () => {
  const executive = read('../components/audit/ExecutiveSummary.tsx')
  const banner = read('../components/audit/RemediationBanner.tsx')

  assert.match(executive, /import AuditFixConsent/)
  assert.match(executive, /const actionableFindings = data\.findings\.filter/)
  assert.match(executive, /!f\.evidenceRequired/)
  assert.match(executive, /\['resolved', 'accepted', 'wont_fix'\]\.includes\(f\.status\)/)
  assert.match(executive, /acceptHref="\/hub\/audit\/remediation"/)

  assert.match(banner, /Approve all fixes/)
  assert.match(banner, /This is the only approval required/)
  assert.match(banner, /\/api\/hub\/operator\/audit\/remediate/)
  assert.match(banner, /body: JSON\.stringify\(\{ runId: targetRunId \}\)/)
  assert.match(banner, /Final approval recorded/)
})

test('the informational consent component itself cannot mutate code, providers, or production', () => {
  const consent = read('../components/audit/AuditFixConsent.tsx')
  assert.doesNotMatch(consent, /fetch\(|XMLHttpRequest|stageInfrastructurePR|proposeInfrastructurePR|\/api\/hub\/action|method:\s*['"]POST['"]|confirmPush/i)
  assert.match(consent, /prepares a remediation plan only/)
  assert.match(consent, /until you review and approve the exact change/)
})

test('individual finding cards no longer create one branch per finding', () => {
  const patch = read('../components/audit/PatchPreview.tsx')

  assert.doesNotMatch(patch, /fetch\(|mode:\s*'preview'|mode:\s*'commit'|confirmPush|Confirm & Push Pull Request/)
  assert.match(patch, /Included in the one-time audit approval/)
  assert.match(patch, /No separate approval is required for this finding/)
  assert.match(patch, /audit-batch-remediation/)
})

test('Stripe webhook and repository findings retain the shared informational entry point', () => {
  const stripe = read('../components/audit/StripeReport.tsx')
  const dashboard = read('../app/dashboard/audit/page.tsx')

  assert.match(stripe, /import PatchPreview from '\.\/PatchPreview'/)
  assert.match(stripe, /messageKey\.startsWith\('audit\.finding\.stripeWebhook'\)/)
  assert.match(stripe, /file: 'saas\/app\/api\/webhook\/route\.ts'/)
  assert.match(dashboard, /<PatchPreview finding=\{selectedFinding\} \/>/)
})

test('single-finding patch generation remains grounded for compatibility callers', () => {
  const route = read('../app/api/hub/operator/audit/patch/route.ts')

  assert.match(route, /listRepoTree\(REPO, BRANCH\)/)
  assert.match(route, /findBadImports/)
  assert.match(route, /missingUseClient/)
  assert.match(route, /preservedFraction/)
  assert.match(route, /react-i18next is not installed/)
  assert.match(route, /MAX_ATTEMPTS = 2/)
  assert.match(route, /patch_validation_failed/)
})

test('stale single-finding previews cannot create misleading pull requests', () => {
  const route = read('../app/api/hub/operator/audit/patch/route.ts')

  assert.match(route, /finding_already_resolved/)
  assert.match(route, /patch_preview_stale/)
  assert.match(route, /contentHash\(current\.content\)/)
})

test('one approval groups all findings into one branch and one pull request', () => {
  const route = read('../app/api/hub/operator/audit/remediate/route.ts')

  assert.match(route, /function groupFindingsByFile/)
  assert.match(route, /MAX_BATCH_FILES = 60/)
  assert.match(route, /GENERATION_CONCURRENCY = 4/)
  assert.match(route, /const branch = `ai\/audit-run-\$\{runId\.replace/)
  assert.match(route, /commitFileToBranch\(\{/)
  assert.match(route, /queueAutoMerge\(prNumber\)/)
  assert.match(route, /approval: 'final'/)
  assert.match(route, /kind: 'audit_batch_remediation'/)
  assert.match(route, /This approval authorizes automatic merge/)
})

test('batch remediation keeps the scan snapshot separate from final approval state', () => {
  const runs = read('../app/api/hub/operator/audit/runs/route.ts')

  assert.match(runs, /function splitAuditPayloads/)
  assert.match(runs, /payload\.kind === 'audit_batch_remediation'/)
  assert.match(runs, /Array\.isArray\(payload\.findings\)/)
  assert.match(runs, /remediation: payloads\.remediation/)
})
