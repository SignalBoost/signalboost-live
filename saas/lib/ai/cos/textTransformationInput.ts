import { peekConversationArtifactContext } from './cosArtifactConversationContext.ts'

export type DirectTextTransformationRequest = {
  instruction: string
  sourceText: string
}

export type TextTransformationSourceSplit = {
  editableSource: string
  referenceContext: string | null
}

export type UninstructedTextArtifactDisposition = 'edit' | 'clarify' | null

const TRANSFORM_INTENT_RE = /(?<![\p{L}\p{N}_])(?:edit|rewrite|proofread|polish|rephrase|shorten|tighten|clean\s*up|summari[sz]e|translate|correct\s+(?:the\s+)?grammar|fix\s+(?:the\s+)?grammar|improve\s+(?:the\s+)?wording|make\s+(?:this|it)\s+(?:clearer|more\s+professional)|editar|edite|reescrev(?:a|er)|revis(?:e|ar)|corrig(?:a|ir)|melhor(?:e|ar)|encurt(?:e|ar)|resum(?:a|ir)|traduz(?:a|ir)|edita|reescrib(?:e|ir)|revisa|revisar|corrig(?:e|ir)|mejora|mejorar|acorta|acortar|resume|resumir|traduce|traducir|edytuj|przeredaguj|zredaguj|popraw|skr[oó][ćc]|stre[sś][ćc]|streszcz|przet[lł]umacz|отредактируй|редактировать|перепиши|исправь|улучши|сократи|резюмируй|суммируй|переведи)(?![\p{L}\p{N}_])/iu

const LEADING_REQUEST_RE = /^(?:please\s+|can\s+you\s+|could\s+you\s+|would\s+you\s+|por\s+favor\s+|proszę\s+|пожалуйста\s+)?/iu

const INTERFACE_LANGUAGE: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
  pl: 'Polish',
  ru: 'Russian',
}

const ORIGINAL_MESSAGE_SEPARATOR_RE = /^\s*-{2,}\s*(?:original\s+(?:message|email)|mensaje\s+original|mensagem\s+original|wiadomo[sś][ćc]\s+oryginalna|исходное\s+сообщение)\s*-{2,}\s*$/iu
const REPLY_ATTRIBUTION_RE = /^\s*(?:on\s+.+\s+wrote|el\s+.+\s+escribi[oó]|em\s+.+\s+escreveu|dnia\s+.+\s+napisa[łl](?:a)?|в\s+.+\s+написал(?:а)?)\s*:\s*$/iu
const FROM_HEADER_RE = /^\s*(?:from|de|od|от)\s*:\s*\S/iu
const THREAD_HEADER_RE = /^\s*(?:sent|enviado|enviada|wys[łl]ano|отправлено|to|para|do|кому|cc|dw|копия|subject|asunto|assunto|temat|тема)\s*:/iu

