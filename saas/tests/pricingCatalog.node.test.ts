import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getTier } from '../lib/config/unifiedPricing.ts'

test('Launch is publicly priced at $15 per month', () => {
  const launch = getTier('platform', 'launch')
  assert.ok(launch)
  assert.equal(launch.price, 15)
  assert.equal(launch.monthlyPrice, 15)
  assert.equal(launch.fallbackPrice, '$15')
  assert.notEqual(launch.hidden, true)
})

test('every locale lists the full AI coding workspace on Launch', () => {
  const source = readFileSync(new URL('../lib/i18n/unifiedPricingCopy.ts', import.meta.url), 'utf8')
  assert.match(source, /create, edit, run, test, debug, and repair code/i)
  assert.match(source, /crea, edita, ejecuta, prueba, depura y repara código/i)
  assert.match(source, /crie, edite, execute, teste, depure e repare código/i)
  assert.match(source, /twórz, edytuj, uruchamiaj, testuj, debuguj i naprawiaj kod/i)
  assert.match(source, /создавайте, редактируйте, запускайте, тестируйте, отлаживайте и исправляйте код/i)
})

test('checkout restores POST and refuses a Stripe amount other than $15 for Launch', () => {
  const source = readFileSync(new URL('../app/api/checkout/route.ts', import.meta.url), 'utf8')
  assert.match(source, /export async function POST/)
  assert.match(source, /expectedMonthlyCents: 1500/)
  assert.match(source, /price\.unit_amount === expectedMonthlyCents/)
})
