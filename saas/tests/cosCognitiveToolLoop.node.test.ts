import test from 'node:test'
import assert from 'node:assert/strict'
import { CosCognitiveToolLoop, CosCognitiveToolRegistry } from '../lib/ai/cos/autonomy/index.ts'

function aiFrom(outputs: string[]) {
  let index = 0
  return { async generate() { return outputs[index++] ?? '{"type":"answer","answer":"done"}' } }
}

test('COS autonomously gathers multiple pieces of evidence before answering', async () => {
  const tools = new CosCognitiveToolRegistry()
    .register({ toolId: 'repo.list', description: 'list', risk: 'read_only', async execute() { return { ok: true, output: ['a.ts'] } } })
    .register({ toolId: 'repo.read', description: 'read', risk: 'read_only', async execute(input) { return { ok: true, output: `content:${input.path}` } } })
  const ai = aiFrom([
    '{"type":"tool","toolId":"repo.list","input":{},"reason":"find files"}',
    '{"type":"tool","toolId":"repo.read","input":{"path":"a.ts"},"reason":"inspect implementation"}',
    '{"type":"answer","answer":"The implementation is in a.ts."}',
  ])
  const result = await new CosCognitiveToolLoop(ai as any, tools).run({ objective: 'Find the implementation.' })
  assert.equal(result.ok, true)
  assert.equal(result.answer, 'The implementation is in a.ts.')
  assert.deepEqual(result.trace.map(x => x.toolId), ['repo.list', 'repo.read'])
})

test('COS cannot invoke undeclared tools', async () => {
  const result = await new CosCognitiveToolLoop(aiFrom(['{"type":"tool","toolId":"shell.exec","input":{}}']) as any, new CosCognitiveToolRegistry()).run({ objective: 'do it' })
  assert.equal(result.ok, false)
  assert.match(result.error || '', /cos_unknown_tool/)
})

test('cognitive loop refuses mutation and external-effect tools without governance', async () => {
  const tools = new CosCognitiveToolRegistry().register({ toolId: 'email.send', description: 'send', risk: 'external_effect', async execute() { throw new Error('must not execute') } })
  const result = await new CosCognitiveToolLoop(aiFrom(['{"type":"tool","toolId":"email.send","input":{}}']) as any, tools).run({ objective: 'send email' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'cos_tool_requires_governance:email.send')
})

test('repeated identical tool calls fail closed instead of looping', async () => {
  const tools = new CosCognitiveToolRegistry().register({ toolId: 'web.search', description: 'search', risk: 'read_only', async execute() { return { ok: false, error: 'offline' } } })
  const ai = aiFrom([
    '{"type":"tool","toolId":"web.search","input":{"query":"x"}}',
    '{"type":"tool","toolId":"web.search","input":{"query":"x"}}',
  ])
  const result = await new CosCognitiveToolLoop(ai as any, tools).run({ objective: 'research x' })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'cos_repeated_tool_call:web.search')
  assert.equal(result.trace.length, 1)
})
