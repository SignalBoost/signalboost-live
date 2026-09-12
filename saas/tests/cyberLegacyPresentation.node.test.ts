import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cyberReportPresentationCopy, dependencyRescanUrl, unclassifiedAdvisoryCount, cyberProductText } from '../lib/cyber/cyberReportPresentation.ts'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const copy = { ...cyberReportPresentationCopy('en'), statuses: {}, approvePlan: 'Approve plan', approvalNotRequired: 'No approval pending', yes: 'yes', no: 'no', humanApproved: 'Human approved', approvedLabel: 'Approved', fixPlan: 'Fix plan', planFirst: 'Plan first', prepareDescription: 'Current routine preparation policy', planSummary: 'Saved dependency plan', noTargetVersion: 'Target not confirmed', prepareFixPlan: 'Prepare fix plan' }
const approval = (r: any) => r.status === 'awaiting_human_review' && r.human_approval_required !== false && r.human_approved !== true

function page(report: any = null, history: any[] = []) {
  const source = readFileSync(new URL('../app/dashboard/cybersecurity/page.tsx', import.meta.url), 'utf8')
    + '\nexport { RemediationCard, IssueReviewReport, recommendedAction };\n'
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} as any }
  let stateIndex = 0
  const jsx = (type: any, props: any) => ({ type, props })
  const imports = (spec: string) => {
    if (spec === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
    if (spec === 'react') return { useEffect: () => {}, useState: (initial: any) => { const i = stateIndex++; return [i === 11 ? report : i === 13 ? history : initial, () => {}] } }
    if (spec === '@/components/i18n/useTranslation') return { useTranslation: () => ({ lang: 'en', t: (_k: string, f: string) => f }) }
    if (spec === '@/components/cybersecurity/CyberActivityPanel') return { default: () => null }
    if (spec === '@/lib/i18n/uiText') return { uiText: (s: string) => s }
    if (spec === '@/lib/cyber/remediationAutonomyCopy') return { remediationAutonomyCopy: () => copy }
    if (spec === '@/lib/cyber/dependencyRemediationPolicy') return {
      needsHumanApproval: approval, isTerminalRemediation: (r: any) => ['completed', 'cancelled', 'rejected'].includes(r.status),
      eligibleDependencyTarget: (a: string, b: string) => /^\d+\.\d+\.\d+$/.test(b) && a.split('.')[0] === b.split('.')[0] && b.localeCompare(a, undefined, { numeric: true }) > 0,
      partitionRemediationRequests: () => ({ pending: [], active: [], history: [] }),
    }
    if (spec === '@/lib/cyber/cyberReportPresentation') return { cyberReportPresentationCopy, dependencyRescanUrl, unclassifiedAdvisoryCount, cyberProductText }
    throw new Error(`Unexpected import ${spec}`)
  }
  new Function('require', 'module', 'exports', output)(imports, module, module.exports)
  return module.exports
}
function expand(node: any): any {
  if (Array.isArray(node)) return node.map(expand)
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') return expand(node.type(node.props))
  return { ...node, props: { ...node.props, children: expand(node.props?.children) } }
}
function text(node: any, includeClosed = false): string {
  if (Array.isArray(node)) return node.map(x => text(x, includeClosed)).join(' ')
  if (!node || typeof node === 'boolean') return ''
  if (typeof node !== 'object') return String(node)
  const children = node.props?.children
  if (node.type === 'details' && !node.props.open && !includeClosed) return text((Array.isArray(children) ? children : [children]).filter(x => x?.type === 'summary'), includeClosed)
  return text(children, includeClosed)
}
function buttons(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(buttons)
  if (!node || typeof node !== 'object') return []
  return [...(node.type === 'button' ? [node] : []), ...buttons(node.props?.children)]
}
const legacy = () => ({ id: 'old', source_area: 'cybersecurity', source_type: 'dependency_scan', repo: 'SignalBoost/signalboost-live', title: 'Saved plan', summary: 'Human approval is required before PR preparation.', status: 'approved', human_approval_required: true, human_approved: true, fix_plan_approved: false, fix_plan_status: 'ready_for_review', created_at: '2026-06-25T17:53:39Z', fix_plan: { summary: 'Original plan summary', safetyControls: ['Creating a PR requires explicit human authorization.'], proposedChanges: [{ packageName: 'postcss', currentVersion: '8.4.31' }] } })
function card(row: any, onReassess = () => {}) {
  return expand(page().RemediationCard({ r: row, loading: false, copy, onApprove: () => { throw new Error('Unexpected approval') }, onApprovePlan: () => { throw new Error('Unexpected approval') }, onPreparePlan: () => {}, onReject: () => {}, onDisposition: () => {}, onReassess }))
}

