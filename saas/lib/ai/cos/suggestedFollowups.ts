import { callLocalModel, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'
import { validateSuggestedFollowups } from './suggestedFollowupPolicy.ts'

export type FollowupSource = { title?: unknown; snippet?: unknown; url?: unknown }

const LOCAL_TIMEOUT_MS = 1_500

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function sourceContext(sources: FollowupSource[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const source of sources) {
    const title = clean(source?.title)
    const snippet = clean(source?.snippet)
    const url = clean(source?.url)
    const line = [title, snippet ? `— ${snippet.slice(0, 500)}` : '', url ? `(${url})` : ''].filter(Boolean).join(' ')
    if (!line || seen.has(line)) continue
    seen.add(line)
    out.push(line)
    if (out.length >= 8) break
  }
  return out
}

function parseFollowups(text: string): unknown {
  try {
    const parsed = JSON.parse(text)
    return parsed?.followups
  } catch {
    return null
  }
}

async function boundedLocalJson(prompt: string, reply: string, evidence: string[]): Promise<unknown> {
  const result = await Promise.race([
    callLocalModel({
      systemPrompt: [
        'Return ONLY strict JSON: {"followups":["question one?","question two?"]}.',
        'Produce exactly two standalone next questions only when both are naturally connected to the answered topic and answerable by continuing research from the supplied answer/evidence.',
        'Each question must carry enough subject, entity, jurisdiction, event, or comparison context to make sense as a new user message without relying on pronouns such as it, this, that, they, these, or the previous answer.',
        'Use only the user question, answer, and evidence supplied. Do not invent a person, event, date, number, premise, or causal claim.',
        'Prefer an unresolved angle explicitly exposed by the answer or evidence. A source title alone is not proof that an angle is answerable; use its snippet when available.',
        'Never suggest a question merely because it sounds related. If two genuinely supported standalone questions cannot be formed, return {"followups":[]}.',
        'Questions only; do not answer them or assert facts.',
      ].join(' '),
      prompt: `USER QUESTION:\n${prompt}\n\nANSWER:\n${reply}\n\nCURRENT TURN EVIDENCE:\n${evidence.join('\n') || '(none beyond the verified answer)'}`,
      maxTokens: 160,
      temperature: 0,
    }, { ...localInferenceConfigFromEnv(), timeoutMs: LOCAL_TIMEOUT_MS }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), LOCAL_TIMEOUT_MS)),
  ])
  return typeof result === 'string' ? parseFollowups(result) : null
}

/** Optional post-answer product surface. It never changes answer generation or provenance. */
export async function suggestFollowups(args: {
  prompt: string
  reply: string
  sources?: FollowupSource[]
  failedClosed?: boolean
}): Promise<string[]> {
  const prompt = clean(args.prompt)
  const reply = clean(args.reply)
  if (!prompt || !reply || args.failedClosed) return []
  try {
    const generated = await boundedLocalJson(prompt, reply.slice(0, 4_000), sourceContext(args.sources || []))
    return validateSuggestedFollowups(generated, prompt, [])
  } catch {
    return []
  }
}
