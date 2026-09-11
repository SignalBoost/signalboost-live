import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cyberReportPresentationCopy, dependencyRescanUrl, unclassifiedAdvisoryCount } from '../lib/cyber/cyberReportPresentation.ts'
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
    if (spec === '@/lib/cyber/cyberReportPresentation') return { cyberReportPresentationCopy, dependencyRescanUrl, unclassifiedAdvisoryCount }
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