test('the reported approved June plan cannot display an actionable Approve plan beside No approval pending', () => {
  let rescans = 0
  const tree = card(legacy(), () => rescans++)
  const controls = buttons(tree)
  assert.equal(controls.some(x => text(x) === 'Approve plan'), false)
  const rescan = controls.find(x => text(x) === copy.reassess)
  assert.ok(rescan)
  rescan.props.onClick()
  assert.equal(rescans, 1)
})

test('historical approval wording is retained in a labelled closed archive, not rendered as current instructions', () => {
  const row = legacy()
  const before = JSON.stringify(row)
  const tree = card(row)
  assert.doesNotMatch(text(tree), /Human approval is required|explicit human authorization/)
  assert.match(text(tree), /historical/)
  assert.match(text(tree, true), /Human approval is required|explicit human authorization/)
  assert.equal(JSON.stringify(row), before)
})

test('completed dependency history and malformed repository identities expose no actionable reassessment', () => {
  assert.equal(buttons(card({ ...legacy(), status: 'completed' })).length, 0)
  for (const repo of ['other/repo/../../secret', 'other/..', './repo', 'other/.'])
    assert.equal(dependencyRescanUrl({ ...legacy(), repo }), null)
  assert.equal(dependencyRescanUrl({ ...legacy(), source_type: 'guardian_repository_change' }), null)
})

test('unclassified severity is visible in the report, dashboard metrics and saved scan history', () => {
  const report = { generatedAt: '2026-09-11T23:13:48Z', repo: 'SignalBoost/signalboost-live', advisories: [{ id: 'GHSA-test', packageName: 'example', version: '1.2.3', sourceFile: 'package.json', severity: 'unknown', summary: 'Details unavailable' }], summary: { packagesScanned: 1, advisories: 1, critical: 0, high: 0, medium: 0, low: 0, unknown: 1 } }
  const p = page(report, [{ id: 'scan', unknown: 1, critical: 0, high: 0 }])
  const reportTree = expand(p.IssueReviewReport({ report, copy, onDownloadPdf: () => {}, onPrint: () => {}, pdfLoading: false }))
  assert.match(text(reportTree), /unclassified severity|Unclassified severity/)
  assert.match(text(reportTree), /Zero critical\/high counts do not mean/)
  const dashboard = text(expand(p.default()))
  assert.ok(dashboard.split(copy.unknownSeverity).length >= 3)
})

test('current advisory recommendations never suggest a downgrade from an unrelated earlier fixed range', () => {
  const action = page().recommendedAction({ packageName: 'example', version: '1.2.3', fixedVersions: ['1.0.9', '1.2.4'] }, copy)
  assert.match(action, /1\.2\.4/)
  assert.doesNotMatch(action, /1\.0\.9/)
})

test('historical-policy and severity disclosures are present in all five languages', () => {
  const keys = Object.keys(cyberReportPresentationCopy('en')).sort()
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    assert.deepEqual(Object.keys(cyberReportPresentationCopy(lang)).sort(), keys)
    assert.ok(Object.values(cyberReportPresentationCopy(lang)).every(v => typeof v === 'string' && v.length > 0))
    if (lang !== 'en') assert.notEqual(cyberReportPresentationCopy(lang).severityWarning, copy.severityWarning)
  }
})


