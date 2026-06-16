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
import {
  CONSOLE_TIERS,
  CONSOLE_UTILITY_PAGES,
  getConsoleTier,
  getConsoleProvider,
  getTierProviders,
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
  },
  utilityPages: {
    domains: () => <DomainsPage />,
    env: () => <EnvVarsPage />,
    logs: () => <LogsPage />,
    deployments: () => <DeploymentsPage />,
    settings: () => <SettingsPage />,
  },
  catalog: {
    tiers: CONSOLE_TIERS,
    utilityNav: CONSOLE_UTILITY_PAGES,
    getTier: getConsoleTier,
    getTierProviders: getTierProviders,
    getProvider: getConsoleProvider,
  },
}
