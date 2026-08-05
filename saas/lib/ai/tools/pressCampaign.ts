// saas/lib/ai/tools/pressCampaign.ts
// COS → Press & Media pipeline. This is what makes the portable AI-DRIVEN rather than merely
// AI-assisted: instead of a human filling the cockpit form and the AI only writing the words,
// COS fills the WHOLE campaign — provider, target, audience, call to action — and it lands in
// the owner approval queue. The owner's only job is to approve (or edit, then approve).
//
// Governance is unchanged and non-negotiable: this calls the SAME engine as the cockpit, so
// target validation, the spend gate, owner approval and provider-shaped proof all still apply.
// Nothing is ever dispatched from here — autoDispatch is never set. An AI may prepare work; a
// human still releases it.
//
// The same function is the correct entry point for the Browser Agent: a third way to fill the
// form, one governed path behind it. Never a parallel dispatcher.
import { getPressMediaHost } from '@/press-media-host'
import { checkPressAdmission } from '@/lib/marketing/pressCampaignAdmission'
import type { MediaTargetType } from '@/press-media-core'

const TARGETS: MediaTargetType[] = ['digital_press', 'newspaper_print', 'magazine_print', 'trade_press', 'broadcast']

export interface CosPressCampaignInput {
  goal: string                      // what the release should announce
  editorEmail?: string              // a REAL, verified contact — never invented
  submitFormUrl?: string
  publicationName?: string
  mediaTargetType?: string
  audience?: string
  ctaUrl?: string
  language?: string
  providerId?: string               // defaults to the free editor-submission provider
  manualCopy?: string               // owner-supplied copy; when present the AI is not used
}

export interface CosPressCampaignResult {
  ok: boolean
  campaignId?: string
  status?: string
  provider?: string
  creative?: string
  placeholders?: string[]
  awaitingApproval?: boolean
  error?: string
  reason?: string
}

function str(value: unknown): string { return String(value ?? '').trim() }

export async function createPressCampaignFromAgent(input: CosPressCampaignInput): Promise<CosPressCampaignResult> {
  const goal = str(input.goal)
  const manualCopy = str(input.manualCopy)
  if (!goal && !manualCopy) return { ok: false, error: 'A goal (or supplied copy) is required.' }

  const editorEmail = str(input.editorEmail)
  const submitFormUrl = str(input.submitFormUrl)
  if (!editorEmail && !submitFormUrl) {
    // Hard stop rather than a guess: this engine emails real journalists.
    return { ok: false, error: 'A verified editor email or submission form URL is required. Do not invent a contact.' }
  }

  const requested = str(input.mediaTargetType) as MediaTargetType
  const mediaTargetType: MediaTargetType = TARGETS.includes(requested) ? requested : 'digital_press'

  // THE ADMISSION GATE BELONGS HERE, at the one chokepoint every path shares.
  //
  // It was living in the cockpit route and, later, in the background worker — so a draft
  // created through THIS function by the COS tool skipped it entirely. That is how a wikiHow
  // stylesheet URL, a political party's press address and three newspaper letters-to-the-editor
  // inboxes reached the owner's approval queue looking exactly like real press targets.
  //
  // Putting it in the two callers and not the callee is the same mistake in a different shape:
  // the next caller inherits the hole. Every route into press drafting runs through this
  // function, so this is the only place the rule cannot be routed around.
  const admission = checkPressAdmission({
    publicationName: str(input.publicationName),
    publicationUrl: submitFormUrl,
    editorEmail,
    submissionFormUrl: submitFormUrl,
    articleNotes: goal || manualCopy,
  })
  if (!admission.admitted) {
    return {
      ok: false,
      reason: admission.refusals[0] || 'refused by the press admission rules',
      error: admission.refusals.join(' '),
    }
  }

  try {
    const host = getPressMediaHost()
    const result = await host.runCampaign({
      providerId: str(input.providerId) || 'free_submission',
      brief: {
        goal: goal || 'Owner-supplied copy',
        audience: str(input.audience) || undefined,
        ctaUrl: str(input.ctaUrl) || undefined,
        language: str(input.language) || undefined,
      },
      target: {
        mediaTargetType,
        publicationName: str(input.publicationName) || undefined,
        editorEmail: editorEmail || undefined,
        submitFormUrl: submitFormUrl || undefined,
      },
      manualCopy: manualCopy || undefined,
      createdByRole: 'staff',
      // Deliberately omitted: ownerApproved and autoDispatch. An agent prepares; the owner releases.
    })

    if (!result.ok) return { ok: false, error: result.error, reason: result.reason }

    return {
      ok: true,
      campaignId: result.campaignId,
      status: result.status,
      provider: str(input.providerId) || 'free_submission',
      creative: result.creative,
      placeholders: result.placeholders,
      awaitingApproval: true,
    }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Could not prepare the press campaign.' }
  }
}

// Tool descriptor for the COS tool registry in saas/app/api/support/route.ts.
export const proposePressCampaignTool = {
  name: 'proposePressCampaign',
  description:
    'Prepare a press campaign and place it in the owner approval queue at /dashboard/marketing/press-providers. ' +
    'Fill every field you can from what the owner told you. NEVER invent an editor email, publication, product name, ' +
    'quote or statistic — if a real verified contact is not known, say so instead of calling this tool. ' +
    'This never sends anything: it creates a draft the owner must approve.',
  input_schema: {
    type: 'object' as const,
    properties: {
      goal: { type: 'string', description: 'What the release should announce, in one or two sentences.' },
      editorEmail: { type: 'string', description: 'A real, verified editor email. Required unless submitFormUrl is given.' },
      submitFormUrl: { type: 'string', description: "The publication's real submission form URL." },
      publicationName: { type: 'string', description: 'The target publication name.' },
      mediaTargetType: { type: 'string', description: 'digital_press | newspaper_print | magazine_print | trade_press | broadcast' },
      audience: { type: 'string', description: 'Who the announcement is aimed at.' },
      ctaUrl: { type: 'string', description: 'Call-to-action URL.' },
      language: { type: 'string', description: 'Language code, e.g. en, es, pt, pl, ru.' },
      providerId: { type: 'string', description: 'Provider to use; defaults to free_submission.' },
    },
    required: ['goal'],
  },
}
