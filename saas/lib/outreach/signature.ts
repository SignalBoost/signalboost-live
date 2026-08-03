// saas/lib/outreach/signature.ts
import { getOutreachSecret } from './social-secrets.ts'
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
  const configured = String(getOutreachSecret('NEXT_PUBLIC_SAAS_URL') || getOutreachSecret('SAAS_PUBLIC_URL') || '').trim()
  if (!configured) return DEFAULT_SAAS_LINK
  return /^https?:\/\//i.test(configured) ? configured.replace(/\/+$/, '') : `https://${configured.replace(/^\/+|\/+$/g, '')}`
}

// The address a recipient should write to. Mirrors the desk the mail is sent from, so a
// reply and a copied address land in the same monitored inbox. Buyers override it with
// OUTREACH_CONTACT_EMAIL and nothing SignalBoost-specific applies to them.
export function outreachContactAddress(senderKey?: string | null): string {
  const configured = String(getOutreachSecret('OUTREACH_CONTACT_EMAIL') || '').trim()
  if (configured) return configured
  return senderKey === 'saasMarketing' ? 'saasmarketing@signalboostapp.com' : 'saassales@signalboostapp.com'
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

  // 3-5. Build the closing block and put it AT THE BOTTOM, always.
  //
  //    The previous version only asked whether each part appeared ANYWHERE in the body.
  //    That is not the same requirement. A model that wrote "— The SignalBoost Sales
  //    Team" in the middle of a paragraph satisfied the check, so no closing block was
  //    added and the email ended on a call to action with no sign-off. Likewise a draft
  //    ending in a deep link (…/website-optimizer) contains the host, so the default
  //    site link was skipped.
  //
  //    So: strip any copy of these lines that the model already produced, then append
  //    the block once, in a fixed order, as the last thing in the message. Still
  //    idempotent — running it twice strips what the first pass added and re-appends
  //    the identical block.
  const contact = outreachContactAddress(senderKey)
  const host = link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase()

  const lines = body.split('\n')
  while (lines.length) {
    const tail = lines[lines.length - 1].trim()
    const isSignature = tail === `— ${team}` || tail === `- ${team}` || tail === team
    const isContact = contact ? tail.toLowerCase() === contact.toLowerCase() : false
    // A trailing bare link to the site — but never a deep link, which is the model's
    // own call to action and belongs in the body it was written for.
    const isBareLink = new RegExp(`^https?://(www\\.)?${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`, 'i').test(tail)
    if (!tail || isSignature || isContact || isBareLink) { lines.pop(); continue }
    break
  }
  body = lines.join('\n').trimEnd()

  // An inline sign-off left at the very end of the last sentence, e.g. "…how it works:
  // <url> — The SignalBoost Sales Team". Removed so the block below is the real close.
  body = body.replace(new RegExp(`[\\s—-]*${team.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'), '').trimEnd()

  // AND ANY SIGN-OFF LEFT STRANDED IN THE MIDDLE. The tail-walk above only reaches the
  // end of the message, so a team line with anything beneath it survived — which is
  // exactly what the draft-time compliance footer produced: an unsubscribe sentence sat
  // below the team name, the walk stopped at the sentence, and real recipients received
  // "— The SignalBoost Sales Team" twice.
  //
  // Only a line that is ENTIRELY the sign-off is removed, optionally preceded by a lone
  // em-dash separator. A sentence that merely mentions the team by name is left alone,
  // and the block appended below remains the single close. This also repairs rows
  // already sitting in the queue, which were drafted before the footer was corrected.
  body = body
    .split('\n')
    .filter((line, index, lines) => {
      const trimmed = line.trim()
      const isSignOff = trimmed === team || trimmed === `— ${team}` || trimmed === `- ${team}`
      if (isSignOff) return false
      // A separator em-dash whose only purpose was to introduce that sign-off.
      if ((trimmed === '—' || trimmed === '-') && lines[index + 1]) {
        const next = lines[index + 1].trim()
        if (next === team || next === `— ${team}` || next === `- ${team}`) return false
      }
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

  const closing = [`— ${team}`, contact, link].filter(Boolean).join('\n')
  body = `${body}\n\n${closing}`

  return body
}
