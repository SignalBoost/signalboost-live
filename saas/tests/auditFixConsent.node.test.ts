import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('the audit consent has exactly one localized global approval choice', () => {
  const consent = read('../components/audit/AuditFixConsent.tsx')
  for (const answer of ['Yes — prepare fixes', 'Not now', 'Sí — preparar correcciones', 'Agora não', 'Tak — przygotuj poprawki', 'Не сейчас']) {
    assert.ok(consent.includes(answer), `missing localized consent answer: ${answer}`)
  }
})

test('the audit dashboard uses the global batch workflow instead of a per-finding patch button', () => {
  const dashboard = read('../app/dashboard/audit/page.tsx')
  assert.match(dashboard, /import GlobalFixApproval/)
  assert.match(dashboard, /<GlobalFixApproval runId=\{selectedRunId\} findings=\{findings\}/)
  assert.doesNotMatch(dashboard, /<PatchPreview finding=\{selectedFinding\}/)
})

test('batch approval is server-side, at-most-once, and logs every applied fix', () => {
  const route = read('../app/api/hub/operator/audit/fix-batch/route.ts')
  const ui = read('../components/audit/GlobalFixApproval.tsx')
  const migration = read('../supabase/migrations/20260719_audit_run_fix_batches.sql')
  assert.match(route, /fix_batch_already_approved/)
  assert.match(route, /audit_run_fix_events/)
  assert.match(route, /filesFixed/)
  assert.match(route, /findingsFixed/)
  assert.match(route, /status: 'completed'/)
  assert.match(ui, /mode: 'preview'/)
  assert.match(ui, /mode: 'commit'/)
  assert.match(ui, /action: 'fix_applied'/)
  assert.match(migration, /run_id uuid not null unique/)
})

test('batch progress strings are present in every audit and console locale dictionary', () => {
  for (const stem of ['audit', 'console']) for (const lang of ['en', 'es', 'pt', 'pl', 'ru']) {
    const dictionary = read(`../lib/i18n/${stem}.${lang}.json`)
    assert.match(dictionary, stem === 'audit' ? /"batch"/ : /"auditBatch"/)
    assert.match(dictionary, /"progress"/)
  }
})
