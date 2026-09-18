// saas/tests/distilledEvaluationStream.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import { readOpenAiStream } from '../lib/ai/cos/openAiStreamReader.ts'

const source = readFileSync('lib/ai/cos/cosUniversityDistilledArtifactEvaluation.ts', 'utf8')

function sseResponse(chunks: readonly string[], contentType = 'text/event-stream'): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers: { 'content-type': contentType } })
}

function delta(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
}

test('chunked deltas accumulate in order into one answer', async () => {
  const text = await readOpenAiStream(sseResponse([
    delta('Case 1: '),
    delta('the priority queue '),
    delta('orders by priority.'),
    'data: [DONE]\n\n',
  ]))
  assert.equal(text, 'Case 1: the priority queue orders by priority.')
})

test('a delta split across two reads is reassembled, not dropped', async () => {
  const whole = delta('alpha beta')
  const text = await readOpenAiStream(sseResponse([
    whole.slice(0, 18),
    whole.slice(18),
    'data: [DONE]\n\n',
  ]))
  assert.equal(text, 'alpha beta')
})

test('a stream that ends without its terminator is rejected as truncated', async () => {
  await assert.rejects(
    () => readOpenAiStream(sseResponse([delta('half an ans')])),
    /distilled_evaluation_runpod_stream_truncated/,
  )
})

test('a server that ignores stream and returns JSON still works', async () => {
  const response = new Response(
    JSON.stringify({ choices: [{ message: { content: 'buffered answer' } }] }),
    { headers: { 'content-type': 'application/json' } },
  )
  assert.equal(await readOpenAiStream(response), 'buffered answer')
})

test('every chunk resets the idle watchdog', async () => {
  let ticks = 0
  await readOpenAiStream(sseResponse([delta('a'), delta('b'), 'data: [DONE]\n\n']), () => { ticks += 1 })
  assert.ok(ticks >= 3, `expected a tick per read, saw ${ticks}`)
})

test('the evaluation request preserves bounded non-thinking generation while streaming', () => {
  assert.match(source, /temperature: 0,/)
  assert.match(source, /MAX_BATCH_COMPLETION_TOKENS = 960/)
  assert.match(source, /BATCH_COMPLETION_TOKENS_PER_CASE = 80/)
  assert.match(source, /chat_template_kwargs: \{ enable_thinking: false \}/)
  assert.match(source, /stream: true/)
  assert.doesNotMatch(source, /AbortSignal\.timeout\(120_000\)/)
})
