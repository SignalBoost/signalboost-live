export type TextTransformationMode =
  | 'proofread'
  | 'edit'
  | 'polish'
  | 'rewrite'
  | 'shorten'
  | 'summarize'
  | 'translate'

function normalizeInstruction(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function textTransformationMode(instruction: string): TextTransformationMode {
  const value = normalizeInstruction(instruction)

  if (/\b(?:proofread|correct (?:the )?grammar|fix (?:the )?grammar|revisar|revisa|corrigir|corrige|popraw|исправь)\b/u.test(value)) {
    return 'proofread'
  }
  if (/\b(?:translate|traduzir|traduza|traducir|traduce|przetlumacz|переведи)\b/u.test(value)) return 'translate'
  if (/\b(?:summari[sz]e|resumir|resuma|resume|streszcz|резюмируй|суммируй)\b/u.test(value)) return 'summarize'
  if (/\b(?:shorten|tighten|encurtar|encurte|acortar|acorta|skroc|сократи)\b/u.test(value)) return 'shorten'
  if (/\b(?:rewrite|rephrase|reescrever|reescreva|reescribir|reescribe|przeredaguj|zredaguj|перепиши)\b/u.test(value)) return 'rewrite'
  if (/\b(?:polish|improve (?:the )?wording|make (?:this|it) (?:clearer|more professional)|melhorar|melhore|mejorar|mejora|ulepsz|улучши)\b/u.test(value)) {
    return 'polish'
  }
  return 'edit'
}

export function textTransformationStyleBlock(instruction: string): string {
  const mode = textTransformationMode(instruction)
  const common = [
    'WRITING QUALITY DEPTH:',
    `- Requested transformation mode: ${mode}.`,
    '- Preserve facts, named entities, titles, acronyms, program names, domain-specific terms, actor/action/recipient relationships, commitments, and degree of certainty.',
    '- Ordinary wording is NOT a fact. You may replace awkward ordinary nouns, verbs, adjectives, transitions, and sentence constructions when doing so preserves the same meaning.',
    '- Never preserve non-native or clumsy phrasing merely because it appeared in the source.',
  ]

  const specific: Record<TextTransformationMode, string[]> = {
    proofread: [
      '- PROOFREADING is conservative: correct spelling, grammar, punctuation, agreement, articles, capitalization, and obvious formatting errors with minimal rewriting.',
      '- Do not substantially reorganize or restyle text unless needed to make a sentence grammatical.',
    ],
    edit: [
      '- EDITING is more than proofreading. Rewrite awkward, literal, fragmented, repetitive, or non-native wording into fluent idiomatic professional language.',
      '- Reorganize sentences and paragraphs when that improves flow, warmth, clarity, or emphasis. A result that simply mirrors the source sentence-by-sentence with corrected grammar is insufficient when the source is visibly rough.',
      '- For correspondence, make the message sound like a capable human colleague wrote it, not like a grammar checker. Preserve the sender\'s personality and level of formality while improving delivery.',
    ],
    polish: [
      '- POLISHING should materially improve tone, rhythm, clarity, transitions, concision, and professional warmth while preserving the same substance.',
      '- Replace stiff, literal, repetitive, or weak phrasing with natural professional alternatives and improve paragraph structure where useful.',
    ],
    rewrite: [
      '- REWRITING permits substantial re-expression. Rebuild sentences and paragraph order as needed so the result reads naturally and purposefully.',
      '- Do not stay close to the source wording unless that wording is already strong. Preserve meaning and facts, not the original syntax.',
    ],
    shorten: [
      '- SHORTENING should remove repetition, filler, and unnecessary setup while retaining every material fact, request, commitment, qualification, and named term.',
      '- Prefer fewer, stronger sentences rather than merely deleting adjectives.',
    ],
    summarize: [
      '- SUMMARIZING should condense the supplied material into its essential points without inventing conclusions or omitting material qualifications.',
      '- Use a natural structure appropriate to the source and requested audience.',
    ],
    translate: [
      '- TRANSLATION should preserve meaning, tone, facts, named terms, and commitments while using native, idiomatic syntax in the target language.',
      '- Do not translate word-for-word when a natural professional expression conveys the same meaning more accurately.',
    ],
  }

  return [...common, ...specific[mode]].join('\n')
}

/**
 * Repair presentation-only escaping that commonly appears when a URL is copied from Markdown.
 * This intentionally changes only backslash-escaped dots inside URL/domain-looking tokens; it
 * does not change the domain, path, query, or scheme supplied by the user.
 */
export function normalizeTextTransformationPresentation(value: string): string {
  return String(value || '').replace(
    /\b(?:https?:\/\/|www\\?\.)[^\s<>()]+/giu,
    token => token.replace(/\\\./g, '.'),
  )
}
