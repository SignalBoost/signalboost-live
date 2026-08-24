export type DirectTextTransformationRequest = {
  instruction: string
  sourceText: string
}

export type TextTransformationSourceSplit = {
  editableSource: string
  referenceContext: string | null
}

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
