// saas/lib/outreach/marketing-sales-portable.ts
//
// MARKETING + SALES — the combined portable's public surface.
//
// The owner's decision, and the reason this file exists: social media is not a separate
// discipline from marketing and sales any more, so Marketing + Sales must ship WITH the
// social connectors rather than beside them. The Social Outreach Connector remains
// sellable on its own — a buyer who only wants publishing installs that smaller
// package — but Marketing + Sales is never sold without it.
//
// So there are two artifacts from one codebase:
//
//   social-portable.ts          → Social Outreach Connector (publishing only)
//   marketing-sales-portable.ts → Marketing + Sales (email outreach + publishing + paid)
//
// This barrel re-exports the whole social surface and adds the email side. The packager
// (saas/scripts/build-marketing-sales-portable.mjs) walks the graph from here and fails
// on any host import, so this file is the boundary as well as the API.
//
// WHAT IS DELIBERATELY NOT HERE: the campaign lifecycle shell in marketing-sales-core,
// the prospect discovery worker, the spend ledger store, and every API route. Those are
// host concerns — the shell needs a scheduler, the worker needs a job table, the ledger
// needs a database and routes need the host's authentication. A buyer wires their own;
// the portable supplies the behaviour those things orchestrate, which is the part that is
// hard to write and easy to get wrong.

// ── Social publishing ────────────────────────────────────────────────────────
// The entire Social Outreach Connector, unchanged. A buyer who later buys only the
// connector gets exactly these symbols from the smaller package.
export * from './social-portable.ts'

// ── Email composition ────────────────────────────────────────────────────────
// The closing block every outbound message carries: team signature, contact address,
// platform link — always at the end, applied at SEND time so messages approved before
// a rule existed still receive it. Idempotent.
export {
  applyOutreachSignature,
  applyOutreachLink,
  outreachTeamName,
  outreachContactAddress,
  outreachLink,
} from './signature.ts'

// ── Duplicate protection ─────────────────────────────────────────────────────
// Scoped to the PRODUCT, not the address: the same company may be approached again for
// a different offer, never twice for the same one. A prospect list is an asset reused
// across products, and burning an address after one campaign is the wrong trade.
export {
  getRecipientHistory,
  duplicateReason,
  normalizeAddress,
  productKeyOf,
  type RecipientHistory,
} from './recipientHistory.ts'

// ── Recipient discovery ──────────────────────────────────────────────────────
// Finds a REAL published address on the target's own site. Returns nothing rather than
// guessing — the rule that keeps this from becoming a spam tool.
export { findContactEmail, type ContactEmailResult } from './emailFinder.ts'

// ── Paid placement ───────────────────────────────────────────────────────────
//
// Paid advertising is marketing, so it ships in this product rather than beside it. It
// keeps its own folder because its risk profile is different: publishing a post that
// fails costs nothing, while a wrong ad spends the buyer's budget at machine speed and
// the money does not come back.
//
// Hence a separate gate. A campaign needs a cap and a SPEND approver — distinct from
// whoever approved the copy — and actual spend is read back from the provider rather
// than assumed. startAdCampaign has no parameter that bypasses any of that.
export {
  registerAdPlatform,
  unregisterAdPlatform,
  listAdPlatforms,
  getAdPlatform,
  checkSpendGate,
  startAdCampaign,
  reconcileAdSpend,
  pauseAdCampaign,
  isValidMoney,
  type Money,
  type AdSpendCap,
  type AdCampaignRequest,
  type AdCampaignResult,
  type AdSpendReport,
  type AdPlatformAdapter,
  type SpendGateContext,
} from '../ads/ads-connector.ts'

// Bring your own ad network — Google Ads, Microsoft Advertising, Amazon Ads, or anything
// regional — plus Meta shipped as a declaration rather than hand-written code.
export {
  declareAdPlatform,
  declareMetaAds,
  type DeclaredAdPlatform,
} from '../ads/ads-declared-platform.ts'

// The paid counterpart of the eight organic connectors: the same social platforms, bought
// rather than posted. Every one creates campaigns PAUSED, so a human turns them on.
export {
  declareSocialAdNetworks,
  declareLinkedInAds,
  declareTikTokAds,
  declareRedditAds,
  declarePinterestAds,
  declareSnapchatAds,
  declareXAds,
  type SocialAdNetworkOptions,
} from '../ads/ads-social-networks.ts'

// Google Ads, plus the two networks that cannot be reached by declaration alone: Microsoft
// Advertising speaks SOAP, and Amazon's spend is only readable from an asynchronous report.
// Both are declared against an endpoint the buyer runs, or not at all.
export {
  declareGoogleAndMarketplaceNetworks,
  declareGoogleAds,
  declareMicrosoftAds,
  declareAmazonAds,
  type NetworkOptions,
} from '../ads/ads-google-and-marketplace.ts'

// Money handling, exported because a buyer integrating their own ad network needs the same
// conversion the declarations use. It knows that a minor unit is not always a hundredth —
// yen has none, Kuwaiti dinar has three — and that four of the social networks report spend
// in millionths. Getting either wrong is not a rounding difference.
export {
  toMinorUnits,
  assertMinorUnits,
  formatMinor,
  currencyExponent,
  isOverCap,
  type SpendUnits,
  type MoneyResult,
} from '../ads/ads-money.ts'

// ── Acceptance ───────────────────────────────────────────────────────────────
// Proves the portable works against the BUYER'S adapter and ad account rather than ours:
// six checks hand the spend gate a request it must refuse, four prove the money arithmetic
// before anything moves, and one real campaign is created paused, reconciled, and stopped —
// because being able to stop a campaign is the capability nobody tests until 2am.
export {
  runMarketingSalesAcceptance,
  MARKETING_SALES_ACCEPTANCE_SCHEMA,
  type MarketingSalesAcceptanceOptions,
  type MarketingSalesAcceptanceResult,
  type MarketingSalesCheck,
  type MarketingSalesCheckId,
} from './marketing-sales-acceptance.ts'

// ── Language ─────────────────────────────────────────────────────────────────
// Which language to write in, decided from the TARGET's identity, never from the
// operator's interface language. A US prospect gets English while the console is in
// Portuguese, and that is correct.
export { pickOutreachLanguage, type OutreachLang } from './regionLanguage.ts'
