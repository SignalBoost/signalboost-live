// saas/lib/ai/cos/conversationProvenanceIntent.ts
//
// Meaning-scoped detection of "where did this come from?" questions about something
// COS produced earlier in THIS conversation.
//
// Why this module exists: the previous provenance interception matched on the literal
// token "answer"/"response"/"source". A visitor who asked "where did you get the IDEA
// from?" about a script COS had just written matched nothing, fell through to
// live-verify-by-default, and was served the fresh-evidence restriction message —
// which asserts a retrieval that never happened. Same failure shape as the anchored
// "what is SignalBoost" regex and the bare "subject line" misroute: literal matching
// where meaning-scoping was required.
//
// Deliberately ZERO IMPORTS so it stays unit-testable and can be called from every
// ingress (concierge -> support/route.ts, cos-browser -> cos-primary) without pulling
// supabase or config into the test process.
//
// Regexes are STATIC LITERALS on purpose. Dynamically concatenated combined regexes
// have broken Turbopack production builds in this repo even with tsc green — do not
// refactor these into built-up strings.
//
// Word boundaries use Unicode lookarounds, never ASCII \b: \b fails on Cyrillic and
// on accented Latin, which silently kills the RU/ES/PT/PL branches.

/** Prompts longer than this are treated as pasted material, not a question about the turn. */
const MAX_PROMPT_CHARS = 600;

/**
 * An authoring imperative means the user is asking COS to WRITE something that happens
 * to mention sources ("write a post about where coffee comes from"), not asking where
 * COS's own output came from.
 */
const AUTHORING_IMPERATIVE =
  /(?<![\p{L}\p{N}_])(?:write|draft|compose|create|generate|make\s+me|escribe|redacta|crea|genera|escreva|redija|crie|gere|napisz|stw[óo]rz|wygeneruj|напиши|составь|создай|сгенерируй)(?![\p{L}\p{N}_])/iu;

/** English: origin interrogatives that already carry their conversational referent. */
const EN_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:where\s+(?:did|do)\s+(?:you|u)\s+(?:get|find|take|pull|source)|where\s+(?:did|does)\s+(?:this|that|it|the\s+(?:idea|answer|script|text|story|joke|response|reply|draft))\s+come\s+from|where(?:'s|\s+is)\s+(?:this|that|it)\s+from|what\s+(?:is|are|was|were)\s+(?:this|that|it|the\s+(?:idea|answer|script|text|story))\s+based\s+on|how\s+did\s+you\s+come\s+up\s+with|did\s+you\s+(?:make|made)\s+(?:this|that|it)\s+up|did\s+you\s+(?:invent|imagine)\s+(?:this|that|it)|what\s+(?:is|was)\s+your\s+source|what\s+sources?\s+did\s+you\s+use|who\s+told\s+you)(?![\p{L}\p{N}_])/iu;

/** Spanish. */
const ES_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:de\s+d[oó]nde\s+(?:lo\s+|la\s+|)?(?:sacaste|saca[sr]?|sac[oó]|obtuviste|sali[oó]|viene|vino|sale)|en\s+qu[eé]\s+(?:te\s+basaste|se\s+bas[oó]|se\s+basa)|c[oó]mo\s+se\s+te\s+ocurri[oó]|cu[aá]l\s+(?:es|fue)\s+tu\s+fuente|te\s+lo\s+inventaste|lo\s+inventaste)(?![\p{L}\p{N}_])/iu;

/** Portuguese. */
const PT_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:de\s+onde\s+(?:voc[eê]\s+)?(?:tirou|tiraste|tirei|veio|saiu|surgiu)|em\s+que\s+(?:voc[eê]\s+)?se\s+base(?:ou|ia)|no\s+que\s+(?:voc[eê]\s+)?se\s+base(?:ou|ia)|qual\s+(?:[ée]|foi)\s+a\s+sua\s+fonte|voc[eê]\s+inventou)(?![\p{L}\p{N}_])/iu;

/** Polish. */
const PL_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:sk[ąa]d\s+(?:to\s+|masz\s+)?(?:masz|wzi[ąa][łl]e[śs]|wzi[ęe][łl]a[śs]|pochodzi|wzi[ęe][łl]o|si[ęe])|na\s+czym\s+(?:si[ęe]\s+opiera(?:sz|)|to\s+bazuje)|jakie\s+(?:jest|by[łl]o)\s+[źz]r[óo]d[łl]o|wymy[śs]li[łl]e[śs]\s+to)(?![\p{L}\p{N}_])/iu;

/** Russian. */
const RU_ORIGIN =
  /(?<![\p{L}\p{N}_])(?:откуда\s+(?:ты\s+|вы\s+)?(?:это\s+)?(?:вз[ья]л|взяли|взялось|появилось|знаешь|знаете)|на\s+ч[её]м\s+(?:основано|ты\s+основывал|вы\s+основывались)|как(?:ой|ов)\s+(?:у\s+тебя\s+|у\s+вас\s+)?источник|(?:ты|вы)\s+это\s+(?:придумал|придумали|выдумал))(?![\p{L}\p{N}_])/iu;

/**
 * True when the prompt asks about the ORIGIN of something COS produced in this
 * conversation — regardless of whether the user calls it an answer, an idea, a script,
 * or just "it".
 *
 * Callers must route a true result to the provenance path and MUST NOT let it reach
 * the fresh-evidence / live-verification branch: there is no external fact to verify,
 * so that branch can only fail closed and report a retrieval that never occurred.
 */
export function isConversationProvenanceQuestion(prompt: string): boolean {
  if (typeof prompt !== 'string') return false;
  const text = prompt.trim();
  if (text.length === 0 || text.length > MAX_PROMPT_CHARS) return false;
  if (AUTHORING_IMPERATIVE.test(text)) return false;
  return (
    EN_ORIGIN.test(text) ||
    ES_ORIGIN.test(text) ||
    PT_ORIGIN.test(text) ||
    PL_ORIGIN.test(text) ||
    RU_ORIGIN.test(text)
  );
}

export const CONVERSATION_PROVENANCE_MAX_PROMPT_CHARS = MAX_PROMPT_CHARS;
