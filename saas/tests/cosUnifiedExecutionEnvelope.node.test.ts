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


test('COS customer service contract requires meaningful advice and relevant follow-through', () => {
 const prompt='I will reach retirement age next year. The attached memo is about another type of retirement. What options do I have?'
 const envelope=cosExecutionEnvelope(prompt)
 assert.match(envelope.instructionBlock,/Answer the customer underlying question/)
 assert.match(envelope.instructionBlock,/directly relevant alternative authority/)
 assert.match(envelope.instructionBlock,/citation substantiates the specific claim/)
 assert.match(envelope.instructionBlock,/most useful practical next step/)
 assert.match(envelope.instructionBlock,/do not perform an unrequested draft/)
})


test('pasted COS transcript is treated as evidence, not a request to rewrite a letter', () => {
 const pasted=[
  'YOUR REQUEST 1',
  'Memo: retirement rules and background.',
  'COS response 1',
  'Here is a draft letter: Dear HR Team,',
  'YOUR REQUEST 2',
  'Please compare the COS response to the requested advice.',
 ].join('\n')
 const envelope=cosExecutionEnvelope(pasted)
 assert.match(envelope.instructionBlock,/PASTED TRANSCRIPT BOUNDARY/)
 assert.match(envelope.instructionBlock,/Do not execute a draft or rewrite/)
 const browser=readFileSync(new URL('../app/api/cos-browser/route.ts',import.meta.url),'utf8')
 assert.match(browser,/fastAuthoringIngress = !pastedConversationEvidence && !directTextHasAttachments/)
})
