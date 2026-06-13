// saas/lib/hub/provider-registry.ts
// Hub Console Provider Registry
//
// Purpose:
// - Define the multi-monitor / tier architecture for the Hub Console.
// - Keep provider layout data centralized instead of hard-coding provider groups
//   inside individual UI pages.
// - Allow the console to scale toward 100+ providers while only connecting one
//   provider at a time.
//
// This registry describes provider placement and safe display metadata. It does
// not store provider secrets and does not execute provider actions.

export type HubProviderTierId = 'core' | 'common' | 'ai' | 'devops' | 'marketing'
export type HubProviderStatus = 'live' | 'ready' | 'planned' | 'attention' | 'error'
export type HubProviderCategory =
  | 'Database & Auth'
  | 'Payments & Billing'
  | 'Hosting & Deployment'
  | 'Source Control'
  | 'Cloud Infrastructure'
  | 'AI Platform'
  | 'Messaging'
  | 'Email'
  | 'Edge & DNS'
  | 'Database'
  | 'Identity'
  | 'Monitoring'
  | 'Incident Response'
  | 'Containers'
  | 'Infrastructure as Code'
  | 'Analytics'
  | 'CRM & Marketing'
  | 'Customer Messaging'

export type HubProviderTier = {
  id: HubProviderTierId
  label: string
  monitorLabel: string
  description: string
  order: number
}

export type HubProvider = {
  id: string
  name: string
  tier: HubProviderTierId
  category: HubProviderCategory
  status: HubProviderStatus
  liveInPhaseOne: boolean
  description: string
  keyPatterns: string[]
  primaryActions: string[]
}

export const HUB_PROVIDER_TIERS: HubProviderTier[] = [
  {
    id: 'core',
    label: 'Core Providers',
    monitorLabel: 'Monitor 1',
    description: 'Must-have providers that power data, billing, deployment, source control, cloud, and primary AI services.',
    order: 1,
  },
  {
    id: 'common',
    label: 'Common Providers',
    monitorLabel: 'Monitor 2',
    description: 'Frequently used SaaS services for communication, edge delivery, auth, storage, and application databases.',
    order: 2,
  },
  {
    id: 'ai',
    label: 'AI Providers',
    monitorLabel: 'Monitor 3',
    description: 'AI model, inference, media generation, and agent capability providers.',
    order: 3,
  },
  {
    id: 'devops',
    label: 'DevOps & Infra',
    monitorLabel: 'Monitor 4',
    description: 'Reliability, monitoring, incident, container, and infrastructure automation services.',
    order: 4,
  },
  {
    id: 'marketing',
    label: 'Marketing & Analytics',
    monitorLabel: 'Monitor 5',
    description: 'Analytics, customer data, marketing automation, CRM, and user messaging tools.',
    order: 5,
  },
]

