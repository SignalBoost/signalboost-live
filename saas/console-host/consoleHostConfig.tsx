'use client'

import type { ReactNode } from 'react'
import { DomainsPage } from '@/components/hub/pages/DomainsPage'
import EnvVarsPage from '@/components/hub/pages/EnvVarsPage'
import { DeploymentsPage } from '@/components/hub/pages/DeploymentsPage'
import { LogsPage } from '@/components/hub/pages/LogsPage'
import { SettingsPage } from '@/components/hub/pages/SettingsPage'
import { UsersPage } from '@/components/hub/pages/UsersPage'
import { WebhooksPage } from '@/components/hub/pages/WebhooksPage'
import ImprovMXPage from '@/components/hub/pages/ImprovMXPage'
import SocialOutreachPage from '@/app/dashboard/outreach/social/page'
import { IMPROVMX_PROVIDER } from '@/console-host/improvmxProvider'
import {
  CONSOLE_TIERS,
  CONSOLE_UTILITY_PAGES,
  LIVE_PROVIDER_IDS,
  getConsoleTier,
  getConsoleProvider,
  getTierProviders,
  type ConsoleProvider,
  type ConsoleTierId,
} from '@/lib/hub/console-catalog'

export interface ConsolePanel {
  title: string
  subtitle: string
  render: () => ReactNode
}

export interface ConsoleHostUI {
  branding: {
    productName: string
    accent: string
    secondary: string
  }
  panelRouter: Record<string, ConsolePanel>
  utilityPages: Record<string, () => ReactNode>
  catalog: {
    tiers: typeof CONSOLE_TIERS
    utilityNav: typeof CONSOLE_UTILITY_PAGES
    getTier: typeof getConsoleTier
    getTierProviders: typeof getTierProviders
    getProvider: typeof getConsoleProvider
  }
}

const ENV_PANEL: ConsolePanel = {
  title: 'Environment Variables',
  subtitle: 'View, add, edit, and delete variables across Production, Preview, and Development.',
  render: () => <EnvVarsPage />,
}

const IMPROVMX_PANEL: ConsolePanel = {
  title: 'ImprovMX Email Forwarding',
  subtitle: 'Live domains and forwarding aliases from the ImprovMX API.',
  render: () => <ImprovMXPage />,
}

const SOCIAL_PANEL: ConsolePanel = {
  title: 'Social Provider Connector Cockpit',
  subtitle: 'Live OAuth readiness, automated destination discovery, and publish-readiness for social platforms.',
  render: () => <SocialOutreachPage />,
}

const SOCIAL_ACTIONS = ['capabilities', 'connect_oauth', 'discover_destinations', 'save_destination']
const SOCIAL_PROVIDER_IDS = ['youtube', 'linkedin', 'tiktok', 'reddit', 'instagram', 'facebook', 'twitter_x']
for (const id of SOCIAL_PROVIDER_IDS) LIVE_PROVIDER_IDS.add(id)
LIVE_PROVIDER_IDS.add('improvmx')

const SOCIAL_PROVIDERS: ConsoleProvider[] = [
  { id: 'youtube', name: 'YouTube', subtitle: 'VIDEO CHANNELS', accent: '#ff0000', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `youtube.${a}`) }] },
  { id: 'tiktok', name: 'TikTok', subtitle: 'SHORT VIDEO', accent: '#25f4ee', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `tiktok.${a}`) }] },
  { id: 'linkedin', name: 'LinkedIn', subtitle: 'B2B SOCIAL', accent: '#0a66c2', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `linkedin.${a}`) }] },
  { id: 'reddit', name: 'Reddit', subtitle: 'COMMUNITY OUTREACH', accent: '#ff4500', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `reddit.${a}`) }] },
  { id: 'instagram', name: 'Instagram', subtitle: 'VISUAL SOCIAL', accent: '#e1306c', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `instagram.${a}`) }] },
  { id: 'facebook', name: 'Facebook', subtitle: 'PAGES', accent: '#1877f2', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `facebook.${a}`) }] },
  { id: 'twitter_x', name: 'X / Twitter', subtitle: 'SOCIAL POSTS', accent: '#d1d5db', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `twitter_x.${a}`) }] },
]

