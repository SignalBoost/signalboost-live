// saas/lib/visuals/namedSubjectIntent.ts

/**
 * `extractNamedPeople` in ./intent.ts is orthographic: two consecutive capitalised
 * words become a person. That is a reasonable way to PROPOSE candidates and a very
 * bad way to decide. "Noah's Ark" and "Eiffel Tower" were classified as people, sent
 * to verified-reference lookup, failed it, and the request was refused with "please
 * provide the full name or a reference image for the unresolved person" — for a boat
 * and a tower. Restating that the Ark is a vessel did not help, because nothing in
 * the path was reading meaning.
 *
 * This filters the proposed candidates with the network: which of these are real,
 * identifiable human beings whose likeness the picture must actually match? Capital
 * letters propose; the network disposes.
 *
 * The filter can only REMOVE candidates, never add them, so it cannot cause an
 * unverified likeness of a real person to be drawn. It fails SAFE rather than closed:
 * on any transport failure, malformed output, or ambiguity the candidates are returned
 * untouched, which preserves today's behaviour — verification still demanded. Failing
 * the other way would generate real people without reference verification.
 */

type NamedSubjectReasoner = (args: Record<string, unknown>) => Promise<{ text?: string } | null>

async function defaultReasoner(args: Record<string, unknown>) {
  const { callCosReasoner } = await import('../ai/cos/cosReasoner.ts')
  return callCosReasoner(args as never)
}

const MAX_CLASSIFIABLE_PROMPT = 600

const SYSTEM_PROMPT = [
  'Some capitalised phrases were extracted from an image request. Decide which of them name a real, identifiable human being whose actual likeness the image would have to match.',
  'Return ONLY strict JSON: {"people":["..."]} containing the subset that are real people, copied exactly as given.',
  'Real people include living or historical individuals, public figures, and named private individuals.',
  'NOT people: places, landmarks, buildings, vehicles, vessels, ships, animals, objects, artworks, brands, organisations, teams, events, books, films, deities, and mythological or scriptural things that are not persons.',
  'A phrase that merely contains a person\'s name but denotes an object is not a person — "Noah\'s Ark" is a vessel, not Noah; "Halley\'s Comet" is a comet.',
  'Judge the phrase as used in this request, in whatever language it is written.',
  'If none are real people, return {"people":[]}. Do not explain. Do not add fields. Do not invent names that were not given.',
].join(' ')

function parsePeople(raw: string, candidates: readonly string[]): string[] | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { people?: unknown }
    if (!Array.isArray(parsed?.people)) return null
    const returned = parsed.people.map(value => String(value).trim())
    // Only names that were proposed may survive; the model cannot introduce a subject.
    return candidates.filter(candidate => returned.includes(candidate))
  } catch {
    return null
  }
}

export async function filterRealPeople(
  prompt: string,
  candidates: readonly string[],
  callImpl: NamedSubjectReasoner = defaultReasoner,
): Promise<string[]> {
  const list = candidates.filter(candidate => typeof candidate === 'string' && candidate.trim())
  const trimmed = typeof prompt === 'string' ? prompt.trim() : ''
  if (!list.length) return []
  if (!trimmed || trimmed.length > MAX_CLASSIFIABLE_PROMPT) return [...list]

  const result = await callImpl({
    temperature: 0,
    maxTokens: 120,
    jsonObject: true,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: SYSTEM_PROMPT,
    prompt: `IMAGE REQUEST:\n${trimmed}\n\nCANDIDATE PHRASES:\n${list.map(candidate => `- ${candidate}`).join('\n')}`,
  }).catch(() => null)

  if (!result?.text) return [...list]
  return parsePeople(result.text, list) ?? [...list]
}
