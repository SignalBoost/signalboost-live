// saas/lib/ai/cos/quotedEmailThread.ts
//
// Dependency-free separation of a user's own draft from the quoted/forwarded mail pasted after it.
// It lives in its own module because the edge-of-request classifier (fastTextTransformIntent, used
// by proxy.ts) must apply the same boundary as the editor without importing request-scoped storage.

export type TextTransformationSourceSplit = {
  editableSource: string
  referenceContext: string | null
}

const ORIGINAL_MESSAGE_SEPARATOR_RE = /^\s*-{2,}\s*(?:original\s+(?:message|email)|mensaje\s+original|mensagem\s+original|wiadomo[sś][ćc]\s+oryginalna|исходное\s+сообщение)\s*-{2,}\s*$/iu
const REPLY_ATTRIBUTION_RE = /^\s*(?:on\s+.+\s+wrote|el\s+.+\s+escribi[oó]|em\s+.+\s+escreveu|dnia\s+.+\s+napisa[łl](?:a)?|в\s+.+\s+написал(?:а)?)\s*:\s*$/iu
const FROM_HEADER_RE = /^\s*(?:from|de|od|от)\s*:\s*\S/iu
const THREAD_HEADER_RE = /^\s*(?:sent|enviado|enviada|wys[łl]ano|отправлено|to|para|do|кому|cc|dw|копия|subject|asunto|assunto|temat|тема)\s*:/iu

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
