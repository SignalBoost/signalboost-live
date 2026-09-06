import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { extractDomainCandidates, lookupDomainsRdap, renderDomainLookups } from '../lib/ai/cos/domainAvailability.ts'

test('extracts explicit domains from the owner request and preceding COS answer', () => {
  assert.deepEqual(extractDomainCandidates('you check availability', 'Try SignalBoost.ai, SBoost.ai, and https://GetSignalBoost.com/pricing.'), ['signalboost.ai','sboost.ai','getsignalboost.com'])
  assert.deepEqual(extractDomainCandidates('edit this text', 'SignalBoost.ai'), [])
})

test('uses free IANA bootstrap and authoritative registry RDAP without guessing', async () => {
  const calls: string[] = []
  const fakeFetch = (async (url: string | URL | Request) => {
    calls.push(String(url))
    if (String(url).includes('data.iana.org')) return new Response(JSON.stringify({ services: [[['ai'], ['https://rdap.nic.ai']]] }), { status: 200 })
    if (String(url).endsWith('/signalboost.ai')) return new Response('{}', { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const results = await lookupDomainsRdap(['signalboost.ai','sboost.ai'], fakeFetch)
  assert.equal(results[0].status, 'registered')
  assert.equal(results[1].status, 'no_registration_found')
  assert.deepEqual(calls, ['https://data.iana.org/rdap/dns.json','https://rdap.nic.ai/domain/signalboost.ai','https://rdap.nic.ai/domain/sboost.ai'])
})

test('RDAP absence is never represented as guaranteed availability', () => {
  const reply = renderDomainLookups([{ domain:'example.ai',status:'no_registration_found',checkedAt:'2026-09-06T00:00:00.000Z',registryEndpoint:'https://rdap.nic.ai',detail:'No record.' }])
  assert.match(reply, /NO REGISTRATION FOUND/)
  assert.match(reply, /not a purchase guarantee/i)
  assert.doesNotMatch(reply, /definitely available|guaranteed available/i)
})

test('owner COS routes domain checks through RDAP before general model reasoning', async () => {
  const [route, gates] = await Promise.all([
    readFile(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8'),
  ])
  assert.match(route, /if\(access\?\.isOwner\)[\s\S]+tryDomainAvailabilityLookup/)
  assert.match(route, /source:'cos-domain-rdap'/)
  assert.match(gates, /tests\/cosDomainAvailability\.node\.test\.ts/)
})
