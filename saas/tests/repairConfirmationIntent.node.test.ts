// saas/tests/repairConfirmationIntent.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { isOperationalLogRepairOffer, operationalLogRepairHandoff } from '../lib/ai/cos/pastedOperationalLog.ts'
import { isRepairConfirmation } from '../lib/ai/cos/repairConfirmationIntent.ts'
import { readRepoFile, requireWiring } from './helpers/requiredWiring.ts'

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

// The confirmation path is reachable only when the assistant actually offered.
test('the offer is recognised only from text this module generated', () => {
  assert.equal(isOperationalLogRepairOffer(`Build failed. ${operationalLogRepairHandoff('en')}`), true)
  assert.equal(isOperationalLogRepairOffer(`Mogę to naprawić. Chcesz, żebym to zrobił?`), true)
  assert.equal(isOperationalLogRepairOffer('Here is a summary of the build failure.'), false)
  assert.equal(isOperationalLogRepairOffer(''), false)
})

test('the browser ingress gates confirmation on a real prior offer and passive log evidence', async () => {
  const route = await readRepoFile('app/api/cos-browser/route.ts')
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Recognise that the prior assistant turn was our own repair offer, so a log can never authorise itself.',
    expect: /isOperationalLogRepairOffer\(priorAnswer\)/,
    insert: '    && isOperationalLogRepairOffer(priorAnswer)',
    after: '    && isPastedOperationalLog(previousUserPrompt)',
    requiresImport: "import { isOperationalLogRepairOffer } from '@/lib/ai/cos/pastedOperationalLog'",
  })
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Let an ordinary human yes authorise the offered repair instead of requiring the literal phrase "fix it".',
    expect: /const confirmedRepairOffer = answeringOurRepairOffer && await isRepairConfirmation\(prompt\)/,
    insert: '    const confirmedRepairOffer = answeringOurRepairOffer && await isRepairConfirmation(prompt)',
    after: '    && isOperationalLogRepairOffer(priorAnswer)',
    requiresImport: "import { isRepairConfirmation } from '@/lib/ai/cos/repairConfirmationIntent'",
  })
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Authorise the repair once the person has confirmed the offer.',
    expect: /explicitOperationalRepair = [\s\S]{0,200}confirmedRepairOffer/,
    insert: '    || confirmedRepairOffer',
    after: '    || reverseImmediateOperationalRepair',
  })
  requireWiring(route, {
    file: 'saas/app/api/cos-browser/route.ts',
    purpose: 'Keep the zero-cost keyword path as the fast route ahead of the network.',
    expect: /const followupOperationalRepair = hasExplicitOperationalLogRepairIntent\(prompt\)/,
    insert: '    const followupOperationalRepair = hasExplicitOperationalLogRepairIntent(prompt)',
    after: '  // evidence, so a log still cannot authorise itself and no authority is widened.',
  })
})
