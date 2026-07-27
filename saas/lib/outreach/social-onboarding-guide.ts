import { type SocialPlatform } from './social-connectors'

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
  destinationHint: string
  complexity: 'easy' | 'medium' | 'hard'
  steps: SocialOnboardingStep[]
}

const CALLBACK_URL = 'https://saas.signalboostapp.com/api/outreach/social/oauth/callback'

const COMMON_AUTOMATED_STEPS: SocialOnboardingStep[] = [
  {
    id: 'vercel_env_check',
    title: 'Verify provider credentials in Vercel',
    detail: 'SignalBoost checks whether the required Client ID and Client Secret variables exist in the running deployment. Secret values are never shown to the browser.',
    owner: 'signalboost',
    automatedBySignalBoost: true,
  },
  {
    id: 'oauth_connect',
    title: 'Connect OAuth account',
    detail: 'After credentials are present, SignalBoost sends the admin to the provider OAuth screen and stores the returned token server-side in Supabase.',
    owner: 'signalboost',
    automatedBySignalBoost: true,
  },
  {
    id: 'destination_discovery',
    title: 'Discover publishing destinations',
    detail: 'SignalBoost calls the provider API to find pages, channels, company organizations, creator accounts, or destination identities where the API supports it.',
    owner: 'signalboost',
    automatedBySignalBoost: true,
  },
  {
    id: 'publish_readiness',
    title: 'Confirm publish readiness',
    detail: 'SignalBoost marks a provider publish-ready only when credentials, OAuth, destination requirements, approval gate, panic switch, and daily limits are satisfied.',
    owner: 'signalboost',
    automatedBySignalBoost: true,
  },
]

