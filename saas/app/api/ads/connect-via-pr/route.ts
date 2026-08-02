// saas/app/api/ads/connect-via-pr/route.ts
//
// COS + PR connection path for an ad network.
//
// Stages the network's credentials and prerequisites as an infrastructure PR — one
// independent vercel.add_env_var step per value — which the owner reviews and merges on
// /dashboard/infrastructure. Nothing reaches Vercel until the merge, and the PR is the
// record of who set spending credentials and when.
//
// This is the AI/PR path from ONBOARD §12C. The MANUAL path (type the variables yourself)
// stays first-class, and the browser agent remains the optional premium route. What is NOT
// acceptable is what this surface shipped with: manual only, which is the path a buyer with
// no Vercel project cannot take at all.
//
// EVERY STEP IS INDEPENDENT, deliberately. The infra-PR engine does not yet substitute
// {{steps[...]}} outputs, so dependent chains fail with unresolved placeholders. Setting
// environment variables needs no chaining, so this path stays inside what the engine
// actually does rather than what it will do later.
//
// THE KEYS ARE NOT FREE TEXT. Every name is validated against the network's declared
// variables in lib/ads/ads-network-setup.ts. A typo'd key does not fail loudly — it creates
// a second useless variable while the one the code reads stays empty, and nothing complains
// until a campaign cannot start.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { stageInfrastructurePR } from '@/lib/hub/pr-engine'
import { adNetworkSetup, adNetworkVarKeys, GLOBAL_ADS_VARS } from '@/lib/ads/ads-network-setup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TARGETS = ['production', 'preview', 'development', 'all']

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req as any)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const role = (user as any).role as string
  if (role !== 'owner' && role !== 'admin' && role !== 'operator') {
    return NextResponse.json({ ok: false, error: 'Forbidden — staging a PR requires owner, admin, or operator' }, { status: 403 })
  }

  let body: any = {}
  try { body = await req.json() } catch {}

  const networkId = String(body?.network || '').trim()
  const setup = adNetworkSetup(networkId)
  if (!setup) return NextResponse.json({ ok: false, error: 'Unsupported ad network' }, { status: 400 })

  const target = TARGETS.includes(String(body?.target)) ? String(body.target) : 'production'
  const allowed = new Set(adNetworkVarKeys(networkId))
  const values = body?.values && typeof body.values === 'object' ? body.values : {}

  const steps: Array<{ provider: string; templateId: string; label: string; payload: Record<string, string> }> = []
  const rejected: string[] = []

  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const name = String(key).trim()
    const value = String(raw ?? '').trim()
    if (!value) continue
    if (!allowed.has(name)) { rejected.push(name); continue }
    steps.push({
      provider: 'vercel',
      templateId: 'vercel.add_env_var',
      label: `Set ${name}`,
      payload: { key: name, value, target },
    })
  }

  if (rejected.length) {
    // Refused rather than staged. A variable this network never reads would sit in the
    // project looking configured while the real one stays empty.
    return NextResponse.json(
      { ok: false, error: `Not variables ${setup.label} reads: ${rejected.join(', ')}` },
      { status: 400 },
    )
  }

  // Everything required must be present in this PR or already set, so a merge leaves the
  // network usable rather than half-configured.
  const declared = [...GLOBAL_ADS_VARS, ...setup.vars]
  const staging = new Set(steps.map(step => step.payload.key))
  const stillMissing = declared
    .filter(item => item.required)
    .map(item => item.key)
    .filter(key => !staging.has(key) && !String(process.env[key] || '').trim())

  if (stillMissing.length) {
    return NextResponse.json(
      {
        ok: false,
        error: `${setup.label} would still be unusable after this merge. Missing: ${stillMissing.join(', ')}`,
        missing: stillMissing,
      },
      { status: 400 },
    )
  }

  if (!steps.length) {
    return NextResponse.json({ ok: false, error: 'Nothing to set — every value was empty.' }, { status: 400 })
  }

  const secretCount = steps.filter(step => {
    const item = declared.find(entry => entry.key === step.payload.key)
    return Boolean(item && item.secret)
  }).length

  const staged = await stageInfrastructurePR({
    title: `Connect ${setup.label}: set advertising credentials`,
    summary:
      `Sets ${steps.length} variable${steps.length === 1 ? '' : 's'} on Vercel (${target}) so ${setup.label} ` +
      `can create capped campaigns, read spend and pause. ${secretCount} of them grant spending power — ` +
      `review the values before merging. Nothing changes until you do. ` +
      `Still yours to obtain from the network: ${setup.prerequisite}`,
    // Higher than the social equivalent on purpose: these credentials can move money, and a
    // reviewer should see that difference before they read the values.
    risk: 'high',
    steps,
    createdBy: (user as any).id ?? null,
    createdByEmail: (user as any).email ?? null,
  })

  if (!staged.ok) return NextResponse.json({ ok: false, error: staged.error || 'Could not stage the PR' }, { status: 500 })

  return NextResponse.json({
    ok: true,
    prId: (staged as any).pr?.id ?? null,
    network: setup.id,
    staged: steps.map(step => step.payload.key),
    url: '/dashboard/infrastructure',
    next: `Review and merge the PR, then ${setup.label} appears as ready in the ads cockpit.`,
  })
}
