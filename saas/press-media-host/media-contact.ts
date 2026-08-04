// saas/press-media-host/media-contact.ts
//
// THE MEDIA CONTACT BLOCK EVERY PRESS SUBMISSION MUST CARRY.
//
// A press release without a contact line is not a press release. An editor who wants to run
// the story, ask a question, or request an interview has to be able to reach someone in one
// step — and if they cannot, the piece is dropped rather than chased. This is the single
// most common reason a technically fine submission produces nothing.
//
// WHY THIS IS CODE AND NOT A PROMPT RULE. The same argument that put the CAN-SPAM footer in
// code rather than in the outreach prompt: a prompt is a request, and a model that is asked
// for twelve things in one brief will occasionally deliver eleven. A submission that reaches
// an editor without a contact line cannot be recalled. So the block is appended AFTER
// generation, on the one path every provider's creative flows through, and it is therefore
// present whatever the model produced and whatever the owner pasted.
//
// DE-DUPLICATION IS NOT OPTIONAL, AND WE HAVE ALREADY PAID FOR LEARNING THAT. The outreach
// footer once wrote the team name at draft time while the send-time signature wrote it again,
// and real recipients got "— The SignalBoost Sales Team" twice. So this checks for the
// address already being present — in copy the owner wrote by hand, or in copy the model
// produced from a brief that quoted it — and appends nothing when it is.
//
// THE VALUES ARE CONFIGURED, NOT HARDCODED. This is the SignalBoost host adapter, so
// SignalBoost's own details are the defaults. A buyer running the press portable against
// their own host sets their own and ships nothing of ours in their releases.

const DEFAULT_TEAM = 'The SignalBoost Sales Team'
const DEFAULT_EMAIL = 'saassales@signalboostapp.com'
const DEFAULT_URL = 'https://saas.signalboostapp.com'

export interface MediaContactDetails {
  team: string
  email: string
  url: string
}

/**
 * Resolved from the environment with SignalBoost's own details as the fallback.
 *
 * PRESS_CONTACT_EMAIL is deliberately separate from the outreach sender desks. Press and
 * sales are different conversations arriving at different people, and pointing an editor at
 * whichever desk happens to be configured for cold email is how a journalist's question ends
 * up in a prospecting inbox.
 */
export function mediaContactDetails(): MediaContactDetails {
  return {
    team: String(process.env.PRESS_CONTACT_TEAM || '').trim() || DEFAULT_TEAM,
    email: String(process.env.PRESS_CONTACT_EMAIL || '').trim() || DEFAULT_EMAIL,
    url: String(process.env.PRESS_CONTACT_URL || '').trim() || DEFAULT_URL,
  }
}

/** The block as an editor should see it: label, human name, address, link. */
export function mediaContactBlock(details: MediaContactDetails = mediaContactDetails()): string {
  return ['Media contact:', details.team, details.email, details.url].join('\n')
}

/**
 * Append the contact block to a piece of creative unless it is already there.
 *
 * The email address is the test rather than the whole block, because a hand-written release
 * will phrase the contact line its own way — "Questions? Reach us at saassales@…" is a
 * perfectly good contact line and appending a second block beneath it would look careless to
 * the one reader who matters.
 *
 * Empty creative is returned untouched. A campaign with no copy is already stored as a draft
 * for the owner to write, and a contact block floating alone above an empty release would be
 * the only content in it.
 */
export function withMediaContact(creative: string, details = mediaContactDetails()): string {
  const body = String(creative || '').trim()
  if (!body) return body

  const haystack = body.toLowerCase()
  const email = details.email.toLowerCase()
  if (email && haystack.includes(email)) return body

  return `${body}\n\n${mediaContactBlock(details)}`
}