export const HUB_PROVIDERS: HubProvider[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    tier: 'core',
    category: 'Payments & Billing',
    status: 'live',
    liveInPhaseOne: true,
    description: 'Payments, subscription pricing, products, webhooks, and billing plan validation.',
    keyPatterns: ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_*', 'STRIPE_WEBHOOK_SECRET'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'create_stripe_price', 'archive_stripe_price'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    tier: 'core',
    category: 'Database & Auth',
    status: 'live',
    liveInPhaseOne: true,
    description: 'Database, authentication, project health, public key visibility, and future key rotation workflow.',
    keyPatterns: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'rotate_secret_key'],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    tier: 'core',
    category: 'Hosting & Deployment',
    status: 'live',
    liveInPhaseOne: true,
    description: 'Hosting, deployments, project environment variable inventory, and future approved sync actions.',
    keyPatterns: ['VERCEL_TOKEN', 'VERCEL_HUB_PROJECT'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'update_preview_environment', 'update_production_environment'],
  },
  {
    id: 'github',
    name: 'GitHub',
    tier: 'core',
    category: 'Source Control',
    status: 'ready',
    liveInPhaseOne: false,
    description: 'Repository visibility, branch status, deployment source, issues, pull requests, and future controlled commits.',
    keyPatterns: ['GITHUB_TOKEN', 'GITHUB_APP_*'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'prepare_recommended_fix'],
  },
  {
    id: 'aws',
    name: 'AWS',
    tier: 'core',
    category: 'Cloud Infrastructure',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Cloud infrastructure inventory, IAM safety checks, storage, compute, and future billing-aware recommendations.',
    keyPatterns: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tier: 'core',
    category: 'AI Platform',
    status: 'ready',
    liveInPhaseOne: false,
    description: 'AI model access, API key coverage, usage visibility, and future cost/safety monitoring.',
    keyPatterns: ['OPENAI_API_KEY'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'rotate_secret_key'],
  },
  {
    id: 'google-cloud',
    name: 'Google Cloud',
    tier: 'core',
    category: 'Cloud Infrastructure',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Cloud project, service account, billing, storage, and API enablement checks.',
    keyPatterns: ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_CLOUD_PROJECT'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'azure',
    name: 'Azure',
    tier: 'core',
    category: 'Cloud Infrastructure',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Azure subscription, resource, app registration, and environment coverage checks.',
    keyPatterns: ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_CLIENT_SECRET'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'twilio',
    name: 'Twilio',
    tier: 'common',
    category: 'Messaging',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'SMS, phone number, messaging service, sender, and webhook readiness checks.',
    keyPatterns: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    tier: 'common',
    category: 'Email',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Transactional email, sender identity, domain authentication, and API key coverage.',
    keyPatterns: ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    tier: 'common',
    category: 'Edge & DNS',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'DNS, edge security, cache, workers, zone health, and domain readiness.',
    keyPatterns: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'firebase',
    name: 'Firebase',
    tier: 'common',
    category: 'Database & Auth',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Firebase app, auth, database, storage, and client/server key inventory.',
    keyPatterns: ['FIREBASE_*', 'NEXT_PUBLIC_FIREBASE_*'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    tier: 'common',
    category: 'Database',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'MongoDB connection, cluster status, database access, and connection string coverage.',
    keyPatterns: ['MONGODB_URI', 'MONGO_*'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'auth0',
    name: 'Auth0',
    tier: 'common',
    category: 'Identity',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Identity provider configuration, domain, client, callback, and secret coverage.',
    keyPatterns: ['AUTH0_*'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'rotate_secret_key'],
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    tier: 'common',
    category: 'Cloud Infrastructure',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Droplets, app platform, spaces, database, and token coverage checks.',
    keyPatterns: ['DIGITALOCEAN_TOKEN', 'DO_*'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    tier: 'ai',
    category: 'AI Platform',
    status: 'ready',
    liveInPhaseOne: false,
    description: 'Claude API key coverage, model access readiness, usage visibility, and future cost monitoring.',
    keyPatterns: ['ANTHROPIC_API_KEY'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'rotate_secret_key'],
  },
  {
    id: 'hugging-face',
    name: 'Hugging Face',
    tier: 'ai',
    category: 'AI Platform',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Model hub, inference token, endpoint, and deployment readiness checks.',
    keyPatterns: ['HUGGINGFACE_API_KEY', 'HF_TOKEN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    tier: 'ai',
    category: 'AI Platform',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Inference token, model endpoint, version coverage, and media generation readiness.',
    keyPatterns: ['REPLICATE_API_TOKEN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'stability-ai',
    name: 'Stability AI',
    tier: 'ai',
    category: 'AI Platform',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Image generation API key, endpoint, model, and usage coverage.',
    keyPatterns: ['STABILITY_API_KEY'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'datadog',
    name: 'Datadog',
    tier: 'devops',
    category: 'Monitoring',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Monitoring, metrics, logs, service checks, and incident readiness.',
    keyPatterns: ['DATADOG_API_KEY', 'DD_*'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    tier: 'devops',
    category: 'Monitoring',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Error monitoring, DSN coverage, project health, and release tracking.',
    keyPatterns: ['SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'NEXT_PUBLIC_SENTRY_DSN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    tier: 'devops',
    category: 'Incident Response',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Incident routing, escalation, on-call, and service integration readiness.',
    keyPatterns: ['PAGERDUTY_API_KEY', 'PAGERDUTY_SERVICE_ID'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'docker-hub',
    name: 'Docker Hub',
    tier: 'devops',
    category: 'Containers',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Container registry, image inventory, token coverage, and publish readiness.',
    keyPatterns: ['DOCKER_USERNAME', 'DOCKER_PASSWORD', 'DOCKER_TOKEN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'terraform-cloud',
    name: 'Terraform Cloud',
    tier: 'devops',
    category: 'Infrastructure as Code',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Workspace, run, token, state, and infrastructure change governance.',
    keyPatterns: ['TERRAFORM_CLOUD_TOKEN', 'TF_API_TOKEN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift', 'prepare_recommended_fix'],
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    tier: 'marketing',
    category: 'Analytics',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Product analytics, event tracking, project token, and user journey instrumentation.',
    keyPatterns: ['MIXPANEL_TOKEN', 'NEXT_PUBLIC_MIXPANEL_TOKEN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'segment',
    name: 'Segment',
    tier: 'marketing',
    category: 'Analytics',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Customer data platform source, destination, write key, and event routing coverage.',
    keyPatterns: ['SEGMENT_WRITE_KEY', 'NEXT_PUBLIC_SEGMENT_WRITE_KEY'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'ga4',
    name: 'GA4',
    tier: 'marketing',
    category: 'Analytics',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Google Analytics property, measurement ID, tag coverage, and event tracking readiness.',
    keyPatterns: ['NEXT_PUBLIC_GA_ID', 'GA_MEASUREMENT_ID'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    tier: 'marketing',
    category: 'CRM & Marketing',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'CRM, forms, marketing automation, API token, and contact sync readiness.',
    keyPatterns: ['HUBSPOT_API_KEY', 'HUBSPOT_ACCESS_TOKEN'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    tier: 'marketing',
    category: 'Customer Messaging',
    status: 'planned',
    liveInPhaseOne: false,
    description: 'Customer messaging, app ID, access token, widget readiness, and support workflow coverage.',
    keyPatterns: ['INTERCOM_ACCESS_TOKEN', 'NEXT_PUBLIC_INTERCOM_APP_ID'],
    primaryActions: ['read_provider_status', 'detect_configuration_drift'],
  },
]

export function getHubTier(tierId: HubProviderTierId): HubProviderTier | undefined {
  return HUB_PROVIDER_TIERS.find(tier => tier.id === tierId)
}

export function getHubProvidersByTier(tierId: HubProviderTierId): HubProvider[] {
  return HUB_PROVIDERS.filter(provider => provider.tier === tierId)
}

export function getHubProvider(providerId: string): HubProvider | undefined {
  return HUB_PROVIDERS.find(provider => provider.id === providerId)
}

export function getLiveHubProviders(): HubProvider[] {
  return HUB_PROVIDERS.filter(provider => provider.status === 'live')
}

export function getPlannedHubProviders(): HubProvider[] {
  return HUB_PROVIDERS.filter(provider => provider.status === 'planned')
}
