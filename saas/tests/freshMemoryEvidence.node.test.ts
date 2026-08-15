import assert from 'node:assert/strict'
import test from 'node:test'
import { freshMemoryEvidenceIsSufficient, type FreshMemoryEvidenceSource } from '../lib/ai/cos/freshMemoryEvidence.ts'
import type { CosFreshnessPolicy } from '../lib/ai/cos/cosFreshnessPolicy.ts'

const policy:CosFreshnessPolicy={required:true,maxMemoryAgeMs:60*60*1000,reason:'test',forceLiveVerification:false}

function source(overrides:Partial<FreshMemoryEvidenceSource>):FreshMemoryEvidenceSource{return{
  id:'MEM1',title:'Source',url:'https://example.com/item',snippet:'relevant current fact',observedAt:'2026-08-15T12:00:00.000Z',ageMs:60_000,sourceKind:'news_article',confidence:0.64,authority:'news',host:'example.com',relevance:0.5,...overrides,
}}

test('one recent primary source is sufficient fresh memory',()=>{
  assert.equal(freshMemoryEvidenceIsSufficient(policy,[source({authority:'primary',confidence:0.72,host:'agency.gov'})]),true)
})

test('one news report alone is not enough to freeze a current fact into memory',()=>{
  assert.equal(freshMemoryEvidenceIsSufficient(policy,[source({authority:'news',host:'wire.example'})]),false)
})

test('two independent recent sourced reports can corroborate memory',()=>{
  assert.equal(freshMemoryEvidenceIsSufficient(policy,[
    source({id:'MEM1',host:'wire-one.example',url:'https://wire-one.example/a'}),
    source({id:'MEM2',host:'wire-two.example',url:'https://wire-two.example/b'}),
  ]),true)
})

test('two URLs on the same host do not count as independent corroboration',()=>{
  assert.equal(freshMemoryEvidenceIsSufficient(policy,[
    source({id:'MEM1',host:'same.example',url:'https://same.example/a'}),
    source({id:'MEM2',host:'same.example',url:'https://same.example/b'}),
  ]),false)
})

test('explicit live verification never accepts remembered evidence',()=>{
  const forced={...policy,forceLiveVerification:true,maxMemoryAgeMs:0}
  assert.equal(freshMemoryEvidenceIsSufficient(forced,[source({authority:'primary',confidence:0.9,host:'agency.gov'})]),false)
})
