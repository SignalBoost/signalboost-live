// saas/lib/ai/cos/cosPlatformGlossary.ts
//
// OWNER-APPROVED PLATFORM GLOSSARY (2026-09-26). OWNER CHANNEL ONLY.
// Owner decision: these are internal platform-business definitions — "neither Concierge". Public Concierge
// never receives this block; callers must gate on the authenticated owner scope before using it.
//
// Why it exists: on 2026-09-26 COS answered "What is the University?" as "a typo for iTMounts" and
// "What is a specialist?" with a dictionary definition, because COS had no recorded knowledge of its own
// platform. These definitions are fixed, owner-authorized facts — never model-guessed — in the same way
// SIGNALBOOST_COMPANY_IDENTITY_DEFINITION is.

export const OWNER_PLATFORM_GLOSSARY: readonly string[] = Object.freeze([
  "COS (Chief of Staff): iTMounts' reasoning and orchestration system. It understands requests, routes work, uses tools and memory, and decides what is released. COS is a running system, not an artifact.",
  "Concierge: the user-facing channel. COS is the brain and Concierge is the mouth: COS reasons and answers; Concierge only renders COS's released answer.",
  'COS University: where COS models are trained, evaluated, and graduated.',
  'Specialist: a model trained by COS University for one subject (for example Reasoning & Decision Science, or Computer Science & Coding).',
  "Artifact: the exact, versioned trained model a specialist produces (an adapter). It is independently evaluated before it may be used. COS's models are artifacts; COS itself is not.",
  'Graduate: an artifact that passed evaluation and is active. COS consults a graduate only in the roles it is approved for, such as critic or verifier.',
  'Builder Residency: supervised practice in which a Computer Science & Coding artifact solves real build cases before its final evaluation.',
])

export function ownerPlatformGlossaryContext(): string {
  return [
    'OWNER-APPROVED PLATFORM GLOSSARY (authoritative definitions; owner channel only; never repeat on public channels):',
    ...OWNER_PLATFORM_GLOSSARY.map(line => `- ${line}`),
    '- When the owner asks about any of these terms, answer from these definitions first. A general-world meaning of the same word (for example a university or a medical specialist) is secondary unless the owner clearly asks about it.',
  ].join('\n')
}

/** The route may wrap a follow-up as PREVIOUS USER CONTEXT + CURRENT USER REQUEST; judge only the current request. */
export function currentUserRequestText(prompt: unknown): string {
  const text = String(prompt ?? '')
  const marker = 'CURRENT USER REQUEST:'
  const at = text.lastIndexOf(marker)
  return (at >= 0 ? text.slice(at + marker.length) : text).trim()
}

const PLATFORM_CONCEPT = /\b(?:cos|chief\s+of\s+staff|concierge|university|specialists?|graduates?|artifacts?|residency|residents?)\b/i

/** True when the current request names a platform concept defined in the owner glossary. */
export function mentionsPlatformConcept(prompt: unknown): boolean {
  return PLATFORM_CONCEPT.test(currentUserRequestText(prompt))
}