export const SOCIAL_ONBOARDING_GUIDES: Record<SocialOnboardingProviderId, SocialOnboardingGuide> = {
  instagram: {
    providerId: 'instagram',
    platform: 'instagram_business',
    label: 'Instagram Business',
    businessAccountName: 'Instagram Professional / Business account connected to a Facebook Page',
    developerPortal: 'Meta for Developers',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_INSTAGRAM_BUSINESS_CLIENT_ID', 'SOCIAL_INSTAGRAM_BUSINESS_CLIENT_SECRET', 'SOCIAL_FACEBOOK_PAGES_CLIENT_ID', 'SOCIAL_FACEBOOK_PAGES_CLIENT_SECRET'],
    destinationHint: 'Instagram Business Account ID connected to a Facebook Page.',
    complexity: 'hard',
    steps: [
      { id: 'create_instagram', title: 'Create or convert Instagram account', detail: 'Use an Instagram account controlled by the business and switch it to a Professional / Business profile.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'create_facebook_page', title: 'Create Facebook Page', detail: 'Create or use a Facebook Page that represents the business.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'link_ig_page', title: 'Connect Instagram to the Facebook Page', detail: 'Connect the Instagram Business account to the Facebook Page in Meta tools so publishing permissions can resolve the IG business destination.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'meta_app', title: 'Create Meta developer app', detail: 'Create a Meta app, add the callback URL, and request/enable the Instagram/Facebook permissions needed for content publishing.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add Meta App ID and Secret to Vercel', detail: 'Paste the Meta App ID and App Secret into the Instagram and Facebook environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
  facebook: {
    providerId: 'facebook',
    platform: 'facebook_pages',
    label: 'Facebook Pages',
    businessAccountName: 'Facebook Page',
    developerPortal: 'Meta for Developers',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_FACEBOOK_PAGES_CLIENT_ID', 'SOCIAL_FACEBOOK_PAGES_CLIENT_SECRET'],
    destinationHint: 'Facebook Page ID.',
    complexity: 'medium',
    steps: [
      { id: 'create_page', title: 'Create Facebook Page', detail: 'Create a business Facebook Page and ensure the admin connecting OAuth has page management rights.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'meta_app', title: 'Create Meta developer app', detail: 'Create a Meta app, add the callback URL, and enable/request the Page permissions needed for publishing.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add Meta App ID and Secret to Vercel', detail: 'Paste the Meta App ID and App Secret into the Facebook Pages environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
  youtube: {
    providerId: 'youtube',
    platform: 'youtube_channels',
    label: 'YouTube Channels',
    businessAccountName: 'YouTube channel',
    developerPortal: 'Google Cloud Console',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_YOUTUBE_CHANNELS_CLIENT_ID', 'SOCIAL_YOUTUBE_CHANNELS_CLIENT_SECRET'],
    destinationHint: 'Connected YouTube channel. Manual destination usually not required.',
    complexity: 'medium',
    steps: [
      { id: 'channel', title: 'Create or confirm YouTube channel', detail: 'Use a Google account that owns the YouTube channel where videos should be uploaded.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'google_project', title: 'Create Google Cloud project and OAuth app', detail: 'Enable YouTube Data API, configure OAuth consent, and add the SignalBoost callback URL.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add Google OAuth credentials to Vercel', detail: 'Paste the OAuth Client ID and Client Secret into the YouTube environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
  tiktok: {
    providerId: 'tiktok',
    platform: 'tiktok',
    label: 'TikTok',
    businessAccountName: 'TikTok creator or business account',
    developerPortal: 'TikTok for Developers',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_TIKTOK_CLIENT_ID', 'SOCIAL_TIKTOK_CLIENT_SECRET'],
    destinationHint: 'Connected TikTok creator/business account. Manual destination usually not required.',
    complexity: 'hard',
    steps: [
      { id: 'account', title: 'Create TikTok account', detail: 'Create or use the TikTok account that will own published videos.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer_app', title: 'Create TikTok developer app', detail: 'Create a TikTok developer app, add the callback URL, and request the content posting scopes needed for publishing.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'review', title: 'Complete provider review if required', detail: 'TikTok may require app review before public/direct posting is fully available.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add TikTok credentials to Vercel', detail: 'Paste the Client Key/ID and Client Secret into the TikTok environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
  linkedin: {
    providerId: 'linkedin',
    platform: 'linkedin_company',
    label: 'LinkedIn Company',
    businessAccountName: 'LinkedIn Company Page',
    developerPortal: 'LinkedIn Developers',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_LINKEDIN_COMPANY_CLIENT_ID', 'SOCIAL_LINKEDIN_COMPANY_CLIENT_SECRET'],
    destinationHint: 'LinkedIn organization ID for the company page.',
    complexity: 'hard',
    steps: [
      { id: 'company_page', title: 'Create LinkedIn Company Page', detail: 'Create or use a company page and ensure the connecting admin has page administrator rights.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer_app', title: 'Create LinkedIn developer app', detail: 'Create an app, associate it with the company page where required, add the callback URL, and request organization posting permissions.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add LinkedIn credentials to Vercel', detail: 'Paste the Client ID and Client Secret into the LinkedIn Company environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
  reddit: {
    providerId: 'reddit',
    platform: 'reddit',
    label: 'Reddit',
    businessAccountName: 'Reddit account and target subreddit',
    developerPortal: 'Reddit app preferences / developer settings',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_REDDIT_CLIENT_ID', 'SOCIAL_REDDIT_CLIENT_SECRET'],
    destinationHint: 'Subreddit name without r/, for example smallbusiness.',
    complexity: 'medium',
    steps: [
      { id: 'account', title: 'Create Reddit account', detail: 'Create or use the Reddit account that is allowed to post in the target community.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'subreddit', title: 'Choose target subreddit', detail: 'Use a subreddit where posting is permitted. For owned communities, create/manage the subreddit first.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer_app', title: 'Create Reddit app', detail: 'Create an OAuth app, add the callback URL, and enable the scopes needed for submit and identity.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add Reddit credentials to Vercel', detail: 'Paste the Client ID and Client Secret into the Reddit environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
  twitter_x: {
    providerId: 'twitter_x',
    platform: 'twitter_x',
    label: 'X / Twitter',
    businessAccountName: 'X account',
    developerPortal: 'X Developer Portal',
    callbackUrl: CALLBACK_URL,
    envVars: ['SOCIAL_TWITTER_X_CLIENT_ID', 'SOCIAL_TWITTER_X_CLIENT_SECRET'],
    destinationHint: 'Connected X user account. Manual destination usually not required.',
    complexity: 'medium',
    steps: [
      { id: 'account', title: 'Create X account', detail: 'Create or use the X account that should publish posts.', owner: 'business_user', automatedBySignalBoost: false },
      { id: 'developer_app', title: 'Create X developer app', detail: 'Create an app, add the callback URL, and enable write/post scopes for OAuth.', owner: 'platform_admin', automatedBySignalBoost: false },
      { id: 'vercel_vars', title: 'Add X credentials to Vercel', detail: 'Paste the Client ID and Client Secret into the X/Twitter environment variables, then redeploy.', owner: 'platform_admin', automatedBySignalBoost: false },
      ...COMMON_AUTOMATED_STEPS,
    ],
  },
}

export function getSocialOnboardingGuide(providerId: string): SocialOnboardingGuide | null {
  return (SOCIAL_ONBOARDING_GUIDES as Record<string, SocialOnboardingGuide>)[providerId] || null
}

export function allSocialOnboardingGuides(): SocialOnboardingGuide[] {
  return Object.values(SOCIAL_ONBOARDING_GUIDES)
}