test('routine verification blockers stay visible and Guardian review controls are preserved', () => {
  const routine = { ...legacy(), human_approval_required: false, human_approved: false, status: 'in_progress', summary: 'Routine plan recorded', implementation_notes: 'fresh_scan_evidence_required' }
  assert.match(text(card(routine)), /fresh_scan_evidence_required/)
  const guardian = { ...legacy(), source_type: 'guardian_repository_change', status: 'in_progress' }
  assert.equal(buttons(card(guardian)).length, 3)
  assert.equal(buttons(card(guardian)).some(x => text(x) === copy.reassess), false)
})


test('reassessment retains the exact saved branch and subpath without rewriting its record', () => {
  for (const suffix of ['/tree/release/packages/app', '/blob/release/package.json', '/tree/release']) {
    const target = `https://github.com/SignalBoost/signalboost-live${suffix}`
    const row = { ...legacy(), target }
    const before = JSON.stringify(row)
    assert.equal(dependencyRescanUrl(row), target)
    assert.equal(JSON.stringify(row), before)
  }
  assert.equal(dependencyRescanUrl({ ...legacy(), target: 'SignalBoost/signalboost-live' }), 'https://github.com/SignalBoost/signalboost-live')
})

test('an invalid explicit reassessment target fails closed instead of falling back to the full repository', () => {
  for (const target of [
    'https://github.com/other/repo/tree/release',
    'https://github.com/SignalBoost/signalboost-live/tree/release/../private',
    'https://github.com/SignalBoost/signalboost-live/tree/release/%2e%2e/private',
    'https://github.com/SignalBoost/signalboost-live/tree',
    'https://github.com/SignalBoost/signalboost-live/issues/1',
    'https://user:secret@github.com/SignalBoost/signalboost-live',
    'https://github.com.evil.example/SignalBoost/signalboost-live',
    'https://itmounts.com',
  ]) assert.equal(dependencyRescanUrl({ ...legacy(), target }), null, target)
  assert.equal(dependencyRescanUrl({ ...legacy(), target: null }), 'https://github.com/SignalBoost/signalboost-live')
})


test('saved remediation prose displays iTMounts without changing the historical record or links', () => {
  const row = {
    ...legacy(),
    title: 'SignalBoost remediation plan: SignalBoost/signalboost-live',
    summary: 'SignalBoost prepared a proposed remediation plan for 1 dependency advisory finding(s). Human approval is required before PR preparation or any code change.',
    implementation_notes: 'SignalBoost prepared https://github.com/SignalBoost/signalboost-live/pull/1',
    pull_request_url: 'https://github.com/SignalBoost/signalboost-live/pull/1',
    fix_plan: {
      summary: 'SignalBoost prepared a remediation plan. No code has been changed.',
      proposedChanges: [{ packageName: 'postcss', currentVersion: '8.4.31', proposedAction: 'SignalBoost will verify the compatible version.' }],
      validationSteps: ['SignalBoost must run the tests.'],
      safetyControls: ['SignalBoost must preserve the approval boundary.'],
    },
  }
  const freeze = (value: any): any => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
    return value
  }
  freeze(row)
  const before = JSON.stringify(row)
  const tree = card(row)
  const visible = text(tree, true)
  assert.match(visible, /iTMounts prepared a proposed remediation plan/)
  assert.match(visible, /iTMounts prepared a remediation plan/)
  assert.match(visible, /iTMounts remediation plan: SignalBoost\/signalboost-live/)
  assert.match(visible, /iTMounts will verify/)
  assert.match(visible, /iTMounts must run the tests/)
  assert.match(visible, /iTMounts must preserve the approval boundary/)
  assert.match(visible, /iTMounts prepared https:\/\/github.com\/SignalBoost\/signalboost-live\/pull\/1/)
  assert.match(visible, /Human approval is required before PR preparation/)
  assert.match(visible, /Stored records and approval history are unchanged/)
  assert.doesNotMatch(visible, /SignalBoost prepared|SignalBoost must|SignalBoost will/)
  const links = (n: any): any[] => Array.isArray(n) ? n.flatMap(links) : !n || typeof n !== 'object' ? [] : [...(n.type === 'a' ? [n.props.href] : []), ...links(n.props?.children)]
  assert.ok(links(tree).includes(row.pull_request_url))
  assert.equal(JSON.stringify(row), before)
  assert.equal(buttons(tree).some(n => text(n) === 'Approve plan'), false)
})

