// saas/app/api/ads/route.ts
//
// THE OWNER-GATED CONTROL SURFACE FOR PAID ADVERTISING.
//
// Everything that can spend money goes through here, and nothing else in the application
// calls startAdCampaign. That is the point: one door, admin-only, every action written to
// the ledger and the audit log before or as it happens.
//
// WHY ONE ROUTE WITH ACTIONS RATHER THAN FOUR ENDPOINTS. Setting a ceiling, starting a
// campaign, reconciling and pausing are the same conversation about the same money, and a
// reviewer should be able to read the whole spend surface in one file. Splitting them makes
// each piece look smaller than it is.
//
// THE ACCESS TOKEN IS NEVER ACCEPTED FROM THE REQUEST. It is read from the environment,
// per platform. A route that took a token in its body would let anyone who reached it spend
// on any account they held a token for, which is precisely the thing the gate exists to
// prevent.
//
// HYDRATION, same reasoning as the social platform registry: ad platforms are declared into
// process memory, and serverless processes are cold and independent. Every handler declares
// first. Assuming warm state fails intermittently, in the way that is hardest to diagnose.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, auditAdminAction } from '@/lib/outreach/security'
import {
  listAdPlatforms,
  startAdCampaign,
  reconcileAdSpend,
  pauseAdCampaign,
  type AdSpendCap,
} from '@/lib/ads/ads-connector'
import { declareSocialAdNetworks } from '@/lib/ads/ads-social-networks'
import { declareGoogleAndMarketplaceNetworks } from '@/lib/ads/ads-google-and-marketplace'
import { formatMinor } from '@/lib/ads/ads-money'
import {
  recordCampaignIntent,
  markCampaignCreated,
  markCampaignFailed,
  markCampaignStatus,
  recordSpendObservation,
  recordReconcileFailure,
  listCampaignPositions,
  listAccountCeilings,
  setAccountCeiling,
  spendGateContextFor,
  getCampaignRow,
} from '@/lib/ads/spend-ledger'

export const dynamic = 'force-dynamic'

/** ADS_META_ACCESS_TOKEN, ADS_LINKEDIN_ACCESS_TOKEN, and so on. */
function tokenName(platformId: string): string {
  return `ADS_${String(platformId).replace(/_ads$/, '').toUpperCase()}_ACCESS_TOKEN`
}

function tokenFor(platformId: string): string {
  return String(process.env[tokenName(platformId)] || '')
}

/**
 * Declare the networks this deployment is configured for.
 *
 * A network with an unmet prerequisite is SKIPPED with its reason rather than half
 * registered — LinkedIn needs a campaign group, X needs an OAuth 1.0a signing endpoint
 * because its API cannot accept a bearer token. The skip reasons are returned to the
 * cockpit so an operator is told what is missing instead of wondering why a platform is
 * absent.
 */
