import assert from 'node:assert/strict'
import test from 'node:test'
import { runCosAgentLoop, type AgentModelTurn } from '../lib/ai/cos/agentLoop/cosAgentLoop.ts'
import type { AgentToolPorts } from '../lib/ai/cos/agentLoop/cosAgentTools.ts'
import { SUPPORTED_LANGUAGES } from '../lib/i18n/supportedLanguages.ts'

const ports: AgentToolPorts = {
  search: async () => [],
  fetchPublic: async url => ({ status: 404, text: '', finalUrl: url, contentType: 'text/plain' }),
  python: {
    async run() { throw new Error('Unexpected Python execution in contract verification') },
    async close() {},
  },
}

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
    ports: { ...ports, python: { run: async () => { attemptedExecution = true; throw new Error('unexpected execution') }, close: async () => {} } } as AgentToolPorts,
    policy: { maxPythonRuns: 3, browserAllowed: false },
    deadlineAt: Date.now() + 90_000,
  })
  assert.equal(attemptedExecution, false)
  assert.equal(result?.reply, 'Analysis completed without execution.')
  assert.ok(calls >= 2)
})

test('older user restrictions survive conversation truncation without granting tools', async () => {
  let captured: readonly { role: string; content?: string | null }[] = []
  const model: AgentModelTurn = async input => {
    captured = input.messages
    return { content: 'Completed with available evidence.', toolCalls: [], finishReason: 'stop', provider: 'test', model: 'test' }
  }
  await runCosAgentLoop({
    request: 'Explain the findings.',
    conversation: [
      { role: 'user', content: 'Never publish private customer data. Limit spending to 50 cents.' },
      ...Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: 'A routine context message number ' + i })),
    ],
    language: 'en', model, ports,
    policy: { maxPythonRuns: 2, browserAllowed: false }, deadlineAt: Date.now() + 90_000,
  })
  assert.match(captured.map(message => message.content || '').join('\n'), /Never publish private customer data/)
  assert.equal(captured.at(-1)?.content, 'Explain the findings.')
})

test('historical constraints are bounded and do not transform the latest request into execution authorization', async () => {
  let content = ''
  const model: AgentModelTurn = async input => {
    content = input.messages.map(m => m.content || '').join(' ')
    return { content: 'Analysis completed.', toolCalls: [], finishReason: 'stop', provider: 'test', model: 'test' }
  }
  await runCosAgentLoop({
    request: 'Investigate the incident. Do not execute code.',
    conversation: Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: 'Never expose API credentials in report section ' + i })),
    language: 'en', model, ports, policy: { maxPythonRuns: 2, browserAllowed: false },
    deadlineAt: Date.now() + 90_000,
  })
  assert.ok(content.length < 30_000)
  assert.match(content, /Never expose API credentials/)
})

test('historical constraints in every required COS language reach the model', async () => {
  const requirements = [
    'Do not share secrets with vendors.',
    'Nunca compartas contraseñas con terceros.',
    'Não divulgue credenciais particulares.',
    'Nigdy nie ujawniaj poufnych danych.',
    'Никогда не раскрывайте секретные данные.',
    'Niemals vertrauliche Kundendaten veröffentlichen.',
    'Ne jamais partager les données confidentielles.',
    'Non divulgare informazioni riservate.',
    '顧客の秘密情報を公開しないでください。',
    '고객의 비밀 정보를 공유하지 마세요.',
    'لا تشارك معلومات العملاء السرية.',
  ]
  assert.deepEqual([...SUPPORTED_LANGUAGES], ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'])
  assert.equal(requirements.length, SUPPORTED_LANGUAGES.length)
  let captured = ''
  const model: AgentModelTurn = async input => {
    captured = input.messages.map(message => message.content || '').join(' ')
    return { content: 'Done.', toolCalls: [], finishReason: 'stop', provider: 'test', model: 'test' }
  }
  await runCosAgentLoop({
    request: 'Review the summary.',
    conversation: [
      ...requirements.map(content => ({ role: 'user' as const, content })),
      ...Array.from({ length: 7 }, (_, i) => ({ role: 'assistant' as const, content: 'Routine follow-up ' + i })),
    ],
    language: 'en', model, ports, policy: { maxPythonRuns: 2, browserAllowed: false },
    deadlineAt: Date.now() + 90_000,
  })
  for (const requirement of requirements) assert.ok(captured.includes(requirement), 'missing: ' + requirement)
})
