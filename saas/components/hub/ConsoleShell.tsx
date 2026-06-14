// saas/components/hub/ConsoleShell.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import DashboardPage from './pages/DashboardPage'
import KeyVaultV2Page from './pages/KeyVaultV2Page'
import ProviderGridPage from './pages/ProviderGridPage'
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
  { key: 'dashboard', label: 'Dashboard Hub', icon: '🛰️', component: <DashboardPage lang="en" data={null} loading={false} failed={false} /> },
  { key: 'vault', label: 'Key Vault', icon: '🔐', component: <KeyVaultV2Page lang="en" data={null} loading={false} failed={false} /> },
  { key: 'providers', label: 'AI Providers', icon: '🧭', component: <ProviderGridPage lang="en" data={null} loading={false} failed={false} /> },
  { key: 'domains', label: 'Domains/DNS', icon: '🌐', component: <DomainsPage /> },
  { key: 'logs', label: 'Logs', icon: '📊', component: <LogsPage /> },
  { key: 'deployments', label: 'Deployments', icon: '🚀', component: <DeploymentsPage /> },
  { key: 'webhooks', label: 'Webhooks', icon: '🔗', component: <WebhooksPage /> },
  { key: 'settings', label: 'Settings', icon: '⚙️', component: <SettingsPage /> },
  { key: 'users', label: 'Team', icon: '👥', component: <UsersPage /> },
]

export default function ConsoleShell({ initialPage = 'dashboard' }: { initialPage?: PageKey }) {
  const [currentPage, setCurrentPage] = useState<PageKey>(initialPage)

  const activePageIndex = PAGES.findIndex(p => p.key === currentPage)
  const activePage = PAGES[activePageIndex] || PAGES[0]

  const goToPrev = () => {
    const newIndex = activePageIndex > 0 ? activePageIndex - 1 : PAGES.length - 1
    setCurrentPage(PAGES[newIndex].key)
  }

  const goToNext = () => {
    const newIndex = activePageIndex < PAGES.length - 1 ? activePageIndex + 1 : 0
    setCurrentPage(PAGES[newIndex].key)
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 80px)', background: '#0a0a0a', color: '#fff', position: 'relative' }}>
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
        {/* Exit Hub Button */}
        <div style={{ padding: '0 0.5rem', marginBottom: '0.75rem' }}>
          <Link
            href="/dashboard"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.75rem 1rem',
              background: '#ffc300',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'center',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              textDecoration: 'none',
            }}
          >
            ← Exit Hub
          </Link>
        </div>

        <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333', marginBottom: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1af0ff' }}>
            Hub Console
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 0.5rem' }}>
          {PAGES.map(page => (
            <button
              key={page.key}
              onClick={() => setCurrentPage(page.key)}
              style={{
                padding: '0.7rem 1rem',
                background: currentPage === page.key ? '#1af0ff' : 'transparent',
                color: currentPage === page.key ? '#000' : '#aaa',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '0.85rem',
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

        <div style={{ padding: '1rem', borderTop: '1px solid #333', fontSize: '0.7rem', color: '#666' }}>
          <div>Page {activePageIndex + 1} of {PAGES.length}</div>
        </div>
      </div>

      {/* Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Page Header with Forward/Back Arrows */}
        <div
          style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid #333',
            background: '#0f0f0f',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {/* Left: Back arrow + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
            <button
              onClick={goToPrev}
              title="Previous page"
              style={{
                padding: '0.5rem 0.9rem',
                background: '#1a1a1a',
                color: '#1af0ff',
                border: '1px solid #1af0ff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              ←
            </button>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#1af0ff' }}>
              {activePage.icon} {activePage.label}
            </div>
          </div>

          {/* Right: Forward arrow + Exit Hub */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={goToNext}
              title="Next page"
              style={{
                padding: '0.5rem 0.9rem',
                background: '#1a1a1a',
                color: '#1af0ff',
                border: '1px solid #1af0ff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              →
            </button>
            <Link
              href="/dashboard"
              style={{
                color: '#000',
                textDecoration: 'none',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '6px',
                background: '#ffc300',
              }}
            >
              ← Exit Hub
            </Link>
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
