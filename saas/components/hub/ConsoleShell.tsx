// saas/components/hub/ConsoleShell.tsx
'use client'

import { useState } from 'react'
import { DashboardHubPage } from './pages/DashboardHubPage'
import { KeyVaultV2Page } from './pages/KeyVaultV2Page'
import { ProviderGridPage } from './pages/ProviderGridPage'
import { DomainsPage } from './pages/DomainsPage'
import { LogsPage } from './pages/LogsPage'
import { DeploymentsPage } from './pages/DeploymentsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WebhooksPage } from './pages/WebhooksPage'
import { UsersPage } from './pages/UsersPage'

type PageKey = 'dashboard' | 'vault' | 'providers' | 'domains' | 'logs' | 'deployments' | 'settings' | 'webhooks' | 'users'

interface Page {
  key: PageKey
  label: string
  icon: string
  component: React.ReactNode
}

const PAGES: Page[] = [
  { key: 'dashboard', label: 'Dashboard Hub', icon: '🛰️', component: <DashboardHubPage /> },
  { key: 'vault', label: 'Key Vault', icon: '🔐', component: <KeyVaultV2Page /> },
  { key: 'providers', label: 'AI Providers', icon: '🧭', component: <ProviderGridPage /> },
  { key: 'domains', label: 'Domains/DNS', icon: '🌐', component: <DomainsPage /> },
  { key: 'logs', label: 'Logs', icon: '📊', component: <LogsPage /> },
  { key: 'deployments', label: 'Deployments', icon: '🚀', component: <DeploymentsPage /> },
  { key: 'webhooks', label: 'Webhooks', icon: '🔗', component: <WebhooksPage /> },
  { key: 'settings', label: 'Settings', icon: '⚙️', component: <SettingsPage /> },
  { key: 'users', label: 'Team', icon: '👥', component: <UsersPage /> },
]

export function ConsoleShell({ initialPage = 'dashboard' }: { initialPage?: PageKey }) {
  const [currentPage, setCurrentPage] = useState<PageKey>(initialPage)

  const activePage = PAGES.find(p => p.key === currentPage) || PAGES[0]

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', color: '#fff' }}>
      {/* Sidebar Navigation */}
      <div
        style={{
          width: '220px',
          background: '#1a1a1a',
          borderRight: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          padding: '1rem 0',
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid #333', marginBottom: '1rem' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1af0ff', marginBottom: '0.25rem' }}>
            Hub Console
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888' }}>
            Phase 1C + Phase 2
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0 0.5rem' }}>
          {PAGES.map(page => (
            <button
              key={page.key}
              onClick={() => setCurrentPage(page.key)}
              style={{
                padding: '0.75rem 1rem',
                background: currentPage === page.key ? '#1af0ff' : 'transparent',
                color: currentPage === page.key ? '#000' : '#aaa',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.9rem',
                fontWeight: currentPage === page.key ? 'bold' : 'normal',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                if (currentPage !== page.key) {
                  (e.target as HTMLButtonElement).style.background = '#2a2a2a'
                }
              }}
              onMouseLeave={e => {
                if (currentPage !== page.key) {
                  (e.target as HTMLButtonElement).style.background = 'transparent'
                }
              }}
            >
              <span style={{ marginRight: '0.5rem' }}>{page.icon}</span>
              {page.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '1rem', borderTop: '1px solid #333', fontSize: '0.75rem', color: '#666' }}>
          <div>9 Pages</div>
          <div>Phase 1C ✅</div>
          <div>Phase 2 ✅</div>
        </div>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Page Header */}
        <div
          style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid #333',
            background: '#0f0f0f',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1af0ff' }}>
              {activePage.icon} {activePage.label}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.85rem', color: '#888' }}>
            <span>SignalBoost Command Control</span>
          </div>
        </div>

        {/* Page Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            background: '#0a0a0a',
          }}
        >
          {activePage.component}
        </div>
      </div>
    </div>
  )
}
