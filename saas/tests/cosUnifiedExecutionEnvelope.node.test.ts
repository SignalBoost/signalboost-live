import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cosExecutionEnvelope, cosAnswerProgress } from '../lib/ai/cos/cosExecutionEnvelope.ts'
import { isConciergeBuilderObjective } from '../lib/ai/cos/cosReasoningRolePolicy.ts'

const incident = 'Only investigate. Do NOT write code, create files, or generate a project.\n1. List plausible root causes.\n2. Rank the causes.\n3. Identify missing evidence.\n4. Design discriminating experiments.'
test('instruction, communication and context envelope preserve exact deliverables and prohibitions',()=>{
 const e=cosExecutionEnvelope(incident)
 assert.equal(e.originalObjective,incident)
 assert.equal(e.contract.prohibitsExecution,true)
 assert.equal(e.contract.deliverables.length,4)
 assert.match(e.instructionBlock,/ANALYSIS ONLY/)
 assert.equal(isConciergeBuilderObjective(incident),false)
})
test('loop observes unanswered deliverables instead of treating fluent text as completion',()=>{
 const answer='### 1. Plausible root causes\nQueue lag, duplicate consumer dispatch.'
 const r=cosAnswerProgress(incident,answer)
 assert.equal(r.complete,false)
 assert.ok(r.missing.length>0)
 const next=cosAnswerProgress(incident,answer,r.missing.length)
 assert.equal(next.decision,'change-strategy')
})
test('real software build remains executable under the shared contract',()=>{
 const input='Build a Node.js application with a package.json and src/index.js, and run npm test.'
 assert.equal(cosExecutionEnvelope(input).contract.prohibitsExecution,false)
 assert.equal(isConciergeBuilderObjective(input),true)
})
test('reasoner actually consumes the contract and evaluates loop progress',()=>{
 const source=readFileSync(new URL('../lib/ai/cos/cosReasoner.ts',import.meta.url),'utf8')
 assert.ok(source.includes('const execution = cosExecutionEnvelope(args.prompt)'))
 assert.ok(source.includes('cosAnswerProgress(args.prompt, firstParsedForPolicy.answer)'))
})
