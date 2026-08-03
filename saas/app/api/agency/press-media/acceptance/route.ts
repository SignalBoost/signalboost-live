// saas/app/api/agency/press-media/acceptance/route.ts
//
// RUN THE PRESS ACCEPTANCE — the last item standing between this portable and 1.0.0.
//
// The eleven-check scenario has existed since July, and so has a CLI runner. Neither was
// reachable by the person who has to produce the evidence: this platform's owner works through
// a browser, so "just run the acceptance" was never actually available to him. The portable sat
// at -rc for want of a click target rather than for want of code.
//
// WHY A ROUTE AND NOT JUST THE CLI. scripts/run-press-acceptance.mjs proves the portable against
// whatever ports it is handed, and a buyer runs it in their own pipeline. But THIS platform's
// ports only resolve where its environment does — the mailer key, the sender identity, the
// company record and the reply desk live in the deployment, not on a laptop. Running the script
// elsewhere would exercise everything except the part that matters: whether a press email
// actually leaves from here, from the right address, with the right contact block.
//
// IT SENDS ONE REAL EMAIL, AND THAT IS THE TEST. Delivery is recorded only after the mail
// transport resolves, so a green record means the message genuinely left. It goes to the OWNER
// ADDRESS — never to an editor, never to a target read from a media database. If no owner
// address is configured the run refuses rather than guessing a recipient.
//
// WHAT IT CANNOT DO: contact a publication, spend anything, or write campaign state. The
// scenario dispatches to the self address and nothing else. Safe to call repeatedly.
//
// Owner-only, matching the acceptance route beside the Supervisor: the record names the sender
// identity and the reply desk, which is deployment wiring rather than public information.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { runPressAcceptance } from '@/press-media-core/index.ts'
import { getPressMediaHost } from '@/press-media-host/index.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Where the single real message goes. Owner addresses only — never a publication. */
function ownerAddress(): string {
  const candidates = [process.env.OWNER_EMAILS, process.env.OWNER_EMAIL, process.env.PRESS_REPLY_TO]
  for (const value of candidates) {
    const first = String(value || '')
      .split(',')
      .map(entry => entry.trim())
      .find(entry => entry.includes('@'))
    if (first) return first
  }
  return ''
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — running the press acceptance is owner-only' }, { status: 403 })
  }

  // POST rather than GET purely because this sends real email. Nothing here mutates state, but a
  // route that messages people should not be reachable by a link preview or a prefetch.

  const selfAddress = ownerAddress()
  if (!selfAddress) {
    return NextResponse.json({
      ok: false,
      stage: 'recipient',
      error: 'No owner address is configured, so there is nowhere safe to send the acceptance message.',
      remedy: 'Set OWNER_EMAILS (or OWNER_EMAIL) in the deployment environment, then run this again. The harness refuses to pick a recipient on its own — the wrong one here is a real editor.',
    }, { status: 409 })
  }

  let host: ReturnType<typeof getPressMediaHost>
  try {
    host = getPressMediaHost()
  } catch (error) {
    // A wiring answer, not a server error. Report it as something the operator can act on.
    return NextResponse.json({
      ok: false,
      stage: 'host',
      error: error instanceof Error ? error.message : 'could not build the press host',
      remedy: 'Check RESEND_API_KEY and the sender identity (RESEND_FROM_EMAIL / PRESS_REPLY_TO), then run this again.',
    }, { status: 409 })
  }

  const url = new URL(req.url)
  const providerId = url.searchParams.get('provider') || 'free_submission'

  let record
  try {
    record = await runPressAcceptance({
      ports: host.ports as never,
      registry: host.registry,
      selfAddress,
      providerId,
    })
  } catch (error) {
    // The harness is documented never to throw; if it ever does, that is itself a finding and
    // is reported as one rather than surfacing as a 500 with a stack trace.
    return NextResponse.json({
      ok: false,
      stage: 'harness',
      error: error instanceof Error ? error.message : 'the acceptance harness threw',
      remedy: 'This should not happen — the harness reports failures as checks. Capture this message before re-running.',
    }, { status: 409 })
  }

  const blocking = record.checks.filter(check => !check.passed).map(check => `${check.id} — ${check.detail}`)

  return NextResponse.json({
    ok: true,
    ...record,
    sentTo: selfAddress,
    blocking,
    // Stated in the response so nobody has to remember it: a green run is the evidence that
    // drops -rc, and the manifest stays preview until it exists.
    meaning: record.passed
      ? 'Every check passed against this deployment\'s real wiring, and one real message was delivered to the owner address. Keep this record — it is the acceptance evidence that closes the release.'
      : 'At least one check failed. The portable is not ready to be marked live on this deployment; each blocking item above names what to fix.',
  }, { status: record.passed ? 200 : 409 })
}