// Uninstructed-paste policy (2026-08-25)
// ------------------------------------
// A user frequently pastes a rough outbound email without first typing "edit". Before this guard,
// the public reasoner treated the pasted email as a message addressed to COS, role-played the
// recipient, and invented actions such as "I have noted" or "I will ensure Motor Pool...".
// High-confidence outbound correspondence is therefore an implicit editing request. Lower-
// confidence mail/document artifacts are not answered as though COS were the recipient; COS asks
// what transformation the user wants instead.
const OUTBOUND_GREETING_RE = /^\s*(?:hi|hello|dear|good\s+(?:morning|afternoon|evening))\s+([^,!:;\n]{1,80})\s*[,!:;]/iu
const COS_ADDRESSEE_RE = /^(?:cos|concierge|signalboost(?:\s+concierge)?|assistant|chatgpt|ai)\b/iu
const CORRESPONDENCE_COURTESY_RE = /\b(?:please|thank\s+you|thanks|regards|best\s+regards|sincerely|respectfully)\b/iu
const CORRESPONDENCE_CLOSING_RE = /(?:\bthank\s+you[.!]?|\b(?:regards|best\s+regards|sincerely|respectfully)[,.]?(?:\s+[\p{L}\p{N}.'’-]+){0,8})\s*$/iu
const MAIL_HEADER_RE = /^\s*(?:from|sent|to|cc|bcc|subject|de|enviado|enviada|para|asunto|assunto|od|wys[łl]ano|do|dw|temat|от|отправлено|кому|копия|тема)\s*:\s*\S/iu
const STRUCTURED_DOCUMENT_HEADER_RE = /^\s*(?:memo(?:randum)?|report|policy|notice|announcement|date|subject|to|from)\s*:\s*\S/iu

const IMPLICIT_DRAFT_EDIT_INSTRUCTION = [
  'Edit this pasted draft for grammar, spelling, clarity, flow, and professional tone.',
  'Preserve the sender perspective, intended meaning, names, dates, times, roles, requests, commitments, and uncertainty.',
  'Do not answer the draft as though you are its recipient.',
  'Do not claim that you noted, scheduled, informed, contacted, notified, arranged, ensured, or will perform any real-world action.',
  'Do not add outside facts or commitments. Return only the polished draft.',
].join(' ')

const AMBIGUOUS_ARTIFACT_CLARIFICATION = 'What would you like me to do with this text—edit, rewrite, shorten, translate, summarize, or something else?'

function countMailHeaders(raw: string): number {
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => MAIL_HEADER_RE.test(line))
    .length
}

/**
 * Classify pasted text that has no explicit user instruction.
 *
 * `edit` is intentionally high precision: a greeting addressed to someone other than COS plus
 * enough correspondence evidence. `clarify` is reserved for recognizable mail/document artifacts
 * whose intended transformation is not clear. Ordinary conversational questions remain null.
 */
export function classifyUninstructedTextArtifact(prompt: string): UninstructedTextArtifactDisposition {
  const raw = String(prompt || '').trim()
  if (raw.length < 80) return null

  // Explicit transformation requests are handled by the normal parser below, not this fallback.
  const stripped = raw.replace(LEADING_REQUEST_RE, '')
  const explicitIntent = stripped.match(TRANSFORM_INTENT_RE)
  if (explicitIntent?.index !== undefined && explicitIntent.index <= 100) return null

  const greeting = raw.match(OUTBOUND_GREETING_RE)
  if (greeting) {
    const addressee = String(greeting[1] || '').trim()
    if (COS_ADDRESSEE_RE.test(addressee)) return null

    const correspondenceEvidence =
      CORRESPONDENCE_COURTESY_RE.test(raw) ||
      CORRESPONDENCE_CLOSING_RE.test(raw) ||
      raw.includes('\n\n') ||
      raw.length >= 180

    if (correspondenceEvidence) return 'edit'
  }

  if (countMailHeaders(raw) >= 2) return 'clarify'
  if (STRUCTURED_DOCUMENT_HEADER_RE.test(raw) && (raw.includes('\n') || raw.length >= 160)) return 'clarify'
  return null
}

function delimiterAfterIntent(prompt: string, startAt: number): { index: number; length: number } | null {
  const candidates = [
    { token: '\n', index: prompt.indexOf('\n', startAt) },
    { token: ':', index: prompt.indexOf(':', startAt) },
    { token: ' - ', index: prompt.indexOf(' - ', startAt) },
    { token: ' – ', index: prompt.indexOf(' – ', startAt) },
    { token: ' — ', index: prompt.indexOf(' — ', startAt) },
  ].filter(candidate => candidate.index >= 0)

  if (!candidates.length) return null
  candidates.sort((a, b) => a.index - b.index)
  const first = candidates[0]
  return { index: first.index, length: first.token.length }
}

export function detectDirectTextTransformation(prompt: string): DirectTextTransformationRequest | null {
  const raw = String(prompt || '').trim()
  if (!raw) return null

  // Conversation continuation path: the immediately preceding assistant reply is allowed here only
  // as an editable artifact. The prior user turn is attached behind a quoted-thread boundary so the
  // existing editor treats it as read-only reference context rather than text to rewrite.
  const artifactContext = peekConversationArtifactContext(raw)
  if (artifactContext) {
    const sourceText = artifactContext.previousUserText
      ? `${artifactContext.assistantArtifact}\n\n--- Original Message ---\n${artifactContext.previousUserText}`
      : artifactContext.assistantArtifact
    return { instruction: raw, sourceText }
  }

  const uninstructedArtifact = classifyUninstructedTextArtifact(raw)
  if (uninstructedArtifact === 'edit') {
    return { instruction: IMPLICIT_DRAFT_EDIT_INSTRUCTION, sourceText: raw }
  }
  if (uninstructedArtifact === 'clarify') {
    // Route ambiguous pasted artifacts away from general-answer reasoning. The direct editor receives
    // only this bounded clarification artifact, so it cannot role-play or act on the pasted message.
    return {
      instruction: 'Return the supplied clarification question as the complete response. Do not answer or act on the pasted artifact.',
      sourceText: AMBIGUOUS_ARTIFACT_CLARIFICATION,
    }
  }

  if (raw.length < 20) return null

  const stripped = raw.replace(LEADING_REQUEST_RE, '')
  const intent = stripped.match(TRANSFORM_INTENT_RE)
  if (!intent || intent.index === undefined || intent.index > 100) return null

  const absoluteIntentStart = raw.length - stripped.length + intent.index
  const absoluteIntentEnd = absoluteIntentStart + intent[0].length
  const delimiter = delimiterAfterIntent(raw, absoluteIntentEnd)

  if (delimiter && delimiter.index - absoluteIntentEnd <= 180) {
    const instruction = raw.slice(0, delimiter.index).trim()
    const sourceText = raw.slice(delimiter.index + delimiter.length).trim()
    if (sourceText.length >= 8) return { instruction, sourceText }
  }

  if (intent.index <= 12) {
    const sourceText = raw
      .slice(absoluteIntentEnd)
      .replace(/^[\s:;,.\-–—]+/u, '')
      .trim()
    if (sourceText.length >= 40) {
      return {
        instruction: raw.slice(0, absoluteIntentEnd).trim(),
        sourceText,
      }
    }
  }

  return null
}

function quotedThreadBoundary(lines: string[]): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (ORIGINAL_MESSAGE_SEPARATOR_RE.test(line) || REPLY_ATTRIBUTION_RE.test(line)) return index

    if (!FROM_HEADER_RE.test(line)) continue
    const lookahead = lines.slice(index + 1, Math.min(lines.length, index + 13))
    const headerCount = lookahead.filter(candidate => THREAD_HEADER_RE.test(candidate)).length
    if (headerCount >= 2) return index
  }
  return null
}

