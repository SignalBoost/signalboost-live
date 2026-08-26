// saas/lib/ai/cos/publicProvenanceNarrative.ts
// Dynamic public provenance ("where did you get the answer from?") for the Concierge channel.
//
// OWNER REQUIREMENT (2026-08-25, verbatim intent): NO HARDCODED REPLY. The Concierge must use its
// brain — the model itself answers where the information came from, in its own voice, creatively
// and differently each time ("I got the information from my training", "from my memory", etc.).
// A fixed sentence is only permitted when the model is genuinely unreachable, because an HTTP
// route cannot return nothing.
//
// What still holds absolutely (owner directive 2026-08-24, NOT revoked): the public channel never
// names a specific AI model, AI vendor, hosting provider, server, database, or internal system
// component, and never states confidence numbers. Generic self-description ("my training", "my
// memory", "my general knowledge", "as an AI assistant") is explicitly PERMITTED — the owner asked
// for exactly that phrasing.
//
// Anti-fabrication line (this codebase's provenance history): the model may speak freely about
// composing from its own training/memory, but it may NOT invent external sources — any URL in the
// generated reply that is not in the verified fact set rejects the reply. When the recorded
// provenance shows a cache replay or real retrieved public sources, those facts are handed to the
// model so its story matches reality.
//
// Zero-import pure module so it is unit-testable under node --test; the model call lives in the route.

export type PublicSourceRef = { title: string; url: string }

export type PublicProvenanceFacts = {
  /** The visitor's own prior request — context for the model; it is told NOT to quote it back. */
  originalRequest: string | null
  /** Excerpt of the answer being asked about. */
  priorAnswerExcerpt: string | null
  /** True only when a recorded provenance row marks a cache replay. */
  fromCache: boolean
  cachedAt: string | null
  /** Public URLs actually retrieved for that answer, from the recorded provenance. Max 3. */
  liveSources: PublicSourceRef[]
  /** Whether a recorded provenance row backs these facts (anonymous visitors have none). */
  recordAvailable: boolean
}

const MAX_SOURCES = 3
const MAX_REQUEST_CONTEXT = 300
const MAX_ANSWER_EXCERPT = 400
const MIN_NARRATIVE_CHARS = 30
const MAX_NARRATIVE_CHARS = 2200

function cleanText(value: unknown, cap: number): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length > cap ? `${text.slice(0, cap - 1)}…` : text
}

function validHttpUrl(value: unknown): string | null {
  const url = String(value ?? '').trim()
  return /^https?:\/\/\S+$/i.test(url) ? url : null
}

/** Defensive extraction from whatever provenance shape the recorded row carries. */
export function extractPublicProvenanceFacts(args: {
  record?: any
  originalRequest?: string | null
  priorAnswer?: string | null
}): PublicProvenanceFacts {
  const record = args.record ?? null
  const provenance = record?.provenance ?? record ?? null

  const fromCache = Boolean(provenance?.answer_origin?.from_cache)
  const cachedAt = fromCache
    ? cleanText(provenance?.answer_origin?.stored_at || provenance?.answer_origin?.grounded_at, 40)
    : null

  const rawSources: any[] = []
  for (const candidate of [
    provenance?.live_external_evidence?.sources,
    provenance?.fresh_evidence?.sources,
    provenance?.freshEvidence?.sources,
    provenance?.live_evidence_sources,
  ]) {
    if (Array.isArray(candidate)) rawSources.push(...candidate)
  }
  const seen = new Set<string>()
  const liveSources: PublicSourceRef[] = []
  for (const source of rawSources) {
    const url = validHttpUrl(source?.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    liveSources.push({ url, title: cleanText(source?.title, 120) || url })
    if (liveSources.length >= MAX_SOURCES) break
  }

  return {
    originalRequest: cleanText(args.originalRequest, MAX_REQUEST_CONTEXT),
    priorAnswerExcerpt: cleanText(args.priorAnswer, MAX_ANSWER_EXCERPT),
    fromCache,
    cachedAt,
    liveSources,
    recordAvailable: Boolean(record),
  }
}

// ---------------------------------------------------------------------------------------------
// Disclosure guard — NAMES only. Generic AI self-description is deliberately allowed ("my
// training", "my memory", "language model", "AI assistant") because the owner asked for it.
// Scope is only the public provenance narrative, so specific-name matching can be aggressive:
// a false positive costs one retry, a false negative leaks architecture to the public internet.
// ---------------------------------------------------------------------------------------------

const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'model_name', pattern: /\b(qwen|llama|mistral|deepseek|gemma|claude|anthropic|openai|chat\s?gpt|gpt-?\d|gemini|cohere|grok|phi-\d)\b/i },
  { label: 'infrastructure', pattern: /\b(ollama|runpod|deepinfra|vercel|supabase|postgres|postgrest|redis|kubernetes|docker|aws|azure|gcp)\b/i },
  { label: 'internal_component', pattern: /\b(reasoner|semantic\s+cache|exact\s+cache|knowledge\s+graph|learned\s+corpus|enterprise\s+memory|provenance\s+record|system\s+prompt|api\s+key|environment\s+variable|escalation\s+threshold)\b/i },
  { label: 'internal_table', pattern: /\bcos_[a-z_]+\b/i },
  { label: 'confidence_metric', pattern: /\bconfidence\s*(score|threshold)?\s*[:=]?\s*0?\.\d+/i },
]

