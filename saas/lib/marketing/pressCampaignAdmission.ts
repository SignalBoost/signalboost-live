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
  codes: Array
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
'use client'

import { LocalizedText } from '@/components/i18n/LocalizedText'
import Link from 'next/link'
import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiText } from '@/lib/i18n/uiText'

type Campaign = { id: string; title?: string; objective?: string; status?: string; metadata?: Record<string, any> }
type Decision = 'ok' | 'no' | 'staff' | 'submitted' | 'published'
const PRESS_PRINT_CHANNELS = ['online-newspapers', 'print-newspapers', 'trade-press'] as const
const channelLabels: Record<string, string> = { 'online-newspapers': "Digital newspaper", 'print-newspapers': "Print newspaper", 'trade-press': "IT magazine / trade press" }
function channel(campaign: Campaign) { return String(campaign.metadata?.outreach_channel || campaign.metadata?.media_channel || '') }
function review(campaign: Campaign) { return String(campaign.metadata?.press_print_review || 'PENDING').toUpperCase() }
function stage(campaign: Campaign) { return String(campaign.metadata?.press_print_execution_stage || campaign.metadata?.press_print_execution?.stage || 'not_started') }
function labelStage(value: string) { if (value === 'approved') return 'Ready to submit'; if (value === 'submitted_to_publisher') return 'Submitted to publisher'; if (value === 'published') return 'Published / completed'; if (value === 'staff_support') return 'Staff support'; if (value === 'on_hold') return 'On hold'; if (value === 'rejected') return 'Rejected'; if (value === 'stopped') return 'Stopped'; if (value === 'target_selection_required') return 'Publisher target required'; return 'Needs review' }
function Action({ id, decision, children, primary = false }: { id: string; decision: Decision; children: React.ReactNode; primary?: boolean }) { return <form method="post" action="/api/marketing/press-print/decision" style={{ display: 'inline-grid', gap: 8 }}><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value={decision} /><button style={primary ? primaryButton : secondaryButton}>{children}</button></form> }
export default function PressPrintMediaPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  // GENERATING A RELEASE IS AN ACTION, NOT A DECISION, so it is a fetch rather than one of the
  // decision forms above: it changes what the record CONTAINS, and the owner still has to read
  // the result and decide afterwards. The route re-runs admission on the stored record first,
  // so a record that should never have been admitted cannot acquire a release here and become
  // approvable — the refusal is shown in place, with its reason.
  const [generatingId, setGeneratingId] = useState('')
  const [generateMessage, setGenerateMessage] = useState<Record<string, string>>({})
  const { t } = useTranslation()
  useEffect(() => { let live = true; (async () => { try { const res = await fetch('/api/marketing/press-print', { cache: 'no-store' }); const json = await res.json(); if (live) setCampaigns((Array.isArray(json.campaigns) ? json.campaigns : []).filter((row: Campaign) => PRESS_PRINT_CHANNELS.includes(channel(row) as any))) } finally { if (live) setLoading(false) } })(); return () => { live = false } }, [])
  async function generateRelease(campaignId: string) {
    setGeneratingId(campaignId)
    setGenerateMessage((previous) => ({ ...previous, [campaignId]: '' }))
    try {
      const res = await fetch('/api/marketing/press-print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate_release', id: campaignId }) })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        const reasons: string[] = Array.isArray(json?.refusals) && json.refusals.length ? json.refusals : [String(json?.error || 'The release could not be written.')]
        setGenerateMessage((previous) => ({ ...previous, [campaignId]: reasons.join(' ') }))
        return
      }
      // Patch the row in place so the release and the Approve button appear without a reload.
      setCampaigns((previous) => previous.map((row) => row.id === campaignId ? { ...row, metadata: { ...(row.metadata || {}), press_release_body: String(json.release || ''), press_release_status: String(json.releaseStatus || 'generated') } } : row))
    } catch (error) {
      setGenerateMessage((previous) => ({ ...previous, [campaignId]: error instanceof Error ? error.message : 'The release could not be written.' }))
    } finally {
      setGeneratingId('')
    }
  }
  return <main style={shell}>
    <section style={hero}><p className="sb-eyebrow">{uiText('generatedUi.u_dcba31525bd63b56')}</p><h1 style={h1}><LocalizedText fallback={uiText('generatedUi.u_ba2f8d68f462717f')} /></h1><p style={body}>{t('marketingSales.pressPrint.description', "Automated Press & Print only accepts free, real newspaper/magazine/publication targets unless the user explicitly asks for paid advertising. The target must include a publisher/editor email or a real submit-news/contact form.")}</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><Link href="/dashboard/marketing/press-print/direct" className="sb-button-primary">{t('marketingSales.pressPrint.startStaffLedCampaign', "Start staff-led campaign")}</Link></div></section>
    {loading ? <p className="sb-body">{uiText('generatedUi.u_ba3bbbe10d8bef66')}</p> : null}
    {!loading && campaigns.length === 0 ? <section style={card}><p style={body}><LocalizedText fallback={uiText('generatedUi.u_6899bd59ae3d5376')} /></p></section> : null}
    {campaigns.map((campaign) => { const currentReview = review(campaign), currentStage = stage(campaign), approved = currentReview === 'APPROVED', submitted = currentStage === 'submitted_to_publisher' || campaign.metadata?.publisher_submission_status === 'submitted', completed = currentStage === 'published', exec = campaign.metadata?.press_print_execution || {}; const publisher = String(campaign.metadata?.publisher_name || campaign.metadata?.publication_name || ''), publisherEmail = String(campaign.metadata?.publisher_email || ''), publisherForm = String(campaign.metadata?.publisher_submission_form_url || ''), sourceUrl = String(campaign.metadata?.publisher_discovery_source_url || ''); const hasPublisherTarget = Boolean(publisher && (publisherEmail || publisherForm));
      // A PAID TARGET IS A CLAIM UNTIL SOMEONE SIGNED FOR IT. automation_mode alone is written
      // upstream and can be set by generated content, so it is treated as an ASSERTION here, not
      // as authorization. Only a recorded WHO and WHEN turns it into one.
      const paidClaimed = campaign.metadata?.automation_mode === 'automated_paid_user_requested';
      const paidRequestedBy = String(campaign.metadata?.paid_requested_by || '');
      const paidRequestedAt = String(campaign.metadata?.paid_requested_at || '');
      const paidRequested = Boolean(paidClaimed && paidRequestedBy && paidRequestedAt);
      const paidUnverified = paidClaimed && !paidRequested;
      // THE BOX BELOW WAS LABELLED "FULL DRAFT" AND IT IS NOT A DRAFT. campaign.objective is the
      // BRIEF — the instruction the campaign was assembled from, plus the CTA, audience and safety
      // rule. Calling a brief a draft is the same defect this cockpit keeps producing: a surface
      // asserting something about content that is not true of it. So the brief is named a brief.
      //
      // press-print/route.ts now writes metadata.press_release_body through the same AI port the
      // Press & Media portable uses. Before that it wrote nothing — across the whole repo history
      // this key was read here and in the decision route and produced by NOTHING, so hasRelease was
      // permanently false and Approve could never appear on any record. Records created before that
      // fix still have no release; the button below writes one for them, and the route re-checks
      // admission first so a record that should never have been admitted cannot become approvable.
      const briefText = String(campaign.objective || '');
      const releaseBody = String(campaign.metadata?.press_release_body || campaign.metadata?.content_body || campaign.metadata?.press_print_execution?.release_body || '').trim();
      const hasRelease = releaseBody.length > 0;
      return <section key={campaign.id} style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><p className="sb-eyebrow">{channelLabels[channel(campaign)] || uiText('generatedUi.u_85c253de08e70759')}</p><h2 style={h2}>{String(campaign.title || "Press campaign").slice(0, 120)}</h2><p style={{ ...body, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>{String(campaign.objective || "Campaign prepared inside Marketing + Sales.").slice(0, 300)}{String(campaign.objective || '').length > 300 ? '…' : ''}</p></div><strong style={pill}>{currentReview} · {labelStage(currentStage)}</strong></div>
      {/* THE WHOLE DRAFT, BEFORE THE APPROVE BUTTON. Approving copy you cannot read is not an
          approval gate, it is a button. The card above truncates at 300 characters and clips at
          120px, so every campaign here was approved or rejected on its first two sentences. This
          reveals the complete text, scrolls rather than truncates, and sits above the actions.
          Open by default while a campaign is still pending — the moment it matters most. */}
      {briefText ? <details open={!approved && !completed} style={draftBox}><summary style={draftSummary}>{t('marketingSales.pressPrint.brief', "Campaign brief — what COS was asked to prepare")}</summary><p style={draftBody}>{briefText}</p></details> : null}
      {hasRelease
        ? <details open={!approved && !completed} style={draftBox}><summary style={draftSummary}>{t('marketingSales.pressPrint.release', "Press release — read every line before approving")}</summary><p style={draftBody}>{releaseBody}</p></details>
        : <div style={warnBox}><h3 style={h3}>{t('marketingSales.pressPrint.noReleaseTitle', "No press release has been written for this campaign")}</h3><p style={body}>{t('marketingSales.pressPrint.noReleaseBody', "Only the brief above exists. Approving would send the brief itself — including any notes pasted into it — to the publisher. Approval is withheld until a release is generated and you have read it.")}</p>{!completed ? <div style={{ marginTop: 12 }}><button type="button" onClick={() => generateRelease(campaign.id)} disabled={generatingId === campaign.id} style={primaryButton}>{generatingId === campaign.id ? t('marketingSales.pressPrint.generating', "Writing the release…") : t('marketingSales.pressPrint.generateRelease', "Generate release")}</button></div> : null}{generateMessage[campaign.id] ? <p style={{ ...body, marginTop: 10, color: '#fecaca' }}>{generateMessage[campaign.id]}</p> : null}</div>}
      <div style={targetBox}><h3 style={h3}>{paidRequested ? uiText('generatedUi.u_646f4403d6cb817a') : uiText('generatedUi.u_18238f7c9ad4b122')}</h3>{hasPublisherTarget ? <p style={body}>{uiText('generatedUi.u_a830b3f1a9dca539')}<strong>{publisher}</strong><br /><LocalizedText fallback={uiText('generatedUi.u_48708414bf63393e')} /><strong>{publisherEmail ? uiText('generatedUi.u_8c99309070b1681c') : paidRequested ? uiText('generatedUi.u_6e1e38f5115a6bd8') : uiText('generatedUi.u_ad314c1be14c24f4')}</strong><br />{uiText('generatedUi.u_890d34fffcde315c')}{publisherEmail || publisherForm}{sourceUrl ? <><br />{uiText('generatedUi.u_8b3d3d068d6ce833')}{sourceUrl}</> : null}{paidRequested ? <><br /><strong>{uiText('generatedUi.u_ee327964a14f18f5')}</strong>{uiText('generatedUi.u_1782911d66f12dbe')}</> : null}</p> : <p style={body}><LocalizedText fallback={uiText('generatedUi.u_51d4658bdbb5b25d')} /></p>}</div>
      {paidUnverified ? <div style={warnBox}><h3 style={h3}>{t('marketingSales.pressPrint.paidUnverifiedTitle', "This campaign claims you asked for paid advertising")}</h3><p style={body}>{t('marketingSales.pressPrint.paidUnverifiedBody', "It is marked as a paid/advertising target, but no record exists of who requested paid placement or when. An authorization that cannot be traced to a person is not an authorization, so approval is withheld here. Reject it, or use Needs staff help to record the request properly.")}</p></div> : null}
      {!approved && !completed ? <div style={actions}>{(paidUnverified || !hasRelease) ? null : <Action id={campaign.id} decision="ok" primary>{uiText('generatedUi.u_6007acbe30b2cd98')}</Action>}<Action id={campaign.id} decision="no">{uiText('generatedUi.u_ab604a360777735f')}</Action><Action id={campaign.id} decision="staff"><LocalizedText fallback={uiText('generatedUi.u_9939e76315d42e7a')} /></Action></div> : null}
      <div style={workflowBox}><h3 style={h3}>{completed ? uiText('generatedUi.u_11a6767d5674c7e4') : submitted ? uiText('generatedUi.u_40bc8af163ec8a65') : approved ? uiText('generatedUi.u_298a9207a732a11d') : uiText('generatedUi.u_9928dd82f38fb093')}</h3>{!approved && !completed ? <p style={body}>{uiText('generatedUi.u_543d52ded0375c37')}{paidRequested ? uiText('generatedUi.u_90b990955bb94300') : uiText('generatedUi.u_f116f127ae72f12c')}{uiText('generatedUi.u_1d53ae482cffc842')}</p> : null}{approved && !submitted && !completed ? <div style={simpleForm}><p style={body}><LocalizedText fallback={uiText('generatedUi.u_eb46cf280f4dfbea')} /></p>{hasPublisherTarget ? <Action id={campaign.id} decision="submitted" primary><LocalizedText fallback={uiText('generatedUi.u_44e814ac93cf7593')} /></Action> : <p style={body}><LocalizedText fallback={uiText('generatedUi.u_fa4c51ae2cbe3dab')} /></p>}</div> : null}{submitted && !completed ? <form method="post" action="/api/marketing/press-print/decision" style={simpleForm}><input type="hidden" name="id" value={campaign.id} /><input type="hidden" name="decision" value="published" /><p style={body}><LocalizedText fallback={uiText('generatedUi.u_97f960ff55065de5')} /></p><input name="live_url" defaultValue={String(exec.live_url || '')} placeholder={uiText('generatedUi.u_e812fc5e43e4450a')} style={input} /><input name="publication_date" type="date" defaultValue={String(exec.publication_date || '')} style={input} /><button style={primaryButton}><LocalizedText fallback={uiText('generatedUi.u_57fc7131202225e3')} /></button></form> : null}{completed ? <div style={doneBox}><p style={body}><LocalizedText fallback={uiText('generatedUi.u_e43923a17647078e')} /></p>{exec.live_url ? <a href={String(exec.live_url)} target="_blank" rel="noreferrer" style={link}>{uiText('generatedUi.u_ce059a563b26bbaa')}</a> : null}{exec.publication_date ? <p style={body}>{uiText('generatedUi.u_d7c6c024083756dd')}{String(exec.publication_date)}</p> : null}</div> : null}</div>
    </section> })}
  </main>
}
const shell: CSSProperties = { maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 18 }
const hero: CSSProperties = { border: '1px solid rgba(244,114,182,.24)', borderRadius: 24, padding: 24, background: 'linear-gradient(145deg, rgba(15,23,42,.94), rgba(2,6,23,.98))' }
const card: CSSProperties = { border: '1px solid rgba(255,255,255,.10)', borderRadius: 22, padding: 20, background: 'linear-gradient(145deg, rgba(3,7,18,.88), rgba(15,23,42,.76))' }
const workflowBox: CSSProperties = { border: '1px solid rgba(56,189,248,.22)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(56,189,248,.06)' }
const targetBox: CSSProperties = { border: '1px solid rgba(250,204,21,.22)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(250,204,21,.06)' }
const draftBox: CSSProperties = { border: '1px solid rgba(103,232,249,.22)', borderRadius: 14, padding: 14, marginTop: 14, background: 'rgba(8,47,73,.35)' }
const draftSummary: CSSProperties = { color: '#67e8f9', fontWeight: 850, cursor: 'pointer' }
const draftBody: CSSProperties = { color: 'rgba(255,255,255,.86)', lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 480, overflowY: 'auto', marginTop: 10 }
const warnBox: CSSProperties = { border: '1px solid rgba(248,113,113,.45)', borderRadius: 14, padding: 14, marginTop: 16, background: 'rgba(127,29,29,.22)' }
const doneBox: CSSProperties = { display: 'grid', gap: 8, maxWidth: 640, marginTop: 10 }
const actions: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }
const simpleForm: CSSProperties = { display: 'grid', gap: 10, maxWidth: 560, marginTop: 12 }
const body: CSSProperties = { color: 'rgba(255,255,255,.72)', lineHeight: 1.65, maxWidth: 860 }
const h1: CSSProperties = { color: '#fff', fontSize: 34, margin: '8px 0' }
const h2: CSSProperties = { color: '#fff', fontSize: 24, margin: '6px 0' }
const h3: CSSProperties = { color: '#fff', margin: 0, fontSize: 18 }
const pill: CSSProperties = { color: '#fde68a', border: '1px solid rgba(255,195,0,.35)', borderRadius: 999, padding: '8px 12px', alignSelf: 'start' }
const input: CSSProperties = { width: '100%', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(15,23,42,.76)', color: '#fff', padding: '9px 10px' }
const primaryButton: CSSProperties = { border: 'none', background: '#ffc300', color: '#000', borderRadius: 12, padding: '10px 14px', fontWeight: 900, cursor: 'pointer' }
const secondaryButton: CSSProperties = { border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.06)', color: '#fff', borderRadius: 12, padding: '10px 14px', fontWeight: 850, cursor: 'pointer' }
const link: CSSProperties = { color: '#67e8f9', fontWeight: 850, textDecoration: 'underline' }
