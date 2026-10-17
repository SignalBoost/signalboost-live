#!/usr/bin/env node
// University commercialization acceptance: executable fail-closed evidence gate.
// This gate never calls Stripe or changes payment/database records.
import { readFileSync } from 'node:fs'
const path = process.env.UNIVERSITY_COMMERCIAL_EVIDENCE_FILE
if (!path) {
  console.error('University commercialization NOT READY: evidence file not supplied')
  process.exit(1)
}
let evidence
try { evidence = JSON.parse(readFileSync(path, 'utf8')) }
catch { console.error('University commercialization NOT READY: evidence JSON invalid'); process.exit(1) }
const required = [
 'approved_pricing', 'live_stripe_checkout', 'verified_webhook_delivery',
 'atomic_tenant_wallet_grant', 'duplicate_payment_replay',
 'refund_and_dispute_reconciliation', 'byoi_customer_workflow',
 'production_reconciliation'
]
const failures = []
for (const key of required) {
 const item = evidence?.checks?.[key]
 if (item?.status !== 'passed' || typeof item?.receipt !== 'string' ||
     !/^https:\/\/[^\s]+$/.test(item.receipt) || typeof item?.revision !== 'string' ||
     !/^[a-f0-9]{7,40}$/.test(item.revision))
  failures.push(key)
}
if (failures.length) {
 console.error('University commercialization NOT READY; missing independently verifiable receipts: '+failures.join(', '))
 process.exit(1)
}
console.log('University commercialization evidence manifest complete (receipt reachability and factual validity require independent review).')