/** Returns the violation label, or null when the text is publicly safe. */
export function publicDisclosureViolation(text: string): string | null {
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.pattern.test(text)) return rule.label
  }
  return null
}

function urlsIn(text: string): string[] {
  return (text.match(/https?:\/\/[^\s"'）)\]]+/gi) || []).map(url => url.replace(/[.,;:!?]+$/, ''))
}

const RECAST_VERB: Record<string, string> = {
  generated: 'generated', produced: 'produced', created: 'created', written: 'wrote', composed: 'composed',
}

/**
 * Deterministic salvage for the model's most stubborn habit (observed repeatedly in production):
 * opening with report-style narration — "The previous answer was generated by me based on…".
 * Instead of burning a retry on it, the opener is mechanically recast into first person
 * ("I generated it based on…") and the result re-checked. Touches ONLY the opener; the model's
 * own dynamic content is preserved. English-only, like the checks below.
 */
export function recastToFirstPerson(text: string): string {
  let result = text
  result = result.replace(
    /^\s*(?:The|That|This)\s+(?:previous|preceding|prior)?\s*(?:answer|response|reply)\s+(?:was|has been|is)\s+(generated|produced|created|written|composed)(?:\s+\w+ly)?\s+by\s+(?:me|cos|the\s+assistant|the\s+system|the\s+concierge)\s*,?\s*/i,
    (_match, verb: string) => `I ${RECAST_VERB[verb.toLowerCase()] || 'wrote'} it `,
  )
  result = result.replace(
    /^\s*(?:The|That|This)\s+(?:previous|preceding|prior)?\s*(?:answer|response|reply)\s+(?:was|has been|is)\s+(generated|produced|created|written|composed)(?:(?:\s+\w+ly)?\s+by\s+(?:me|cos|the\s+assistant|the\s+system|the\s+concierge))?\s*,?\s*/i,
    (_match, verb: string) => `I ${RECAST_VERB[verb.toLowerCase()] || 'wrote'} it `,
  )
  return result.trim()
}

/**
 * Acceptance gate for a model-written narrative. Report-style openers are first RECAST into first
 * person, then the text is rejected (returns null) only when it is empty/absurdly long, names
 * forbidden specifics, still narrates "the previous answer/question" anywhere, or cites a URL not
 * in the verified fact set (an invented source). Everything else — "from my training", "from my
 * memory", "my general knowledge" — is welcome; that is the owner's requested voice.
 */
export function acceptPublicNarrative(candidate: string | null | undefined, facts: PublicProvenanceFacts): string | null {
  // Preserve line structure: the owner-approved answer shape (2026-08-25, modeled on the
  // ChatGPT provenance answer he supplied) is multi-line — an intro, an "It was generated from:"
  // bullet list, and a labeled summary block. Only collapse horizontal whitespace and 3+ blank
  // lines; never flatten newlines.
  const raw = String(candidate ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (!raw) return null
  const text = recastToFirstPerson(raw)
  if (text.length < MIN_NARRATIVE_CHARS || text.length > MAX_NARRATIVE_CHARS) return null
  if (publicDisclosureViolation(text)) return null
  // Owner correction (2026-08-25, repeated): ANY leftover "the previous answer/question" narration
  // is rejected — humans name the question's topic, they don't file reports about "the previous
  // answer". English-pattern check; other languages rely on the instruction.
  if (/\b(the|that|this) (previous|preceding|prior) (answer|question|response|reply)\b/i.test(text)) return null
  if (/\b(the )?(previous|preceding|prior|that|this) (answer|response|reply) (was|is|has been) (generated|produced|created|written|composed)\b/i.test(text)) return null
  if (/\b(generated|produced|created|written|composed)(\s+\w+ly)? by (the )?(cos|assistant|system|concierge)\b/i.test(text)) return null
  const allowed = new Set(facts.liveSources.map(source => source.url))
  for (const url of urlsIn(text)) {
    if (!allowed.has(url)) return null
  }
  return text
}

// ---------------------------------------------------------------------------------------------
// Model instruction — the model answers in its own voice, with variety, grounded on the facts.
// ---------------------------------------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian' }

export function buildPublicProvenanceInstruction(
  facts: PublicProvenanceFacts,
  visitorQuestion: string,
  language: string,
): { system: string; prompt: string } {
  const languageName = LANGUAGE_NAMES[language] || 'English'
  const factLines: string[] = []
  if (facts.fromCache) {
    factLines.push(`- You are reusing a reply you had already written for a nearly identical request${facts.cachedAt ? ` (written ${facts.cachedAt})` : ''}. Say so in your own words.`)
  }
  if (facts.liveSources.length > 0) {
    factLines.push('- You consulted these public sources for that answer (you may mention them, exactly as listed, never others):')
    for (const source of facts.liveSources) factLines.push(`  * ${source.title} — ${source.url}`)
  }
  if (!facts.fromCache && facts.liveSources.length === 0) {
    factLines.push('- You composed the answer yourself, in this conversation, drawing on your own training, memory and general knowledge. Nothing was looked up for it.')
  }
  const system = [
    `You are COS, the SignalBoost concierge assistant. The visitor is asking where your previous answer came from. Reply in ${languageName}.`,
    'Speak in the FIRST PERSON, as yourself: "I wrote…", "I drew on…", "I did not…". Never narrate yourself in the third person — never "the previous answer was generated", never "the assistant used". You may refer to yourself as COS by name, but never as "the system".',
    'Produce a STRUCTURED provenance answer with this shape, adapted to the facts: (1) one or two natural sentences stating plainly whether any external source or web search was used; (2) a short list introduced by a line like "It was generated from:", with 2 to 4 bullets naming the actual knowledge areas of the question (e.g. "my pretrained knowledge about fail-open versus fail-closed AI design") and "reasoning applied to the statement you gave me" when they supplied one; (3) a compact labeled summary, one item per line, using these labels adapted to the facts: "Primary source:", "External web retrieval:", "Your request:", "Private data:", "Fresh factual verification:". For Primary source you may write "COS pretrained knowledge". (4) Optionally one closing sentence drawing the honest distinction, e.g. that you were composing or analyzing for their request, not independently verifying against external evidence.',
    'Name the TOPIC of what they asked about in your own words inside the bullets — never refer to it generically as "the previous answer" or "your previous question", and never quote their request back verbatim.',
    'Ground every line in the facts below. Never invent sources, links, dates or capabilities that are not listed. If the facts list retrieved public sources, name them under External web retrieval; otherwise write "None".',
    'Never name any specific underlying AI model, AI company, hosting provider, server, database, or internal system component, and never state confidence numbers. "COS" and "my training / my pretrained knowledge / my memory" are the permitted self-descriptions.',
    'Vary your wording between answers; this must read as you talking, not a template being filled.',
  ].join(' ')
  const prompt = [
    `VISITOR'S QUESTION: ${cleanText(visitorQuestion, 240) || 'Where did the previous answer come from?'}`,
    facts.originalRequest ? `CONTEXT — WHAT THEY HAD ASKED FOR (name its topic in your own words; do not quote verbatim): ${facts.originalRequest}` : null,
    facts.priorAnswerExcerpt ? `CONTEXT — THE ANSWER THEY ARE ASKING ABOUT (excerpt): ${facts.priorAnswerExcerpt}` : null,
    'FACTS ABOUT HOW THAT ANSWER WAS PRODUCED:',
    ...factLines,
    'Write your reply now. Plain text only.',
  ].filter(Boolean).join('\n')
  return { system, prompt }
}

// ---------------------------------------------------------------------------------------------
// OUTAGE-ONLY fallback. Served exclusively when the model is unreachable or its output was
// rejected twice — a route cannot return nothing. One short sentence in the owner's requested
// voice. This is NOT the normal path and must never become it: if this string shows up in
// production regularly, the model path is broken and that is the defect to fix.
// ---------------------------------------------------------------------------------------------

const EMERGENCY_COPY: Record<string, string> = {
  en: 'I put that answer together myself, drawing on my own training and general knowledge.',
  es: 'Esa respuesta la elaboré yo mismo, a partir de mi propio entrenamiento y conocimiento general.',
  pt: 'Essa resposta eu mesmo elaborei, a partir do meu próprio treinamento e conhecimento geral.',
  pl: 'Tę odpowiedź ułożyłem sam, korzystając z własnego treningu i ogólnej wiedzy.',
  ru: 'Этот ответ я составил сам, опираясь на собственное обучение и общие знания.',
}

export function emergencyPublicProvenance(language: string): string {
  return EMERGENCY_COPY[language] || EMERGENCY_COPY.en
}
