import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { brainstormVerifiedDomains, extractDomainCandidates, isDomainBrainstormRequest, lookupDomainsRdap, parseGeneratedDomainSuggestions, renderDomainLookups } from '../lib/ai/cos/domainAvailability.ts'

test('extracts explicit domains from the owner request and preceding COS answer', () => {
  assert.deepEqual(extractDomainCandidates('you check availability', 'Try SignalBoost.ai, SBoost.ai, and https://GetSignalBoost.com/pricing.'), ['signalboost.ai','sboost.ai','getsignalboost.com'])
  assert.deepEqual(extractDomainCandidates('edit this text', 'SignalBoost.ai'), [])
})

test('explicit verification checks only requested domains and resolves a named prior candidate', () => {
  const context = 'Try codevia.io, oldidea.dev, and fluxa.io.'
  assert.deepEqual(
    extractDomainCandidates('Can you verify these names: codevia, nova.ai, fluxa.ai?', context),
    ['nova.ai', 'fluxa.ai', 'codevia.io'],
  )
})

test('current-turn domains are checked without requiring a separate availability keyword', () => {
  assert.deepEqual(extractDomainCandidates('check these names deepcloud.ai or deepcloud.com', 'Prior: nexus.dev'), ['deepcloud.ai', 'deepcloud.com'])
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

test('recognizes the exact creative fifteen-name follow-up as a domain assignment', () => {
  const input = 'i am asking for you to brainstorm and come out with 15 suggestions? the platform develops software but also is a saas platform?'
  assert.equal(isDomainBrainstormRequest(input, 'We were discussing a shorter domain URL.'), true)
})

test('generated candidates obey format and explicit signal/boost exclusion', () => {
  const parsed = parseGeneratedDomainSuggestions(JSON.stringify({ candidates: [
    { name:'SignalForge',domain:'signalforge.dev',meaning:'Legacy-shaped name' },
    { name:'Nuvora',domain:'nuvora.dev',meaning:'New software taking shape' },
    { name:'Bad',domain:'bad.example.net',meaning:'Unsupported TLD' },
  ]}), true)
  assert.deepEqual(parsed, [{ name:'Nuvora',domain:'nuvora.dev',meaning:'New software taking shape' }])
})

test('rejects numeric meanings and duplicate neural names while normalizing escaped dots', () => {
  const parsed = parseGeneratedDomainSuggestions(JSON.stringify({ candidates: [
    { name:'Telta',domain:'telta.dev',meaning:-1050318937 },
    { name:'Codexa',domain:'codexa\\.app',meaning:'A concise code workspace' },
    { name:'codexa',domain:'codexa.ai',meaning:'Duplicate name' },
  ]}), false)
  assert.deepEqual(parsed, [{name:'Codexa',domain:'codexa.app',meaning:'A concise code workspace'}])
})

test('explicit owner domain verification precedes creative brainstorming', async () => {
  const route = await readFile(new URL('../app/api/cos-primary/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('tryDomainAvailabilityLookup({input,context:precedingAssistant})') < route.indexOf('runOwnerDomainBrainstorm({input,context:precedingAssistant})'))
})

test('domain generation requests provider-enforced JSON rather than relying on prose compliance', async () => {
  const source = await readFile(new URL('../lib/ai/cos/domainBrainstorm.ts', import.meta.url), 'utf8')
  assert.match(source, /callCosReasoner\(\{[\s\S]*?jsonObject:\s*true/)
  assert.match(source, /frequencyPenalty:\s*0/)
  assert.match(source, /presencePenalty:\s*0/)
})

test('brainstorming has no hard-coded candidate fallback', async () => {
  const result = await brainstormVerifiedDomains({
    input:'brainstorm 15 names for a software SaaS platform', context:'domain URL',
    generateImpl:async()=>({ candidates:[], modelInvoked:false }),
  })
  assert.equal(result?.suggestions.length, 0)
  assert.match(result?.reply || '', /generated candidates and checked them/i)
  assert.doesNotMatch(result?.reply || '', /Nuvora|Forgepath|Klyro/)
})

test('brainstorms, verifies, and returns fifteen candidates without asking the owner to narrow', async () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({ name:`Nuvora${index}`,domain:`nuvora${index}.dev`,meaning:`Software creation concept ${index}` }))
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes('data.iana.org')) return new Response(JSON.stringify({ services: [[['dev'], ['https://rdap.example.dev']]] }), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const result = await brainstormVerifiedDomains({
    input:'brainstorm and come out with 15 suggestions for the software and SaaS platform',
    context:'shorter domain URL', fetchImpl:fakeFetch,
    generateImpl:async()=>({ candidates, modelInvoked:true }),
  })
  assert.equal(result?.suggestions.length, 15)
  assert.match(result?.reply || '', /1\. \*\*Nuvora0\*\*/)
  assert.match(result?.reply || '', /15\. \*\*Nuvora14\*\*/)
  assert.doesNotMatch(result?.reply || '', /tell me|narrow|if available/i)
})

test('regenerates after a fully registered naming wave and excludes rejected domains', async () => {
  const exclusions: string[][] = []
  let wave = 0
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes('data.iana.org')) return new Response(JSON.stringify({ services: [[['dev'], ['https://rdap.example.dev']]] }), { status: 200 })
    return new Response('{}', { status: String(url).includes('fresh') ? 404 : 200 })
  }) as typeof fetch
  const result = await brainstormVerifiedDomains({
    input:'suggest 2 names for this software SaaS platform', context:'shorter domain URL', fetchImpl:fakeFetch,
    generateImpl:async(_input, _count, excluded=[]) => {
      exclusions.push(excluded)
      wave += 1
      return wave === 1
        ? { candidates:[{name:'TakenOne',domain:'taken-one.dev',meaning:'First checked concept'},{name:'TakenTwo',domain:'taken-two.dev',meaning:'Second checked concept'}], modelInvoked:true }
        : { candidates:[{name:'TakenOne',domain:'taken-one.dev',meaning:'Repeated concept'},{name:'FreshOne',domain:'fresh-one.dev',meaning:'Fresh software concept'},{name:'FreshTwo',domain:'fresh-two.dev',meaning:'Fresh SaaS concept'}], modelInvoked:true }
    },
  })
  assert.deepEqual(exclusions, [[], ['taken-one.dev','taken-two.dev']])
  assert.deepEqual(result?.suggestions.map(item => item.domain), ['fresh-one.dev','fresh-two.dev'])
  assert.match(result?.reply || '', /2\. \*\*FreshTwo\*\*/)
})

test('preserves prior owner naming constraints and checks alternate TLDs before discarding a neural name', async () => {
  let generationInput = ''
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes('data.iana.org')) return new Response(JSON.stringify({ services: [[['com','ai','dev','app','io'], ['https://rdap.example']]] }), { status: 200 })
    return new Response('{}', { status: String(url).endsWith('/novara.dev') ? 404 : 200 })
  }) as typeof fetch
  const result = await brainstormVerifiedDomains({
    input:'suggest a shorter meaningful URL',
    context:'Forget Signal and Boost. Be creative.',
    fetchImpl:fakeFetch,
    generateImpl:async input => {
      generationInput = input
      return { candidates:[{name:'Novara',domain:'novara.com',meaning:'A novel software workspace'}], modelInvoked:true }
    },
  })
  assert.match(generationInput, /Forget Signal and Boost/)
  assert.deepEqual(result?.suggestions, [{name:'Novara',domain:'novara.dev',meaning:'A novel software workspace'}])
})

test('a subdomain is never misreported as an available registrable domain', async () => {
  const fakeFetch = (async (url: string | URL | Request) => {
    if (String(url).includes('data.iana.org')) return new Response(JSON.stringify({ services: [[['com'], ['https://rdap.example.com']]] }), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as typeof fetch
  const [result] = await lookupDomainsRdap(['saas.signalboostapp.com'], fakeFetch)
  assert.equal(result.status, 'unknown')
  assert.match(result.detail, /subdomain/i)
})
