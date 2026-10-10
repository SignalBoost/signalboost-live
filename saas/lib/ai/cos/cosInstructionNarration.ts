// saas/lib/ai/cos/cosInstructionNarration.ts
//
// AN ANSWER MUST NOT NARRATE ITS OWN INSTRUCTIONS (2026-10-09, owner-reported production defect).
// Production chat, Portuguese, "quem sera o proximo presidente do Brasil?" released:
//   "A resposta deve ser neutra e factual, evitando especulações ... Como iTMounts, devo manter-me dentro
//    dos limites ... A resposta deve ser direta, factual e neutra, conforme as diretrizes fornecidas."
// The prompt already forbids process narration and self-reference by name ("DELIVER CONCLUSIONS, NOT YOUR
// DELIBERATION"); the model ignored it and nothing after generation checked. This module is that check:
// it finds sentences in which the model talks about its rules, what "the answer" should be, or itself by
// name, so the release gate can repair the answer or remove those sentences.
//
// Deliberately narrow: each pattern needs a meta subject ("the answer must be neutral", "according to the
// provided guidelines", "as iTMounts, I must", "I must avoid any speculation"). Ordinary content such as
// "according to WHO guidelines" or "the answer should include your order number" does not match.
// Pure and dependency-free so it is unit-testable without the reasoner.

export const INSTRUCTION_NARRATION_SIGNAL = 'instruction_narration'

const SELF = '(?:itmounts|cos)'
const STYLE_EN = '(?:neutral|factual|direct|objective|impartial|balanced|concise|unbiased)'

// JavaScript's \b is ASCII-only even with the u flag, so "\bé importante" never matches at a sentence start.
// Every \b below is rewritten to a Unicode letter/digit boundary.
const UNICODE_WORD_BOUNDARY = '(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))'
function unicodeBoundaries(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes('u') ? pattern.flags : `${pattern.flags}u`
  return new RegExp(pattern.source.replace(/\\b/g, UNICODE_WORD_BOUNDARY), flags)
}

