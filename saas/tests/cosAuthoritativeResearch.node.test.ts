import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorityScore,
  authorityTier,
  authoritativeEvidenceIsSufficient,
  authoritativeSearchQuery,
  prepareAuthoritativeEvidence,
} from '../lib/ai/cos/cosAuthoritativeResearch.ts'
import type { CosEvidencePolicy } from '../lib/ai/cos/cosEvidencePolicy.ts'

const freshRequired: CosEvidencePolicy = { mode:'required', freshnessRequired:true, reason:'test' }
const stableRequired: CosEvidencePolicy = { mode:'required', freshnessRequired:false, reason:'test' }

test('government and first-party documentation rank above arbitrary web pages without topic-specific rules', () => {
  const query='What is the latest Next.js version?'
  const government={title:'Official release information',url:'https://example.gov/releases',snippet:'Official release data'}
  const docs={title:'Next.js Documentation',url:'https://nextjs.org/docs',snippet:'Official documentation'}
  const blog={title:'My Next.js thoughts',url:'https://random-blog.example/posts/nextjs',snippet:'A blog post'}
  assert.equal(authorityTier(query,government),'primary')
  assert.equal(authorityTier(query,docs),'primary')
  assert.ok(authorityScore(query,docs)>authorityScore(query,blog))
})

test('evidence preparation is generic and authority-ranked', () => {
  const sources=prepareAuthoritativeEvidence('Who is the current CEO of Acme?',[
    {title:'Opinion post',url:'https://random.example/acme',snippet:'Commentary'},
    {title:'Acme Official Leadership',url:'https://acme.com/leadership',snippet:'Leadership team'},
    {title:'Regulatory filing',url:'https://www.sec.gov/example',snippet:'Filing'},
  ])
  assert.equal(sources.length,3)
  assert.equal(sources[0]?.authorityTier,'primary')
  assert.ok(sources.some(source=>source.host==='acme.com'))
})

test('fresh facts require strong authority while stable facts can use institutional evidence', () => {
  const primary=prepareAuthoritativeEvidence('current leader',[
    {title:'Official government page',url:'https://agency.gov/leader',snippet:'Leader'},
  ])
  assert.equal(authoritativeEvidenceIsSufficient(freshRequired,primary),true)

  const institutional=prepareAuthoritativeEvidence('Hamlet Shakespeare',[
    {title:'Hamlet — Shakespeare institution',url:'https://example.org/hamlet',snippet:'Hamlet by Shakespeare'},
  ])
  assert.equal(authoritativeEvidenceIsSufficient(stableRequired,institutional),true)
})

test('fresh search query matches the existing current-fact cache key shape', () => {
  const query=authoritativeSearchQuery('Who is the current US president?',freshRequired,new Date('2026-08-15T12:00:00.000Z'))
  assert.equal(query,'Who is the current US president? official authoritative source current as of 2026-08-15')
})
