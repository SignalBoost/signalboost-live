import { splitQuotedEmailThread } from './quotedEmailThread.ts'

const FORWARDED_METADATA_RE = /(?:^|\n)\s*(?:from|sent|to|cc|bcc|subject|enviado|de|para|asunto|temat)\s*:\s*\S|\b(?:sbu|cui)\s*[-–—]\s*(?:privacy|pii|confidential)/iu

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** A fast model's nonempty JSON is not sufficient proof of an acceptable edit.
 * Reject obvious copied-thread metadata and forwarded signature text, then let
 * canonical COS editing take over. Never fabricate or deterministically write
 * the user's email as a fallback.
 */
export function fastTextEditReplyIsClean(input: { originalPrompt: string; reply: string }): boolean {
  const text = String(input.reply || '').trim()
  if (!text) return false
  const source = splitQuotedEmailThread(input.originalPrompt)
  const ownDraft = compact(source.editableSource)

  // Forwarded headers/confidentiality markings belong to the quoted message
  // unless the user explicitly included them in their own editable draft.
  if (FORWARDED_METADATA_RE.test(text) && !FORWARDED_METADATA_RE.test(source.editableSource)) return false

  const context = String(source.referenceContext || '')
  const fromIndex = context.search(/(?:^|\n)\s*(?:from|de|od|от)\s*:/iu)
  if (fromIndex <= 0) return true
  const copiedSignature = context.slice(0, fromIndex)
  const normalizedAnswer = compact(text)
  for (const rawLine of copiedSignature.split('\n')) {
    const line = compact(rawLine)
    // A name alone may legitimately be in the draft; only reject sufficiently
    // distinctive pieces of a copied footer not authored by the user.
    if (line.length >= 9 && normalizedAnswer.includes(line) && !ownDraft.includes(line)) return false
  }
  return true
}
