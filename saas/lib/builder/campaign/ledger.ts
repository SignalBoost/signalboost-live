// saas/lib/builder/campaign/ledger.ts
//
// THE CAMPAIGN LEDGER: one row per catalog item, every field the brief's evidence package requires (Section 13),
// and the completion decision (Section 14). PASS only on the item's own evidence; a skipped, timed-out or partial
// check is never PASS; an item the host cannot execute is BLOCKED with the cause. Pure, zero imports.

import type { CampaignItem } from './catalog.ts'

export type CampaignVerdict = 'PASS' | 'FAIL' | 'BLOCKED'

export type CampaignEvidence = Readonly<{
  kind: 'model_call' | 'http' | 'browser' | 'record' | 'fixture' | 'check_run' | 'note'
  label: string
  /** Credential-free, customer-free detail: receipts, ids, timings, finish reasons, pass/fail counts. */
  detail: string
}>

export type CampaignLedgerRow = Readonly<{
  testId: string
  title: string
  productionCommit: string | null
  executedAt: string
  finishedAt: string
  scenario: string
  expected: string
  actual: string
  verdict: CampaignVerdict
  correlationId: string | null
  evidence: readonly CampaignEvidence[]
  failureCause: string | null
  repairPr: string | null
  retest: Readonly<{ verdict: CampaignVerdict; actual: string; finishedAt: string }> | null
}>

export type CampaignLedger = Readonly<{
  campaignId: string
  /** The revision the live site reported serving the campaign's first request. */
  productionCommit: string | null
  mainCommit: string | null
  /** Revisions the live site reported after the first one differed: production changed during the campaign. */
  revisionChanges: readonly string[]
  startedAt: string
  rows: readonly CampaignLedgerRow[]
}>

export type CampaignCertification = Readonly<{
  outcome: CampaignVerdict
  passed: number
  failed: number
  blocked: number
  pending: number
  total: number
  /** Section 14: production behaviour must match the tested release. */
  deployedMatchesMain: boolean | null
  /** The live site changed revision while the campaign ran; its evidence spans more than one release. */
  productionChanged: boolean
}>

/** The verdict a row carries after a retest, if one ran. */
export function effectiveVerdict(row: CampaignLedgerRow): CampaignVerdict {
  return row.retest?.verdict ?? row.verdict
}

export function certifyCampaign(ledger: CampaignLedger, catalog: readonly CampaignItem[]): CampaignCertification {
  const byId = new Map(ledger.rows.map(row => [row.testId, row]))
  let passed = 0, failed = 0, blocked = 0, pending = 0
  for (const item of catalog) {
    const row = byId.get(item.id)
    if (!row) { pending++; continue }
    const verdict = effectiveVerdict(row)
    if (verdict === 'PASS') passed++
    else if (verdict === 'FAIL') failed++
    else blocked++
  }
  const deployedMatchesMain = ledger.productionCommit && ledger.mainCommit ? ledger.productionCommit === ledger.mainCommit : null
  const productionChanged = ledger.revisionChanges.length > 0
  const total = catalog.length
  // Section 14: certified PASS only when every mandatory case meets its criteria, production matches the release,
  // and the release did not change under the campaign.
  const outcome: CampaignVerdict = failed > 0 ? 'FAIL'
    : (blocked > 0 || pending > 0 || deployedMatchesMain !== true || productionChanged) ? 'BLOCKED'
    : 'PASS'
  return { outcome, passed, failed, blocked, pending, total, deployedMatchesMain, productionChanged }
}

export function pendingItems(ledger: CampaignLedger, catalog: readonly CampaignItem[]): CampaignItem[] {
  const done = new Set(ledger.rows.map(row => row.testId))
  return catalog.filter(item => !done.has(item.id))
}

function line(label: string, value: string | null | undefined): string {
  return `${label}: ${value && String(value).trim() ? String(value).trim() : '—'}`
}

/** The Section 13 evidence package, one block per item, then the Section 14 decision. Plain text, no internals. */
/** How a run is scoped: a targeted run covers some of the campaign's checks and is never a certification. */
export type CampaignRunScope = Readonly<{ targeted: boolean; campaignSize: number }>

