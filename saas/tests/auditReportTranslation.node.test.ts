import test from 'node:test'
import assert from 'node:assert/strict'
import { readUiSource } from './helpers/sourceWithUiCopy.mjs'

const read = (path: string) => readUiSource(new URL(path, import.meta.url))

test('generated audit translations are stored separately from remediation findings', () => {
  const route = read('../app/api/hub/operator/audit/runs/route.ts')

  assert.match(route, /AUDIT_REPORT_TRANSLATION_KIND/)
  assert.match(route, /from\('audit_logs'\)\.insert/)
  assert.doesNotMatch(route, /from\('audit_findings'\)\.update/)
  assert.match(route, /original audit_findings rows are immutable source records/)
})

test('existing language versions are reused before a new translation is generated', () => {
  const route = read('../app/api/hub/operator/audit/runs/route.ts')

  const cachedLookup = route.indexOf("payload.kind === AUDIT_REPORT_TRANSLATION_KIND")
  const generation = route.indexOf('createCachedTranslation({')
  assert.ok(cachedLookup >= 0, 'cached translation lookup is missing')
  assert.ok(generation > cachedLookup, 'translation generation must happen after cache lookup')
  assert.match(route, /if \(!payloads\.translation && sourceLang !== lang\)/)
  assert.match(route, /availableLanguages/)
})

test('translation preserves protected technical fields and report structure', () => {
  const helper = read('../lib/audit/reportTranslation.ts')

  assert.match(helper, /Translate only category, title, detail, and recommendation/)
  assert.match(helper, /Keep code identifiers, file paths, URLs, package names, route names/)
  assert.match(helper, /Preserve every slot value, item order, item count/)
  assert.match(helper, /const CHUNK_SIZE = 12/)
  assert.match(helper, /translation returned an invalid finding count/)
})

test('new audit runs persist the narrative and source language for later regeneration', () => {
  const route = read('../app/api/hub/operator/audit/route.ts')

  assert.match(route, /narrative: result\.narrative \|\| ''/)
  assert.match(route, /findings: result\.findings/)
  assert.match(route, /\blang,?\n/)
})
