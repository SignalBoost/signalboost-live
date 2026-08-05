// saas/lib/marketing/pressCampaignAdmission.ts
//
// NOTHING ENTERS THE PRESS QUEUE UNTIL IT IS FIT TO BE SENT TO AN EDITOR.
//
// PORTABLE KERNEL. Pure, no imports from the host, no database, no network.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY ADMISSION CONTROL AND NOT MORE WARNINGS
//
// The cockpit now labels the brief a brief, blocks approval when no release exists, and
// refuses an unsigned paid claim. Every one of those is a gate at the EXIT. They are correct
// and they changed nothing about what the queue contains, because the queue keeps filling
// with records that were never admissible:
//
//   · "Other Issues Letter to Editor – UUJO" — a Unitarian congregation's guide about how to
//     write letters to the editor, admitted as a publication.
//   · "Press Release Distribution Guide: Get Media Coverage" — a Square blog post, admitted,
//     approved, and marked published.
//   · "Submission Information" — the title of a submissions page.
//   · Three records whose ARTICLE NOTES are a pasted i18n audit report, and one whose notes
//     are an internal specification about affiliate mailboxes.
//
// A queue that accepts anything and warns afterwards trains its operator to click past
// warnings. The enterprise shape is the opposite: REFUSE AT INTAKE, name the reason, and keep
// the queue small enough that every record in it deserves to be read.
//
// ─────────────────────────────────────────────────────────────────────────────
// FIVE ADMISSION RULES, EACH WITH A STATED CAUSE
//
//   1. THE TARGET MUST BE A PUBLICATION. This is the mirror of the sales rule — sales refuses
//      publications, press REQUIRES one. Same classifier, opposite direction, so the two
//      pipelines cannot both accept the same target and cannot both reject it.
//   2. THE TARGET NAME MUST BE A PUBLICATION'S NAME, not a scraped page title.
//   3. THERE MUST BE A REACHABLE SUBMISSION TARGET — an editor address or a real submission
//      form. A campaign with nowhere to go is a record that will be read, considered, and
//      thrown away by a person.
//   4. ARTICLE NOTES MUST READ LIKE ARTICLE NOTES. Pasted console output, audit reports and
//      internal specifications are not copy, and they are what would be transmitted.
//   5. THE TARGET MUST BE ONE ORGANISATION. Rules 1-3 shipped first and let two of the four
//      records above straight back in: a Unitarian congregation's guide at uujo.org carrying
//      athensnews.com's newsroom address, and a page titled "Submission Information" at
//      theopedproject.org carrying theadvocate.com's letters address. Both satisfied rule 1,
//      because a real editorial address is on its own enough to say "publication" — and both
//      addresses ARE real editorial addresses. They just belong to somebody else. That is the
//      signature of a directory or a how-to guide: the page you found and the desk you would
//      write to are different organisations. So the discovery site and the submission target
//      must agree, and when no site is given the NAME must at least identify the outlet whose
//      address it is. Measured before shipping: 13 of 14 fixtures correct, the fourteenth (a
//      Square blog post) already refused by rule 2.
//
// Refusal is not data loss. The caller gets every reason, so the operator can correct the
// input and try again — which is the difference between a gate and a wall.

import { classifyPublicationTarget } from '@/lib/outreach/publicationTargets'
import { classifyTargetName } from '@/lib/outreach/targetNameQuality'

export interface PressAdmissionInput {
  /** The publication's name as discovery or the operator recorded it. */
  publicationName?: string | null
  /** The publication's own website, when known. */
  publicationUrl?: string | null
  /** Editor / newsroom address, when the submission method is email. */
  editorEmail?: string | null
  /** Submission or contact form, when the submission method is a form. */
  submissionFormUrl?: string | null
  /** The article or advertisement notes the campaign would carry. */
  articleNotes?: string | null
}

export interface PressAdmissionResult {
  admitted: boolean
  /** One entry per rule that refused, in the operator's words. Empty when admitted. */
  refusals: string[]
  /** Stable codes for logs, SIEM ingestion and support triage. */
  codes: Array<
    | 'PRESS_TARGET_NOT_A_PUBLICATION'
    | 'PRESS_TARGET_IS_A_PAGE_TITLE'
    | 'PRESS_NO_SUBMISSION_TARGET'
    | 'PRESS_NOTES_ARE_NOT_COPY'
    | 'PRESS_TARGET_IDENTITY_MISMATCH'
  >
  /** One sentence for a surface with room for one. */
  summary: string
}

