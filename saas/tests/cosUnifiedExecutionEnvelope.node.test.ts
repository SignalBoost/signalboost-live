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

test('shared outcome authority binds advisory requests without substituting unsolicited artifacts',()=>{
 const request='I need advice about an upcoming retirement, based on the memo below. What options should I consider?'
 const envelope=cosExecutionEnvelope(request)
 assert.match(envelope.instructionBlock,/Do not replace requested advice or explanation with an unsolicited letter, email/)
 const reasoner=readFileSync(new URL('../lib/ai/cos/cosReasoner.ts',import.meta.url),'utf8')
 assert.match(reasoner,/systemPrompt: \[String\(args\.systemPrompt \?\? ''\), execution\.instructionBlock\]/)
 const builder=readFileSync(new URL('../lib/builder/agent-v2.ts',import.meta.url),'utf8')
 assert.match(builder,/systemPrompt: \[SYSTEM_PROMPT, USER_OUTCOME_AUTHORITY\]/)
})

test('a completed-looking answer cannot mint its own verified receipt', () => {
 const prompt = '1. Identify the cause.\n2. Rank the hypotheses.\n3. Explain the tests.'
 const answer = ['1. Cause: ' + 'network mismatch and reset evidence. '.repeat(8), '2. Ranking: ' + 'CNI first, network policy second. '.repeat(8), '3. Tests: ' + 'compare rollback and ingress packet traces. '.repeat(8)].join('\n')
 const result = cosAnswerProgress(prompt, answer)
 assert.equal(result.complete, false)
 assert.deepEqual(result.outstanding, ['requested_analytical_outcome'])
})

test('customer-service completion loop remains bound to COS and Builder reasoning', () => {
 const envelope = cosExecutionEnvelope('I am not TIC limited. Can I extend my age-65 retirement next year? The memo discusses TIC changes.')
 for (const stage of ['UNDERSTAND', 'INVESTIGATE', 'RESOLVE', 'ANTICIPATE', 'OFFER', 'REMEMBER']) {
  assert.ok(envelope.instructionBlock.includes(stage), stage)
 }
 assert.match(envelope.instructionBlock, /VERIFICATION GATE/)
 assert.match(envelope.instructionBlock, /answer the personal question first/)
 assert.match(envelope.instructionBlock, /sources that actually support them/)
 assert.match(envelope.instructionBlock, /do not send, purchase, deploy, alter accounts/)
 assert.match(envelope.instructionBlock, /never claim persistence without a storage receipt/)
})

test('closed-world incident remains an analysis task with no invented live-evidence requirement', () => {
 const envelope=cosExecutionEnvelope(incident)
 assert.match(envelope.instructionBlock, /For a supplied-facts incident with enumerated deliverables/)
 assert.equal(envelope.contract.prohibitsExecution,true)
})