function hydrateAdPlatforms(): { declared: string[]; skipped: Array<{ id: string; reason: string }> } {
  const linkedInGroup = String(process.env.ADS_LINKEDIN_CAMPAIGN_GROUP_URN || '').trim()
  const xProxy = String(process.env.ADS_X_SIGNING_PROXY_URL || '').trim()
  const xFunding = String(process.env.ADS_X_FUNDING_INSTRUMENT_ID || '').trim()

  const currency = String(process.env.ADS_CURRENCY || 'USD').toUpperCase()
  const lookbackDays = Number(process.env.ADS_REPORT_LOOKBACK_DAYS || 90) || 90

  const social = declareSocialAdNetworks({
    currency,
    lookbackDays,
    linkedIn: linkedInGroup ? { campaignGroupUrn: linkedInGroup } : undefined,
    x: xProxy && xFunding ? { signingProxyBaseUrl: xProxy, fundingInstrumentId: xFunding } : undefined,
  })

  // Google Ads, and the two networks that need an endpoint the buyer runs — Microsoft
  // because its API is SOAP, Amazon because its spend can only be read from an
  // asynchronous report. Each is declared only when its prerequisites are present.
  const googleToken = String(process.env.ADS_GOOGLE_DEVELOPER_TOKEN || '').trim()
  const googleBudget = String(process.env.ADS_GOOGLE_CAMPAIGN_BUDGET || '').trim()
  const microsoftBridge = String(process.env.ADS_MICROSOFT_BRIDGE_URL || '').trim()
  const amazonReporting = String(process.env.ADS_AMAZON_REPORTING_URL || '').trim()
  const amazonClientId = String(process.env.ADS_AMAZON_CLIENT_ID || '').trim()
  const amazonProfileId = String(process.env.ADS_AMAZON_PROFILE_ID || '').trim()

  const others = declareGoogleAndMarketplaceNetworks({
    currency,
    lookbackDays,
    google: googleToken && googleBudget
      ? {
          developerToken: googleToken,
          campaignBudgetResourceName: googleBudget,
          loginCustomerId: String(process.env.ADS_GOOGLE_LOGIN_CUSTOMER_ID || '').trim() || undefined,
        }
      : undefined,
    microsoft: microsoftBridge ? { bridgeBaseUrl: microsoftBridge } : undefined,
    amazon: amazonReporting && amazonClientId && amazonProfileId
      ? { reportingBaseUrl: amazonReporting, clientId: amazonClientId, profileId: amazonProfileId }
      : undefined,
  })

  return {
    declared: [...social.declared, ...others.declared],
    skipped: [...social.skipped, ...others.skipped],
  }
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const hydration = hydrateAdPlatforms()

  const platforms = listAdPlatforms().map(adapter => ({
    id: adapter.id,
    label: adapter.label,
    currencies: adapter.currencies || [],
    // Stated plainly: a platform is declared but unusable until its token exists, and the
    // operator is told the exact variable name rather than left to guess it.
    tokenVariable: tokenName(adapter.id),
    ready: Boolean(tokenFor(adapter.id)),
  }))

  const [positions, ceilings] = await Promise.all([
    listCampaignPositions(ctx.admin),
    listAccountCeilings(ctx.admin),
  ])

  return NextResponse.json({
    platforms,
    // Networks that could not be declared, and why. An empty list here is the healthy case.
    unavailable: hydration.skipped,
    ceilings: ceilings.map((row: any) => ({
      platformId: row.platform_id,
      accountRef: row.account_ref,
      ceilingMinor: Number(row.ceiling_minor),
      currency: row.currency,
      display: formatMinor(Number(row.ceiling_minor), row.currency),
      setBy: row.set_by,
    })),
    campaigns: positions.map((row: any) => ({
      id: row.id,
      platformId: row.platform_id,
      accountRef: row.account_ref,
      campaignRef: row.campaign_ref,
      name: row.name,
      status: row.status,
      currency: row.currency,
      capMinor: Number(row.campaign_max_minor),
      capDisplay: formatMinor(Number(row.campaign_max_minor), row.currency),
      spentMinor: Number(row.reported_spend_minor),
      spentDisplay: formatMinor(Number(row.reported_spend_minor), row.currency),
      remainingMinor: Number(row.remaining_minor),
      overCap: row.over_cap === true,
      spendApprovedBy: row.spend_approved_by,
      contentApprovedBy: row.content_approved_by,
      lastReconciledAt: row.last_reconciled_at,
      reconcileError: row.reconcile_error,
    })),
  })
}

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  let body: any
  try { body = await req.json() } catch { body = {} }

  const action = String(body?.action || '').trim()
  hydrateAdPlatforms()

  if (action === 'set_ceiling') return setCeiling(ctx, body)
  if (action === 'start') return startCampaign(ctx, body)
  if (action === 'reconcile') return reconcile(ctx, body)
  if (action === 'pause') return pause(ctx, body)

  return NextResponse.json(
    { error: "action must be one of 'set_ceiling', 'start', 'reconcile' or 'pause'." },
    { status: 400 },
  )
}