/**
 * Signatures of machine output pasted where prose belongs.
 *
 * Each pattern describes a SHAPE, not a topic, so this does not become a list of things the
 * operator is banned from writing about. A press release may legitimately discuss an audit;
 * it will not contain forty lines of "Line 61 · Category:".
 */
const MACHINE_OUTPUT_PATTERNS: Array<{ re: RegExp; what: string }> = [
  { re: /·\s*Line\s*\d+\s*·/i, what: 'file-and-line references' },
  { re: /\b(Category|Recommendation):\s/i, what: 'report field labels' },
  { re: /\.(tsx?|jsx?|mjs|json|sql|ya?ml)\b[^\n]{0,40}\bLine\b/i, what: 'source file paths' },
  { re: /^\s*(High|Medium|Low|Critical)\s*$/m, what: 'severity labels on their own line' },
  { re: /\bhardcoded in JSX\b|\bi18n hook\b|\buseTranslation\(\)/i, what: 'code-review findings' },
  { re: /^\s*(TO|CC|BCC|FROM|REPLY-TO|SUBJECT|BODY|ATTACHMENTS)\s*:/im, what: 'an email-header specification' },
  { re: /────/, what: 'section rules from a pasted specification' },
]

/** Beyond this, a "note" is a document that nobody pasted on purpose. */
const NOTES_LENGTH_CEILING = 8000

function looksLikeMachineOutput(notes: string): string | null {
  const hit = MACHINE_OUTPUT_PATTERNS.find(entry => entry.re.test(notes))
  return hit ? hit.what : null
}

// ── RULE 5 helpers: is the record about ONE organisation? ────────────────────
function hostOf(url: string): string {
  try { return new URL(String(url || '').trim()).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}

/**
 * The registrable domain, so a section page and a homepage on the same outlet compare equal.
 *
 * The two-level suffixes are listed rather than fetched: this is a PORTABLE KERNEL and it does
 * not get to make a network call to the public suffix list at admission time. A suffix missing
 * from the list makes the comparison STRICTER, never looser — it can produce a refusal the
 * operator corrects, never an admission nobody checked.
 */
const TWO_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'com.br', 'net.br', 'com.mx', 'com.ar', 'com.au', 'co.jp', 'com.pl', 'com.tr', 'co.za',
])
function registrableDomain(host: string): string {
  const parts = host.split('.').filter(Boolean)
  if (parts.length <= 2) return host
  return TWO_LEVEL_SUFFIXES.has(parts.slice(-2).join('.')) ? parts.slice(-3).join('.') : parts.slice(-2).join('.')
}
function domainOfEmail(email: string): string {
  const at = String(email || '').split('@')[1]
  return at ? at.trim().replace(/^www\./i, '').toLowerCase() : ''
}
function identityTokens(text: string): string[] {
  return String(text || '').toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(token => token.length > 2)
}
/**
 * Words that appear in the title of a page ABOUT submitting, and carry no identity of their own.
 * Stripped before the name is compared to the domain, so "Submission Information" is left with
 * nothing to identify theadvocate.com with — which is the correct answer.
 */
const NON_IDENTIFYING_WORDS = new Set([
  'the', 'and', 'for', 'los', 'las', 'del', 'com', 'net', 'org', 'info',
  'submission', 'submissions', 'submit', 'information', 'issues', 'other', 'letter', 'letters',
  'editor', 'editors', 'editorial', 'contact', 'media', 'guide', 'page', 'about', 'how', 'your', 'with', 'from', 'news',
])