const EXTRA_PROVIDERS: ConsoleProvider[] = [IMPROVMX_PROVIDER, ...SOCIAL_PROVIDERS]

function socialPanelRouter(): Record<string, ConsolePanel> {
  return Object.fromEntries(SOCIAL_PROVIDER_IDS.flatMap(id => SOCIAL_ACTIONS.map(action => [`${id}.${action}`, SOCIAL_PANEL])))
}

function providerWithExtras(id: string, dict?: any) {
  const extra = EXTRA_PROVIDERS.find(provider => provider.id === id)
  return extra || getConsoleProvider(id, dict)
}

function tierProvidersWithExtras(tierId: ConsoleTierId, dict?: any) {
  const base = getTierProviders(tierId, dict)
  const existing = new Set(base.map(provider => provider.id))
  return [...base, ...EXTRA_PROVIDERS.filter(provider => provider.tier === tierId && !existing.has(provider.id))]
}

export const signalboostConsoleUI: ConsoleHostUI = {
  branding: {
    productName: 'SignalBoost',
    accent: '#ffc300',
    secondary: '#1af0ff',
  },
  panelRouter: {
    'vercel.add_env_var': ENV_PANEL,
    'vercel.list_env_vars': ENV_PANEL,
    'vercel.view_env': ENV_PANEL,
    'vercel.delete_env_var': ENV_PANEL,
    'vercel.edit_env': ENV_PANEL,
    'vercel.delete_env': ENV_PANEL,
    'improvmx.list_domains': IMPROVMX_PANEL,
    'improvmx.get_domain': IMPROVMX_PANEL,
    'improvmx.list_aliases': IMPROVMX_PANEL,
    'improvmx.create_alias': IMPROVMX_PANEL,
    'improvmx.update_alias': IMPROVMX_PANEL,
    'improvmx.delete_alias': IMPROVMX_PANEL,
    'vercel.logs': {
      title: 'Logs Viewer',
      subtitle: 'Recent platform, build, and runtime log events.',
      render: () => <LogsPage />,
    },
    'vercel.list_deployments': {
      title: 'Deployments Panel',
      subtitle: 'Inspect running build tracks, commit records, and production targets.',
      render: () => <DeploymentsPage mode="view" />,
    },
    'vercel.trigger_rollback': {
      title: 'Rollback Deploy',
      subtitle: 'Promote a previous READY deployment back to production.',
      render: () => <DeploymentsPage mode="rollback" />,
    },
    'vercel.cancel_build': {
      title: 'Cancel Build',
      subtitle: 'Abort an in-progress build (BUILDING, QUEUED, or INITIALIZING).',
      render: () => <DeploymentsPage mode="cancel" />,
    },
    'vercel.sync_dns_domain': {
      title: 'Domains / DNS',
      subtitle: 'Configure domains, alias paths, verification, and SSL.',
      render: () => <DomainsPage />,
    },
    ...socialPanelRouter(),
  },
  utilityPages: {
    domains: () => <DomainsPage />,
    env: () => <EnvVarsPage />,
    logs: () => <LogsPage />,
    deployments: () => <DeploymentsPage />,
    webhooks: () => <WebhooksPage />,
    users: () => <UsersPage />,
    settings: () => <SettingsPage />,
  },
  catalog: {
    tiers: CONSOLE_TIERS,
    utilityNav: CONSOLE_UTILITY_PAGES,
    getTier: getConsoleTier,
    getTierProviders: tierProvidersWithExtras as typeof getTierProviders,
    getProvider: providerWithExtras as typeof getConsoleProvider,
  },
}
