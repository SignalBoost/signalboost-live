// saas/lib/outreach/publicationTargets.ts
//
// A PUBLICATION IS NOT A SALES PROSPECT, AND AN EDITORIAL INBOX IS NOT A BUYER.
//
// PORTABLE KERNEL. Pure, no imports, no host coupling.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// The sales discovery path found Business Insider and queued it as a prospect, and an
// editorial address at another company was emailed as if it were a buyer. The copy that
// reached them read as a press pitch — "worth a closer look for your readers", "happy to
// arrange a live demo if there is editorial interest" — signed by the sales desk, sent to a
// support inbox, with an unsubscribe footer. Nothing in the sales path had any concept of a
// publication: createOutreachDraft rejects directories and "Top N" listicles and stops there.
//
// The rule this enforces is architectural, not cosmetic: PUBLICATIONS AND EMAIL OUTREACH DO
// NOT SHARE A PIPELINE. They contact different people, for different reasons, from different
// desks, under different rules. A press pitch that arrives as cold sales does not merely
// underperform — it spends a relationship with an outlet you wanted covering the launch, and
// it cannot be taken back.
//
// ─────────────────────────────────────────────────────────────────────────────
// PRECISION OVER RECALL, DELIBERATELY
//
// A false positive blocks a real prospect and costs a sale. A false negative sends one more
// cold email to an editor. Both are bad, so this fires only on signals that are hard to
// produce by accident: an editorial CONTACT ADDRESS, a publisher word standing alone as a
// domain label, or a publication word in the business name. It does NOT guess from industry,
// from the presence of a blog, or from a company merely publishing articles — a software firm
// with a content marketing team is still a buyer.
//
// Every decision carries its reasons, so a skipped row can be read and argued with rather
// than merely counted.

export interface PublicationVerdict {
  /** True when this target belongs in the press pipeline, not the sales pipeline. */
  isPublication: boolean
  /** Which signals fired, in the operator's words. Empty when nothing fired. */
  reasons: string[]
  /** The strongest single signal, for a one-line skip message. */
  summary: string
}

/**
 * Local parts that exist to receive EDITORIAL contact — pitches, letters, tips, contributed
 * articles. Mail to these reaches a desk whose job is deciding what to publish, never a desk
 * whose job is buying software. This is the strongest signal in the file: it is about the
 * address the message would actually arrive at, not about what the company might be.
 */
const EDITORIAL_LOCALPARTS = new Set([
  'editor', 'editors', 'editorial', 'letters', 'letter', 'news', 'newsroom', 'newsdesk',
  'tips', 'tip', 'press', 'pressroom', 'media', 'pitch', 'pitches', 'submissions',
  'submission', 'submit', 'guest', 'guestpost', 'contribute', 'contributor', 'contributors',
  'reporters', 'journalist', 'journalists', 'redaccion', 'redacao', 'redakcja', 'redaktsiya',
])

/**
 * Words that make a domain label a publisher. Matched as a WHOLE hyphen- or dot-separated
 * label segment, never as a substring: 'newsletter-tools.com' is a product, 'news.com' is not,
 * and 'postmark.com' must never read as 'post'.
 */
const PUBLISHER_LABELS = new Set([
  'news', 'newspaper', 'magazine', 'mag', 'journal', 'gazette', 'herald', 'tribune',
  'times', 'post', 'chronicle', 'observer', 'examiner', 'dispatch', 'bulletin', 'press',
  'daily', 'weekly', 'insider', 'wire', 'newsroom', 'editorial', 'media', 'broadcast',
  'jornal', 'revista', 'imprensa', 'prensa', 'periodico', 'diario', 'gazeta', 'prasa',
])

/** Publication words in a BUSINESS NAME. Same whole-word rule. */
const PUBLICATION_NAME_WORDS = new Set([
  'news', 'newspaper', 'magazine', 'journal', 'gazette', 'herald', 'tribune', 'times',
  'chronicle', 'observer', 'examiner', 'dispatch', 'bulletin', 'press', 'daily', 'weekly',
  'insider', 'wire', 'newsroom', 'editorial', 'publishing', 'publisher', 'publications',
  'publication', 'media', 'broadcasting', 'podcast', 'jornal', 'revista', 'imprensa',
  'prensa', 'periodico', 'diario', 'gazeta',
])

/**
 * Outlets whose names carry no publisher word at all. Kept deliberately SHORT: this list is a
 * patch over the general rules, and a long one would rot into a maintenance burden that still
 * misses the next outlet. The general rules above are what does the work.
 */
const KNOWN_OUTLET_HOSTS = new Set([
  'businessinsider.com', 'techcrunch.com', 'wired.com', 'zdnet.com', 'venturebeat.com',
  'theverge.com', 'reuters.com', 'bloomberg.com', 'axios.com', 'cnbc.com', 'forbes.com',
  'theregister.com', 'arstechnica.com', 'engadget.com', 'protocol.com', 'thenewstack.io',
  'infoworld.com', 'computerworld.com', 'cio.com', 'darkreading.com', 'scworld.com',
  'securityboulevard.com', 'infosecurity-magazine.com', 'sdtimes.com', 'diginomica.com',
  'siliconangle.com', 'ft.com', 'economist.com', 'theguardian.com', 'nytimes.com', 'wsj.com',
])

function hostOf(url: string): string {
  try {
    return new URL(String(url || '').trim()).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function wordsOf(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z\u00c0-\u024f]+/)
    .filter(Boolean)
}

/**
 * Decide whether a target belongs to the press pipeline.
 *
 * Any single signal is enough. These are not weighted or summed: each one independently means
 * "this message would arrive at an editorial desk", and one is as disqualifying as three.
 */
export function classifyPublicationTarget(input: {
  businessName?: string | null
  businessUrl?: string | null
  contactEmail?: string | null
}): PublicationVerdict {
  const reasons: string[] = []

  const email = String(input.contactEmail || '').trim().toLowerCase()
  const localPart = email.includes('@') ? email.split('@')[0].replace(/[._-].*$/, '') : ''
  if (localPart && EDITORIAL_LOCALPARTS.has(localPart)) {
    reasons.push(`the contact address "${email}" is an editorial inbox (${localPart}@), which receives pitches and submissions rather than buying decisions`)
  }

  const host = hostOf(String(input.businessUrl || ''))
  if (host && KNOWN_OUTLET_HOSTS.has(host)) {
    reasons.push(`${host} is a publication`)
  }
  if (host) {
    const labels = host.split(/[.-]/).filter(Boolean)
    const hit = labels.find(label => PUBLISHER_LABELS.has(label))
    if (hit) reasons.push(`the domain ${host} contains the publisher word "${hit}"`)
  }

  const nameHit = wordsOf(input.businessName).find(word => PUBLICATION_NAME_WORDS.has(word))
  if (nameHit) {
    reasons.push(`the business name contains the publication word "${nameHit}"`)
  }

  return {
    isPublication: reasons.length > 0,
    reasons,
    summary: reasons[0] || '',
  }
}

/**
 * The skip message a sales path should record when it refuses a publication.
 *
 * It names the reason AND where the target belongs, because a refusal that does not say what
 * to do instead just looks like the system losing a lead.
 */
export function publicationSkipReason(
  businessName: string,
  verdict: PublicationVerdict,
): string {
  return `${businessName} looks like a publication or an editorial contact — ${verdict.summary}. It was NOT queued for sales outreach. Publications belong in the Press & Media pipeline, which pitches editors from the partners desk instead of cold-emailing them from sales.`
}