test('routine and completed remediation prose also uses the current brand without changing decisions', () => {
  for (const status of ['in_progress', 'completed']) {
    const row = { ...legacy(), status, human_approval_required: false, human_approved: false,
      summary: 'User requested SignalBoost remediation assistance.',
      implementation_notes: 'SignalBoost prepared the proposal, not a deployment.',
      fix_plan: { summary: 'SIGNALBOOST AI prepared a plan.' } }
    const before = JSON.stringify(row)
    const tree = card(row)
    const visible = text(tree, true)
    assert.match(visible, /User requested iTMounts remediation assistance/)
    assert.match(visible, /iTMounts prepared a plan/)
    assert.match(visible, /iTMounts prepared the proposal, not a deployment/)
    assert.equal(JSON.stringify(row), before)
    assert.equal(buttons(tree).length, status === 'completed' ? 0 : 1)
    if (status === 'completed') assert.match(visible, /Stored records and approval history are unchanged/)
  }
})

test('display branding preserves technical identities, URLs, email addresses and code', () => {
  for (const technical of [
    'SignalBoost/signalboost-live', 'signalboost/signalboost-live',
    'https://github.com/SignalBoost/signalboost-live?label=SignalBoost#SignalBoost',
    'https://saas.signalboostapp.com', 'mailto:SignalBoost@example.com',
    'SignalBoost@example.com', 'ops@SignalBoost.com', 'git@github.com:SignalBoost/signalboost-live.git',
    'signalboost-live', 'SIGNALBOOST_API_KEY', 'SignalBoost.ts', 'SignalBoost.com',
    'src/SignalBoost', 'C:\\SignalBoost\\project', '`SignalBoost`',
  ]) assert.equal(cyberProductText(technical), technical, technical)
  const prose = 'SignalBoost prepared SignalBoost/signalboost-live; SignalBoost AI verified https://github.com/SignalBoost/signalboost-live.'
  assert.equal(cyberProductText(prose), 'iTMounts prepared SignalBoost/signalboost-live; iTMounts verified https://github.com/SignalBoost/signalboost-live.')
})

test('display branding handles legacy casing and prose in all five supported languages', () => {
  for (const legacyName of ['SignalBoost', 'SIGNALBOOST', 'signalboost', 'SignalBoostAi', 'SignalBoost AI', 'signalboost ai']) {
    for (const [before, after] of [['', ' prepared a plan.'], ['', ' preparó un plan.'], ['', ' preparou um plano.'], ['', ' przygotował plan.'], ['Платформа ', ' подготовила план.']]) {
      assert.equal(cyberProductText(`${before}${legacyName}${after}`), `${before}iTMounts${after}`)
    }
  }
  assert.equal(cyberProductText('(SignalBoost). SignalBoost: plan'), '(iTMounts). iTMounts: plan')
  assert.equal(cyberProductText(undefined), '')
  assert.equal(cyberProductText(null), '')
  assert.equal(cyberProductText('iTMounts'), 'iTMounts')
  for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) assert.match(cyberReportPresentationCopy(lang).brandDisplayNotice, /iTMounts/)
})


test('product adjectives normalize without rewriting hyphenated technical identifiers', () => {
  for (const adjective of ['powered', 'assisted', 'driven', 'generated', 'managed', 'enabled', 'based', 'backed', 'led']) {
    for (const name of ['SignalBoost', 'SIGNALBOOST AI', 'SignalBoostAi']) {
      assert.equal(cyberProductText(`${name}-${adjective} remediation`), `iTMounts-${adjective} remediation`)
    }
  }
  for (const technical of ['signalboost-live', 'signalboost-api', 'signalboost-worker', 'signalboost-powered.ts', 'src/SignalBoost-powered', '`SignalBoost-powered`', 'https://example.com/SignalBoost-powered']) {
    assert.equal(cyberProductText(technical), technical)
  }
})


