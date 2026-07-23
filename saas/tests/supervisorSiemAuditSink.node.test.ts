import test from 'node:test'
import assert from 'node:assert/strict'
import { createSiemAuditSink, formatEcsJson, formatCef, teeAuditSinks } from '../lib/supervisor/portable/siem-audit-sink.ts'
import { readFileSync } from 'node:fs'

const ev: any = { eventId: 'ev-1', incidentId: 'inc-9', dispatchId: 'dsp-3', eventType: 'sandbox_execution_paused', occurredAt: '2026-07-23T05:00:00.000Z', payload: { stepId: 'migrate-db', reason: 'financial_gate' }, schemaVersion: 'supervisor-dispatch-audit-v1' }

test('ECS-JSON carries the key fields and maps a paused step to warning', () => {
  const r = JSON.parse(formatEcsJson(ev, { transport: { send() {} }, format: 'ecs-json' }))
  assert.equal(r['event.action'], 'sandbox_execution_paused')
  assert.equal(r['log.level'], 'warning')
  assert.equal(r['incident.id'], 'inc-9')
  assert.equal(r['supervisor.payload'].stepId, 'migrate-db')
})

test('CEF header is well-formed and escapes extension values', () => {
  const cef = formatCef({ ...ev, payload: { note: 'a=b|c' } }, { transport: { send() {} }, format: 'cef', vendor: 'Acme', product: 'SHS', productVersion: '1.2' })
  assert.ok(cef.startsWith('CEF:0|Acme|SHS|1.2|sandbox_execution_paused|'))
  assert.ok(cef.includes('note=a\\=b|c'))
})

test('transport error is swallowed by default, propagated when disabled', async () => {
  const throwing = { send() { throw new Error('down') } }
  await createSiemAuditSink({ transport: throwing, format: 'cef' }).write(ev) // no throw
  await assert.rejects(() => Promise.resolve(createSiemAuditSink({ transport: throwing, format: 'cef', swallowTransportErrors: false }).write(ev)))
})

test('tee delivers to every sink (buyer SIEM + platform ledger)', async () => {
  const a: any[] = [], b: any[] = []
  await teeAuditSinks({ write: e => { a.push(e) } }, { write: e => { b.push(e) } }).write(ev)
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
})

test('sink stays host-agnostic (no env, no supabase, no seller brand)', () => {
  const src = readFileSync(new URL('../lib/supervisor/portable/siem-audit-sink.ts', import.meta.url), 'utf8')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  assert.ok(!/process\.env/.test(src))
  assert.ok(!/supabase/i.test(src))
  assert.ok(!/signalboost/i.test(src))
})
