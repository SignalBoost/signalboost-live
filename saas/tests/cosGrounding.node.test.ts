import assert from 'node:assert/strict'
import test from 'node:test'
import { groundingConfidenceCap, selectGroundingEvidence } from '../lib/ai/cos/grounding.ts'

const QUERY='Explain Postgres query planning for enterprise tenant latency and Kubernetes scaling behavior.'

test('selects relevant evidence across corpus, knowledge graph and memory without forcing irrelevant rows',()=>{
  const selected=selectGroundingEvidence(QUERY,{
    kg:['[KG1] Kubernetes scaling behavior depends on pending pods and scheduler capacity.','[KG2] unrelated marketing fact'],
    cl:['[CL1] Postgres query planning can change after statistics refresh and alter latency.','[CL2] unrelated travel article'],
    em:['[EM1] Prior enterprise tenant latency incident involved query-plan regression.','[EM2] family preference unrelated to systems'],
  },5)
  assert.ok(selected.some(item=>item.system==='kg'))
  assert.ok(selected.some(item=>item.system==='cl'))
  assert.ok(selected.some(item=>item.system==='em'))
  assert.ok(!selected.some(item=>item.text.includes('travel article')))
})

test('caps confidence below default threshold when selected evidence is ignored',()=>{
  assert.equal(groundingConfidenceCap({retrieved:12,selected:4,cited:0}),0.70)
})

test('does not penalize when relevant evidence is cited or none was selected',()=>{
  assert.equal(groundingConfidenceCap({retrieved:12,selected:4,cited:1}),1)
  assert.equal(groundingConfidenceCap({retrieved:12,selected:0,cited:0}),1)
})
