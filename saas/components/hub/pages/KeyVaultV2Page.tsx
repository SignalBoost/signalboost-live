'use client'

// saas/components/hub/pages/KeyVaultV2Page.tsx
// Vault v2 Wave 1 (W1) — Read-only unlocked view with secrets grid and audit log.

import { useState, useMemo } from 'react'
import { UnlockScreen, VaultSecretsGrid, VaultAuditLog, ProviderSelect } from '../vault'
import { VaultSecret, VaultExpirationAlert, VaultAuditLog as VaultAuditLogType, VaultStats } from '@/lib/hub/vault-types'
import { notifyBoth } from '@/lib/hub/vault-notifications'
import { PageProps, cardStyle, labelStyle } from '../shared'

// Mock data for W1 (read-only demo)
const MOCK_SECRETS: VaultSecret[] = [
  {
    id: '1',
    provider_id: 'stripe',
    provider_name: 'Stripe',
    secret_type: 'api_key',
    secret_name: 'sk_live_prod',
    masked_value: 'sk_live_4J3****Xx2',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-06-10T14:30:00Z',
    expires_at: undefined,
    last_rotated_at: '2024-05-01T09:00:00Z',
    last_accessed_at: '2024-06-13T08:45:00Z',
    status: 'active',
    tags: ['production', 'billing'],
    environment: 'production',
  },
  {
    id: '2',
    provider_id: 'supabase',
    provider_name: 'Supabase',
    secret_type: 'api_key',
    secret_name: 'service_key',
    masked_value: 'eyJhbGciOiJI****YXJ0aWZhY3Q',
    created_at: '2024-02-20T10:00:00Z',
    updated_at: '2024-06-05T12:00:00Z',
    expires_at: '2025-02-20T10:00:00Z',
    last_rotated_at: '2024-02-20T10:00:00Z',
    last_accessed_at: '2024-06-13T09:30:00Z',
    status: 'active',
    tags: ['database', 'production'],
    environment: 'production',
  },
  {
    id: '3',
    provider_id: 'vercel',
    provider_name: 'Vercel',
    secret_type: 'token',
    secret_name: 'vc_deploy_token',
    masked_value: 'vercel_****mK2t',
    created_at: '2024-03-10T10:00:00Z',
    updated_at: '2024-06-01T11:00:00Z',
    expires_at: '2024-09-10T10:00:00Z',
    last_rotated_at: null,
    last_accessed_at: '2024-06-13T06:00:00Z',
    status: 'expiring_soon',
    tags: ['deployments', 'production'],
    environment: 'production',
  },
  {
    id: '4',
    provider_id: 'github',
    provider_name: 'GitHub',
    secret_type: 'token',
    secret_name: 'github_pat',
    masked_value: 'ghp_****KqL9',
    created_at: '2024-04-05T10:00:00Z',
    updated_at: '2024-06-01T10:00:00Z',
    expires_at: '2025-04-05T10:00:00Z',
    last_rotated_at: '2024-06-01T10:00:00Z',
    last_accessed_at: '2024-06-13T07:15:00Z',
    status: 'active',
    tags: ['ci-cd', 'repos'],
    environment: 'production',
  },
]

const MOCK_ALERTS: VaultExpirationAlert[] = [
  {
    id: '1',
    secret_id: '3',
    days_until_expiry: 88,
    severity: 'warning',
    notified_at: '2024-06-01T10:00:00Z',
    dismissed_at: null,
  },
]

const MOCK_AUDIT_LOGS: VaultAuditLogType[] = [
  {
    id: '1',
    secret_id: '1',
    action: 'accessed',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-06-13T08:45:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: 'Stripe API key accessed',
  },
  {
    id: '2',
    secret_id: '4',
    action: 'rotated',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-06-01T10:00:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: 'GitHub PAT rotated',
  },
  {
    id: '3',
    secret_id: '2',
    action: 'accessed',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-06-13T09:30:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: 'Supabase service key accessed',
  },
  {
    id: '4',
    secret_id: '3',
    action: 'created',
    user_id: 'user-1',
    user_email: 'luis@signalboost.com',
    timestamp: '2024-03-10T10:00:00Z',
    ip_address: '192.168.1.1',
    status: 'success',
    message: 'Vercel deploy token created',
  },
]

const MOCK_STATS: VaultStats = {
  total_secrets: 4,
  active_secrets: 3,
  expiring_soon: 1,
  expired: 0,
  last_rotation: '2024-06-01T10:00:00Z',
  next_rotation: '2024-07-01T10:00:00Z',
}

