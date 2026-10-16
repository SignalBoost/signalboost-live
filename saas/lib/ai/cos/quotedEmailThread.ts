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
// Mail clients stamp a handling banner directly above a quoted message ("SBU - PRIVACY OR PII",
// "UNCLASSIFIED", "CONFIDENTIAL", "Classification: ..."). It belongs to the quoted thread, never to
// the user's draft.
const HANDLING_BANNER_RE = /^\s*(?:sbu\b.*|sensitive\s+but\s+unclassified\b.*|unclassified(?:\s*\/\/.*)?|confidential\b.*|official(?:\s*[-–:]\s*sensitive)?|classification\s*:.*|internal(?:\s+use)?\s+only)\s*$/iu

function quotedThreadBoundary(lines: string[]): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (ORIGINAL_MESSAGE_SEPARATOR_RE.test(line) || REPLY_ATTRIBUTION_RE.test(line)) return index

    if (!FROM_HEADER_RE.test(line)) continue
    const lookahead = lines.slice(index + 1, Math.min(lines.length, index + 13))
    const headerCount = lookahead.filter(candidate => THREAD_HEADER_RE.test(candidate)).length
    if (headerCount < 2) continue
    let start = index
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      if (!lines[previous].trim()) continue
      if (HANDLING_BANNER_RE.test(lines[previous])) start = previous
      break
    }
    return start
  }
  return null
}

// Production 2026-10-15: "edit - Thank you Tim, … in Managua. See below. It looks like you need to
// send them a TA.\n\nTim\nTimothy Hinman\n…" — the user pasted his reply, then the message he is
// replying to (Tim's note, on the same line), then Tim's signature, then the older thread. Tim's
// note was edited as if the user wrote it. When the draft addresses a person by name and that
// person's signature block (first name, then a full name beginning with it) appears below, the
// addressee's note and signature are reference context. The note starts at a forwarding opener
// ("See below", "FYI", …) when one precedes the signature; otherwise only the signature moves.
const SIGNATURE_FIRST_NAME_RE = /^\p{Lu}\p{Ll}{1,19}$/u
const SIGNATURE_FULL_NAME_RE = /^\p{Lu}\p{Ll}+(?:\s+\p{Lu}[\p{L}'.-]*){1,3}$/u
const FORWARDING_OPENER_RE = /(?:^|[.!?]\s+|\n\s*)((?:please\s+)?see\s+(?:below|(?:the\s+)?(?:e-?mail|message|note|thread)\s+below|attached)|fyi\b|forwarding\b)/giu
const ADDRESS_WINDOW_CHARS = 80
const GREETING_SOURCE = '(?:hi|hello|hey|dear|thank\\s+you|thanks|good\\s+(?:morning|afternoon|evening)|hola|ol[aá]|bonjour|hallo|ciao|cze[sś][ćc])'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addresseeReplyStart(text: string): number | null {
  const lines = text.split('\n')
  let offset = 0
  for (let index = 0; index < lines.length; offset += lines[index].length + 1, index += 1) {
    const name = lines[index].trim()
    if (index === 0 || !SIGNATURE_FIRST_NAME_RE.test(name)) continue
    const following = lines.slice(index + 1, index + 5).map(line => line.trim()).filter(Boolean)
    const fullName = following[0] || ''
    if (!SIGNATURE_FULL_NAME_RE.test(fullName) || !fullName.split(/\s+/)[0].startsWith(name)) continue
    // Only the signature of the person the draft is written to; the user's own signature stays.
    // The name must be the one the greeting addresses ("Thank you Tim,", "Hi Tim"), not any name in
    // the opening: "Hi Sam, this is Luis" signed "Luis / Luis Example" keeps the user's signature.
    const opening = text.slice(0, Math.min(offset, ADDRESS_WINDOW_CHARS))
    if (!new RegExp(`(?:^|[^\\p{L}])${GREETING_SOURCE}[\\s,]+(?:(?:mr|ms|mrs|dr)\\.?\\s+)?${escapeRegExp(name)}(?:[^\\p{L}]|$)`, 'iu').test(opening)) continue

    const before = text.slice(0, offset)
    let start = offset
    for (const match of before.matchAll(FORWARDING_OPENER_RE)) {
      const openerIndex = (match.index ?? 0) + match[0].indexOf(match[1])
      if (before.slice(0, openerIndex).trim()) start = openerIndex
    }
    return start
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
  let editableSource = boundary === null ? source : lines.slice(0, boundary).join('\n').trim()
  let referenceContext = boundary === null ? '' : lines.slice(boundary).join('\n').trim()

  const replyStart = addresseeReplyStart(editableSource)
  if (replyStart !== null) {
    const addresseeReply = editableSource.slice(replyStart).trim()
    editableSource = editableSource.slice(0, replyStart).trim()
    referenceContext = [addresseeReply, referenceContext].filter(Boolean).join('\n\n')
  }
  return {
    editableSource,
    referenceContext: referenceContext || null,
  }
}

/** Backward-compatible helper for callers that need only the draft. */
export function stripQuotedEmailThread(sourceText: string): string {
  return splitQuotedEmailThread(sourceText).editableSource
}
