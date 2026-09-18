// saas/lib/ai/cos/openAiStreamReader.ts

/**
 * Accumulates an OpenAI-compatible SSE stream into one string. A server that ignores `stream` and
 * answers with a normal JSON body is still handled, so this cannot become a new failure mode.
 * A stream that ends without its terminator is rejected: a silently truncated evaluation answer
 * would be scored as if the student had stopped early on merit.
 */
export async function readOpenAiStream(response: Response, onChunk: () => void = () => {}): Promise<string> {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('text/event-stream')) {
    const payload: any = await response.json()
    return String(payload?.choices?.[0]?.message?.content || '')
  }
  if (!response.body) throw new Error('distilled_evaluation_runpod_stream_missing')

  const decoder = new TextDecoder()
  const reader = (response.body as any).getReader()
  let buffered = ''
  let text = ''
  let terminated = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk()
    buffered += decoder.decode(value, { stream: true })
    const lines = buffered.split('\n')
    // The last element may be a partial line; keep it for the next read.
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') { terminated = true; continue }
      try {
        const parsed: any = JSON.parse(data)
        const delta = parsed?.choices?.[0]?.delta?.content
        if (typeof delta === 'string') text += delta
        // Some servers emit a final full message instead of a delta on the closing chunk.
        const whole = parsed?.choices?.[0]?.message?.content
        if (!delta && typeof whole === 'string') text += whole
      } catch {
        // A malformed chunk is not fatal on its own; truncation is caught by the terminator check.
      }
    }
  }

  if (!terminated) throw new Error('distilled_evaluation_runpod_stream_truncated')
  return text
}
