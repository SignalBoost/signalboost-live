// saas/lib/ai/cos/provenanceIntrospectionIntent.ts
//
// RECOGNIZE "WHERE DID YOU GET THAT?" IN THE WAY PEOPLE ACTUALLY ASK IT.
//
// COS stores real execution provenance for every turn and can answer source questions from that
// record instead of guessing. The gate deciding whether a question IS a source question required
// technical vocabulary — provenance, execution telemetry, which model, reasoner, semantic cache.
// Nobody asks that way. Two production failures, both the natural phrasing:
//
//   2026-08-22  "skąd masz te informacje?" (Polish, after a name-change answer) → not recognized →
//               answered from model memory with a generic "I am a language model trained on..."
//               boilerplate rather than the stored provenance for that exact turn.
//   2026-08-22  "show me where from you got the answer for the question?" (after a reasoned funnel
//               sequence) → not recognized → routed to the CURRENT-FACT path → COS searched the web
//               for evidence supporting an answer it had just reasoned out, found nothing
//               groundable, and refused. The provenance record was sitting unused.
//
// This module adds the natural-language half in all five platform languages. Two hard constraints:
//
//   1. IT MUST BE ABOUT THE ASSISTANT'S OWN PRIOR ANSWER. Second-person address plus a
//      source/knowledge verb plus a referent to the answer. "Where do plants get their energy?"
//      is a content question about plants and must stay one.
//   2. IT MUST NOT SWALLOW CONDITIONAL "how do you know WHEN/IF ..." questions, which are ordinary
//      advice ("how do you know when bread is done?"). A trailing when/if/whether clause disqualifies.
//
// Pure, deterministic, no imports — this sits at the routing boundary and must never be the thing
// that breaks a build or costs a model call.

/** Second-person address, per language (Polish/Russian encode it in the verb, hence the verb lists). */
// NOTE ON BOUNDARIES: JavaScript's \b is ASCII-word-based, so it does not work around accented or
// Cyrillic letters ("\bvocê\b" and "\bоткуда\b" never match). Boundaries here are Unicode letter
// lookarounds, which is what makes the non-English fixtures pass.
const B0 = '(?<![\\p{L}\\p{M}])'
const B1 = '(?![\\p{L}\\p{M}])'
const bounded = (alternatives: string) => new RegExp(`${B0}(?:${alternatives})${B1}`, 'iu')

/** Second-person address, per language (Polish/Russian also encode it in the verb). */
const ADDRESSES_ASSISTANT = bounded([
  'you|your|yours',
  'usted|tú|tu|tus|su|sus|sacaste|dijiste|basas|sabes',
  'você|voce|teu|tua|teus|tuas|seu|sua|seus|suas|tirou|disse|baseia|sabe',
  'masz|wiesz|twoje|twoja|twój|twoich|twoim|wziąłeś|wzięłaś|znalazłeś|znalazłaś|podałeś|podałaś',
  'ты|вы|тебя|вас|твой|твои|твоя|ваш|ваши|ваша|знаешь|сказал|сказали|взял|взяли',
].join('|'))

/** Verbs/nouns that ask about the ORIGIN of what was said. */
const SOURCE_LANGUAGE = bounded([
  // en — origin phrasings, including the ones with no second person at all
  'where\\s+(?:did|do|does)\\s+\\w+\\s+(?:get|find|obtain|source)|where\\s+from|where\\s+\\w+\\s+(?:came|come|comes)\\s+from|(?:came|come|comes)\\s+from|got\\s+(?:this|that|the)|sources?|citations?|references?|based\\s+on|base\\s+(?:this|that|it)\\s+on|arrive[d]?\\s+at|how\\s+do\\s+you\\s+know|how\\s+did\\s+you\\s+know|according\\s+to\\s+what|on\\s+what\\s+basis|evidence\\s+for|did\\s+you\\s+use',
  // es
  'de\\s+d[oó]nde|vino|proviene|fuentes?|citas?|en\\s+qu[eé]\\s+te\\s+basas|c[oó]mo\\s+lo\\s+sabes|seg[uú]n\\s+qu[eé]',
  // pt
  'de\\s+onde|veio|prov[eé]m|fontes?|cita[cç][aã]o|em\\s+que\\s+voc[eê]\\s+se\\s+baseia|como\\s+voc[eê]\\s+sabe|segundo\\s+o\\s+qu[eê]',
  // pl
  'sk[aą]d|pochodzi|[zź]r[oó]d[lł][aoe]?|[zź]r[oó]de[lł]|na\\s+jakiej\\s+podstawie',
  // ru
  'откуда|источник[иаов]?|на\\s+основании\\s+чего',
].join('|'))

