import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../app/api/webhook/route.ts', import.meta.url), 'utf8')
const topup = source.slice(source.indexOf('async function handleCreditTopup('), source.indexOf('async function handleAuditCreditTopup('))

test('credit top-ups reject an unknown user and invalid credits before claiming the event', () => {
  const user = topup.indexOf('if (!userId)')
  const amount = topup.indexOf('if (!Number.isInteger(credits)')
  const claim = topup.indexOf('const fresh = await claimStripeEvent')
  assert.ok(user >= 0 && amount > user && claim > amount)
  assert.match(topup, /credit_topup_user_unresolved[^\n]*status: 422/)
  assert.match(topup, /credit_topup_amount_invalid[^\n]*status: 422/)
  assert.doesNotMatch(topup, /received: true, warning: '(no userId|invalid creditAmount)'/)
  assert.match(topup, /\^\[1-9\]\[0-9\]\*\$/)
  assert.doesNotMatch(topup, /Number\.parseInt/)

})

test('credit top-ups still deduplicate after validation and fail on database credit errors', () => {
  assert.match(topup, /received: true, deduped: true/)
  assert.match(topup, /await releaseStripeEvent\(supabase, eventId\)/)
  assert.match(topup, /return NextResponse.json\(\{ error: 'DB error' \}, \{ status: 500 \}\)/)
})