// ── Actions ──────────────────────────────────────────────────────────────────

async function setCeiling(ctx: any, body: any) {
  const result = await setAccountCeiling(ctx.admin, {
    platformId: String(body?.platformId || '').trim(),
    accountRef: String(body?.accountRef || '').trim(),
    ceilingMinor: Number(body?.ceilingMinor),
    currency: String(body?.currency || '').trim(),
    setBy: String(ctx.user?.email || ctx.user?.id || 'unknown'),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  await auditAdminAction({
    admin: ctx.admin,
    actorId: String(ctx.user?.id || ''),
    action: 'ads.ceiling.set',
    targetType: 'ad_account',
    targetId: `${body?.platformId}:${body?.accountRef}`,
    metadata: { ceilingMinor: Number(body?.ceilingMinor), currency: String(body?.currency || '').toUpperCase() },
  })

  return NextResponse.json({ ok: true })
}

async function startCampaign(ctx: any, body: any) {
  const platformId = String(body?.platformId || '').trim()
  const accountRef = String(body?.accountRef || '').trim()
  const currency = String(body?.currency || '').trim().toUpperCase()

  const cap: AdSpendCap = {
    campaignMax: { amount: Number(body?.campaignMaxMinor), currency },
    dailyMax: body?.dailyMaxMinor ? { amount: Number(body.dailyMaxMinor), currency } : undefined,
  }

  const contentApprovedBy = String(body?.contentApprovedBy || '').trim()
  const spendApprovedBy = String(body?.spendApprovedBy || '').trim()
  if (!contentApprovedBy || !spendApprovedBy) {
    return NextResponse.json(
      { error: 'Both a content approver and a spend approver must be named. Approving the wording is not approving the budget.' },
      { status: 400 },
    )
  }

  const token = tokenFor(platformId)
  if (!token) {
    return NextResponse.json(
      { error: `No access token for ${platformId}. Set ${tokenName(platformId)} in the environment.` },
      { status: 400 },
    )
  }

  // The ledger row is written BEFORE the provider is contacted, so a create whose response
  // is lost still leaves a record that this account was asked to spend.
  const intent = await recordCampaignIntent(ctx.admin, {
    platformId,
    accountRef,
    name: String(body?.name || '').trim(),
    productKey: body?.productKey ? String(body.productKey) : null,
    cap,
    contentApprovedBy,
    spendApprovedBy,
    createdBy: String(ctx.user?.email || ctx.user?.id || 'unknown'),
  })
  if (!intent.ok || !intent.id) return NextResponse.json({ error: intent.error || 'ledger_write_failed' }, { status: 400 })

  const gateContext = await spendGateContextFor(ctx.admin, platformId, accountRef, currency)

  // Flattened deliberately. AdCampaignResult is a discriminated union, and this repo's
  // tsconfig is not strict — without strictNullChecks TypeScript will not narrow it by the
  // truthiness of `ok`, which has already broken one build.
  const started = (await startAdCampaign(
    {
      platform: platformId,
      accountRef,
      name: String(body?.name || '').trim(),
      creative: {
        landingUrl: String(body?.landingUrl || '').trim(),
        headline: body?.headline ? String(body.headline) : undefined,
        body: body?.copy ? String(body.copy) : undefined,
        imageUrl: body?.imageUrl ? String(body.imageUrl) : undefined,
        videoUrl: body?.videoUrl ? String(body.videoUrl) : undefined,
      },
      cap,
      spendApprovedBy,
      spendApprovedAt: new Date().toISOString(),
    },
    token,
    gateContext,
  )) as { ok: boolean; reason?: string; platformCampaignId?: string; status?: string }

  if (started.ok !== true) {
    await markCampaignFailed(ctx.admin, intent.id, String(started.reason || 'refused'))
    return NextResponse.json({ error: started.reason, ledgerId: intent.id }, { status: 400 })
  }

  await markCampaignCreated(ctx.admin, intent.id, String(started.platformCampaignId), 'created_paused')
  await auditAdminAction({
    admin: ctx.admin,
    actorId: String(ctx.user?.id || ''),
    action: 'ads.campaign.start',
    targetType: 'ad_campaign',
    targetId: String(started.platformCampaignId),
    metadata: { platformId, accountRef, capMinor: cap.campaignMax.amount, currency, spendApprovedBy },
  })

  return NextResponse.json({
    ok: true,
    ledgerId: intent.id,
    campaignRef: started.platformCampaignId,
    status: started.status || 'created_paused',
    // Said explicitly because it is the safety property, not a detail: nothing is spending
    // yet, and it will not until a person turns it on in the ad account.
    note: 'The campaign was created PAUSED. It will not spend until someone starts it in the ad account.',
  })
}

async function reconcile(ctx: any, body: any) {
  const ledgerId = String(body?.ledgerId || '').trim()
  const row = await getCampaignRow(ctx.admin, ledgerId)
  if (!row) return NextResponse.json({ error: 'Unknown campaign.' }, { status: 404 })
  if (!row.campaign_ref) return NextResponse.json({ error: 'This campaign has no provider id, so its spend cannot be read. Check the ad account directly.' }, { status: 400 })

  const token = tokenFor(row.platform_id)
  if (!token) return NextResponse.json({ error: `Set ${tokenName(row.platform_id)} in the environment.` }, { status: 400 })

  const cap: AdSpendCap = {
    campaignMax: { amount: Number(row.campaign_max_minor), currency: String(row.currency) },
  }

  const result = await reconcileAdSpend(row.platform_id, String(row.campaign_ref), cap, token, String(row.account_ref))
  if (!result.ok || !result.report) {
    await recordReconcileFailure(ctx.admin, ledgerId, String(result.error || 'spend_unreadable'))
    return NextResponse.json({ error: result.error || 'spend_unreadable' }, { status: 502 })
  }

  await recordSpendObservation(ctx.admin, ledgerId, result.report, cap)

  return NextResponse.json({
    ok: true,
    spentMinor: result.report.spent.amount,
    spentDisplay: formatMinor(result.report.spent.amount, result.report.spent.currency),
    overCap: result.overCap === true,
    // The provider's own figure, kept beside ours. If the units were ever declared wrong,
    // this is what proves it.
    raw: result.report.raw || null,
  })
}

async function pause(ctx: any, body: any) {
  const ledgerId = String(body?.ledgerId || '').trim()
  const row = await getCampaignRow(ctx.admin, ledgerId)
  if (!row) return NextResponse.json({ error: 'Unknown campaign.' }, { status: 404 })
  if (!row.campaign_ref) return NextResponse.json({ error: 'This campaign has no provider id, so it cannot be paused from here. Stop it in the ad account.' }, { status: 400 })

  const token = tokenFor(row.platform_id)
  if (!token) return NextResponse.json({ error: `Set ${tokenName(row.platform_id)} in the environment.` }, { status: 400 })

  const result = await pauseAdCampaign(row.platform_id, String(row.campaign_ref), token, String(row.account_ref))

  await auditAdminAction({
    admin: ctx.admin,
    actorId: String(ctx.user?.id || ''),
    action: 'ads.campaign.pause',
    targetType: 'ad_campaign',
    targetId: String(row.campaign_ref),
    metadata: { platformId: row.platform_id, ok: result.ok, status: result.status },
  })

  if (!result.ok) {
    // Never reported as success. The operator has to know the campaign may still be
    // spending so they can stop it by hand — this is the one call where being quietly
    // wrong costs money per minute.
    return NextResponse.json(
      {
        error: `Pause failed (${result.status}). The campaign may still be spending — stop it in the ad account now.`,
        status: result.status,
      },
      { status: 502 },
    )
  }

  await markCampaignStatus(ctx.admin, ledgerId, 'paused')
  return NextResponse.json({ ok: true, status: result.status })
}
