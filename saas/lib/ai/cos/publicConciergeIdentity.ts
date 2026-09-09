type PublicIdentityReply = Readonly<{ reply: string; source: string }>

const EMPLOYER_QUESTION = /\b(?:who|what(?:'s|\s+is)?|name)\b[\s\S]{0,80}\b(?:your|you)\b[\s\S]{0,40}\bemployer\b|\b(?:your|you)\b[\s\S]{0,40}\bemployer\b/i

/**
 * Public Concierge has no human employment history. Answer deterministically so a
 * model cannot invent a government agency, company, or personal affiliation.
 */
export function publicConciergeIdentityReply(prompt: string): PublicIdentityReply | null {
  if (!EMPLOYER_QUESTION.test(String(prompt || '').trim())) return null
  return Object.freeze({
    reply: 'I’m iTMounts Concierge, an AI assistant—not a person—so I do not have an employer.',
    source: 'concierge-public-identity',
  })
}
