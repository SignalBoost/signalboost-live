// Static fail-closed regression guard until webhook claiming is moved into
// a transactional commercial wallet RPC. Does NOT assert atomic credit grants.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const route = readFileSync(new URL('../app/api/webhook/route.ts', import.meta.url), 'utf8')
const claim = route.split('async function claimStripeEvent(')[1]?.split('async function releaseStripeEvent(')[0]
assert.ok(claim, 'Stripe event claim handler must exist')
assert.match(claim, /if \(!eventId \|\| !eventId\.trim\(\)\) throw new Error\('stripe_event_id_required'\)/)
assert.match(claim, /error\.code === '23505'\) return false/)
assert.match(claim, /throw new Error\('stripe_event_claim_unavailable'\)/)
assert.doesNotMatch(claim, /proceeding fail-open/)
assert.doesNotMatch(claim, /return true\s*\}\s*$/, 'Unexpected permissive fallback')
console.log('PASS: webhook event claim fails closed on missing ID and DB error; atomic grant remains a separate gate')
