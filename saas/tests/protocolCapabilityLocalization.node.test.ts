import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const layout = hydrateLocalizedSource(readFileSync(new URL('../app/dashboard/supervisor/layout.tsx', import.meta.url), 'utf8'))
const summary = hydrateLocalizedSource(readFileSync(new URL('../components/supervisor/ProtocolCapabilitySummary.tsx', import.meta.url), 'utf8'))

test('supervisor protocol capability surfaces support five languages', () => {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) assert.match(layout, new RegExp(`${language}:`))
  assert.match(layout, /sb_locale/)
})

test('localized summary preserves read-only execution boundary', () => {
  assert.match(layout, /sin controles de ejecución/)
  assert.match(layout, /sem controles de execução/)
  assert.match(layout, /bez kontroli wykonania/)
  assert.match(layout, /без элементов выполнения/)
  assert.match(summary, /method: 'GET'/)
  assert.doesNotMatch(summary, /onClick=/)
})