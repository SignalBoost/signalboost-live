import assert from 'node:assert/strict'
import test from 'node:test'
import { runCosAgentLoop, type AgentModelTurn } from '../lib/ai/cos/agentLoop/cosAgentLoop.ts'
import type { AgentToolPorts } from '../lib/ai/cos/agentLoop/cosAgentTools.ts'

const ports = {} as AgentToolPorts // No tools execute in these admission checks.

async function inspect(request: string) {
  let seen: { prompt: string; tools: string[] } | null = null
  const model: AgentModelTurn = async input => {
    seen = { prompt: input.systemPrompt, tools: input.tools.map(t => t.function.name) }
    return { content: 'I cannot verify this without more evidence.', toolCalls: [], finishReason: 'stop', provider: 'test', model: 'test' }
  }
  await runCosAgentLoop({
    request, language: 'en', model, ports,
    policy: { maxPythonRuns: 3, browserAllowed: false },
    deadlineAt: Date.now() + 90_000,
  })
  assert.ok(seen, 'model must receive the instruction contract')
  return seen
}

test('analysis-only instructions survive routing into the loop and remove executable tools', async () => {
  const seen = await inspect('Investigate this queue failure. Do not execute code or run tests.\n1. Describe root causes in detail\n2. Identify the missing evidence')
  assert.match(seen.prompt, /The user requested analysis only/)
  assert.match(seen.prompt, /Describe root causes in detail/)
  assert.match(seen.prompt, /Identify the missing evidence/)
  assert.ok(!seen.tools.includes('run_python'))
  assert.ok(seen.tools.includes('web_search'))
})

test('authorized software requests retain available calculation tools', async () => {
  const seen = await inspect('Create a project and explain the implementation.')
  assert.ok(seen.tools.includes('run_python'))
  assert.doesNotMatch(seen.prompt, /The user requested analysis only/)
})

test('a model-issued forbidden call is blocked at execution, even if the model ignores tool listings', async () => {
  let calls = 0
  let attemptedExecution = false
  const model: AgentModelTurn = async input => {
    calls += 1
    if (calls === 1) return {
      content: '', finishReason: 'tool_calls', provider: 'test', model: 'test',
      toolCalls: [{ id: 'forbidden-1', type: 'function', function: { name: 'run_python', arguments: JSON.stringify({ code: 'print(42)' }) } }],
    }
    return { content: 'Analysis completed without execution.', toolCalls: [], finishReason: 'stop', provider: 'test', model: 'test' }
  }
  const result = await runCosAgentLoop({
    request: 'Investigate this discrepancy. Do not execute code or run tests.',
    language: 'en', model,
    ports: { ...ports, python: { run: async () => { attemptedExecution = true; throw new Error('unexpected execution') } } } as unknown as AgentToolPorts,
    policy: { maxPythonRuns: 3, browserAllowed: false },
    deadlineAt: Date.now() + 90_000,
  })
  assert.equal(attemptedExecution, false)
  assert.equal(result?.reply, 'Analysis completed without execution.')
  assert.ok(calls >= 2)
})
