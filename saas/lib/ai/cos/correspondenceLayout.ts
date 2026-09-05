// saas/lib/ai/cos/correspondenceLayout.ts
//
// CORRESPONDENCE LAYOUT (2026-09-04)
// ----------------------------------
// The direct text editor was producing wording-correct email edits that came back as ONE
// run-on block: salutation, body and closing all welded into a single paragraph. A message a
// human is about to paste into Outlook or Gmail is not finished until it has the shape of an
// email, so a correct rewrite with no layout still reads as poor quality.
//
// Two mechanisms, deliberately:
//   1. CORRESPONDENCE_LAYOUT_RULES tells the reasoner to emit real line breaks and to escape
//      them as \n inside the JSON envelope. Asking a model for strict JSON pushes it toward
//      one-line output; that instruction pushes back.
//   2. restoreCorrespondenceLayout() repairs the result deterministically when the model
//      ignores rule 1. It inserts WHITESPACE ONLY — no word, name, link, punctuation or
//      ordering is ever changed — so it cannot affect meaning fidelity, the communicative
//      intent guard, or any release gate that inspects wording.
//
// It is intentionally conservative: if the answer already contains a blank line, the model did
// the job and the text is returned untouched.
//
// Zero imports, five languages, static literal regexes (dynamically concatenated combined
// regexes have broken Turbopack production builds in this repo even with tsc green).

export const CORRESPONDENCE_LAYOUT_RULES = [
  'CORRESPONDENCE LAYOUT — the finished text must be ready to paste straight into an email client:',
  '- Keep the salutation on its own line, followed by a blank line.',
  '- Separate distinct paragraphs with a blank line. Never merge an entire message into one block of text.',
  '- Keep the closing ("Thank you", "Best regards", equivalent in the source language) and any signature on their own lines, preceded by a blank line.',
  '- Preserve any line structure the source already had; add structure when the source was a single rough block.',
  '- Emit real line breaks in the answer text and escape them as \\n inside the JSON string value. Never drop line breaks in order to keep the JSON on one line.',
].join('\n')

// Salutation at the very start, with body text following on the SAME line. EN/ES/PT/PL/RU.
const RUN_ON_SALUTATION_RE =
  /^([ \t]*(?:hi|hello|hey|dear|good morning|good afternoon|good evening|hola|buenos d[ií]as|buenas tardes|buenas noches|estimad[oa]s?|ol[aá]|bom dia|boa tarde|boa noite|prezad[oa]s?|car[oa]|cze[sś][cć]|dzie[nń] dobry|witam|szanown[ya]|здравствуйте|привет|добрый день|добрый вечер|уважаем(?:ый|ая|ые))(?![\p{L}\p{N}_])[^\n,:!]{0,60}[,:!])[ \t]+(?=\S)/iu

// Trailing closing phrase welded onto the end of the body line. It must START a sentence — the
// preceding character is sentence-ending punctuation — and it must not be followed by another
// sentence, so "I said thank you at the time and I meant it." is left exactly where it is.
const RUN_ON_CLOSING_RE =
  /([.!?])[ \t]+((?:thank you|thanks(?: again)?|many thanks|best regards|kind regards|warm regards|regards|sincerely|respectfully|cheers|gracias|muchas gracias|saludos|atentamente|un saludo|obrigad[oa]|atenciosamente|abra[cç]os|dzi[eę]kuj[eę]|pozdrawiam|z powa[zż]aniem|serdecznie pozdrawiam|спасибо|благодарю|с уважением)(?![\p{L}\p{N}_])[^\n.!?]{0,60}[.!]?)$/iu

// Only correspondence gets restructured. Generic prose, lists and documents are left alone.
const LOOKS_LIKE_CORRESPONDENCE_RE =
  /^[ \t]*(?:hi|hello|hey|dear|good morning|good afternoon|good evening|hola|buenos d[ií]as|buenas tardes|buenas noches|estimad[oa]s?|ol[aá]|bom dia|boa tarde|boa noite|prezad[oa]s?|car[oa]|cze[sś][cć]|dzie[nń] dobry|witam|szanown[ya]|здравствуйте|привет|добрый день|добрый вечер|уважаем(?:ый|ая|ые))(?![\p{L}\p{N}_])/iu

/** True when the supplied text opens like a letter or email addressed to a person. */
export function looksLikeCorrespondence(text: string): boolean {
  return LOOKS_LIKE_CORRESPONDENCE_RE.test(String(text || '').trim())
}

/**
 * Give an edited message email shape again. Whitespace-only: every character of the answer is
 * preserved in its original order, and only line breaks are inserted.
 *
 * No-ops when the source was not correspondence, or when the answer already has a blank line.
 */
export function restoreCorrespondenceLayout(answer: string, originalSource: string): string {
  const text = String(answer || '')
  const trimmed = text.trim()
  if (!trimmed) return text
  if (!looksLikeCorrespondence(originalSource) && !looksLikeCorrespondence(trimmed)) return text
  if (/\n[ \t]*\n/.test(trimmed)) return text

  let out = trimmed.replace(/\r\n?/g, '\n')
  out = out.replace(RUN_ON_SALUTATION_RE, '$1\n\n')

  const lines = out.split('\n')
  const lastIndex = lines.length - 1
  const closing = lines[lastIndex].match(RUN_ON_CLOSING_RE)
  if (closing) {
    lines[lastIndex] = lines[lastIndex].slice(0, lines[lastIndex].length - closing[0].length) + closing[1]
    lines.push('', closing[2])
  }

  out = lines.join('\n')

  // A single-line body that still holds the whole message gets one more break between the
  // greeting and the body only; sentence-level splitting is deliberately NOT attempted, because
  // guessing paragraph boundaries would change emphasis the writer chose.
  return out
}
