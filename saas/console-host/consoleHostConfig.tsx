'use client'

// saas/console-host/consoleHostConfig.tsx
//
// The UI extension contract for the console shell, plus SignalBoost's
// implementation of it. This is the host-UI seam: the console shell
// (components/hub/console/CommandConsole) renders pages and branding from a
// ConsoleHostUI object instead of importing app-specific pages directly. Another
// company supplies its own ConsoleHostUI (its pages, its brand colors) and the
// shell is unchanged.

import type { ReactNode } from 'react'
import { DomainsPage } from '@/components/hub/pages/DomainsPage'
import EnvVarsPage from '@/components/hub/pages/EnvVarsPage'
import { DeploymentsPage } from '@/components/hub/pages/DeploymentsPage'
import { LogsPage } from '@/components/hub/pages/LogsPage'
import { SettingsPage } from '@/components/hub/pages/SettingsPage'
import { UsersPage } from '@/components/hub/pages/UsersPage'
import { WebhooksPage } from '@/components/hub/pages/WebhooksPage'
import SocialOutreachPage from '@/app/dashboard/outreach/social/page'
import { IMPROVMX_PROVIDER } from './improvmxProvider'
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

/** A workspace panel that a provider action opens instead of a single-action form. */
export interface ConsolePanel {
  title: string
  subtitle: string
  render: () => ReactNode
}

/**
 * The UI extension contract a host implements to plug its own pages and branding
 * into the portable console shell. Swap this object to rebrand or re-page the
 * console without touching the shell.
 */
export interface ConsoleHostUI {
  branding: {
    productName: string
    /** Primary accent (used for highlights / active states). */
    accent: string
    /** Secondary accent (used for instrument readouts). */
    secondary: string
  }
  /** Action id → workspace panel (e.g. Vercel env / logs / deployments / domains). */
  panelRouter: Record<string, ConsolePanel>
  /** Utility page id → renderer (domains / env / logs / deployments / settings). */
  utilityPages: Record<string, () => ReactNode>
  /** Provider catalog: tiers, sidebar nav, and lookups. A host supplies its own. */
  catalog: {
    tiers: typeof CONSOLE_TIERS
    utilityNav: typeof CONSOLE_UTILITY_PAGES
    getTier: typeof getConsoleTier
    getTierProviders: typeof getTierProviders
    getProvider: typeof getConsoleProvider
  }
}

// ── SignalBoost's implementation ────────────────────────────────────────────

const ENV_PANEL: ConsolePanel = {
  title: 'Environment Variables',
  subtitle: 'View, add, edit, and delete variables across Production, Preview, and Development.',
  render: () => <EnvVarsPage />,
}

const SOCIAL_PANEL: ConsolePanel = {
  title: 'Social Provider Connector Cockpit',
  subtitle: 'Live OAuth readiness, automated destination discovery, and publish-readiness for social platforms.',
  render: () => <SocialOutreachPage />,
}

const SOCIAL_ACTIONS = ['capabilities', 'connect_oauth', 'discover_destinations', 'save_destination']
const SOCIAL_PROVIDER_IDS = ['youtube', 'linkedin', 'tiktok', 'reddit', 'instagram', 'facebook', 'twitter_x']
for (const id of SOCIAL_PROVIDER_IDS) LIVE_PROVIDER_IDS.add(id)

const SOCIAL_PROVIDERS: ConsoleProvider[] = [
  { id: 'youtube', name: 'YouTube', subtitle: 'VIDEO CHANNELS', accent: '#ff0000', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `youtube.${a}`) }] },
  { id: 'tiktok', name: 'TikTok', subtitle: 'SHORT VIDEO', accent: '#25f4ee', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `tiktok.${a}`) }] },
  { id: 'linkedin', name: 'LinkedIn', subtitle: 'B2B SOCIAL', accent: '#0a66c2', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `linkedin.${a}`) }] },
  { id: 'reddit', name: 'Reddit', subtitle: 'COMMUNITY OUTREACH', accent: '#ff4500', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `reddit.${a}`) }] },
  { id: 'instagram', name: 'Instagram', subtitle: 'VISUAL SOCIAL', accent: '#e1306c', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `instagram.${a}`) }] },
  { id: 'facebook', name: 'Facebook', subtitle: 'PAGES', accent: '#1877f2', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `facebook.${a}`) }] },
  { id: 'twitter_x', name: 'X / Twitter', subtitle: 'SOCIAL POSTS', accent: '#d1d5db', tier: 'tier2', sections: [{ title: 'Connection', templateIds: SOCIAL_ACTIONS.map(a => `twitter_x.${a}`) }] },
]

function socialPanelRouter(): Record<string, ConsolePanel> {
  return Object.fromEntries(SOCIAL_PROVIDER_IDS.flatMap(id => SOCIAL_ACTIONS.map(action => [`${id}.${action}`, SOCIAL_PANEL])))
}

function providerWithExtensions(id: string, dict?: any) {
  if (id === IMPROVMX_PROVIDER.id) return IMPROVMX_PROVIDER
  const social = SOCIAL_PROVIDERS.find(p => p.id === id)
  return social || getConsoleProvider(id, dict)
}

function tierProvidersWithExtensions(tierId: ConsoleTierId, dict?: any) {
  const base = getTierProviders(tierId, dict)
  if (tierId !== 'tier2') return base
  const existing = new Set(base.map(p => p.id))
  return [
    ...base,
    ...(existing.has(IMPROVMX_PROVIDER.id) ? [] : [IMPROVMX_PROVIDER]),
    ...SOCIAL_PROVIDERS.filter(p => !existing.has(p.id)),
  ]
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
    getTierProviders: tierProvidersWithExtensions as typeof getTierProviders,
    getProvider: providerWithExtensions as typeof getConsoleProvider,
  },
}
