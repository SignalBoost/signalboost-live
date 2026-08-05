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
// FOUR ADMISSION RULES, EACH WITH A STATED CAUSE
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
  codes: Array
    | 'PRESS_TARGET_NOT_A_PUBLICATION'
    | 'PRESS_TARGET_IS_A_PAGE_TITLE'
    | 'PRESS_NO_SUBMISSION_TARGET'
    | 'PRESS_NOTES_ARE_NOT_COPY'
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
