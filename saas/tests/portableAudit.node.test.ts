// saas/tests/portableAudit.node.test.ts
import './portableSupportBoundaryEvidence.cases.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createSiemAuditSink,
  teeAuditSinks,
  formatEcsJson,
  formatCef,
  type PortableAuditEvent,
  type SiemAuditSinkConfig,
  type SiemSeverity,
} from '../portable-audit/index.ts'

const evt: PortableAuditEvent = {
  eventId: 'evt_1',
  eventType: 'campaign.published',
  occurredAt: '2026-07-24T12:00:00.000Z',
  dataset: 'campaign',
  subjectId: 'camp_9',
  correlationId: 'trace_5',
  schemaVersion: 1,
  payload: { channel: 'youtube', url: 'https://x/y', nested: { a: 1 } },
}
const sev = (t: string): SiemSeverity => (t === 'campaign.published' ? 'notice' : 'info')

test('ecs-json is valid JSON with the expected ECS fields and no secrets leaked', () => {
  const cfg: SiemAuditSinkConfig = { transport: { send() {} }, format: 'ecs-json', product: 'CampaignStudio', tenantId: 'acme', environment: 'prod', severityFor: sev }
  const o = JSON.parse(formatEcsJson(evt, cfg))
  assert.equal(o['@timestamp'], '2026-07-24T12:00:00.000Z')
  assert.equal(o['event.action'], 'campaign.published')
  assert.equal(o['event.dataset'], 'campaign')
  assert.equal(o['log.level'], 'notice')
  assert.equal(o['observer.product'], 'CampaignStudio')
  assert.equal(o['entity.id'], 'camp_9')
  assert.equal(o['trace.id'], 'trace_5')
  assert.equal(o['organization.id'], 'acme')
  assert.equal(o['service.environment'], 'prod')
  assert.equal(o['portable.payload'].channel, 'youtube')
})

test('cef header + escaping', () => {
  const cfg: SiemAuditSinkConfig = { transport: { send() {} }, format: 'cef', vendor: 'Acme', product: 'Prod', productVersion: '2.0', severityFor: sev }
  const line = formatCef(evt, cfg)
  assert.ok(line.startsWith('CEF:0|Acme|Prod|2.0|campaign.published|campaign.published|3|'))
  assert.ok(line.includes('externalId=evt_1'))
  assert.ok(line.includes('cs1=camp_9'))
})

test('transport receives the formatted record + severity meta', async () => {
  const seen: any[] = []
  const sink = createSiemAuditSink({ transport: { send: (r, m) => { seen.push({ r, m }) } }, format: 'ecs-json', severityFor: sev })
  await sink.record(evt)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].m.severity, 'notice')
  assert.equal(seen[0].m.format, 'ecs-json')
})

test('swallowTransportErrors defaults to true (audit never breaks the portable); false propagates', async () => {
  const boom = { send() { throw new Error('collector down') } }
  await createSiemAuditSink({ transport: boom, format: 'cef' }).record(evt)
  await assert.rejects(() => createSiemAuditSink({ transport: boom, format: 'cef', swallowTransportErrors: false }).record(evt))
})

test('teeAuditSinks fans out and isolates a failing sink', async () => {
  let a = 0, b = 0
  const good = { record: async () => { a++ } }
  const bad = { record: async () => { throw new Error('x') } }
  const other = { record: async () => { b++ } }
  await teeAuditSinks(good, bad, other).record(evt)
  assert.equal(a, 1)
  assert.equal(b, 1)
})

test('default severity is info when no mapper supplied', () => {
  const o = JSON.parse(formatEcsJson(evt, { transport: { send() {} }, format: 'ecs-json' }))
  assert.equal(o['log.level'], 'info')
})
