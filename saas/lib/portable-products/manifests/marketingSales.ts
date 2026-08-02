// saas/lib/portable-products/manifests/marketingSales.ts
import type { PortableProductManifest } from '../manifestTypes.ts'

export const marketingSalesManifest: PortableProductManifest = Object.freeze({
  productId: 'marketing-sales',
  displayName: 'Marketing + Sales',
  shortDescription: 'Marketing, sales and social publishing in one portable engine.',
  // The Social Outreach Connector is a CAPABILITY of this product, not a product beside
  // it. It ships inside and is never sold apart from it, so it is named here rather than
  // registered as its own catalog entry — a buyer scanning the homepage should see one
  // thing to buy, with publishing as a reason to buy it.
  longDescription: 'A governed engine for marketing and sales workflows that keeps customer-facing campaigns separate from implementation architecture. Includes the Social Outreach Connector: publish approved content to YouTube, TikTok, Instagram, LinkedIn (company page or personal profile), Facebook, X and Reddit using the buyer\'s own developer applications and credentials, with a post reported as published only when the platform confirms it.',
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
