// saas/tests/repairConfirmationIntent.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { isOperationalLogRepairOffer, operationalLogRepairHandoff } from '../lib/ai/cos/pastedOperationalLog.ts'
import { isRepairConfirmation } from '../lib/ai/cos/repairConfirmationIntent.ts'

const reasoner = (verdict: unknown, seen?: string[]) => (async (args: any) => {
  seen?.push(String(args?.prompt || ''))
  return { text: JSON.stringify(verdict), reasoner: {} as any, turnId: 't' }
}) as any

const offline = (async () => null) as any

// The offer is a question a person can answer, not a phrase they must reproduce.
test('the offer is a plain question in every platform language', () => {
  for (const locale of ['en', 'es', 'pt', 'pl', 'ru']) {
    const offer = operationalLogRepairHandoff(locale)
    assert.ok(offer.trim().endsWith('?'), offer)
    assert.doesNotMatch(offer, /fix it/i, offer)
    assert.ok(offer.length < 60, offer)
  }
})

// Any ordinary human agreement authorises the repair, including the impatient kind.
test('a human yes authorises the offered repair, in any phrasing or language', async () => {
  for (const reply of ['yes', 'go', 'please do', 'yep go ahead', 'fuck go', 'sim', 'tak', 'да', 'sí hazlo']) {
    assert.equal(await isRepairConfirmation(reply, reasoner({ authorizes_repair: true })), true, reply)
  }
})

test('a refusal, a question or a different instruction is not consent', async () => {
  for (const reply of ['no', 'not yet', 'what would you change?', 'show me the diff first', 'nie', 'нет']) {
    assert.equal(await isRepairConfirmation(reply, reasoner({ authorizes_repair: false })), false, reply)
  }
})

// The boundary is unchanged: consent is still required and still fails closed.
test('the classifier fails closed on outage, junk and malformed verdicts', async () => {
  assert.equal(await isRepairConfirmation('yes', offline), false)
  assert.equal(await isRepairConfirmation('yes', reasoner({ authorizes_repair: 'true' })), false)
  assert.equal(await isRepairConfirmation('yes', reasoner({})), false)
  assert.equal(await isRepairConfirmation('', reasoner({ authorizes_repair: true })), false)
})

// A long message is a new instruction, not an answer to the offer.
test('a long reply is never read as a bare confirmation', async () => {
  const seen: string[] = []
  const long = `go ahead ${'and also please rewrite the whole module '.repeat(10)}`
  assert.ok(long.length > 200)
  assert.equal(await isRepairConfirmation(long, reasoner({ authorizes_repair: true }, seen)), false)
  assert.deepEqual(seen, [])
})

// The confirmation path remains available to older callers while canonical browser ingress now
// uses the shared semantic request-understanding layer instead of phrase syntax.
test('the offer is recognised only from text this module generated', () => {
  assert.equal(isOperationalLogRepairOffer(`Build failed. ${operationalLogRepairHandoff('en')}`), true)
  assert.equal(isOperationalLogRepairOffer(`Mogę to naprawić. Chcesz, żebym to zrobił?`), true)
  assert.equal(isOperationalLogRepairOffer('Here is a summary of the build failure.'), false)
  assert.equal(isOperationalLogRepairOffer(''), false)
})

test('browser ingress uses semantic intent and clarification rather than repair command regexes', async () => {
  const fs = await import('node:fs/promises')
  const route = await fs.readFile('app/api/cos-browser/route.ts', 'utf8')
  assert.match(route, /understandRequest\(\{/)
  assert.match(route, /requestUnderstanding\?\.softwareRepairIntent === true/)
  assert.match(route, /requestUnderstanding\?\.needsClarification/)
  assert.match(route, /clarificationQuestion\(language, requestUnderstanding\.missing\)/)
  assert.doesNotMatch(route, /hasExplicitOperationalLogRepairIntent/)
  assert.doesNotMatch(route, /isExplicitOperationalLogRepairRequest/)
  // Passive evidence is still required before an operational repair follow-up can inherit it.
  assert.match(route, /previousOperationalEvidence = isPastedOperationalLog\(previousUserPrompt\)/)
  assert.match(route, /followupOperationalRepair = requestUnderstanding\?\.softwareRepairIntent === true[\s\S]{0,120}previousOperationalEvidence/)
})