export default function KeyVaultV2Page({ lang }: PageProps) {
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedSecret, setSelectedSecret] = useState<VaultSecret | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedProviderName, setSelectedProviderName] = useState<string | null>(null)

  const handleUnlock = (sid: string) => {
    setSessionId(sid)
    setIsUnlocked(true)
  }

  const handleProviderSelect = (providerId: string, providerName: string) => {
    setSelectedProviderId(providerId)
    setSelectedProviderName(providerName)
  }

  const secretsByStatus = useMemo(() => {
    const groups: Record<string, VaultSecret[]> = {
      active: [],
      expiring_soon: [],
      expired: [],
      rotated: [],
      revoked: [],
    }
    
    // Filter by selected provider if one is chosen
    const filteredSecrets = selectedProviderId 
      ? MOCK_SECRETS.filter(s => s.provider_id === selectedProviderId)
      : MOCK_SECRETS
    
    filteredSecrets.forEach(s => {
      groups[s.status].push(s)
    })
    return groups
  }, [selectedProviderId])

  if (!isUnlocked) {
    return <UnlockScreen onUnlock={handleUnlock} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 12 }}>
      {/* Header */}
      <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={labelStyle}>Operations & Production</div>
          <h2 style={{ margin: '3px 0 4px', fontSize: 24, letterSpacing: '-.02em' }}>Keys & Secrets</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,.58)', fontSize: 13.5, maxWidth: 840 }}>
            Credential inventory, expiration alerts, and rotation status. {MOCK_STATS.total_secrets} secret{MOCK_STATS.total_secrets === 1 ? '' : 's'} stored.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, fontWeight: 600, flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,.35)', background: 'rgba(34,197,94,.08)', color: '#86efac' }}>
            {MOCK_STATS.active_secrets} Active
          </span>
          <span style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,195,0,.35)', background: 'rgba(255,195,0,.08)', color: '#ffc300' }}>
            {MOCK_STATS.expiring_soon} Expiring
          </span>
          <button
            onClick={() => setIsUnlocked(false)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,.15)',
              background: 'rgba(255,255,255,.04)',
              color: 'rgba(255,255,255,.6)',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Lock Vault
          </button>
        </div>
      </section>

      {/* Main content */}
      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 28, paddingRight: 8 }}>
        {/* Provider selector */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...labelStyle }}>Browse Secrets</div>
          <div style={{ ...cardStyle, padding: 14 }}>
            <ProviderSelect onSelect={handleProviderSelect} selectedId={selectedProviderId} placeholder="Search and select a provider..." />
            {selectedProviderName && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(26,240,255,.8)' }}>
                Selected: <strong>{selectedProviderName}</strong>
              </div>
            )}
          </div>
        </section>

        {/* Secrets by status */}
        {!selectedProviderId ? (
          <div style={{ padding: '24px 14px', borderRadius: 10, border: '1px dashed rgba(26,240,255,.2)', background: 'rgba(26,240,255,.04)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(26,240,255,.7)' }}>
              👆 Select a provider above to view its secrets
            </p>
          </div>
        ) : Object.values(secretsByStatus).every(s => s.length === 0) ? (
          <div style={{ padding: '24px 14px', borderRadius: 10, border: '1px dashed rgba(255,195,0,.2)', background: 'rgba(255,195,0,.04)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,195,0,.7)' }}>
              No secrets found for <strong>{selectedProviderName}</strong>
            </p>
          </div>
        ) : (
          Object.entries(secretsByStatus).map(([status, secrets]) => {
            if (secrets.length === 0) return null

          const statusLabels: Record<string, string> = {
            active: 'Active Secrets',
            expiring_soon: 'Expiring Soon',
            expired: 'Expired',
            rotated: 'Recently Rotated',
            revoked: 'Revoked',
          }

          return (
            <section key={status}>
              <div style={{ ...labelStyle, marginBottom: 12 }}>
                {statusLabels[status]} — {secrets.length} secret{secrets.length === 1 ? '' : 's'}
              </div>
              <VaultSecretsGrid secrets={secrets} alerts={MOCK_ALERTS} onSelectSecret={setSelectedSecret} />
            </section>
          )
        })
        )}

        {/* Audit log */}
        <section style={{ minHeight: '54vh' }}>
          <VaultAuditLog logs={MOCK_AUDIT_LOGS} />
        </section>
      </main>

      {/* Secret detail modal (if selected) */}
      {selectedSecret && (
        <div
          onClick={() => setSelectedSecret(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.88)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              ...cardStyle,
              maxWidth: 480,
              padding: 24,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{selectedSecret.secret_name}</h2>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
                  {selectedSecret.provider_name}
                </p>
              </div>
              <button
                onClick={() => setSelectedSecret(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'rgba(255,255,255,.05)',
                  color: 'rgba(255,255,255,.6)',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  Masked Value
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,.04)',
                    border: '1px solid rgba(255,255,255,.1)',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: 'rgba(255,255,255,.65)',
                  }}
                >
                  {selectedSecret.masked_value}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 10, color: 'rgba(255,255,255,.4)' }}>
                  Full value is encrypted and not displayed in the UI.
                </p>
              </div>

              {selectedSecret.expires_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                    Expiration
                  </div>
                  <div style={{ fontSize: 13, color: '#fff' }}>
                    {new Date(selectedSecret.expires_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              )}

              {selectedSecret.last_rotated_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                    Last Rotated
                  </div>
                  <div style={{ fontSize: 13, color: '#fff' }}>
                    {new Date(selectedSecret.last_rotated_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.5)', marginBottom: 6 }}>
                  Type & Environment
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'rgba(255,255,255,.08)',
                      color: 'rgba(255,255,255,.65)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {selectedSecret.secret_type.replace('_', ' ')}
                  </span>
                  {selectedSecret.environment && (
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'rgba(255,255,255,.08)',
                        color: 'rgba(255,255,255,.65)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {selectedSecret.environment}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
