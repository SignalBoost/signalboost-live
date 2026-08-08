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

type OutreachLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

function normalizeLocale(value?: string | null): OutreachLocale {
  const lang = String(value || '').toLowerCase()
  if (lang.startsWith('es')) return 'es'
  if (lang.startsWith('pt')) return 'pt'
  if (lang.startsWith('pl')) return 'pl'
  if (lang.startsWith('ru')) return 'ru'
  return 'en'
}

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

export function outreachTeamName(senderKey?: string | null, locale?: string | null): string {
  const lang = normalizeLocale(locale)
  const marketing = senderKey === 'saasMarketing'
  const names: Record<OutreachLocale, { sales: string; marketing: string }> = {
    en: { sales: 'The SignalBoost Sales Team', marketing: 'The SignalBoost Marketing Team' },
    es: { sales: 'El equipo de ventas de SignalBoost', marketing: 'El equipo de marketing de SignalBoost' },
    pt: { sales: 'A equipe de vendas da SignalBoost', marketing: 'A equipe de marketing da SignalBoost' },
    pl: { sales: 'Zespół sprzedaży SignalBoost', marketing: 'Zespół marketingu SignalBoost' },
    ru: { sales: 'Команда продаж SignalBoost', marketing: 'Команда маркетинга SignalBoost' },
  }
  return marketing ? names[lang].marketing : names[lang].sales
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

export function applyOutreachSignature(message: string, senderKey?: string | null, locale?: string | null): string {
  const team = outreachTeamName(senderKey, locale)
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

  const contact = outreachContactAddress(senderKey)
  const host = link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').toLowerCase()

  const allTeamNames = [
    'The SignalBoost Sales Team', 'The SignalBoost Marketing Team',
    'El equipo de ventas de SignalBoost', 'El equipo de marketing de SignalBoost',
    'A equipe de vendas da SignalBoost', 'A equipe de marketing da SignalBoost',
    'Zespół sprzedaży SignalBoost', 'Zespół marketingu SignalBoost',
    'Команда продаж SignalBoost', 'Команда маркетинга SignalBoost',
  ]

  const isKnownTeamLine = (value: string) => {
    const trimmed = value.trim().replace(/^[—-]\s*/, '')
    return allTeamNames.some(name => trimmed.toLowerCase() === name.toLowerCase())
  }

  const lines = body.split('\n')
  while (lines.length) {
    const tail = lines[lines.length - 1].trim()
    const isSignature = isKnownTeamLine(tail)
    const isContact = contact ? tail.toLowerCase() === contact.toLowerCase() : false
    const isBareLink = new RegExp(`^https?://(www\\.)?${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`, 'i').test(tail)
    if (!tail || isSignature || isContact || isBareLink) { lines.pop(); continue }
    break
  }
  body = lines.join('\n').trimEnd()

  // Remove any translated or English team sign-off already stranded elsewhere in the
  // message so switching locale cannot leave two different-language signatures behind.
  body = body
    .split('\n')
    .filter((line, index, lines) => {
      const trimmed = line.trim()
      if (isKnownTeamLine(trimmed)) return false
      if ((trimmed === '—' || trimmed === '-') && lines[index + 1] && isKnownTeamLine(lines[index + 1])) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

  const closing = [`— ${team}`, contact, link].filter(Boolean).join('\n')
  return `${body}\n\n${closing}`
}
