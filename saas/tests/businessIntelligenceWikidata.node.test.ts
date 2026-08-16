import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWikidataCompanyBindings } from '../lib/business-intelligence-corpus/wikidata-public-parser.ts'

test('Wikidata company parsing keeps sourced business identity and official website', () => {
  const parsed = parseWikidataCompanyBindings([
    {
      item: { value: 'http://www.wikidata.org/entity/Q312' },
      itemLabel: { value: 'Apple Inc.' },
      website: { value: 'https://www.apple.com/' },
      countryLabel: { value: 'United States of America' },
      industryLabel: { value: 'technology industry' },
    },
  ])

  assert.deepEqual(parsed, [{
    qid: 'Q312',
    itemUrl: 'http://www.wikidata.org/entity/Q312',
    companyName: 'Apple Inc.',
    canonicalDomain: 'apple.com',
    website: 'https://www.apple.com/',
    country: 'United States of America',
    industry: 'technology industry',
  }])
})

test('Wikidata company parsing rejects labels that are only unresolved QIDs and invalid websites', () => {
  const parsed = parseWikidataCompanyBindings([
    {
      item: { value: 'http://www.wikidata.org/entity/Q1' },
      itemLabel: { value: 'Q1' },
      website: { value: 'https://example.com/' },
    },
    {
      item: { value: 'http://www.wikidata.org/entity/Q2' },
      itemLabel: { value: 'Example Company' },
      website: { value: 'mailto:hello@example.com' },
    },
  ])

  assert.equal(parsed.length, 0)
})

test('Wikidata company parsing deduplicates multiple statements by canonical domain', () => {
  const parsed = parseWikidataCompanyBindings([
    {
      item: { value: 'http://www.wikidata.org/entity/Q10' },
      itemLabel: { value: 'Example Incorporated' },
      website: { value: 'https://www.example.com/' },
      industryLabel: { value: 'software industry' },
    },
    {
      item: { value: 'http://www.wikidata.org/entity/Q10' },
      itemLabel: { value: 'Example Inc.' },
      website: { value: 'https://example.com/about' },
      industryLabel: { value: 'technology industry' },
    },
  ])

  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.canonicalDomain, 'example.com')
  assert.equal(parsed[0]?.companyName, 'Example Incorporated')
})

test('Wikidata company parsing counts one QID once across regional official websites', () => {
  const parsed = parseWikidataCompanyBindings([
    {
      item: { value: 'http://www.wikidata.org/entity/Q312' },
      itemLabel: { value: 'Apple Inc.' },
      website: { value: 'https://apple.com.cn/' },
    },
    {
      item: { value: 'http://www.wikidata.org/entity/Q312' },
      itemLabel: { value: 'Apple Inc.' },
      website: { value: 'https://apple.com/ae-ar/' },
    },
    {
      item: { value: 'http://www.wikidata.org/entity/Q312' },
      itemLabel: { value: 'Apple Inc.' },
      website: { value: 'https://apple.com/' },
    },
  ])

  assert.equal(parsed.length, 1)
  assert.equal(parsed[0]?.qid, 'Q312')
  assert.equal(parsed[0]?.canonicalDomain, 'apple.com')
  assert.equal(parsed[0]?.website, 'https://apple.com/')
})
