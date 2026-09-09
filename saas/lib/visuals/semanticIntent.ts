// saas/lib/visuals/semanticIntent.ts
// The reasoner is loaded lazily rather than imported at module scope: its own
// module graph uses path aliases the plain test runner cannot resolve, and this
// classifier must stay unit-testable without booting the whole COS stack.
import { boundedRecentUserTurns, composeUserAuthoredVisualObjective } from './conversationIntent.ts'

type VisualIntentReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>
type ConversationMessage = Readonly<{ role?: unknown; content?: unknown }>

export type SemanticVisualResolution = Readonly<{
  objective: string
  semanticVisual: true
  continuation: boolean
}>

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('../ai/cos/cosReasoner.ts')
  return callCosReasoner(args as never)
}

/**
 * The deterministic gate in ./intent.ts handles obvious visual requests cheaply.
 * The reasoner handles everything the finite vocabulary cannot understand.
 *
 * Fails closed: any transport failure, malformed output, or ambiguity returns false.
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

const CONVERSATION_SYSTEM_PROMPT = [
  'You are the semantic routing classifier for a visual-generation conversation.',
  'Use meaning, not keyword or regex matching.',
  'You receive only recent USER turns, numbered from oldest to newest. The newest numbered turn is the current request.',
  'Decide whether the CURRENT user turn asks to create, revise, improve, continue, or actually deliver a still visual such as an image, logo, drawing, poster, diagram, scene, portrait, or render.',
  'Elliptical follow-ups such as “do something better”, “I want the design”, or equivalent wording in another language can be visual continuations when the recent user conversation makes that meaning clear.',
  'A request to explain, discuss, critique, describe, write about, or analyze a visual is NOT a visual-generation request unless the current turn also asks for an actual visual deliverable.',
  'If a later user turn changed topic, do not resurrect an older visual request. In that case return visual_request false.',
  'If the current request is a new visual request, anchor_user_turn is the current turn index.',
  'If it is a continuation, anchor_user_turn is the earliest still-relevant user turn that defines the visual being revised, and every later user turn through the current turn must belong to the same visual thread.',
  'Return ONLY strict JSON with exactly these fields: {"visual_request": boolean, "anchor_user_turn": number|null}.',
  'When visual_request is false, anchor_user_turn must be null. Do not explain and do not add fields.',
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

function parseConversationVerdict(raw: string, turnCount: number): Readonly<{ visual: boolean; anchor: number | null }> | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      visual_request?: unknown
      anchor_user_turn?: unknown
    }
    if (typeof parsed?.visual_request !== 'boolean') return null
    if (parsed.visual_request === false) {
      return parsed.anchor_user_turn === null ? Object.freeze({ visual: false, anchor: null }) : null
    }
    if (!Number.isInteger(parsed.anchor_user_turn)) return null
    const anchor = Number(parsed.anchor_user_turn)
    if (anchor < 0 || anchor >= turnCount) return null
    return Object.freeze({ visual: true, anchor })
  } catch {
    return null
  }
}

export async function isSemanticVisualRequest(
  prompt: string,
  callImpl: VisualIntentReasoner = defaultReasoner,
): Promise<boolean> {
  const trimmed = typeof prompt === 'string' ? prompt.trim() : ''
  if (!trimmed || trimmed.length > MAX_CLASSIFIABLE_PROMPT) return false

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

/**
 * Deep-learning continuation resolver. The model decides semantic continuity; deterministic
 * code only bounds context, validates the verdict, and preserves the user's exact words.
 */
export async function resolveSemanticVisualRequest(
  messages: readonly ConversationMessage[],
  latestPrompt: string,
  callImpl: VisualIntentReasoner = defaultReasoner,
): Promise<SemanticVisualResolution | null> {
  const turns = boundedRecentUserTurns(messages, latestPrompt)
  if (turns.length === 0) return null

  const transcript = turns.map((turn, index) => `[${index}] ${turn}`).join('\n')
  const result = await callImpl({
    temperature: 0,
    maxTokens: 48,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: CONVERSATION_SYSTEM_PROMPT,
    prompt: `RECENT USER TURNS:\n${transcript}`,
  }).catch(() => null)

  if (!result?.text) return null
  const verdict = parseConversationVerdict(result.text, turns.length)
  if (!verdict?.visual || verdict.anchor === null) return null

  const objective = composeUserAuthoredVisualObjective(turns, verdict.anchor)
  if (!objective) return null
  return Object.freeze({
    objective,
    semanticVisual: true,
    continuation: verdict.anchor < turns.length - 1,
  })
}
