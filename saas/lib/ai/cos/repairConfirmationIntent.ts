// saas/lib/ai/cos/repairConfirmationIntent.ts

/**
 * The passive-log guard is correct: a build log full of the word "failed" must never
 * authorise a repository mutation by itself. What was wrong was the SHAPE of asking.
 * The diagnostic offered to repair, and then required the person to type a specific
 * phrase — "fix it" — for that offer to count. A human who is handed something and
 * asked "want me to fix it?" answers "yes", "go", "please", "sim", "tak", "да", or
 * nothing recognisable to a regex at all, and reasonably expects to be understood.
 *
 * This decides that with the network: given that the previous turn offered to repair,
 * is this short reply an authorisation, a refusal, or a different request entirely?
 * No vocabulary list, so it works in any phrasing and any of the five platform
 * languages. It changes only how consent is recognised — never who may repair what.
 *
 * Bounded on both sides. It is consulted ONLY when the previous assistant turn was
 * our own repair offer and the turn before it was passive log evidence, so a log can
 * still never authorise itself. It fails closed: any transport failure, malformed
 * output, or ambiguity returns false and the turn keeps today's exact behaviour.
 */

type RepairConfirmationReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('./cosReasoner.ts')
  return callCosReasoner(args as never)
}

// A confirmation is a short human answer. Anything long is a new instruction and is
// left to ordinary routing rather than being read as a yes.
const MAX_CONFIRMATION_CHARS = 200

const SYSTEM_PROMPT = [
  'The assistant has just offered to repair a failing build and is waiting for the person to answer.',
  'Decide what the person\'s reply means.',
  'Return ONLY strict JSON: {"authorizes_repair": true} or {"authorizes_repair": false}.',
  'Answer true when the reply agrees, accepts, or tells the assistant to proceed — in any language, however brief, however casual, including impatient or profane agreement.',
  'Answer false when the reply declines, hesitates, asks a question, changes the subject, or gives a different instruction.',
  'Judge the reply as a human answer to the offer, not by matching particular words.',
  'Do not explain. Do not add fields.',
].join(' ')

function parseVerdict(raw: string): boolean | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { authorizes_repair?: unknown }
    return typeof parsed?.authorizes_repair === 'boolean' ? parsed.authorizes_repair : null
  } catch {
    return null
  }
}

export async function isRepairConfirmation(
  reply: string,
  callImpl: RepairConfirmationReasoner = defaultReasoner,
): Promise<boolean> {
  const trimmed = typeof reply === 'string' ? reply.trim() : ''
  if (!trimmed || trimmed.length > MAX_CONFIRMATION_CHARS) return false

  const result = await callImpl({
    temperature: 0,
    maxTokens: 24,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: `THE PERSON REPLIED:\n${trimmed}`,
  }).catch(() => null)

  if (!result?.text) return false
  return parseVerdict(result.text) === true
}
