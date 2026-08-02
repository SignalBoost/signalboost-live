// saas/lib/outreach/social-onboarding-guide.ts
import { type SocialPlatform } from './social-connectors.ts'

export type SocialOnboardingProviderId = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin' | 'reddit' | 'twitter_x'

export type SocialOnboardingStep = {
  id: string
  title: string
  detail: string
  owner: 'business_user' | 'platform_admin' | 'signalboost'
  automatedBySignalBoost: boolean
}

export type SocialOnboardingGuide = {
  providerId: SocialOnboardingProviderId
  platform: SocialPlatform
  label: string
  businessAccountName: string
  developerPortal: string
  callbackUrl: string
  envVars: string[]
  steps: SocialOnboardingStep[]
}

const CALLBACK_URL = 'https://saas.signalboostapp.com/api/outreach/social/oauth/callback'

const GUIDES: SocialOnboardingGuide[] = [
  {
    providerId: 'instagram',
    platform: 'instagram_business',
    label: 'Instagram Business',
    businessAccountName: 'Instagram professional account connected to a Facebook Page',
    developerPortal: 'https://developers.facebook.com/apps/',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_INSTAGRAM_BUSINESS_CLIENT_ID', 'SOCIAL_INSTAGRAM_BUSINESS_CLIENT_SECRET'],
    steps: [
      { id: 'business-account', title: 'Prepare the business account', detail: 'Use an Instagram professional account and connect it to a Facebook Page owned by the business.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer-app', title: 'Create or select a Meta app', detail: 'In Meta for Developers, create or select a Business app and add Instagram Graph API plus Facebook Login for Business.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'redirect-uri', title: 'Register the OAuth callback', detail: `Add ${CALLBACK_URL} as an exact valid OAuth redirect URI.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the Meta app ID and app secret into the matching SignalBoost environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize access', detail: 'Use the SignalBoost connect action, sign in to Meta, select the Page and Instagram account, and approve the requested scopes.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'discover', title: 'Discover destinations', detail: 'SignalBoost can retrieve the connected Page and Instagram business account references after OAuth succeeds.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can validate token state, check permissions, and surface renewal requirements.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
  {
    providerId: 'facebook',
    platform: 'facebook_pages',
    label: 'Facebook Pages',
    businessAccountName: 'Facebook Page managed by the connecting user',
    developerPortal: 'https://developers.facebook.com/apps/',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_FACEBOOK_PAGES_CLIENT_ID', 'SOCIAL_FACEBOOK_PAGES_CLIENT_SECRET'],
    steps: [
      { id: 'page', title: 'Prepare the Facebook Page', detail: 'Confirm the connecting user has the required Page and business permissions.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer-app', title: 'Create or select a Meta app', detail: 'Create or select a Business app and configure Facebook Login for Business and required Page products.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'redirect-uri', title: 'Register the OAuth callback', detail: `Add ${CALLBACK_URL} as an exact valid OAuth redirect URI.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the app ID and app secret into the Facebook Pages environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize Page access', detail: 'Connect through SignalBoost, select the Page, and approve the requested Page permissions.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'discover', title: 'Discover Pages', detail: 'SignalBoost can list Pages available to the connected account and save the selected destination reference.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can validate token and Page access, monitor expiration, and report missing permissions.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
  {
    providerId: 'youtube',
    platform: 'youtube_channels',
    label: 'YouTube Channels',
    businessAccountName: 'YouTube channel or Brand Account managed by the connecting Google user',
    developerPortal: 'https://console.cloud.google.com/apis/credentials',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_YOUTUBE_CHANNELS_CLIENT_ID', 'SOCIAL_YOUTUBE_CHANNELS_CLIENT_SECRET'],
    steps: [
      { id: 'project', title: 'Prepare a Google Cloud project', detail: 'Create or select a Google Cloud project and enable YouTube Data API v3.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'consent', title: 'Configure the OAuth consent screen', detail: 'Set the app name, support contacts, scopes, test users, and publishing status required for the intended audience.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'oauth-client', title: 'Create a web OAuth client', detail: `Create a Web application OAuth client and add ${CALLBACK_URL} as an authorized redirect URI.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the OAuth client ID and client secret into the YouTube environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize the channel', detail: 'Connect through SignalBoost, choose the Google account and channel, and approve the requested YouTube scopes.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'discover', title: 'Discover channel identity', detail: 'SignalBoost can retrieve the authorized channel ID and channel name after OAuth succeeds.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can check token refresh, scopes, channel availability, and quota-related errors.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
  {
    providerId: 'tiktok',
    platform: 'tiktok',
    label: 'TikTok',
    businessAccountName: 'TikTok account authorized for the selected developer product',
    developerPortal: 'https://developers.tiktok.com/apps/',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_TIKTOK_CLIENT_ID', 'SOCIAL_TIKTOK_CLIENT_SECRET'],
    steps: [
      { id: 'developer-app', title: 'Create a TikTok developer app', detail: 'Create an app in TikTok for Developers and request the products and scopes needed by the business use case.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'redirect-uri', title: 'Register the redirect URI', detail: `Add ${CALLBACK_URL} to the approved Login Kit or OAuth redirect URLs.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'review', title: 'Complete provider review', detail: 'Submit required app details, demonstrations, privacy information, and scope justification when TikTok requires review.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the client key or ID and client secret into the TikTok environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize TikTok access', detail: 'Connect through SignalBoost, sign in to TikTok, and approve the requested scopes.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'identity', title: 'Store connected identity', detail: 'SignalBoost can save the connected account reference and display name after OAuth succeeds.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can monitor token status, scopes, and provider errors within approved API limits.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
  {
    providerId: 'linkedin',
    platform: 'linkedin_member',
    label: 'LinkedIn Profile',
    businessAccountName: 'Posts from the connecting person\'s own profile. A LinkedIn Page is still required to HOLD the app — it does not need to be verified.',
    developerPortal: 'https://www.linkedin.com/developers/apps',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_LINKEDIN_MEMBER_CLIENT_ID', 'SOCIAL_LINKEDIN_MEMBER_CLIENT_SECRET'],
    steps: [
      // Corrected after hitting this in practice: LinkedIn will not create an app without
      // a Page attached, and it will not let a thin personal profile create a Page. The
      // advantage over company-page posting is real but narrower than "no setup" — no
      // Page VERIFICATION and no Community Management review, which is what the company
      // path demands and what takes weeks.
      { id: 'linkedin-page', title: 'Have a LinkedIn Page to attach the app to', detail: 'Every LinkedIn app must be associated with a Page, even one that only posts to a personal profile. The Page does NOT need to be verified. Creating a Page requires the personal profile to be established — LinkedIn reports a minimum of around five connections, an account older than seven days, and an email address on the company\'s own domain (free providers are rejected).', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer-app', title: 'Create a LinkedIn app', detail: 'Create an app against that Page and add the Share on LinkedIn and Sign In with LinkedIn products. Both enable immediately — no Page verification and no partner review, unlike company-page posting.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'redirect-uri', title: 'Register the OAuth callback', detail: `Add ${CALLBACK_URL} as an authorized redirect URL.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the client ID and client secret into the LinkedIn Profile environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize LinkedIn access', detail: 'Connect through SignalBoost and approve posting on your own behalf. The profile is discovered automatically — nothing to paste.', owner: 'business_user', automatedBySignalBoost: false },
    ],
  },
  {
    providerId: 'linkedin',
    platform: 'linkedin_company',
    label: 'LinkedIn Company Pages',
    businessAccountName: 'LinkedIn organization Page administered by the connecting member',
    developerPortal: 'https://www.linkedin.com/developers/apps',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_LINKEDIN_COMPANY_CLIENT_ID', 'SOCIAL_LINKEDIN_COMPANY_CLIENT_SECRET'],
    steps: [
      { id: 'developer-app', title: 'Create a LinkedIn app', detail: 'Create an app linked to the company Page and request the products required for organization posting or analytics.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'redirect-uri', title: 'Register the OAuth callback', detail: `Add ${CALLBACK_URL} as an authorized redirect URL.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'verification', title: 'Verify the organization relationship', detail: 'Complete LinkedIn company verification and product approval requirements when requested.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the client ID and client secret into the LinkedIn Company environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize LinkedIn access', detail: 'Connect through SignalBoost using a member who administers the organization and approve the requested scopes.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'discover', title: 'Discover organizations', detail: 'SignalBoost can retrieve organizations the connected member may administer and save the selected organization reference.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can validate token state, organization access, approved scopes, and renewal requirements.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
  {
    providerId: 'reddit',
    platform: 'reddit',
    label: 'Reddit',
    businessAccountName: 'Reddit account permitted to act in the intended communities',
    developerPortal: 'https://www.reddit.com/prefs/apps',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_REDDIT_CLIENT_ID', 'SOCIAL_REDDIT_CLIENT_SECRET'],
    steps: [
      { id: 'app', title: 'Create a Reddit web app', detail: 'Create a web app under the owning Reddit account and set the exact redirect URI.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'redirect-uri', title: 'Register the OAuth callback', detail: `Set ${CALLBACK_URL} as the Reddit app redirect URI.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the app client ID and secret into the Reddit environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize Reddit access', detail: 'Connect through SignalBoost, sign in to Reddit, and approve only the scopes required by the intended workflow.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'destination', title: 'Select destinations', detail: 'Choose or enter the subreddit and account references that the connected account is allowed to use.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'identity', title: 'Store connected identity', detail: 'SignalBoost can save the connected Reddit identity and selected destination references.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can validate token refresh, scopes, API errors, and rate-limit state.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
  {
    providerId: 'twitter_x',
    platform: 'twitter_x',
    label: 'X / Twitter',
    businessAccountName: 'X account authorized for the selected developer project and access tier',
    developerPortal: 'https://developer.x.com/en/portal/dashboard',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_TWITTER_X_CLIENT_ID', 'SOCIAL_TWITTER_X_CLIENT_SECRET'],
    steps: [
      { id: 'project', title: 'Create an X developer project and app', detail: 'Create or select a developer project, configure the app, and choose the access tier that supports the intended workflow.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'oauth', title: 'Configure OAuth 2.0', detail: `Enable OAuth 2.0, select the required scopes, and add ${CALLBACK_URL} as a callback URI.`, owner: 'business_user', automatedBySignalBoost: false },
      { id: 'credentials', title: 'Copy credentials into Vercel', detail: 'Copy the OAuth client ID and secret into the X environment variables.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'connect', title: 'Authorize X access', detail: 'Connect through SignalBoost, sign in to X, and approve the requested scopes.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'identity', title: 'Store connected identity', detail: 'SignalBoost can save the connected user ID and display name after OAuth succeeds.', owner: 'signalboost', automatedBySignalBoost: true },
      { id: 'health', title: 'Maintain connection health', detail: 'SignalBoost can validate token status, scopes, rate limits, and access-tier restrictions.', owner: 'signalboost', automatedBySignalBoost: true },
    ],
  },
]

export function allSocialOnboardingGuides(): SocialOnboardingGuide[] {
  return GUIDES.map((guide) => ({ ...guide, envVars: [...guide.envVars], steps: guide.steps.map((step) => ({ ...step })) }))
}

export function getSocialOnboardingGuide(providerId: string): SocialOnboardingGuide | null {
  const guide = GUIDES.find((item) => item.providerId === providerId)
  return guide ? { ...guide, envVars: [...guide.envVars], steps: guide.steps.map((step) => ({ ...step })) } : null
}