test('complete tagged and quoted email tokens are preserved before prose normalization', () => {
  const addresses = [
    'SignalBoost+alerts@example.com', 'SignalBoost!alerts@example.com',
    'SignalBoost%alerts@example.com', 'SignalBoost=alerts@example.com',
    'SignalBoost#alerts@example.com', 'SignalBoost$alerts@example.com',
    'SignalBoost&alerts@example.com', "SignalBoost'alerts@example.com",
    'SignalBoost*alerts@example.com', 'SignalBoost/alerts@example.com',
    'SignalBoost?alerts@example.com', 'SignalBoost^alerts@example.com',
    'SignalBoost`alerts@example.com', 'SignalBoost{alerts}@example.com',
    'SignalBoost|alerts@example.com', 'SignalBoost~alerts@example.com',
    'SignalBoost.alerts@example.com', 'SignalBoost+alerts@przykład.pl',
    '"SignalBoost Alerts"@example.com', '"SignalBoost+alerts"@[127.0.0.1]',
    'mailto:SignalBoost+alerts@example.com',
  ]
  for (const address of addresses) {
    assert.equal(cyberProductText(address), address)
    assert.equal(cyberProductText(`SignalBoost prepared a message for ${address}.`), `iTMounts prepared a message for ${address}.`)
  }
})

test('email shielding ends at sentence punctuation before adjacent product prose', () => {
  for (const address of ['SignalBoost@example.com', 'SignalBoost+alerts@przykład.pl', '"SignalBoost Alerts"@[IPv6:2001:db8::1]', 'mailto:SignalBoost@example.com']) {
    for (const separator of ['—', '–', ',', ';', '!', '?', ')', '。']) {
      assert.equal(cyberProductText(`${address}${separator}SignalBoost prepared a plan`), `${address}${separator}iTMounts prepared a plan`)
    }
  }
})

test('unlisted descriptive product compounds normalize while known technical names stay exact', () => {
  for (const suffix of ['created', 'provided', 'verified', 'supported', 'authored', 'created-and-verified', 'gerado', 'generado', 'wygenerowany']) {
    for (const name of ['SignalBoost', 'SIGNALBOOST AI', 'SignalBoostAi']) {
      assert.equal(cyberProductText(`${name}-${suffix} remediation`), `iTMounts-${suffix} remediation`)
    }
  }
  for (const technical of ['SignalBoost-live', 'SIGNALBOOST-API', 'signalboost-worker', 'signalboost-live-worker', 'src/SignalBoost-created', 'SignalBoost-created.ts', 'SIGNALBOOST_CREATED', '`SignalBoost-created`']) {
    assert.equal(cyberProductText(technical), technical)
  }
})

test('matching multi-backtick code spans protect their entire contents', () => {
  for (const delimiter of ['`', '``', '```', '````']) {
    const code = `${delimiter}SignalBoost${delimiter}`
    assert.equal(cyberProductText(`${code} — SignalBoost prepared a plan`), `${code} — iTMounts prepared a plan`)
  }
  for (const code of ['``SignalBoost `example` SignalBoost-created``', '```\nSignalBoost\n```', '````SignalBoost ``` inner``` SignalBoost````']) {
    assert.equal(cyberProductText(code), code)
  }
})

test('saved-card rendering applies edge-case branding without mutating evidence or technical tokens', () => {
  const row = { ...legacy(),
    summary: 'SignalBoost@example.com—SignalBoost-created remediation with ``SignalBoost`` code.',
    implementation_notes: 'SignalBoost-provided guidance for SignalBoost/signalboost-live.',
  }
  const before = JSON.stringify(row)
  const visible = text(card(row), true)
  assert.match(visible, /SignalBoost@example\.com—iTMounts-created remediation with ``SignalBoost`` code\./)
  assert.match(visible, /iTMounts-provided guidance for SignalBoost\/signalboost-live\./)
  assert.equal(JSON.stringify(row), before)
})

