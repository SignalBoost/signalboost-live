import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const page = () => hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/page.tsx', import.meta.url), 'utf8'))

test('Supervisor Operations Center is authenticated, admin-gated, localized, and read-only', () => {
  const source = page()
  assert.match(source, /getCurrentUser\(\)/)
  assert.match(source, /redirect\('\/login'\)/)
  assert.match(source, /access\.isAdmin/)
  assert.match(source, /loadLanguage/)
  assert.doesNotMatch(source, /<form|<button|method="post"|approve|redeploy|repair|BrowserRuntime|Playwright|process\.env\[[^\]]+\]/i)
  for (const lang of ['en','es','pt','pl','ru']) {
    const dict = JSON.parse(hydrateLocalizedSource(readFileSync(new URL('../lib/i18n/supervisorSocLocales.json', import.meta.url), 'utf8')))[lang].supervisorSoc
    for (const key of ['title','readOnly','supervisorCluster','providerHealth','incidentQueue','activeWork','auditTimeline','verification','metrics','filters','search']) assert.ok(dict[key], `${lang}.${key}`)
  }
})

test('Supervisor Operations Center supports operational filters, search, percentages, and avoids N+1 reads', () => {
  const source = page()
  for (const key of ['provider','environment','status','severity','verification']) assert.match(source, new RegExp(`matches\\([^\\n]+, '${key}'\\)`))
  assert.match(source, /param\('q'\)/)
  assert.match(source, /t\.supervisor/) 
  assert.match(source, /textHas\(r\.projectId, r\.governance\?\.deploymentId, r\.incident\?\.affectedResource, r\.incident\?\.incidentId, r\.runId/)
  assert.match(source, /pct\(countRuns\(filteredRuns/)
  assert.match(source, /Promise\.all\(\[/)
  assert.equal((source.match(/readTable\(db,/g) || []).length, 4)
  assert.match(source, /new SupabaseVercelHealthStore\(db\)\.listRuns\(\{ limit: 50 \}\)/)
})
