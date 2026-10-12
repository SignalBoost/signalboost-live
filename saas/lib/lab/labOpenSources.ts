// saas/lib/lab/labOpenSources.ts
// Free training material for the customer LAB: open sources instead of a paid frontier teacher.
// Shared by the browser (the source list) and the server (turning documents into training examples).
// No AI model is involved: every answer is the source's own text, with its link and licence attached.
//
// Only material whose licence allows training is used: public domain, CC0, or CC BY-SA 4.0 (attribution is in every
// answer). OpenAlex and Semantic Scholar are deliberately NOT offered here: their abstracts belong to the publishers
// ("training rights not asserted"), so they may inform COS retrieval but must not be copied into a model's training set.

/** Open sources, alphabetical by name. Ids are stable API values; names are proper nouns (not translated). */
export const LAB_OPEN_SOURCES = Object.freeze([
  { id: 'huggingface_datasets', name: 'Hugging Face open datasets' },
  { id: 'gutenberg', name: 'Project Gutenberg' },
  { id: 'wikipedia', name: 'Wikipedia' },
] as const)
export type LabOpenSourceId = (typeof LAB_OPEN_SOURCES)[number]['id']
export const isLabOpenSourceId = (value: unknown): value is LabOpenSourceId => LAB_OPEN_SOURCES.some(item => item.id === value)

export const OPEN_SOURCE_MAX_EXAMPLES = 128
const CHUNK_MAX = 1500
const CHUNK_MIN = 200
const CHUNKS_PER_DOCUMENT = 6

export type OpenSourceDocument = Readonly<{ sourceId: LabOpenSourceId; uri: string; title: string; text: string; license: string }>
export type OpenSourceExample = Readonly<{ prompt: string; response: string; sourceId: LabOpenSourceId; uri: string }>

/** True only when the record's licence explicitly allows reuse for training. "Not asserted" always fails. */
export function hasTrainingRights(license: string): boolean {
  const text = String(license ?? '')
  if (/not asserted|metadata only|all rights reserved/i.test(text)) return false
  return /\b(public[ -]domain|cc0|cc by-sa 4\.0)\b/i.test(text)
}

/** A safe https link for a record: Hugging Face dataset references (hf://datasets/...) become their dataset page. */
export function sourceUrl(uri: string): string | null {
  const hf = /^hf:\/\/datasets\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:[#?].*)?$/.exec(uri)
  if (hf) return `https://huggingface.co/datasets/${hf[1]}`
  return /^https:\/\/[^\s]+$/.test(uri) ? uri : null
}

/** A topic is one short line of plain text. */
export function cleanTopic(raw: unknown): string {
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** Splits text into passages of at most CHUNK_MAX characters at sentence ends; passages under CHUNK_MIN are dropped. */
export function chunkText(text: string): string[] {
  const sentences = String(text ?? '').replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? []
  const chunks: string[] = []
  let current = ''
  for (const raw of sentences) {
    const sentence = raw.length > CHUNK_MAX ? raw.slice(0, CHUNK_MAX) : raw
    if (current && current.length + sentence.length > CHUNK_MAX) { chunks.push(current.trim()); current = '' }
    current += sentence
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(chunk => chunk.length >= CHUNK_MIN)
}

/**
 * Documents -> prompt/response examples. Takes passages round-robin across documents so one long book cannot crowd
 * out every other source, keeps at most OPEN_SOURCE_MAX_EXAMPLES, and drops exact repeats.
 */
export function buildOpenSourceExamples(topic: string, documents: readonly OpenSourceDocument[]): OpenSourceExample[] {
  const subject = cleanTopic(topic)
  const queues = documents
    .map(doc => ({ ...doc, uri: sourceUrl(doc.uri) ?? '' }))
    .filter(doc => doc.uri && doc.title.trim() && hasTrainingRights(doc.license))
    .map(doc => ({ doc, chunks: chunkText(doc.text).slice(0, CHUNKS_PER_DOCUMENT) }))
    .filter(queue => queue.chunks.length)
  const out: OpenSourceExample[] = []
  const seen = new Set<string>()
  for (let round = 0; out.length < OPEN_SOURCE_MAX_EXAMPLES && queues.some(queue => queue.chunks.length > round); round++) {
    for (const { doc, chunks } of queues) {
      if (out.length >= OPEN_SOURCE_MAX_EXAMPLES) break
      const passage = chunks[round]
      if (!passage || seen.has(passage)) continue
      seen.add(passage)
      const title = doc.title.trim().slice(0, 200)
      const prompt = round === 0
        ? `${subject}: what does "${title}" say?`
        : `${subject}: what else does "${title}" say? (part ${round + 1})`
      const response = `${passage}\n\nSource: ${title} - ${doc.uri} (${doc.license || 'see source'})`
      out.push(Object.freeze({ prompt, response, sourceId: doc.sourceId, uri: doc.uri }))
    }
  }
  return out
}

/** The examples box format the LAB already trains from: one {"prompt","response"} JSON object per line. */
export const examplesToJsonl = (examples: readonly OpenSourceExample[]) =>
  examples.map(example => JSON.stringify({ prompt: example.prompt, response: example.response })).join('\n')