test('mailto link query parameters remain technical text rather than product prose', () => {
  for (const link of [
    'mailto:SignalBoost@example.com?subject=SignalBoost&body=SignalBoost-created',
    'mailto:?subject=SignalBoost',
    'mailto:SignalBoost@example.com,SignalBoost+alerts@example.net?subject=SignalBoost',
  ]) {
    assert.equal(cyberProductText(link), link)
    assert.equal(cyberProductText(`${link} — SignalBoost prepared a plan`), `${link} — iTMounts prepared a plan`)
  }
})

test('natural-language punctuation after a URL does not shield following product prose', () => {
  for (const link of ['https://example.com', 'https://example.com/SignalBoost?label=SignalBoost#SignalBoost', 'mailto:SignalBoost@example.com?subject=SignalBoost']) {
    for (const punctuation of ['—', '–', '，', '；', '。', '！', '？']) {
      assert.equal(cyberProductText(`${link}${punctuation}SignalBoost prepared a plan`), `${link}${punctuation}iTMounts prepared a plan`)
    }
  }
  const encoded = 'https://example.com/SignalBoost%E2%80%94SignalBoost?q=SignalBoost%EF%BC%8CSignalBoost'
  assert.equal(cyberProductText(encoded), encoded)
})

test('ASCII sentence punctuation after a bare URL does not swallow product prose', () => {
  for (const link of ['https://example.com', 'https://github.com/SignalBoost/signalboost-live']) {
    for (const punctuation of [',', ';', '!', '?', ')']) {
      for (const name of ['SignalBoost', 'SignalBoostAi', 'SignalBoost AI', 'SignalBoost-created']) {
        const branded = name.endsWith('-created') ? 'iTMounts-created' : 'iTMounts'
        assert.equal(cyberProductText(`${link}${punctuation}${name} prepared a plan`), `${link}${punctuation}${branded} prepared a plan`)
      }
    }
  }
  // URI data, not sentence prose: preserve standalone tokens and query/fragment values.
  for (const link of ['https://example.com?SignalBoost', 'https://example.com/path/SignalBoost,SignalBoost', 'https://example.com?tags=SignalBoost,SignalBoost', 'https://example.com#SignalBoost,SignalBoost']) {
    assert.equal(cyberProductText(link), link)
  }
  for (const link of ['https://example.com?tags=SignalBoost,SignalBoost', 'https://example.com#SignalBoost,SignalBoost']) {
    assert.equal(cyberProductText(`${link} reference for SignalBoost`), `${link} reference for iTMounts`)
  }
})

test('the reported recipient-free mailto header stops before dash-separated prose', () => {
  assert.equal(cyberProductText('mailto:?subject=Status—SignalBoost prepared a plan'), 'mailto:?subject=Status—iTMounts prepared a plan')
})

test('Guardian next steps and finding prose normalize without rewriting technical evidence or decisions', () => {
  for (const status of ['in_progress', 'completed']) {
    const row = { ...legacy(), source_type: 'guardian_repository_change', status,
      human_approval_required: false, human_approved: false,
      findings: [{ summary: 'SignalBoost observed an authorized change.', sensitivePaths: ['src/SignalBoost.ts'], evidenceReference: 'github:SignalBoost/signalboost-live' }],
      fix_plan: { nextStep: 'SignalBoost must review SignalBoost/signalboost-live; not a code-change authorization.' },
    }
    const before = JSON.stringify(row)
    const tree = card(row)
    const visible = text(tree, true)
    assert.match(visible, /iTMounts must review SignalBoost\/signalboost-live/)
    assert.match(visible, /iTMounts observed an authorized change/)
    assert.match(visible, /src\/SignalBoost\.ts/)
    assert.match(visible, /github:SignalBoost\/signalboost-live/)
    assert.equal(buttons(tree).length, status === 'in_progress' ? 3 : 0)
    if (status === 'completed') assert.match(visible, /Stored records and approval history are unchanged/)
    assert.equal(JSON.stringify(row), before)
  }
})
