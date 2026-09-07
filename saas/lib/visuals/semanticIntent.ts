// saas/lib/visuals/semanticIntent.ts
import { hasVisualActionToken } from './intent.ts'

// The reasoner is loaded lazily rather than imported at module scope: its own
// module graph uses path aliases the plain test runner cannot resolve, and this
// classifier must stay unit-testable without booting the whole COS stack.
type VisualIntentReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('../ai/cos/cosReasoner.ts')
  return callCosReasoner(args as never)
}

/**
 * The deterministic gate in ./intent.ts requires the prompt to contain a listed
 * picture-noun (image, picture, illustration, logo…). That made "draw 2 kids
 * playing football in the rain" invisible to the visual pipeline, because
 * "kids", "football" and "rain" are not in the noun list — and no finite noun
 * list ever covers what a person might ask to be drawn.
 *
 * This decides the same question semantically instead: given a request that
 * already carries a drawing verb, is the thing being asked for a depictable
 * picture, or is it ordinary work that happens to use the verb "create",
 * "make" or "design"? The noun list stays as the fast path; this only runs
 * when the noun list declined, so an accepted request costs no model call.
 *
 * Fails closed: any transport failure, malformed output, or ambiguity returns
 * false and the request keeps the exact behaviour it has today.
 */

const MAX_CLASSIFIABLE_PROMPT = 400

const SYSTEM_PROMPT = [
  'You decide whether a request asks for a PICTURE to be produced.',
  'Return ONLY strict JSON: {"depictable_image": true} or {"depictable_image": false}.',
  'Answer true when the requested deliverable is a still visual — a drawing, illustration, scene, portrait, diagram, poster, logo or photo-like image — regardless of which words name the subject.',
  'Answer false when the deliverable is text or work product: a plan, strategy, document, list, schema, database design, code, architecture written in prose, an email, a schedule, a name or a piece of analysis.',
  'The verbs create, make, design, generate and render appear in both kinds of request, so judge the OUTPUT being asked for, not the verb.',
  'Judge the request in whatever language it is written.',
  'Do not explain. Do not add fields.',
].join(' ')

function parseVerdict(raw: string): boolean | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { depictable_image?: unknown }
    return typeof parsed?.depictable_image === 'boolean' ? parsed.depictable_image : null
  } catch {
    return null
  }
}

export async function isSemanticVisualRequest(
  prompt: string,
  callImpl: VisualIntentReasoner = defaultReasoner,
): Promise<boolean> {
  const trimmed = typeof prompt === 'string' ? prompt.trim() : ''
  // A drawing verb is still required. Without it the request is not a visual
  // request in any phrasing, and this stays off the hot path for every turn
  // that never mentions drawing anything.
  if (!trimmed || trimmed.length > MAX_CLASSIFIABLE_PROMPT || !hasVisualActionToken(trimmed)) return false

  const result = await callImpl({
    temperature: 0,
    maxTokens: 24,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: `REQUEST:\n${trimmed}`,
  }).catch(() => null)

  if (!result?.text) return false
  return parseVerdict(result.text) === true
}