const PATTERNS: readonly RegExp[] = ([
  // English
  new RegExp(`\\bthe (?:answer|response|reply) (?:should|must|needs to|has to|will need to) (?:be|remain|stay) (?:\\w+ )?${STYLE_EN}\\b`, 'iu'),
  /\b(?:according to|in line with|in accordance with|as per|following|per) (?:the |my |these )?(?:provided|given|supplied|system|my|these) (?:guidelines|instructions|rules|directives|policies)\b/iu,
  new RegExp(`\\bas ${SELF},? (?:i|we)\\b`, 'iu'),
  /\b(?:it is important to|i must|i should|i need to|i have to|we must) avoid (?:any |making )?(?:statements?|speculation|speculating|predictions?|political comments?|claims?)\b/iu,
  // Portuguese
  /\ba resposta (?:deve|precisa|tem que|deveria) (?:ser|permanecer|manter-se) (?:\p{L}+ )?(?:neutra|factual|direta|objetiva|imparcial|equilibrada|concisa)/iu,
  /\b(?:conforme|de acordo com|segundo|seguindo) (?:as |às )?(?:diretrizes|instruções|regras|orientações) (?:fornecidas|recebidas|dadas|do sistema)/iu,
  new RegExp(`\\bcomo (?:o |a )?${SELF},? (?:eu )?(?:devo|preciso|tenho)\\b`, 'iu'),
  /\b(?:é importante|devo|preciso|devemos) evitar (?:qualquer |fazer )?(?:afirmaç(?:ão|ões)|especulaç(?:ão|ões)|previs(?:ão|ões)|comentários?)/iu,
  // Spanish
  /\bla respuesta (?:debe|debería|tiene que) (?:ser|mantenerse|permanecer) (?:\p{L}+ )?(?:neutral|factual|directa|objetiva|imparcial|equilibrada|concisa)/iu,
  /\b(?:conforme a|de acuerdo con|según|siguiendo) (?:las )?(?:directrices|instrucciones|reglas|pautas) (?:proporcionadas|dadas|recibidas|del sistema)/iu,
  new RegExp(`\\bcomo ${SELF},? (?:yo )?(?:debo|tengo que|necesito)\\b`, 'iu'),
  /\b(?:es importante|debo|debemos) evitar (?:cualquier |hacer )?(?:afirmaci(?:ón|ones)|especulaci(?:ón|ones)|predicci(?:ón|ones)|comentarios?)/iu,
  // French
  /\bla réponse (?:doit|devrait) (?:être|rester) (?:\p{L}+ )?(?:neutre|factuelle|directe|objective|impartiale|équilibrée|concise)/iu,
  /\b(?:conformément aux|selon les|suivant les) (?:directives|instructions|règles|consignes) (?:fournies|données|reçues|du système)/iu,
  new RegExp(`\\ben tant que ${SELF},? je (?:dois|devrais)\\b`, 'iu'),
  /\b(?:il est important d'|il est important d’|je dois )éviter (?:toute |tout )?(?:affirmation|spéculation|prédiction|commentaire)/iu,
  // Italian
  /\bla risposta (?:deve|dovrebbe) (?:essere|restare|rimanere) (?:\p{L}+ )?(?:neutrale|fattuale|diretta|oggettiva|imparziale|equilibrata|concisa)/iu,
  /\b(?:secondo le|conformemente alle|seguendo le) (?:linee guida|istruzioni|regole|direttive) (?:fornite|date|ricevute|di sistema)/iu,
  new RegExp(`\\bcome ${SELF},? (?:io )?devo\\b`, 'iu'),
  /\b(?:è importante|devo) evitare (?:qualsiasi |ogni )?(?:affermazion[ei]|speculazion[ei]|prevision[ei]|comment[oi])/iu,
  // German
  /\bdie antwort (?:sollte|muss|soll) (?:\p{L}+ )?(?:neutral|sachlich|faktisch|direkt|objektiv|unparteiisch|ausgewogen|knapp) (?:sein|bleiben)/iu,
  /\b(?:gemäß|entsprechend|laut) den (?:bereitgestellten|vorgegebenen|erhaltenen) (?:richtlinien|anweisungen|vorgaben|regeln)/iu,
  new RegExp(`\\bals ${SELF},? (?:muss|sollte|darf) ich\\b`, 'iu'),
  // Polish
  /\bodpowiedź (?:powinna|musi) (?:być|pozostać) (?:\p{L}+ )?(?:neutralna|rzeczowa|faktyczna|bezpośrednia|obiektywna|bezstronna|zwięzła)/iu,
  /\bzgodnie z (?:przekazanymi|podanymi|otrzymanymi) (?:wytycznymi|instrukcjami|zasadami)/iu,
  new RegExp(`\\bjako ${SELF},? (?:muszę|powinienem|powinnam)\\b`, 'iu'),
  // Russian
  /(?:^|[\s«"(])ответ (?:должен|следует|обязан) (?:быть|оставаться) (?:\p{L}+ )?(?:нейтральным|фактическим|прямым|объективным|беспристрастным|сбалансированным|кратким)/iu,
  /(?:^|[\s«"(])(?:согласно|в соответствии с) (?:предоставленным|полученными|заданными|предоставленными) (?:инструкциям|инструкциями|указаниям|указаниями|рекомендациям|рекомендациями|правилам|правилами)/iu,
  new RegExp(`(?:^|[\\s«"(])как ${SELF},? я (?:должен|должна|обязан)`, 'iu'),
  // Japanese
  /回答は(?:中立|事実に基づ|客観|簡潔|直接)[^。]{0,20}(?:べき|必要があります|なければなりません)/u,
  /(?:提供された|与えられた|受け取った)(?:ガイドライン|指示|ルール)に(?:従|沿)/u,
  new RegExp(`${SELF}として、?(?:私は)?[^。]{0,30}(?:べき|なければなりません|必要があります)`, 'iu'),
  // Korean
  /(?:답변|응답)은 (?:중립적|사실적|직접적|객관적|간결)[^.。]{0,20}(?:해야|합니다)/u,
  /(?:제공된|주어진|받은) (?:지침|가이드라인|지시|규칙)에 따라/u,
  new RegExp(`${SELF}(?:로서|으로서),? (?:저는 )?[^.。]{0,30}해야`, 'iu'),
  // Arabic
  /(?:يجب|ينبغي) أن تكون (?:الإجابة|الاستجابة|الرد) (?:محايدة|واقعية|مباشرة|موضوعية|متوازنة|موجزة)/u,
  /وفقًا لل(?:إرشادات|تعليمات|قواعد) (?:المقدمة|المعطاة|المستلمة)/u,
  new RegExp(`بصفتي ${SELF}،? (?:يجب|ينبغي)`, 'iu'),
] as RegExp[]).map(unicodeBoundaries)

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?。！？؟])\s+|(?<=[。！？])|\n+/u)
    .map(sentence => sentence.trim())
    .filter(Boolean)
}

/** Sentences in which the answer narrates its own instructions, what "the answer" should be, or itself by name. */
export function instructionNarrationSentences(answer: string): string[] {
  return splitSentences(answer).filter(sentence => PATTERNS.some(pattern => pattern.test(sentence)))
}

/** Release signal list for the executive release gate. */
export function instructionNarrationSignals(answer: string): string[] {
  return instructionNarrationSentences(answer).length ? [INSTRUCTION_NARRATION_SIGNAL] : []
}

/**
 * Remove the narrating sentences. Returns null when what remains is not a real answer (too little text),
 * so the caller fails closed instead of releasing a fragment.
 */
export function stripInstructionNarration(answer: string): string | null {
  const paragraphs = String(answer || '').split(/\n{2,}/)
  const kept = paragraphs
    .map(paragraph => splitSentences(paragraph).filter(sentence => !PATTERNS.some(pattern => pattern.test(sentence))).join(' '))
    .filter(paragraph => paragraph.trim())
  const result = kept.join('\n\n').trim()
  const substance = result.replace(/[\s\p{P}]/gu, '')
  return substance.length >= 40 ? result : null
}