/** A referent to the thing that was just said. */
const ANSWER_REFERENT = bounded([
  'answer|response|reply|information|info|claim|statement|data|figures?|numbers?|this|that|it|above|previous|prior|last',
  'respuesta|informaci[oó]n|datos?|esto|eso|esta|anterior',
  'resposta|informa[cç][aã]o|dados?|isso|isto|essa|esse|anterior',
  'odpowied[zź]|odpowiedzi|informacj[eięa]|to|te|tę|poprzedni',
  'ответ|ответа|информаци[юяи]|это|эта|эти|предыдущ\\w*',
].join('|'))

/**
 * Conditional/advice shapes that merely borrow the words: "how do you know WHEN the bread is done",
 * "where do you get IF you need a permit". These are ordinary questions, not source questions.
 */
const CONDITIONAL_ADVICE = /\b(?:how\s+do\s+you\s+know|c[oó]mo\s+lo\s+sabes|como\s+voc[eê]\s+sabe|sk[aą]d\s+wiesz|как\s+(?:ты|вы)\s+знаешь)\b[^?]*\b(?:when|whether|if|cu[aá]ndo|si|quando|se|kiedy|czy|когда|если|ли)\b/iu

/** Third-person content questions that happen to use source words ("where do plants get energy"). */
const THIRD_PERSON_SUBJECT = /\bwhere\s+(?:do|does|did)\s+(?!you\b|u\b)(?:the\s+|a\s+|an\s+)?\w+/i

/**
 * Imperatives aimed at the assistant. "show me where the answers came from" addresses COS without
 * ever saying "you" — the 2026-08-22 second miss, which routed an introspection question to live
 * search and answered it with an unrelated FAFSA page and a crossword puzzle.
 */
const IMPERATIVE_TO_ASSISTANT = bounded([
  'show\\s+me|tell\\s+me|give\\s+me|list|display',
  'mu[eé]strame|dime|dame|ense[nñ][aá]me',
  'me\\s+mostre|me\\s+diga|mostre|diga',
  'poka[zż]\\s+mi|powiedz\\s+mi|podaj',
  'покажи|скажи|дай',
].join('|'))

/** A definite reference to the answer just given — assistant-referring on its own. */
// TYPO TOLERANCE. A production miss (2026-08-23) was "show me where did you get the ANSWERT
// from?" — one stray letter. The consequence is severe and asymmetric: an unrecognized
// introspection question falls through to LIVE WEB SEARCH, and COS then answered a question about
// its own provenance using retrieved pages about E-Verify and FAFSA verification. A short trailing
// letter run is therefore allowed on the answer nouns. The risk of over-matching is low because
// this noun never fires alone — it is always combined with a where-word and second-person address.
const ANSWER_NOUN = bounded([
  'answer\\p{L}{0,2}|responses?|replies|reply',
  'respuestas?',
  'respostas?',
  'odpowied[zź]\\p{L}{0,2}|odpowiedzi',
  'ответ\\p{L}{0,2}',
].join('|'))

/**
 * True when the user is asking where the ASSISTANT's own previous answer came from. Callers should
 * answer from the stored provenance record for that turn — never from a live search, and never
 * from model memory about what models generally are.
 *
 * Structure: ORIGIN language + a reference to the assistant or its answer, minus the shapes that
 * merely borrow the vocabulary (conditional advice, third-person content questions, and topical
 * source requests such as "show me the best sources of vitamin D").
 */

