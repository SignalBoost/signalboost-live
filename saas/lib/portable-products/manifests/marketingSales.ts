// saas/lib/portable-products/manifests/marketingSales.ts
import type { PortableProductManifest } from '../manifestTypes.ts'

export const marketingSalesManifest: PortableProductManifest = Object.freeze({
  productId: 'marketing-sales',
  displayName: 'Marketing + Sales Engine Software',
  shortDescription: 'Marketing and sales automation that runs the campaign, not just the copy: it writes and publishes across your own connected accounts, and reads spend and delivery back from each platform so what it reports is measured rather than estimated.',
  categoryLabel: 'marketing and sales automation software',
  // Publishing runs through the seven real platform connectors in lib/outreach/social-connectors,
  // driven by the buyer's OWN app credentials and OAuth. Nothing leaves the system without an
  // owner approving the draft, and that approval step is the human control — deliberately not
  // removable. NO BROWSER CHANNEL IS CLAIMED HERE: these connectors are API-only, and the
  // Supervisor's browser channel does not extend to them.
  // ORDER IS THE MESSAGE. These three used to read as one automation line followed by two
  // control lines, and the drafts that resulted sold the brakes: caps, approvers,
  // confirmations, and barely a sentence about the engine doing the work. Campaigns being
  // BUILT AND RUN for you is the reason to buy; the controls are why the buyer's risk team
  // permits it. The automation now leads and the controls follow it, as consequence.
  executionModes: Object.freeze([
    'campaigns-are-generated-and-published-automatically-across-your-connected-accounts',
    'spend-and-publishing-are-read-back-from-the-provider-so-reported-results-are-measured-not-estimated',
    'you-set-the-caps-and-the-approver-and-nothing-goes-out-without-them',
    'manual-control-of-every-draft-before-and-after-generation',
  ]),
  // The Social Outreach Connector is a CAPABILITY of this product, not a product beside
  // it. It ships inside and is never sold apart from it, so it is named here rather than
  // registered as its own catalog entry — a buyer scanning the homepage should see one
  // thing to buy, with publishing as a reason to buy it.
  longDescription: 'A marketing, sales and social publishing engine that operates your own accounts rather than a copy of them. You connect the platforms you already pay for and it generates and publishes across all seven, reporting a post as published only when the platform confirms it and reading actual spend from the advertiser account instead of estimating it. You set the spend cap and name the approver, and nothing leaves the system without both. Every draft stays editable before and after generation, so a person can take the work over at any point without breaking the run.',
  category: 'growth',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['sales teams', 'marketing teams']),
  requiredCapabilities: Object.freeze(['marketing-workflows', 'sales-workflows', 'social-publishing']),
  // Paid placement is part of this product, with its own spend gate — see lib/ads.
  optionalCapabilities: Object.freeze(['approval-gates', 'native-video-upload', 'oauth-connections', 'paid-advertising-placement', 'spend-approval-gate']),
  dependencies: Object.freeze(['configured-workflow-host']),
  exclusions: Object.freeze(['guaranteed-business-outcomes', 'guaranteed-reach-or-engagement', 'platform-approval-on-behalf-of-buyer', 'content-scheduling']),
  architectureReferences: Object.freeze(['marketing-sales-core', 'marketing-sales-host', 'lib/outreach/marketing-sales-portable', 'lib/ads/ads-connector', 'scripts/build-marketing-sales-portable']),
  documentationReferences: Object.freeze(['saas/docs/marketing-sales-module-design.md', 'docs/portables/social-outreach-integration-guide.md', 'docs/portables/buyer-package/social-outreach-presentation.md']),
  futureFeatures: Object.freeze(['catalog-templates']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
