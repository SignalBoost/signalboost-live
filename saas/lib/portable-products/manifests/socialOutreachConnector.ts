// saas/lib/portable-products/manifests/socialOutreachConnector.ts
//
// The Social Outreach Connector sells on its own AND ships inside Marketing + Sales.
// Both are true at once and the registry has to say so, because a buyer comparing the
// two cards must be able to tell what they would be buying twice.
//
// Its status is 'live' on the same evidence the other live portables use: the engine
// runs in production on this deployment, the boundary is enforced by CI, and the
// artifact installs from a tarball into a clean environment. It is not a badge flip.

import type { PortableProductManifest } from '../manifestTypes.ts'

export const socialOutreachConnectorManifest: PortableProductManifest = Object.freeze({
  productId: 'social-outreach-connector',
  displayName: 'Social Outreach Connector',
  shortDescription: 'Publish approved content to seven platforms on your own credentials.',
  longDescription:
    'A buyer-hosted publishing layer for YouTube, TikTok, Instagram, LinkedIn (company page or personal profile), Facebook, X and Reddit. It runs inside the buyer\'s own environment using their developer applications and their accounts, and reports a post as published only when the platform confirms it. Included in Marketing + Sales and also licensed on its own.',
  category: 'growth',
  status: 'live',
  maturity: 'production',
  publicVisible: true,
  licensingAvailable: true,
  targetAudience: Object.freeze(['marketing teams', 'agencies', 'founders']),
  requiredCapabilities: Object.freeze(['social-publishing', 'oauth-connections']),
  optionalCapabilities: Object.freeze(['approval-gates', 'native-video-upload']),
  dependencies: Object.freeze(['buyer-provider-applications', 'configured-workflow-host']),
  // Stated as exclusions because a buyer who discovers these after signing is a buyer
  // who was misled. Each one is a real boundary of the product, not a roadmap item.
  exclusions: Object.freeze([
    'guaranteed-reach-or-engagement',
    'platform-approval-on-behalf-of-buyer',
    'content-scheduling',
    'content-generation',
  ]),
  architectureReferences: Object.freeze(['lib/outreach/social-portable', 'scripts/build-social-portable']),
  documentationReferences: Object.freeze([
    'docs/portables/social-outreach-integration-guide.md',
    'docs/portables/buyer-package/social-outreach-presentation.md',
  ]),
  futureFeatures: Object.freeze(['native-video-on-x-and-reddit', 'scheduling-adapter']),
  supportedLanguages: Object.freeze(['en', 'pt', 'es', 'pl', 'ru']),
})