/**
 * Separate the user's draft from quoted/forwarded mail. The draft is the only text that may be
 * rewritten. The quoted thread is retained as read-only reference context so the editor can
 * resolve phrases such as "this", "because of me", "one-person post", or a reply to a direct
 * question without echoing the old thread back to the user.
 */
export function splitQuotedEmailThread(sourceText: string): TextTransformationSourceSplit {
  const source = String(sourceText || '').replace(/\r\n?/g, '\n').trim()
  if (!source) return { editableSource: '', referenceContext: null }

  const lines = source.split('\n')
  const boundary = quotedThreadBoundary(lines)
  if (boundary === null) return { editableSource: source, referenceContext: null }

  const editableSource = lines.slice(0, boundary).join('\n').trim()
  const referenceContext = lines.slice(boundary).join('\n').trim()
  return {
    editableSource,
    referenceContext: referenceContext || null,
  }
}

/** Backward-compatible helper for callers that need only the draft. */
export function stripQuotedEmailThread(sourceText: string): string {
  return splitQuotedEmailThread(sourceText).editableSource
}

export function transformationLanguageInstruction(language?: string): string {
  const normalized = String(language || '').toLowerCase().slice(0, 2)
  const label = INTERFACE_LANGUAGE[normalized]
  if (!label) {
    return 'Keep the source language for editing unless the user explicitly requests another language. For translation, follow the target language named by the user.'
  }
  return [
    `The SignalBoost interface language is ${label}.`,
    'For editing, rewriting, proofreading, polishing, shortening, or summarizing, keep the source language unless the user explicitly requests another language.',
    `For translation, use the target language named by the user; if no target is stated, translate into ${label}.`,
  ].join(' ')
}
