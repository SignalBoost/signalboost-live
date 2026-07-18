import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createProviderAlertHistory,
  type ProviderAlertLifecycleEntry,
  type ProviderAlertLifecycleSnapshot,
} from '../lib/supervisor/index.ts'

const entry = (
  state: ProviderAlertLifecycleEntry['state'],
  overrides: Partial<ProviderAlertLifecycleEntry> = {},
): ProviderAlertLifecycleEntry => ({
  alertId: 'vercel:warning_provider',
  provider: 'vercel',
  type: 'warning_provider',
  state,
  previousSeverity: state === 'opened' ? null : 'warning',
  currentSeverity: state === 'resolved' ? null : 'warning',
  message: state,
  ...overrides,
})

const snapshot = (generatedAt: string, entries: ProviderAlertLifecycleEntry[]): ProviderAlertLifecycleSnapshot => ({
  generatedAt,
  summary: {
    total: entries.length,
    opened: entries.filter(item => item.state === 'opened').length,
    ongoing: entries.filter(item => item.state === 'ongoing').length,
    escalated: entries.filter(item => item.state === 'escalated').length,
    deescalated: entries.filter(item => item.state === 'deescalated').length,
    resolved: entries.filter(item => item.state === 'resolved').length,
  },
  entries,
  schemaVersion: 'supervisor-provider-alert-lifecycle-v1',
})

test('tracks first opened, last observed, ongoing duration, and resolution time', () => {
  const history = createProviderAlertHistory([
    snapshot('2026-07-18T10:00:00.000Z', [entry('opened')]),
    snapshot('2026-07-18T10:05:00.000Z', [entry('ongoing')]),
    snapshot('2026-07-18T10:15:00.000Z', [entry('resolved')]),
  ])
  assert.deepEqual(history.records[0], {
    historyId: 'vercel:warning_provider:1',
    alertId: 'vercel:warning_provider',
    provider: 'vercel',
    type: 'warning_provider',
    occurrence: 1,
    firstOpenedAt: '2026-07-18T10:00:00.000Z',
    lastObservedAt: '2026-07-18T10:15:00.000Z',
    escalationCount: 0,
    deescalationCount: 0,
    resolvedAt: '2026-07-18T10:15:00.000Z',
    totalActiveDurationMs: 900_000,
    status: 'resolved',
  })
})

test('counts escalation and deescalation transitions', () => {
  const history = createProviderAlertHistory([
    snapshot('2026-07-18T10:00:00.000Z', [entry('opened')]),
    snapshot('2026-07-18T10:01:00.000Z', [entry('escalated')]),
    snapshot('2026-07-18T10:02:00.000Z', [entry('deescalated')]),
  ])
  assert.equal(history.records[0].escalationCount, 1)
  assert.equal(history.records[0].deescalationCount, 1)
  assert.equal(history.records[0].totalActiveDurationMs, 120_000)
})

test('creates a new deterministic occurrence when a resolved alert reopens', () => {
  const history = createProviderAlertHistory([
    snapshot('2026-07-18T10:00:00.000Z', [entry('opened')]),
    snapshot('2026-07-18T10:05:00.000Z', [entry('resolved')]),
    snapshot('2026-07-18T10:10:00.000Z', [entry('opened')]),
  ])
  assert.equal(history.records.length, 2)
  assert.deepEqual(history.records.map(item => item.historyId), [
    'vercel:warning_provider:2',
    'vercel:warning_provider:1',
  ])
  assert.equal(history.summary.active, 1)
  assert.equal(history.summary.resolved, 1)
})

test('produces provider-level reliability trend summaries', () => {
  const github = { alertId: 'github:warning_provider', provider: 'github' }
  const history = createProviderAlertHistory([
    snapshot('2026-07-18T10:00:00.000Z', [entry('opened'), entry('opened', github)]),
    snapshot('2026-07-18T10:10:00.000Z', [entry('resolved'), entry('escalated', github)]),
  ])
  assert.deepEqual(history.providerTrends, [
    {
      provider: 'github',
      alertOccurrences: 1,
      activeAlerts: 1,
      resolvedAlerts: 0,
      escalationCount: 1,
      deescalationCount: 0,
      totalActiveDurationMs: 600_000,
      averageResolutionDurationMs: null,
      lastObservedAt: '2026-07-18T10:10:00.000Z',
    },
    {
      provider: 'vercel',
      alertOccurrences: 1,
      activeAlerts: 0,
      resolvedAlerts: 1,
      escalationCount: 0,
      deescalationCount: 0,
      totalActiveDurationMs: 600_000,
      averageResolutionDurationMs: 600_000,
      lastObservedAt: '2026-07-18T10:10:00.000Z',
    },
  ])
})

test('sorts input snapshots deterministically and bounds results', () => {
  const history = createProviderAlertHistory([
    snapshot('2026-07-18T10:02:00.000Z', [entry('ongoing')]),
    snapshot('2026-07-18T10:00:00.000Z', [entry('opened')]),
    snapshot('2026-07-18T10:01:00.000Z', [entry('opened', { alertId: 'github:warning_provider', provider: 'github' })]),
  ], { limit: 1 })
  assert.equal(history.records.length, 1)
  assert.equal(history.records[0].alertId, 'vercel:warning_provider')
  assert.equal(history.records[0].totalActiveDurationMs, 120_000)
})

test('exports the stable provider alert history schema', () => {
  const history = createProviderAlertHistory([])
  assert.equal(history.schemaVersion, 'supervisor-provider-alert-history-v1')
  assert.equal(history.generatedAt, '1970-01-01T00:00:00.000Z')
})
