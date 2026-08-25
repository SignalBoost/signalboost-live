// saas/lib/ai/cos/contentGenerationIntent.ts
//
// Authoring and transforming user-supplied material create or modify an artifact; they are not
// current-world factual lookups. This classifier exists so requests such as "write me X",
// "edit this email", "summarize this text", or "translate this paragraph" are never hijacked
// into live web retrieval and then failed closed for evidence they never needed.
//
// WHY THE ANCHOR MOVED (2026-08-23): the pattern was anchored to the start of the WHOLE prompt, so
// the authoring verb had to be the very first word. Real executive requests state the situation
// first and ask last:
//
//   "Gross margins have declined from 74% to 61% ... The Head of AI wants to maintain the CURRENT
//    premium model tier ... Design a 90-day phased optimization strategy ..."
//
// The verb "Design" sits in the third sentence, so the exclusion never fired; the word "current" —
// a possessive adjective describing the company's OWN internal tier, not a current-world fact —
// then routed the whole thing to live evidence, which came back unavailable and the user got a
// refusal instead of a strategy.
//
// The verb must still LEAD ITS OWN CLAUSE — that separates a real instruction ("design a strategy")
// from an incidental mention ("who designed the Eiffel Tower"). Unicode-aware boundaries are used
// so Polish and Russian commands are treated the same way as English, Spanish, and Portuguese.

const AUTHORING_VERB = [
  // English
  'write', 'draft', 'create', 'generate', 'design', 'produce',
  'edit', 'rewrite', 'proofread', 'polish', 'rephrase', 'shorten', 'tighten', 'summarize', 'summarise', 'translate',
  // Spanish
  'escribe', 'redacta', 'crea', 'edita', 'reescribe', 'revisa', 'corrige', 'resume', 'traduce',
  // Portuguese
  'escreva', 'redija', 'crie', 'edite', 'reescreva', 'revise', 'corrija', 'resuma', 'traduza',
  // Polish
  'napisz', 'stw[oó]rz', 'zaprojektuj', 'edytuj', 'przeredaguj', 'zredaguj', 'popraw', 'skr[oó][ćc]', 'stre[sś][ćc]', 'przet[lł]umacz',
  // Russian
  'напиши', 'создай', 'сгенерируй', 'отредактируй', 'перепиши', 'исправь', 'улучши', 'сократи', 'резюмируй', 'переведи',
].join('|')

/** Matches an authoring/transformation verb at the start of the string. */
const GENERATION = new RegExp(`^\\s*(?:${AUTHORING_VERB})(?![\\p{L}\\p{N}_])`, 'iu')

/**
 * Split on sentence terminators and on clause boundaries that commonly precede an instruction
 * ("..., so design a plan", "... — draft the memo", "and then write the summary"). Newlines and
 * bullet markers count too, since briefs are often written as lists.
 */
function clausesOf(input: string): string[] {
  return input
    .split(/(?:[.!?;:]|\n+|—|--|\band then\b|\bso\b(?=\s)|\bthen\b(?=\s)|^\s*[-*•]\s*)/iu)
    .map(part => part.trim())
    // A role prefix frames the requested artifact; it must not hide the authoring verb.
    .flatMap(part => {
      const stripped = part.replace(/^(?:as|acting\s+as|in\s+(?:your|the)\s+role\s+as|in\s+your\s+capacity\s+as|como|na\s+qualidade\s+de|jako|как)(?![\p{L}\p{N}_])[^,]{0,60},\s*/iu, '')
      return stripped !== part ? [part, stripped] : [part]
    })
    .filter(Boolean)
}

/**
 * True when any clause is an instruction to author or transform supplied material. Checking per
 * clause rather than per prompt lets a request that supplies context first still be recognized.
 */
export function isContentGenerationRequest(input: string): boolean {
  const text = String(input || '').trim()
  if (!text) return false
  if (GENERATION.test(text)) return true
  if (isWritingElementQuestion(text)) return true
  return clausesOf(text).some(clause => GENERATION.test(clause))
}

// ---------------------------------------------------------------------------------------------
// Writing-element follow-up questions (2026-08-25).
//
// Observed in production: after COS edited an email, the follow-up "what would be the subject
// line for this email?" carries NO authoring verb, so the exclusion above never fired. The
// question was routed to live evidence retrieval as if it were a current-world lookup, the
// synthesis could not prove grounding (there is nothing on the web about the visitor's own
// email), and the turn failed closed. A request for a subject line, title, greeting, or closing
// OF a document in the conversation is composition work on supplied material — it must never
// enter freshness routing, in any of the five platform languages.
// ---------------------------------------------------------------------------------------------

const WRITING_ELEMENT = [
  // English
  'subject\\s+line', 'subject', 'title', 'headline', 'greeting', 'salutation', 'closing', 'sign[\\s-]?off', 'opening\\s+line', 'tagline', 'caption',
  // Spanish
  'asunto', 't[ií]tulo', 'encabezado', 'saludo', 'despedida', 'cierre',
  // Portuguese
  'assunto', 'cabe[cç]alho', 'sauda[cç][aã]o', 'fechamento',
  // Polish
  'temat', 'tytu[lł]', 'nag[lł][oó]wek', 'powitanie', 'zako[nń]czenie', 'podpis',
  // Russian
  'тема', 'заголовок', 'приветствие', 'подпись', 'концовка',
].join('|')

const CONVERSATION_ARTIFACT = [
  // English
  'e-?mail', 'letter', 'message', 'draft', 'memo', 'reply', 'note', 'post', 'document', 'text',
  // Spanish
  'correo', 'carta', 'mensaje', 'borrador', 'respuesta', 'nota', 'documento', 'texto',
  // Portuguese
  'mensagem', 'rascunho', 'resposta', 'documento', 'texto',
  // Polish
  'list', 'wiadomo[sś][cć]', 'szkic', 'odpowied[zź]', 'notatka', 'dokument', 'tekst',
  // Russian
  'письм[оаеу]', 'сообщени[еяю]', 'черновик[ае]?', 'ответ[ае]?', 'заметк[аеу]', 'документ[ае]?', 'текст[ае]?',
].join('|')

// Keep these as two small independently compiled patterns instead of one large dynamically
// concatenated regex. The previous combined expression produced an invalid bundled RegExp under
// Turbopack, which broke production page-data collection even though TypeScript compilation passed.
const WRITING_ELEMENT_TOKEN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${WRITING_ELEMENT})(?![\\p{L}\\p{N}_])`,
  'iu',
)

const CONVERSATION_ARTIFACT_TOKEN = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${CONVERSATION_ARTIFACT})[\\p{L}]{0,3}(?![\\p{L}\\p{N}_])`,
  'iu',
)

/**
 * True when the message asks for a writing element (subject line, title, greeting, closing, …)
 * of a document in the conversation. The two concepts must occur close together, in either order.
 * This keeps the classifier Unicode-safe and avoids rebuilding one fragile mega-regex at runtime.
 */
export function isWritingElementQuestion(input: string): boolean {
  const text = String(input || '').trim()
  if (!text) return false

  const element = WRITING_ELEMENT_TOKEN.exec(text)
  const artifact = CONVERSATION_ARTIFACT_TOKEN.exec(text)
  if (!element || !artifact) return false

  const elementStart = element.index
  const elementEnd = elementStart + element[0].length
  const artifactStart = artifact.index
  const artifactEnd = artifactStart + artifact[0].length
  const gap = elementEnd <= artifactStart
    ? artifactStart - elementEnd
    : elementStart >= artifactEnd
      ? elementStart - artifactEnd
      : 0

  return gap <= 96
}
