// saas/lib/outreach/signature.ts
//
// THE SIGNATURE CHOKEPOINT.
//
// Every outbound outreach email must close the same way: a team signature (never a
// personal name) and a link the reader can click to reach the platform. Leaving that
// to the drafting model failed in production on 2026-07-30, when a message went to a
// real company signed "Best regards, [Your Name]" and carrying no link at all.
//
// So it is enforced in code, at SEND time rather than at draft time. Draft-time only
// would leave every already-approved row in the queue untouched, and those are exactly
// the rows about to go out. Applying it here means it covers drafts from every origin —
// the analyzer pipeline, the strategist, the background prospect worker, and anything
// written before this file existed.
//
// The function is IDEMPOTENT. It is safe to run on a message that already carries the
// signature or the link; nothing is duplicated. It is also safe to run twice in one
// request path, which matters because both senders call it.

const DEFAULT_SAAS_LINK = 'https://saas.signalboostapp.com'

// A bare URL on its own line. The send routes render the body inside a
// white-space:pre-wrap div with no anchor tags, and every mail client auto-links a
// bare https:// URL — so this is the form that actually stays clickable.
export function outreachLink(): string {
  const configured = String(process.env.NEXT_PUBLIC_SAAS_URL || process.env.SAAS_PUBLIC_URL || '').trim()
  if (!configured) return DEFAULT_SAAS_LINK
  return /^https?:\/\//i.test(configured) ? configured.replace(/\/+$/, '') : `https://${configured.replace(/^\/+|\/+$/g, '')}`
}

export function outreachTeamName(senderKey?: string | null): string {
  return senderKey === 'saasMarketing' ? 'The SignalBoost Marketing Team' : 'The SignalBoost Sales Team'
}

// Sign-offs a model tends to produce with a placeholder or an empty name after them.
// Matching the sign-off AND what follows lets us replace the whole tail cleanly rather
// than leaving "Best regards," dangling above the injected signature.
const DANGLING_SIGNOFF = /(?:^|\n)\s*(best regards|kind regards|warm regards|regards|sincerely|best|thanks|thank you|cheers|atentamente|saludos|cordialmente|z powa[żz]aniem|pozdrawiam|с уважением)\s*,?\s*(?:\n+\s*(?:\[[^\]]{0,48}\]|\{\{[^}]{0,60}\}\}|<[^>]{0,48}>|your name|name|sender|signature)\s*)?\s*$/i

// SOCIAL / SHORT-FORM VARIANT.
//
// The same rule as email — every outreach must carry the platform link — but a social
// post or DM has no signature block and a hard character budget, so the full email
// footer is wrong there. This appends only the link, and only when it is missing.
//
// Idempotent, like its email counterpart.
export function applyOutreachLink(message: string): string {
  const body = String(message || '').replace(/\r\n/g, '\n').trimEnd()
  const link = outreachLink()
  const host = link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase()
  if (!body) return link
  if (body.toLowerCase().includes(host)) return body
  return `${body}\n${link}`
}

export function applyOutreachSignature(message: string, senderKey?: string | null): string {
  const team = outreachTeamName(senderKey)
  const link = outreachLink()
  let body = String(message || '').replace(/\r\n/g, '\n').trimEnd()

  // 1. Remove a trailing sign-off that has no real name under it. Whatever the model
  //    left there — a placeholder, or nothing — the team signature below replaces it.
  body = body.replace(DANGLING_SIGNOFF, '').trimEnd()

  // 2. Any remaining name placeholder anywhere in the body becomes the team name, so a
  //    mid-body "[Your Name] from SignalBoost" reads correctly instead of being refused.
  body = body
    .replace(/\[\s*(your\s+name|name|sender|signature|your\s+full\s+name)\s*\]/gi, team)
    .replace(/\{\{\s*(your_?name|name|sender|signature)\s*\}\}/gi, team)
    .replace(/<\s*(your\s+name|name|sender|signature)\s*>/gi, team)
    .trimEnd()

  // 3. Ensure the team signature is present exactly once, at the end.
  if (!body.toLowerCase().includes(team.toLowerCase())) {
    body = `${body}\n\n— ${team}`
  }

  // 4. Ensure the platform link is present exactly once. Compared on the bare host so a
  //    message that already links the site in prose does not get a second copy.
  const host = link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase()
  if (!body.toLowerCase().includes(host)) {
    body = `${body}\n${link}`
  }

  return body
}
