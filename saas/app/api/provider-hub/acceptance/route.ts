// saas/app/api/provider-hub/acceptance/route.ts
//
// RUN THE PROVIDER HUB ACCEPTANCE — the last item before this portable drops -rc.
//
// The twelve-check harness has a CLI runner, and a CLI is no use to the person who has to
// produce the evidence: this platform's owner works through a browser. Press had exactly this
// gap and it kept that portable at -rc for a week. Same fix, same shape.
//
// WHAT MAKES THIS ONE SELF-SUFFICIENT. Provider Hub now SHIPS both ports the harness needs —
// createHttpsReadTransport for the read and createSha256DigestPort for the hash — so this route
// builds them itself. Nothing has to be configured first.
//
// THE PROBE IS THIS DEPLOYMENT'S OWN ORIGIN, by default. The harness refuses to run without an
// https address the caller controls, and the one address this platform indisputably controls is
// itself. So the run performs one real GET against this deployment, through the shipped
// transport, over the real network path — which is the part a stubbed test could never prove.
//
// WHAT IT CANNOT DO: reach a provider, use a credential, or write anything. Every read in the
// harness is either a refusal being tested or the single probe above. Safe to call repeatedly.
//
// Owner-only: the record names the probe origin and the deployment's own reachability, which is
// wiring detail rather than public information.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import {
  createHttpsReadTransport,
  createSha256DigestPort,
  runProviderHubAcceptance,
} from '@/provider-hub-core/index.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — running the acceptance is owner-only' }, { status: 403 })
  }

  const url = new URL(req.url)
  // A caller may nominate a different address they control; otherwise this deployment probes
  // itself, which is the one origin it can vouch for without asking anyone.
  const probeUrl = url.searchParams.get('probe') || `${url.origin}/`

  if (!probeUrl.startsWith('https://')) {
    return NextResponse.json({
      ok: false,
      stage: 'probe',
      error: `The probe address must be https. This deployment reports its own origin as ${url.origin}.`,
      remedy: 'Run this from the deployed https URL rather than a local http one, or pass ?probe=<https address you control>.',
    }, { status: 409 })
  }

  let record
  try {
    record = await runProviderHubAcceptance({
      transport: createHttpsReadTransport(),
      digest: createSha256DigestPort(),
      probeUrl,
      executionMode: 'staging',
    })
  } catch (error) {
    // The harness is documented never to throw. If it does, that is itself the finding.
    return NextResponse.json({
      ok: false,
      stage: 'harness',
      error: error instanceof Error ? error.message : 'the acceptance harness threw',
      remedy: 'This should not happen — the harness reports failures as checks. Capture this message before re-running.',
    }, { status: 409 })
  }

  if (record.refusal) {
    return NextResponse.json({ ok: false, stage: 'refused', ...record, remedy: 'The harness refused to run. The refusal names what is missing.' }, { status: 409 })
  }

  const blocking = record.checks.filter(check => !check.passed).map(check => `${check.id} — ${check.detail}`)

  return NextResponse.json({
    ok: true,
    ...record,
    blocking,
    meaning: record.passed
      ? 'Every check passed against this deployment, using the shipped transport and digest over the real network path. Keep this record — it is the acceptance evidence that closes the release.'
      : 'At least one check failed. The portable is not ready to be marked live on this deployment; each blocking item above names what to fix.',
  }, { status: record.passed ? 200 : 409 })
}
