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

test('consent is visible in both live reports and repository-scan remediation', () => {
  const executive = read('../components/audit/ExecutiveSummary.tsx')
  const banner = read('../components/audit/RemediationBanner.tsx')

  assert.match(executive, /import AuditFixConsent/)
  assert.match(executive, /const actionableFindings = data\.findings\.filter/)
  assert.match(executive, /!f\.evidenceRequired/)
  assert.match(executive, /\['resolved', 'accepted', 'wont_fix'\]\.includes\(f\.status\)/)
  assert.match(executive, /acceptHref="\/hub\/audit\/remediation"/)

  assert.match(banner, /import AuditFixConsent/)
  assert.match(banner, /onAccept=\{scrollToFindings\}/)
  assert.match(banner, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/)
})

test('the consent step cannot mutate code, providers, or production', () => {
  const consent = read('../components/audit/AuditFixConsent.tsx')
  assert.doesNotMatch(consent, /fetch\(|XMLHttpRequest|stageInfrastructurePR|proposeInfrastructurePR|\/api\/hub\/action|method:\s*['"]POST['"]|confirmPush/i)
  assert.match(consent, /prepares a remediation plan only/)
  assert.match(consent, /until you review and approve the exact change/)
})

test('existing code-fix flow still requires preview before explicit pull-request confirmation', () => {
  const patch = read('../components/audit/PatchPreview.tsx')
  const previewCall = patch.indexOf("mode: 'preview'")
  const commitCall = patch.indexOf("mode: 'commit'")
  assert.ok(previewCall >= 0, 'preview phase missing')
  assert.ok(commitCall > previewCall, 'commit must remain after preview')
  assert.match(patch, /Confirm & Push Pull Request/)
  assert.match(patch, /onClick=\{confirmPush\}/)
})

test('Stripe webhook findings retain the shared preview component while the audit dashboard uses global approval', () => {
  const stripe = read('../components/audit/StripeReport.tsx')
  const dashboard = read('../app/dashboard/audit/page.tsx')

  assert.match(stripe, /import PatchPreview from '\.\/PatchPreview'/)
  assert.match(stripe, /messageKey\.startsWith\('audit\.finding\.stripeWebhook'\)/)
  assert.match(stripe, /file: 'saas\/app\/api\/webhook\/route\.ts'/)
  assert.match(dashboard, /approveAllFixes/)
  assert.doesNotMatch(dashboard, /<PatchPreview finding=\{selectedFinding\} \/>/)
})

test('audit patch generation is grounded in real repository modules before preview', () => {
  const route = read('../app/api/hub/operator/audit/patch/route.ts')
  const patch = read('../components/audit/PatchPreview.tsx')

  assert.match(route, /listRepoTree\(REPO, BRANCH\)/)
  assert.match(route, /findBadImports/)
  assert.match(route, /missingUseClient/)
  assert.match(route, /preservedFraction/)
  assert.match(route, /react-i18next is not installed/)
  assert.match(route, /MAX_ATTEMPTS = 2/)
  assert.match(route, /patch_validation_failed/)
  assert.match(patch, /category: finding\.category/)
})

test('stale audit findings and stale previews cannot create misleading pull requests', () => {
  const route = read('../app/api/hub/operator/audit/patch/route.ts')
  const patch = read('../components/audit/PatchPreview.tsx')

  assert.match(route, /finding_already_resolved/)
  assert.match(route, /patch_preview_stale/)
  assert.match(route, /contentHash\(current\.content\)/)
  assert.match(patch, /baseHash: data\.baseHash/)
  assert.match(patch, /baseHash: preview\.baseHash/)
  assert.match(patch, /phase === 'resolved'/)
})

test('approved audit findings include four localized values plus the English fallback', () => {
  const rootCatalog = read('../../lib/i18n/approvedAuditRemediationCopy.ts')
  const saasCatalog = read('../lib/i18n/approvedAuditRemediationCopy.ts')
  const rootLocalizedText = read('../../components/i18n/LocalizedText.tsx')
  const saasLocalizedText = read('../components/i18n/LocalizedText.tsx')

  const rootPhrases = [
    'No dead cards: every subsystem links here with state, root cause, routing mode, and approval gate.',
    'Raw performance, regional reach, and milestone-ready notifications',
  ]
  const saasPhrases = [
    'No live governance telemetry returned yet.',
    'No verified free newspaper, magazine, or publication contact is recorded. Automated campaigns should stop here unless the user explicitly asked for paid advertising.',
    'Mark submitted to publisher',
    'Social Outreach Connector Cockpit',
    'Admin access required.',
    'Fully Autonomous Hybrid-Dynamic COS Router',
    'Failing nodes and autonomous reroute paths',
    'Informational early warnings',
    'No fix attempts required.',
    'No life-critical escalation. Ordinary issues are handled autonomously.',
    'Full lifecycle visibility',
    'Blueprint output',
    'Build provider-backed, approval-aware integration blueprints with searchable metadata, dynamic provider schemas, no-code endpoint selection, and a live JSON compiler.',
    'Test Integration',
    'Integration Name',
    'HTTP Method',
    'Save mapping',
  ]

  for (const lang of ['es', 'pt', 'pl', 'ru']) {
    assert.match(rootCatalog, new RegExp(`\\b${lang}: \\{`))
    assert.match(saasCatalog, new RegExp(`\\b${lang}: \\{`))
  }
  for (const phrase of rootPhrases) {
    assert.equal(rootCatalog.split(phrase).length - 1, 4, `root phrase must have ES/PT/PL/RU values: ${phrase}`)
  }
  for (const phrase of saasPhrases) {
    assert.equal(saasCatalog.split(phrase).length - 1, 4, `SaaS phrase must have ES/PT/PL/RU values: ${phrase}`)
  }
  for (const component of [rootLocalizedText, saasLocalizedText]) {
    assert.match(component, /approvedAuditRemediationText\(lang, fallback\) \?\? auditUiText\(lang, fallback\)/)
  }
})
