// saas/lib/hub/provider-templates-social.ts
import type { ProviderTemplate } from './provider-templates.ts'

function socialTemplates(provider: string, label: string, icon: string, accountHelp: string): Record<string, ProviderTemplate> {
  return {
    [`${provider}.capabilities`]: {
      id: `${provider}.capabilities`,
      label: `${label} Readiness`,
      description: `Show live ${label} provider credentials, OAuth token, destinations, and publish-readiness.`,
      icon,
      policyActionId: 'read_provider_status',
      api: { service: 'social', method: 'GET', endpoint: `/api/outreach/social/capabilities?provider=${provider}` },
      fields: [],
    },
    [`${provider}.connect_oauth`]: {
      id: `${provider}.connect_oauth`,
      label: `Connect ${label}`,
      description: `Generate a live OAuth connection URL for ${label}.`,
      icon: '🔗',
      policyActionId: 'read_provider_status',
      api: { service: 'social', method: 'GET', endpoint: `/api/outreach/social/oauth?provider=${provider}` },
      fields: [],
    },
    [`${provider}.discover_destinations`]: {
      id: `${provider}.discover_destinations`,
      label: `Discover ${label} Destinations`,
      description: `Call the live ${label} API to discover channels, pages, company orgs, subreddits, or creator accounts where supported.`,
      icon: '🧭',
      policyActionId: 'read_provider_status',
      api: { service: 'social', method: 'POST', endpoint: '/api/outreach/social/destinations' },
      fields: [
        { id: 'autoSelect', label: 'Auto-select single destination', type: 'toggle', defaultValue: true, help: 'If the provider returns exactly one valid destination, save it as the active destination automatically.' },
      ],
    },
    [`${provider}.save_destination`]: {
      id: `${provider}.save_destination`,
      label: `Save ${label} Destination`,
      description: `Set the publishing destination for ${label}. ${accountHelp}`,
      icon: '📍',
      policyActionId: 'read_provider_status',
      api: { service: 'social', method: 'POST', endpoint: '/api/outreach/social/account-ref' },
      fields: [
        { id: 'accountRef', label: 'Destination / account reference', type: 'text', required: true, help: accountHelp },
        { id: 'accountName', label: 'Friendly display name', type: 'text' },
      ],
    },
  }
}

export const SOCIAL_PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  ...socialTemplates('youtube', 'YouTube', '▶️', 'YouTube usually does not require a manual destination; discovery records the connected channel.'),
  ...socialTemplates('linkedin', 'LinkedIn', '💼', 'Use the LinkedIn organization ID for company-page publishing.'),
  ...socialTemplates('tiktok', 'TikTok', '🎵', 'TikTok publishes to the connected creator account and normally does not require a manual destination.'),
  ...socialTemplates('reddit', 'Reddit', '👽', 'Use the subreddit name without r/, for example smallbusiness.'),
  ...socialTemplates('instagram', 'Instagram', '📸', 'Use the Instagram Business account ID connected to a Facebook Page.'),
  ...socialTemplates('facebook', 'Facebook', '📘', 'Use the Facebook Page ID where approved posts should publish.'),
  ...socialTemplates('twitter_x', 'X / Twitter', '𝕏', 'X publishes to the connected user account and normally does not require a manual destination.'),
}