/** where-words, all five languages. */
const WHERE_WORD = bounded('where|d[oó]nde|de\\s+d[oó]nde|onde|de\\s+onde|sk[aą]d|gdzie|откуда|где')

/** "answers ABOUT visas" is a topic request, not introspection — unless it is "the answer to the question". */
const TOPICAL_ANSWER = /\b(?:answers?|respuestas?|respostas?|odpowiedzi|ответ\p{L}*)\s+(?:about|on|regarding|to|for|sobre|acerca|para|o|na|про|о|об)\s+(?!the\s+question|my\s+question|this\s+question)/iu

/**
 * STRUCTURAL BACKSTOP — a production miss (2026-08-23) was a TYPO: "show me where did you the
 * answer from?" dropped the verb "get", and every source-language pattern assumes a verb. People
 * asking where an answer came from keep producing surface forms no pattern list anticipates, so
 * alongside the verb patterns: WHERE + second-person address + an answer noun is introspection,
 * whatever sits between them — unless the answer noun is topical ("answers about visas").
 */
function whereYouAnswerShape(text: string): boolean {
  if (!WHERE_WORD.test(text)) return false
  if (!ADDRESSES_ASSISTANT.test(text)) return false
  if (!ANSWER_NOUN.test(text)) return false
  if (TOPICAL_ANSWER.test(text)) return false
  return true
}

export function asksWhereTheAnswerCameFrom(input: string): boolean {
  const text = String(input || '').trim()
  if (!text || text.length > 300) return false
  if (CONDITIONAL_ADVICE.test(text)) return false
  // Structural backstop FIRST: it exists precisely for inputs the verb patterns cannot match
  // (typos, dropped verbs), so it must not sit behind the verb-pattern gate.
  if (whereYouAnswerShape(text)) return true
  if (!SOURCE_LANGUAGE.test(text)) return false
  const addressed = ADDRESSES_ASSISTANT.test(text)
  const imperative = IMPERATIVE_TO_ASSISTANT.test(text)
  const answerNoun = ANSWER_NOUN.test(text)

  // The third-person content-question exclusion ("where does the Nile get its water") must not
  // swallow "where does this ANSWER come from" — an answer noun makes the subject the assistant's
  // own output, not a topic in the world.
  if (!answerNoun && THIRD_PERSON_SUBJECT.test(text)) return false

  // An explicit source noun needs to be tied to the assistant or its answer, or it is a topical
  // request for sources ABOUT something ("the best sources of vitamin D").
  const explicitSourceNoun = bounded('sources?|citations?|references?|fuentes?|citas?|fontes?|[zź]r[oó]d[lł][aoe]?|[zź]r[oó]de[lł]|источник[иаов]?').test(text)
  if (explicitSourceNoun) {
    const possessive = bounded('your|yours|tus|tu|sus|suas|seus|twoje|twoich|ваши|ваш|твои').test(text)
    if (possessive || answerNoun) return true
    // "what sources did you use?" — addressed, and the sources are tied to the assistant by verb.
    // Second-person address is itself the tie: "what sources did you use", "какие у вас источники".
    if (addressed) return true
    return false
  }

  if (answerNoun) return true
  if (addressed && ANSWER_REFERENT.test(text)) return true
  // No second person and no answer noun: an origin question about "this information" / "esta
  // información" still refers to what was just said, provided it is short and demonstrative.
  const demonstrative = bounded('this|that|these|those|esta|esto|eso|essa|isso|ta|te|to|эта|это|эти').test(text)
  const informationNoun = bounded('information|info|data|claim|statement|informaci[oó]n|informa[cç][aã]o|informacj[eaię]|информаци[яию]').test(text)
  if ((imperative || demonstrative) && informationNoun) return true
  return false
}
