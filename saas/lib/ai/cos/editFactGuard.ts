// saas/lib/ai/cos/editFactGuard.ts
//
// Deterministic check that an edit added no details the user did not write. Production 2026-10-15:
// an "edit my reply" to a hotel/airport-pickup thread came back with "my arrival on June 18 at
// 8:10 p.m." and a "Subject:" line, both taken from the quoted thread, not from the owner's draft.
// Numbers (times, dates, amounts, phone numbers) are the details that do the most harm when
// invented, and they can be checked exactly against what the user wrote.

import { splitQuotedEmailThread } from './quotedEmailThread.ts'

const DIGIT_GROUP_RE = /\d+/g
const DETAIL_SPAN_RE = /\d[\d:.,/-]*\d|\d/g
const SUBJECT_LINE_RE = /^\s*subject\s*:/i

/** The part of the request the user wrote: everything before a detected quoted mail thread. */
export function userAuthoredText(request: string): string {
  const { editableSource } = splitQuotedEmailThread(String(request || ''))
  return editableSource || String(request || '')
}

const NUMBER_WORDS: Readonly<Record<string, string>> = Object.freeze({
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
})

function digitGroups(text: string): Set<string> {
  const value = String(text || '')
  const groups = new Set((value.match(DIGIT_GROUP_RE) || []).map(group => String(Number(group))))
  // A user who wrote "two" may legitimately see "2" in the edit.
  for (const word of value.toLowerCase().match(/[a-z]+/g) || []) if (NUMBER_WORDS[word]) groups.add(NUMBER_WORDS[word])
  return groups
}

/**
 * Number-bearing details in the edit that the user's own text does not contain, e.g. ["8:10", "18"]
 * when the draft never mentioned an arrival time or date. Leading zeros are ignored ("06" == "6").
 */
export function unsupportedEditDetails(answer: string, request: string): string[] {
  const allowed = digitGroups(userAuthoredText(request))
  const spans: string[] = String(answer || '').match(DETAIL_SPAN_RE) ?? []
  const unsupported = spans.filter(span => (span.match(DIGIT_GROUP_RE) ?? []).some(group => !allowed.has(String(Number(group)))))
  return [...new Set(unsupported)]
}

/** Remove a leading "Subject:" line the user's own text did not contain. */
export function stripUnrequestedSubjectLine(answer: string, request: string): string {
  const lines = String(answer || '').split('\n')
  const first = lines.findIndex(line => line.trim())
  if (first < 0 || !SUBJECT_LINE_RE.test(lines[first])) return String(answer || '')
  if (/\bsubject\s*:/i.test(userAuthoredText(request))) return String(answer || '')
  return lines.slice(first + 1).join('\n').replace(/^\s*\n/, '').trim()
}

export const EDIT_DETAIL_REPAIR_INSTRUCTIONS = [
  'You are COS correcting one defect in a finished edit. The edit added details that do not appear in the text the user wrote.',
  'Remove each listed detail, or rephrase only the words around it so the sentence no longer states it. Never replace it with another value. Keep every other word, line break, greeting, closing and signature exactly as it is.',
  'Return strict JSON: {"answer":"<corrected text>","confidence":0.0}.',
].join('\n')

export function formatEditDetailRepairPrompt(userText: string, answer: string, details: string[]): string {
  return [
    `DETAILS TO REMOVE (not in the user's text): ${details.join(', ')}`,
    `USER'S OWN TEXT:\n<<<USER\n${userText}\nUSER`,
    `EDIT TO CORRECT:\n<<<EDIT\n${answer}\nEDIT`,
  ].join('\n\n')
}
