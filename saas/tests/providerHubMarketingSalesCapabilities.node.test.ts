import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createStaticMarketingSalesCapabilityGrants } from '../provider-hub-host/marketing-sales-capability-discovery.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const bridge = read('../provider-hub-host/marketing-sales-capability-discovery.ts')
const grantsStore = read('../provider-hub-host/marketing-sales-capability-grants.ts')
const socialInventory = read('../lib/outreach/social-capability-inventory.ts')
const adsInventory = read('../lib/ads/ads-capability-inventory.ts')
const socialConnectors = read('../lib/outreach/social-connectors.ts')
const adsSetup = read('../lib/ads/ads-network-setup.ts')
const socialRoute = read('../app/api/outreach/social/capabilities/route.ts')
const providerHubRoute = read('../app/api/provider-hub/marketing-sales-capabilities/route.ts')
const migration = read('../supabase/migrations/20260827135000_provider_hub_portable_capability_grants.sql')

test('Marketing + Sales already owns eight built-in social adapters and ten paid-ad network setups', () => {
  for (const platform of [
    'youtube_channels', 'twitter_x', 'linkedin_company', 'linkedin_member',
    'facebook_pages', 'instagram_business', 'tiktok', 'reddit',
  ]) assert.match(socialConnectors, new RegExp(`\\b${platform}\\b`))

  for (const network of [
    'meta_ads', 'linkedin_ads', 'tiktok_ads', 'reddit_ads', 'pinterest_ads',
    'snapchat_ads', 'x_ads', 'google_ads', 'microsoft_ads', 'amazon_ads',
  ]) assert.match(adsSetup, new RegExp(`\\b${network}\\b`))
})

test('Provider Hub reuses canonical Marketing + Sales inventories instead of copying provider adapters', () => {
  assert.match(socialInventory, /SOCIAL_CONNECTORS/)
  assert.match(adsInventory, /listAdNetworkSetups/)
  assert.match(adsInventory, /listAdsConnections/)
  assert.match(bridge, /loadSocialCapabilityInventory/)
  assert.match(bridge, /loadAdsCapabilityInventory/)
  assert.doesNotMatch(bridge, /publishSocialPost|startAdCampaign|pauseAdCampaign|reconcileAdSpend/)
  assert.match(socialRoute, /loadSocialCapabilityInventory/)
})

test('cross-portable grants are exact and deny by default', async () => {
  const grants = createStaticMarketingSalesCapabilityGrants({
    campaign_studio: ['social.facebook_pages.publish'],
  })
  const base = {
    tenantId: 'tenant_1', environmentId: 'prod', portableId: 'campaign_studio',
    providerId: 'meta', risk: 'write' as const,
  }
  assert.equal(await grants.isAllowed({ ...base, capabilityId: 'social.facebook_pages.publish' }), true)
  assert.equal(await grants.isAllowed({ ...base, capabilityId: 'social.instagram_business.publish' }), false)
  assert.equal(await grants.isAllowed({ ...base, portableId: 'other', capabilityId: 'social.facebook_pages.publish' }), false)
})

test('publishing remains approval-gated and ad mutations remain consequential', () => {
  assert.match(bridge, /const publishCapability = `social\.\$\{platform\.platform\}\.publish`/)
  assert.match(bridge, /risk: 'write',[\s\S]*requiresApproval: true/)
  assert.match(bridge, /ads\.\$\{network\.platformId\}\.campaign\.create/)
  assert.match(bridge, /ads\.\$\{network\.platformId\}\.campaign\.pause/)
  assert.match(bridge, /risk: 'consequential',[\s\S]*requiresApproval: true/)
  assert.match(bridge, /execution authority/)
})

test('read capabilities stay read-only and do not require action approval', () => {
  assert.match(bridge, /destinations\.read/)
  assert.match(bridge, /account\.read/)
  assert.match(bridge, /spend\.read/)
  assert.match(bridge, /risk: 'read',[\s\S]*requiresApproval: false/)
})

test('persistent grants contain no provider secrets and are not writable by browser roles', () => {
  assert.match(migration, /provider_hub_portable_capability_grants/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* from anon, authenticated/)
  assert.doesNotMatch(migration, /access_token|refresh_token|client_secret|api_key|password/)
  assert.match(grantsStore, /provider_hub_portable_capability_grants/)
})

test('owner API grants only capabilities backed by the existing adapter catalog', () => {
  assert.match(providerHubRoute, /requireAdmin\(\)/)
  assert.match(providerHubRoute, /catalog\.find\(capability => capability\.capabilityId === capabilityId\)/)
  assert.match(providerHubRoute, /Capability is not backed by an existing Marketing \+ Sales adapter/)
  assert.match(providerHubRoute, /executionDelegated: false/)
  assert.match(providerHubRoute, /action !== 'grant' && action !== 'revoke'/)
})

test('bridge preserves fixed tenant and environment isolation', () => {
  assert.match(bridge, /tenantId !== ownerTenant \|\| environmentId !== ownerEnvironment/)
  assert.match(bridge, /return Object\.freeze\(\[\.\.\.upstream\]\)/)
})
