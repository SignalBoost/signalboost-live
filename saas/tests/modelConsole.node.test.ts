import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const routeUrl = new URL('../app/api/admin/models/route.ts', import.meta.url)
const pageUrl = new URL('../app/admin/models/page.tsx', import.meta.url)
const consoleUrl = new URL('../components/admin/ModelConsole.tsx', import.meta.url)
const navUrl = new URL('../lib/platform/unifiedPlatform.ts', import.meta.url)

test('model console API is owner-gated, no-store and requires explicit spend confirmation', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /requireOwner\(\)/)
  assert.match(source, /Cache-Control', 'no-store'/)
  assert.match(source, /confirmSpend !== true|confirmSpend !== true/)
  assert.match(source, /platform_model_certification_explicit_spend_confirmation_required/)
  assert.match(source, /runPlatformModelCertification/)
  assert.doesNotMatch(source, /return.*SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(source, /return.*ANTHROPIC_API_KEY/)
  assert.doesNotMatch(source, /return.*GEMINI_API_KEY/)
})

test('model console surfaces certification without exposing secret values', async () => {
  const [page, component, nav] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(consoleUrl, 'utf8'),
    readFile(navUrl, 'utf8'),
  ])
  assert.match(page, /<ModelConsole/)
  assert.match(component, /\/api\/admin\/models/)
  assert.match(component, /confirmSpend:true/)
  assert.match(component, /credentialConfigured/)
  assert.match(component, /action:'register'/)
  assert.match(component, /confirmMutation:true/)
  assert.match(component, /action:'assign'/)
  assert.match(component, /confirmActivation:true/)
  assert.match(component, /action:'rollback'/)
  assert.match(component, /confirmRollback:true/)
  assert.doesNotMatch(component, /SUPABASE_SERVICE_ROLE_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/)
  assert.match(nav, /label: 'Models', href: '\/admin\/models'/)
})

test('model console adapts Supabase to the narrow certification audit port and types stored receipts', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /type StoredCertificationReceipt/)
  assert.match(source, /type StoredCertificationReceipt/)
  assert.match(source, /profileKey: string/)
  assert.match(source, /certificationAuditDb\(db\)/)
  assert.match(source, /table !== 'supervisor_audit_events'/)
  assert.match(source, /db\.from\('supervisor_audit_events'\)\.insert\(value as never\)/)
})

test('certification receipts use the existing immutable sanitized supervisor audit ledger', async () => {
  const source = await readFile(new URL('../lib/ai/modelCertification.ts', import.meta.url), 'utf8')
  assert.match(source, /supervisor_audit_events/)
  assert.match(source, /platform_model_certification_completed/)
  assert.match(source, /outputsPersisted: false/)
  assert.match(source, /credentialsPersisted: false/)
  assert.match(source, /authorityExpanded: false/)
  assert.doesNotMatch(source, /payload:\s*\{[^}]*text:/s)
})
