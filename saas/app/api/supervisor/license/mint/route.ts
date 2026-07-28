// saas/app/api/supervisor/license/mint/route.ts
//
// MINT A LICENCE FROM THE BROWSER.
//
// scripts/issue-license.ts does this already, and it assumes a terminal. This platform's
// owner works through a browser, so the CLI is not a path he has — the same gap the
// acceptance route closed for the acceptance scenario. This route closes it for licensing.
//
// WHAT IT DOES: generates an issuer key pair, signs a licence for the requested edition,
// and returns the three environment variable values to paste into the deployment, plus the
// private key ONCE.
//
// THE PRIVATE KEY IS NEVER STORED. It is generated in memory, used to sign, returned in the
// response, and forgotten. Nothing writes it to a database, a file, or a log. If it is lost
// it cannot be recovered — a new pair must be generated and every deployment reconfigured.
// That is the correct trade: a signing key a server retains is a signing key a server can
// leak, and this key is the only thing standing between anyone and a licence that verifies.
//
// OWNER ONLY, and POST rather than GET, matching the acceptance route beside it: a request
// that mints credentials must not be reachable by a link preview, a prefetch, or a browser
// history replay.
//
// ROTATION IS SUPPORTED WITHOUT DOWNTIME: pass an existing public key as `keepPublicKey` and
// the response's PUBLIC_KEYS value contains both, so deployments still holding the old token
// keep verifying while the new one is rolled out. The gate accepts several keys separated by
// a comma.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import {
  editionNames,
  featuresForEdition,
  generateIssuerKeyPair,
  issueLicense,
  type PortableLicenseClaims,
} from '@/portable-license'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PRODUCT_ID = 'self-healing-supervisor'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — minting a licence is owner-only' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const edition = String(body.edition || 'enterprise').trim()
  const licensee = String(body.licensee || '').trim()
  const issuer = String(body.issuer || 'signalboost').trim()
  const days = Number(body.days ?? 365)
  const grace = Number(body.graceDays ?? 14)
  const keepPublicKey = String(body.keepPublicKey || '').trim()

  if (!licensee) {
    return NextResponse.json({
      ok: false,
      error: 'A licensee is required — the legal name of the party this licence is issued to.',
      remedy: 'For your own deployment, use your own entity name.',
    }, { status: 400 })
  }

  // Features come from the catalogue, never from the request. A feature name no code checks
  // produces a licence that silently unlocks nothing: the holder pays, the gate refuses, and
  // nobody finds out until an incident.
  const features = featuresForEdition(PRODUCT_ID, edition)
  if (!features) {
    return NextResponse.json({
      ok: false,
      error: `"${edition}" is not an edition of ${PRODUCT_ID}.`,
      editions: editionNames(PRODUCT_ID),
    }, { status: 400 })
  }

  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ ok: false, error: 'days must be a positive number' }, { status: 400 })
  }

  const { publicKeyPem, privateKeyPem } = generateIssuerKeyPair()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + days * 86_400_000)

  const claims: PortableLicenseClaims = {
    schema: 'portable-license/1',
    licenseId: randomUUID(),
    issuer,
    licensee,
    productId: PRODUCT_ID,
    edition,
    features,
    seats: body.seats === undefined || body.seats === null ? null : Number(body.seats),
    maxExecutions: body.maxExecutions === undefined || body.maxExecutions === null ? null : Number(body.maxExecutions),
    issuedAt: now.toISOString(),
    notBefore: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    graceDays: Number.isFinite(grace) ? grace : 14,
  }

  const token = issueLicense(claims, privateKeyPem)

  // Environment variables carry newlines badly, so the PEM is emitted with literal \n
  // sequences. The gate converts them back before use, and accepts either form.
  const flatten = (pem: string) => pem.trim().replace(/\r?\n/g, '\\n')
  const publicKeys = [keepPublicKey, publicKeyPem].filter(Boolean).map(flatten).join(',')

  return NextResponse.json({
    ok: true,
    schemaVersion: 'self-healing-license-mint-v1',
    licence: {
      licenseId: claims.licenseId,
      product: PRODUCT_ID,
      licensee: claims.licensee,
      issuer: claims.issuer,
      edition,
      features,
      issuedAt: claims.issuedAt,
      expiresAt: claims.expiresAt,
      graceDays: claims.graceDays,
    },
    environment: {
      SUPERVISOR_LICENSE_TOKEN: token,
      SUPERVISOR_LICENSE_ISSUER: claims.issuer,
      SUPERVISOR_LICENSE_PUBLIC_KEYS: publicKeys,
    },
    privateKeyPem,
    warnings: [
      'The private key is shown once and is not stored anywhere. Put it in your vault now — it cannot be recovered, and it is the only thing that can mint a licence this deployment will accept.',
      'Record the licence id. Revocation is by id, and you cannot revoke what you did not write down.',
      'Seats and execution limits are recorded in the token but are NOT enforced by the product. They are contract terms.',
      'Set the three environment variables in the deployment and redeploy. Licence configuration is read once per process, so an edit alone changes nothing until a new deployment starts.',
    ],
  }, { status: 200 })
}