function checkTargetIdentity(input: { publicationName: string; publicationUrl: string; editorEmail: string; submissionFormUrl: string }): string | null {
  const siteHost = hostOf(input.publicationUrl)
  // Where a message would actually arrive: the address's domain, or the form's host.
  const contactHost = domainOfEmail(input.editorEmail) || hostOf(input.submissionFormUrl)
  if (!contactHost) return null                       // rule 3 already refused this record

  if (siteHost && registrableDomain(siteHost) !== registrableDomain(contactHost)) {
    return `The publication website (${siteHost}) and the submission target (${contactHost}) belong to different organisations. A page on one site that carries another outlet's address is a directory or a how-to guide, not the outlet itself — the campaign would be named after one publication and sent to another. Record the outlet the message would actually reach, and its own website.`
  }

  if (!siteHost) {
    const domainWord = identityTokens(registrableDomain(contactHost).replace(/\.[a-z.]+$/, '')).join('')
    const nameTokens = identityTokens(input.publicationName).filter(token => !NON_IDENTIFYING_WORDS.has(token))
    const joinedName = nameTokens.join('')
    const identifies = nameTokens.some(token => domainWord.includes(token)) || Boolean(joinedName && domainWord && joinedName.includes(domainWord))
    if (!identifies) {
      return `"${String(input.publicationName || '').trim() || 'This target'}" does not identify the outlet at ${contactHost} — it reads as the title of a page rather than the name of a publication. Record the publication's own name, and its website so the two can be checked against each other.`
    }
  }
  return null
}

export function checkPressAdmission(input: PressAdmissionInput): PressAdmissionResult {
  const refusals: string[] = []
  const codes: PressAdmissionResult['codes'] = []

  const publicationName = String(input.publicationName || '').trim()
  const publicationUrl = String(input.publicationUrl || '').trim()
  const editorEmail = String(input.editorEmail || '').trim()
  const submissionFormUrl = String(input.submissionFormUrl || '').trim()
  const articleNotes = String(input.articleNotes || '')

  // RULE 3 FIRST, because a target with nowhere to send is refused whatever else is true and
  // the message is the most actionable one an operator can get.
  if (!editorEmail && !submissionFormUrl) {
    refusals.push('No editor address and no submission form were recorded, so this campaign has nowhere to go. Add a published editorial contact or a real submit-news form before creating it.')
    codes.push('PRESS_NO_SUBMISSION_TARGET')
  }

  // RULE 2 before RULE 1: a scraped headline usually also fails the publication test, and
  // "this is a page title" is the more useful thing to be told.
  const nameVerdict = classifyTargetName({ businessName: publicationName, businessUrl: publicationUrl })
  if (nameVerdict.looksLikePageTitle) {
    refusals.push(`${nameVerdict.reason} A press campaign must name the publication itself.`)
    codes.push('PRESS_TARGET_IS_A_PAGE_TITLE')
  }

  // RULE 1 — the mirror of the sales rule. Only checked when there is something to judge.
  if (publicationName || publicationUrl || editorEmail) {
    const verdict = classifyPublicationTarget({
      businessName: publicationName,
      businessUrl: publicationUrl,
      contactEmail: editorEmail,
    })
    if (!verdict.isPublication) {
      refusals.push(`Nothing identifies "${publicationName || publicationUrl || editorEmail}" as a publication — not the name, not the domain, and not the contact address. Press campaigns go to outlets; if this is a company, it belongs in the sales pipeline.`)
      codes.push('PRESS_TARGET_NOT_A_PUBLICATION')
    }
  }

  // RULE 5 — one organisation, not two. Runs after rule 1 because "this is a publication, but
  // not the one you named" is only worth saying once a publication has been recognised at all.
  const identityRefusal = checkTargetIdentity({ publicationName, publicationUrl, editorEmail, submissionFormUrl })
  if (identityRefusal) {
    refusals.push(identityRefusal)
    codes.push('PRESS_TARGET_IDENTITY_MISMATCH')
  }

  // RULE 4 — what would actually be transmitted.
  if (articleNotes.length > NOTES_LENGTH_CEILING) {
    refusals.push(`The article notes are ${articleNotes.length.toLocaleString()} characters. That is a document, not notes for an editor, and all of it would be sent.`)
    codes.push('PRESS_NOTES_ARE_NOT_COPY')
  } else {
    const machine = looksLikeMachineOutput(articleNotes)
    if (machine) {
      refusals.push(`The article notes contain ${machine} — this is pasted machine output rather than copy, and it is what the publisher would receive.`)
      codes.push('PRESS_NOTES_ARE_NOT_COPY')
    }
  }

  return {
    admitted: refusals.length === 0,
    refusals,
    codes,
    summary: refusals.length
      ? `This press campaign was not created: ${refusals[0]}`
      : 'Admitted: a named publication with a reachable submission target.',
  }
}