const FULL_RUN = (catalog: readonly CampaignItem[]): CampaignRunScope => ({ targeted: false, campaignSize: catalog.length })

function runLabel(ledger: CampaignLedger, catalog: readonly CampaignItem[], scope: CampaignRunScope): string {
  return scope.targeted
    ? `Targeted run of ${catalog.map(item => item.id).join(', ')} (${catalog.length} of ${scope.campaignSize} checks of ${ledger.campaignId})`
    : `Verification campaign ${ledger.campaignId}`
}

/**
 * The live status a running campaign shows after every finished check: how many are done, and every failure so far
 * with its cause, so the first failure is visible the moment it is recorded instead of at the end of the run.
 */
export function renderCampaignProgress(ledger: CampaignLedger, catalog: readonly CampaignItem[], scope: CampaignRunScope = FULL_RUN(catalog), reliability: Readonly<{ completed: number; required: number }> | null = null): string {
  const certification = certifyCampaign(ledger, catalog)
  const inCatalog = new Set(catalog.map(item => item.id))
  const problems = ledger.rows.filter(row => inCatalog.has(row.testId) && effectiveVerdict(row) !== 'PASS')
  const done = certification.total - certification.pending
  return [
    `${runLabel(ledger, catalog, scope)} in progress: ${done} of ${certification.total} checks done (${certification.passed} PASS, ${certification.failed} FAIL, ${certification.blocked} BLOCKED).`,
    ...(reliability ? [`Reliability loop: ${reliability.completed} of ${reliability.required} requests completed.`] : []),
    ...(problems.length ? ['Not passing so far:', ...problems.map(row => `- ${row.testId} ${row.title}: ${effectiveVerdict(row)}, ${(row.failureCause || row.actual).slice(0, 240)}`)] : []),
    'It continues in the background; the full evidence package will appear here when it finishes.',
  ].join('\n')
}

export function renderCampaignReport(ledger: CampaignLedger, catalog: readonly CampaignItem[], scope: CampaignRunScope = FULL_RUN(catalog)): string {
  const certification = certifyCampaign(ledger, catalog)
  const byId = new Map(ledger.rows.map(row => [row.testId, row]))
  const blocks = catalog.map(item => {
    const row = byId.get(item.id)
    if (!row) return [`${item.id} — ${item.title}`, line('Status', 'NOT RUN')].join('\n')
    const verdict = effectiveVerdict(row)
    return [
      `${item.id} — ${item.title}`,
      line('Status', verdict),
      line('Production commit', row.productionCommit),
      line('Executed', row.executedAt),
      line('Scenario', row.scenario.length > 240 ? row.scenario.slice(0, 237) + '…' : row.scenario),
      line('Expected', row.expected),
      line('Actual', row.actual),
      line('Correlation', row.correlationId),
      ...row.evidence.map(evidence => `  · ${evidence.label}: ${evidence.detail}`),
      ...(row.failureCause ? [line('Failure cause', row.failureCause)] : []),
      ...(row.repairPr ? [line('Repair PR', row.repairPr)] : []),
      ...(row.retest ? [line('Retest', `${row.retest.verdict} at ${row.retest.finishedAt}: ${row.retest.actual}`)] : []),
    ].join('\n')
  })
  const decision = [
    scope.targeted ? runLabel(ledger, catalog, scope) : `Campaign ${ledger.campaignId}`,
    line('Production commit', ledger.productionCommit),
    line('main commit', ledger.mainCommit),
    line('Production matches main', certification.deployedMatchesMain === null ? 'unknown' : certification.deployedMatchesMain ? 'yes' : 'no'),
    line('Production changed during the campaign', certification.productionChanged ? `yes (${ledger.revisionChanges.map(sha => sha.slice(0, 7)).join(', ')})` : 'no'),
    `Results: ${certification.passed} PASS, ${certification.failed} FAIL, ${certification.blocked} BLOCKED, ${certification.pending} not run, of ${certification.total}`,
    ...(scope.targeted
      ? [`${runLabel(ledger, catalog, scope)}: ${certification.outcome}`, 'A targeted run retests the named checks only; it is not a certification of the campaign.']
      : [`Final certification outcome: ${certification.outcome}`]),
  ].join('\n')
  return [...blocks, decision].join('\n\n')
}
